CREATE POLICY "Public can update execution log status"
ON public.execution_logs
FOR UPDATE
USING (
  chain = 'sepolia'
  AND wallet_address ~* '^0x[a-f0-9]{40}$'
  AND tx_hash ~* '^0x[a-f0-9]{64}$'
)
WITH CHECK (
  chain = 'sepolia'
  AND wallet_address ~* '^0x[a-f0-9]{40}$'
  AND tx_hash ~* '^0x[a-f0-9]{64}$'
  AND status IN ('submitted', 'confirmed', 'failed')
);