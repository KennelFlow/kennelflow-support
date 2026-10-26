-- Trusted Square webhook reconciliation, installed only after 015_windows_renewal.sql.
-- The HTTP layer MUST authenticate Square's signature and fetch the current
-- subscription from Square before invoking this function. No user can use
-- a webhook event alone to grant access.
CREATE OR REPLACE FUNCTION business_reconcile_square_subscription_event(
 p_event_id text,p_purchase_id text,p_plan text,p_state text,
 p_paid_until timestamptz,p_verified_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE matched kennelone_purchase_entitlements; inserted text;
BEGIN
 IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 3 AND 256
   OR p_purchase_id NOT LIKE 'sqsub:%'
   OR p_plan NOT IN ('monthly','annual') OR p_state NOT IN ('active','grace','expired')
   OR p_verified_at IS NULL OR p_verified_at>now()+interval '5 minutes'
   OR (p_state IN ('active','grace') AND (p_paid_until IS NULL OR p_paid_until<=now()))
 THEN RAISE EXCEPTION 'Invalid Square verification' USING ERRCODE='42501'; END IF;
 -- This cannot create a paid account. Both the existing Square purchase and
 -- the matching settled checkout must already be attached to the same owner.
 SELECT e.* INTO matched
 FROM kennelone_purchase_entitlements e
 JOIN kennelone_windows_checkout_links c
   ON c.user_id=e.user_id AND c.verified_purchase_id=e.provider_purchase_id
   AND c.plan=e.plan AND c.state='paid'
 WHERE e.provider='windows' AND e.provider_purchase_id=p_purchase_id
   AND e.plan=p_plan FOR UPDATE OF e;
 IF NOT FOUND THEN RETURN jsonb_build_object('matched',false,'changed',false); END IF;
 IF matched.state='refunded' THEN RETURN jsonb_build_object('matched',true,'changed',false,'refunded',true); END IF;
 INSERT INTO kennelone_billing_events(provider,provider_event_id,processed_at)
 VALUES('windows',p_event_id,now())
 ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING provider_event_id INTO inserted;
 IF inserted IS NULL THEN RETURN jsonb_build_object('matched',true,'changed',false,'duplicate',true); END IF;
 IF p_state='active' AND matched.valid_through IS NOT NULL
   AND p_paid_until<matched.valid_through THEN
   RAISE EXCEPTION 'Square renewal cannot shorten a paid period' USING ERRCODE='42501';
 END IF;
 UPDATE kennelone_purchase_entitlements
 SET state=p_state,valid_through=CASE
   WHEN p_state='expired' THEN LEAST(COALESCE(p_paid_until,now()),now())
   WHEN p_state='grace' THEN LEAST(COALESCE(matched.valid_through,p_paid_until),p_paid_until)
   ELSE p_paid_until END,
   verified_at=GREATEST(matched.verified_at,p_verified_at),updated_at=now()
 WHERE id=matched.id;
 RETURN jsonb_build_object('matched',true,'changed',true,'state',p_state);
END $$;
REVOKE ALL ON FUNCTION business_reconcile_square_subscription_event(text,text,text,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_reconcile_square_subscription_event(text,text,text,text,timestamptz,timestamptz) TO kennelflow_api;

-- A verified COMPLETED Square refund revokes only the purchase whose original
-- checkout order AND original payment match this refund. A subscription
-- renewal can never restore an explicitly refunded purchase.
CREATE OR REPLACE FUNCTION business_reconcile_square_refund_event(
 p_event_id text,p_square_order text,p_payment_id text,p_verified_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ent kennelone_purchase_entitlements; inserted text;
BEGIN
 IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 3 AND 256
   OR p_square_order IS NULL OR length(p_square_order) NOT BETWEEN 3 AND 256
   OR p_payment_id IS NULL OR length(p_payment_id) NOT BETWEEN 3 AND 256
   OR p_verified_at IS NULL OR p_verified_at>now()+interval '5 minutes'
 THEN RAISE EXCEPTION 'Invalid verified refund' USING ERRCODE='42501'; END IF;
 SELECT e.* INTO ent
 FROM kennelone_windows_checkout_links c
 JOIN kennelone_purchase_entitlements e ON e.user_id=c.user_id
  AND e.provider='windows' AND e.provider_purchase_id=c.verified_purchase_id
 WHERE c.square_order_id=p_square_order AND c.state='paid'
   AND (c.plan IN ('monthly','annual')
     OR (c.plan='lifetime' AND c.verified_purchase_id='sqpay:'||p_payment_id))
 FOR UPDATE OF e;
 IF NOT FOUND THEN RETURN jsonb_build_object('matched',false,'changed',false); END IF;
 INSERT INTO kennelone_billing_events(provider,provider_event_id,processed_at)
 VALUES('windows',p_event_id,now())
 ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING provider_event_id INTO inserted;
 IF inserted IS NULL THEN RETURN jsonb_build_object('matched',true,'changed',false,'duplicate',true); END IF;
 UPDATE kennelone_purchase_entitlements
 SET state='refunded',valid_through=now(),verified_at=GREATEST(verified_at,p_verified_at),updated_at=now()
 WHERE id=ent.id;
 RETURN jsonb_build_object('matched',true,'changed',true,'state','refunded');
END $$;
REVOKE ALL ON FUNCTION business_reconcile_square_refund_event(text,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_reconcile_square_refund_event(text,text,text,timestamptz) TO kennelflow_api;
