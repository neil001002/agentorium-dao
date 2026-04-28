CREATE TABLE public.agent_memory_commits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT,
  run_id TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  payload JSONB NOT NULL,
  network TEXT NOT NULL DEFAULT '0g-galileo-testnet',
  indexer_url TEXT NOT NULL DEFAULT 'https://indexer-storage-testnet-turbo.0g.ai',
  status TEXT NOT NULL DEFAULT 'committed',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_memory_commits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view agent memory commits"
ON public.agent_memory_commits
FOR SELECT
USING (true);

CREATE POLICY "Public can add agent memory commits"
ON public.agent_memory_commits
FOR INSERT
WITH CHECK (
  status IN ('committed', 'uploaded')
  AND network IN ('0g-galileo-testnet', '0g-storage-ready')
  AND content_hash ~* '^0x[a-f0-9]{64}$'
  AND merkle_root ~* '^0x[a-f0-9]{64}$'
  AND (wallet_address IS NULL OR wallet_address ~* '^0x[a-f0-9]{40}$')
);

CREATE INDEX agent_memory_commits_created_idx
ON public.agent_memory_commits (created_at DESC);

CREATE INDEX agent_memory_commits_wallet_idx
ON public.agent_memory_commits (lower(wallet_address), created_at DESC);