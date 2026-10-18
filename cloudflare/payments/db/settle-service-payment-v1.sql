-- STAGING ONLY: apply to an isolated Neon branch for integration testing.
-- Do not run against customer production data until the schema is confirmed.
-- The procedure holds the pending checkout row lock and writes the payment record
-- within ONE PostgreSQL transaction. Any conflict raises and rolls back.
CREATE OR REPLACE FUNCTION public.ko_settle_service_payment_v1(
    p_order_id TEXT,
    p_payment_id TEXT,
    p_amount_cents BIGINT,
    p_environment TEXT,
    p_record_id UUID
)
RETURNS TABLE(saved BOOLEAN, already_recorded BOOLEAN, ignored BOOLEAN)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  pending RECORD;
  existing RECORD;
  payment_record JSONB;
  inserted_count INTEGER;
  expected_method TEXT;
  expected_note TEXT;
BEGIN
  IF p_order_id IS NULL OR length(p_order_id) = 0 OR length(p_order_id) > 192
     OR p_payment_id IS NULL OR length(p_payment_id) = 0 OR length(p_payment_id) > 192
     OR p_amount_cents IS NULL OR p_amount_cents < 100 OR p_amount_cents > 5000000
     OR p_environment NOT IN ('sandbox','production')
     OR p_record_id IS NULL THEN
    RAISE EXCEPTION 'Invalid verified Square settlement input';
  END IF;

  SELECT * INTO pending
  FROM public.kennelflow_square_checkouts
  WHERE order_id = p_order_id AND environment = p_environment
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, true;
    RETURN;
  END IF;
  IF pending.amount_cents IS DISTINCT FROM p_amount_cents THEN
    RAISE EXCEPTION 'Square payment amount mismatch';
  END IF;
  IF pending.status = 'COMPLETED' AND pending.payment_id IS DISTINCT FROM p_payment_id THEN
    RAISE EXCEPTION 'Conflicting Square payment ID';
  END IF;
  IF pending.status NOT IN ('COMPLETED','AWAITING_CUSTOMER_PAYMENT','PENDING') THEN
    RAISE EXCEPTION 'Checkout cannot be settled from this status: %', pending.status;
  END IF;
  IF pending.kennel_id IS NULL THEN
    RAISE EXCEPTION 'Checkout has no kennel';
  END IF;

  expected_method := CASE WHEN p_environment='sandbox'
    THEN 'Square Sandbox — TEST ONLY' ELSE 'Square' END;
  expected_note := 'Verified Square order ' || p_order_id;
  payment_record := jsonb_build_object(
    'id', p_record_id,
    'customerName', pending.customer_name,
    'puppyName', '',
    'date', to_char(timezone('UTC', statement_timestamp()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'amount', p_amount_cents::numeric / 100,
    'method', expected_method,
    'reference', p_payment_id,
    'notes', expected_note
  );

  INSERT INTO public.kennel_records(id,kennel_id,record_type,payload)
  VALUES (p_record_id,pending.kennel_id,'payments',
    jsonb_build_object('platform','ios','collection','payments','record',payment_record))
  ON CONFLICT(kennel_id,id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF inserted_count = 0 THEN
    SELECT record_type,payload,deleted_at INTO existing
    FROM public.kennel_records
    WHERE id=p_record_id AND kennel_id=pending.kennel_id
    FOR UPDATE;
    IF NOT FOUND
       OR existing.record_type IS DISTINCT FROM 'payments'
       OR existing.deleted_at IS NOT NULL
       OR existing.payload->'record'->>'reference' IS DISTINCT FROM p_payment_id
       OR existing.payload->'record'->>'method' IS DISTINCT FROM expected_method
       OR existing.payload->'record'->>'notes' IS DISTINCT FROM expected_note
       OR (existing.payload->'record'->>'amount')::numeric IS DISTINCT FROM p_amount_cents::numeric/100 THEN
      RAISE EXCEPTION 'Existing payment record conflict';
    END IF;
  END IF;

  UPDATE public.kennelflow_square_checkouts
  SET status='COMPLETED',payment_id=p_payment_id,updated_at=now()
  WHERE order_id=p_order_id AND environment=p_environment;
  RETURN QUERY SELECT inserted_count=1, inserted_count=0, false;
END;
$$;
