I found the likely reason MetaMask asks twice: the app has two separate execution triggers that can call the wallet-signed Uniswap swap.

1. The main button runs `runOnce()`.
2. The auto-loop feature can also call `runOnce()` in a loop.
3. Inside `runOnce()`, every message with `role === "execute"` triggers `executeSepoliaSwap(...)`, which calls `writeContractAsync(...)` and opens MetaMask.

Because the agent response currently includes more than one `execute`-role message, the frontend can attempt a wallet transaction more than once in the same cycle. One is the actual swap request, and the newer 0G memory commit message is also marked as `execute`, so it can accidentally trigger the swap logic too.

Plan to fix:

1. Make transaction triggering stricter
   - Only call `executeSepoliaSwap(...)` when the message metadata explicitly says it is a wallet-signed Uniswap execution.
   - Use fields already emitted by the backend, such as:
     - `status === "ready_for_signature"`
     - `execution_type === "wallet_signed_uniswap_v3"`
     - `requires_user_signature === true`

2. Prevent duplicate swaps within one agent cycle
   - Add a local guard inside `runOnce()` so only one wallet transaction can be requested per cycle, even if multiple qualifying messages appear.

3. Separate 0G memory messages from wallet execution messages
   - Change the 0G memory commit message role from `execute` to a non-transaction role such as `research` or `plan`, or keep it visible but ensure the frontend never treats `memory_committed` metadata as a swap request.

4. Improve the UI copy
   - Update the wallet status text so it is clear that MetaMask should only open once per approved cycle.

Technical change targets:

- `src/pages/Index.tsx`
  - Replace the broad condition:
    ```ts
    if (m.role === "execute" && typeof m.metadata === "object" && m.metadata) {
      await executeSepoliaSwap(...)
    }
    ```
    with a stricter check for the Uniswap execution metadata and a per-cycle duplicate guard.

- `supabase/functions/agent-loop/index.ts`
  - Adjust the 0G memory commit message so it cannot be confused with an execution request.

Expected result:

- One approved cycle = at most one MetaMask transaction confirmation.
- 0G memory commits will still be shown and stored, but they will not trigger wallet signing.
- Auto-loop will still work, but each cycle will only request one swap confirmation.