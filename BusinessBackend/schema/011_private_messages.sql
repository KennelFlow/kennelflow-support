-- Kennel One: tenant-scoped, authenticated employee-to-employee messaging.
-- Messages must NEVER be stored in CloudKit publicDatabase or generic records.
-- This additive migration leaves existing kennel records and account identities intact.
BEGIN;
CREATE TABLE IF NOT EXISTS business_private_messages (
 id uuid PRIMARY KEY,
 kennel_id uuid NOT NULL REFERENCES kennels(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES app_users(id),
 recipient_id uuid NOT NULL REFERENCES app_users(id),
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
 sent_at timestamptz NOT NULL DEFAULT now(),
 CHECK (sender_id<>recipient_id)
);
CREATE INDEX IF NOT EXISTS business_private_messages_actor
 ON business_private_messages(kennel_id,sent_at DESC,id DESC);
ALTER TABLE business_private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_private_messages FORCE ROW LEVEL SECURITY;
REVOKE ALL ON business_private_messages FROM PUBLIC, kennelflow_api;
-- Defense in depth: RLS protects rows even if functions are called with a
-- compromised session or another app accidentally grants table access.
CREATE POLICY private_msg_read ON business_private_messages FOR SELECT USING (
  (sender_id=nullif(current_setting('request.user_id',true),'')::uuid OR
   recipient_id=nullif(current_setting('request.user_id',true),'')::uuid)
  AND business_role(kennel_id) IN ('owner','admin','staff')
);
CREATE POLICY private_msg_insert ON business_private_messages FOR INSERT WITH CHECK (
  sender_id=nullif(current_setting('request.user_id',true),'')::uuid
  AND business_role(kennel_id) IN ('owner','admin','staff')
  AND EXISTS(SELECT 1 FROM kennel_memberships m WHERE m.kennel_id=business_private_messages.kennel_id
    AND m.user_id=business_private_messages.recipient_id AND m.role IN ('owner','admin','staff'))
);


CREATE OR REPLACE FUNCTION business_private_send(p_kennel uuid,p_id uuid,p_to text,p_body text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; recipient uuid; actor_role text; entry business_private_messages;
BEGIN
 actor:=nullif(current_setting('request.user_id',true),'')::uuid;
 actor_role:=business_role(p_kennel);
 IF actor IS NULL OR coalesce(actor_role,'') NOT IN ('owner','admin','staff') OR p_id IS NULL OR
    length(btrim(coalesce(p_body,''))) NOT BETWEEN 1 AND 4000 OR
    length(p_to)>254 OR lower(btrim(p_to)) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 THEN RAISE EXCEPTION 'Invalid private message' USING ERRCODE='42501'; END IF;
 SELECT m.user_id INTO recipient
 FROM kennel_memberships m JOIN app_users u ON u.id=m.user_id
 WHERE m.kennel_id=p_kennel AND u.email=lower(btrim(p_to)) AND m.role IN ('owner','admin','staff');
 IF recipient IS NULL OR recipient=actor
 THEN RAISE EXCEPTION 'Recipient not authorized' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_kennel::text,0));
 -- Retry is idempotent. A UUID reused for different contents is a conflict.
 INSERT INTO business_private_messages(id,kennel_id,sender_id,recipient_id,body)
 VALUES(p_id,p_kennel,actor,recipient,btrim(p_body))
 ON CONFLICT(id) DO NOTHING;
 SELECT * INTO entry FROM business_private_messages WHERE id=p_id;
 IF entry.id IS NULL OR entry.kennel_id<>p_kennel OR entry.sender_id<>actor OR
 entry.recipient_id<>recipient OR entry.body<>btrim(p_body)
 THEN RAISE EXCEPTION 'Message identity conflict' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('id',entry.id,'sentAt',entry.sent_at,'senderID',entry.sender_id,'recipientID',entry.recipient_id);
END; $$;

CREATE OR REPLACE FUNCTION business_private_inbox(p_kennel uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; actor_role text; items jsonb;
BEGIN
 actor:=nullif(current_setting('request.user_id',true),'')::uuid;
 actor_role:=business_role(p_kennel);
 IF actor IS NULL OR coalesce(actor_role,'') NOT IN ('owner','admin','staff')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(row_data ORDER BY sent_at ASC,id ASC),'[]'::jsonb) INTO items
 FROM (
  SELECT p.id,p.sent_at,
   jsonb_build_object(
    'id',p.id,'sentAt',p.sent_at,'body',p.body,
    'senderID',p.sender_id,'recipientID',p.recipient_id,
    'senderName',coalesce(s.display_name,s.email),
    'recipientName',coalesce(r.display_name,r.email),
    'senderEmail',s.email,'recipientEmail',r.email
   ) AS row_data
  FROM business_private_messages p
   JOIN app_users s ON s.id=p.sender_id
   JOIN app_users r ON r.id=p.recipient_id
  WHERE p.kennel_id=p_kennel AND (p.sender_id=actor OR p.recipient_id=actor)
  ORDER BY p.sent_at DESC,p.id DESC LIMIT 200
 ) selected;
 RETURN items;
END; $$;
REVOKE ALL ON FUNCTION business_private_send(uuid,uuid,text,text),business_private_inbox(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_private_send(uuid,uuid,text,text),business_private_inbox(uuid) TO kennelflow_api;
COMMIT;
