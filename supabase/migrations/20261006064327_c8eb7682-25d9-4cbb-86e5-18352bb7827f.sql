CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_hash text NOT NULL,
  message_count int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_logs_client_time ON public.ai_usage_logs (client_hash, created_at DESC);
GRANT SELECT ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ai usage" ON public.ai_usage_logs FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- Rate limit + anonymous log in one step. Returns false when the visitor exceeded the limit.
CREATE OR REPLACE FUNCTION public.ai_rate_check(_client_hash text, _message_count int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF _client_hash IS NULL OR length(_client_hash) < 16 OR length(_client_hash) > 128 THEN
    RAISE EXCEPTION 'bad_client';
  END IF;
  SELECT count(*) INTO n FROM ai_usage_logs
   WHERE client_hash = _client_hash AND status = 'ok' AND created_at > now() - interval '10 minutes';
  IF n >= 20 THEN
    INSERT INTO ai_usage_logs (client_hash, message_count, status) VALUES (_client_hash, greatest(0, least(_message_count, 100)), 'rate_limited');
    RETURN false;
  END IF;
  INSERT INTO ai_usage_logs (client_hash, message_count, status) VALUES (_client_hash, greatest(0, least(_message_count, 100)), 'ok');
  DELETE FROM ai_usage_logs WHERE created_at < now() - interval '90 days';
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ai_rate_check(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.ai_rate_check(text, int) TO anon, authenticated, service_role;