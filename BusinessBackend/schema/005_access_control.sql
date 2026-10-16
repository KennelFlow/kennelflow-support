-- A membership must not be a route to privileges outside its own kennel.
-- Policy evaluation through the API role must not recurse into membership policies.
CREATE OR REPLACE FUNCTION kennelflow_can_access(p_kennel uuid, p_write boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kennel_memberships
    WHERE kennel_id = p_kennel
      AND user_id = nullif(current_setting('request.user_id',true),'')::uuid
      AND (NOT p_write OR role IN ('owner','admin','staff'))
  );
$$;
REVOKE ALL ON FUNCTION kennelflow_can_access(uuid,boolean) FROM PUBLIC;
DROP POLICY IF EXISTS kennel_member_read ON kennels;
CREATE POLICY kennel_member_read ON kennels FOR SELECT USING (kennelflow_can_access(id,false));
DROP POLICY IF EXISTS record_member_read ON kennel_records;
CREATE POLICY record_member_read ON kennel_records FOR SELECT USING (kennelflow_can_access(kennel_id,false));
DROP POLICY IF EXISTS record_member_write ON kennel_records;
CREATE POLICY record_member_write ON kennel_records FOR ALL USING (kennelflow_can_access(kennel_id,true)) WITH CHECK (kennelflow_can_access(kennel_id,true));
DROP POLICY IF EXISTS attachment_member_read ON kennel_attachments;
CREATE POLICY attachment_member_read ON kennel_attachments FOR SELECT USING (kennelflow_can_access(kennel_id,false));
DROP POLICY IF EXISTS attachment_member_write ON kennel_attachments;
CREATE POLICY attachment_member_write ON kennel_attachments FOR ALL USING (kennelflow_can_access(kennel_id,true)) WITH CHECK (kennelflow_can_access(kennel_id,true));
-- Session/auth tables are accessed only by a separate trusted server role.

