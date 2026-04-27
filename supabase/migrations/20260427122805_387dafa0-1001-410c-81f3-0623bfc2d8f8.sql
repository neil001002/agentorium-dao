CREATE TABLE public.execution_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  gas_gwei NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted',
  chain TEXT NOT NULL DEFAULT 'sepolia',
  explorer_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view execution logs"
ON public.execution_logs
FOR SELECT
USING (true);

CREATE POLICY "Public can add execution logs"
ON public.execution_logs
FOR INSERT
WITH CHECK (
  chain = 'sepolia'
  AND wallet_address ~* '^0x[a-f0-9]{40}$'
  AND tx_hash ~* '^0x[a-f0-9]{64}$'
  AND status IN ('submitted', 'confirmed', 'failed')
);

CREATE INDEX execution_logs_wallet_created_idx
ON public.execution_logs (lower(wallet_address), created_at DESC);

CREATE INDEX execution_logs_created_idx
ON public.execution_logs (created_at DESC);