-- Account-scoped profile editing. Test against isolated Neon before production.
BEGIN;
ALTER TABLE kennels ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
ALTER TABLE kennels ADD COLUMN IF NOT EXISTS contact_address text NOT NULL DEFAULT '';
ALTER TABLE kennels ADD COLUMN IF NOT EXISTS website text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION business_update_profile(
  p_kennel uuid, p_account uuid, p_expected_email text, p_expected_business_name text,
  p_email text, p_owner_name text, p_business_name text,
  p_phone text, p_address text, p_website text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_email text; old_business_name text;
BEGIN
 IF p_account IS DISTINCT FROM nullif(current_setting('request.user_id',true),'')::uuid
 OR NOT EXISTS(SELECT 1 FROM kennel_memberships WHERE kennel_id=p_kennel AND user_id=p_account AND role='owner')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF length(p_email)>254 OR length(p_email)<3 OR length(p_owner_name)>120 OR length(trim(p_owner_name))<1
 OR length(p_business_name)>120 OR length(trim(p_business_name))<1
 OR length(p_phone)>40 OR length(p_address)>500 OR length(p_website)>250
 THEN RAISE EXCEPTION 'Invalid business profile' USING ERRCODE='22023'; END IF;
 SELECT u.email,k.name INTO old_email,old_business_name FROM app_users u CROSS JOIN kennels k
 WHERE u.id=p_account AND k.id=p_kennel FOR UPDATE OF u,k;
 IF old_email IS DISTINCT FROM p_expected_email OR old_business_name IS DISTINCT FROM p_expected_business_name
 THEN RAISE EXCEPTION 'Profile changed on another device' USING ERRCODE='40001'; END IF;
 UPDATE app_users SET email=p_email, display_name=p_owner_name WHERE id=p_account;
 UPDATE kennels SET name=p_business_name,contact_phone=p_phone,contact_address=p_address,website=p_website WHERE id=p_kennel;
END $$;
REVOKE ALL ON FUNCTION business_update_profile(uuid,uuid,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION business_update_profile(uuid,uuid,text,text,text,text,text,text,text,text) TO kennelflow_api;
COMMIT;
