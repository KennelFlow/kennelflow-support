-- Optimistic concurrency: only accept updates against the version the client last saw.
-- Invoke this function only through a verified authenticated database session.
CREATE OR REPLACE FUNCTION upsert_kennel_record(
  p_kennel_id uuid, p_id uuid, p_type text, p_schema_version integer,
  p_expected_revision bigint, p_payload jsonb, p_deleted_at timestamptz DEFAULT NULL
) RETURNS kennel_records LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result kennel_records;
BEGIN
  IF p_type IS NULL OR length(trim(p_type)) = 0 OR p_schema_version < 1 OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid record';
  END IF;
  IF p_expected_revision = 0 THEN
    INSERT INTO kennel_records(id, kennel_id, record_type, schema_version, revision, payload, deleted_at)
    VALUES (p_id, p_kennel_id, p_type, p_schema_version, 1, p_payload, p_deleted_at)
    ON CONFLICT DO NOTHING RETURNING * INTO result;
  ELSE
    UPDATE kennel_records SET payload = p_payload, revision = revision + 1,
      schema_version = p_schema_version, deleted_at = p_deleted_at, updated_at = now()
    WHERE kennel_id = p_kennel_id AND id = p_id AND revision = p_expected_revision
      AND record_type = p_type RETURNING * INTO result;
  END IF;
  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = '40001';
  END IF;
  RETURN result;
END;
$$;
-- The API must derive user identity from a verified session, and must not allow
-- untrusted callers to set request.user_id or access a table-owner DB role.

