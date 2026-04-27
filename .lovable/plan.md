Plan to make executions real using Uniswap testnet swaps with a user wallet

Scope confirmed:
- Execution: real testnet swaps, not mainnet funds
- Authorization: user-connected wallet signs every transaction
- First real integration: Uniswap

What will change

1. Add wallet connection
- Add Ethereum wallet support to the React app using Wagmi/Viem and a wallet connector such as MetaMask/injected wallets.
- Configure a testnet network, preferably Sepolia, so the app does not touch real mainnet funds.
- Show connection state in the Strategy Controls panel: disconnected, connected address, chain, and a warning if the user is on the wrong network.

2. Replace simulated execution with a real transaction flow
- Keep the AI multi-agent loop for Planner → Researcher → Trader → Risk Manager.
- Change the final “KeeperHub execution” stage from fake tx generation to a “ready to execute” trade proposal.
- After Risk Manager approval, the frontend will build and submit a real Uniswap testnet swap transaction from the connected wallet.
- The user will see the wallet confirmation popup and must approve the transaction manually.

3. Use real Uniswap testnet routing/quote data
- Update the quote path so it supports testnet token pairs rather than the current CoinGecko-only sample quote.
- Use known testnet token addresses for ETH/WETH and a testnet stable/token pair where Uniswap has usable liquidity.
- Add guardrails so the AI can only propose supported token pairs and small test amounts.

4. Update the UI for real execution status
- Rename labels that currently imply simulated execution.
- Add states such as: “wallet required”, “quote ready”, “awaiting signature”, “submitted”, “confirmed”, and “failed”.
- KeeperLog will record the actual transaction hash returned by the wallet provider instead of a generated fake hash.
- Add a link to the relevant testnet block explorer for each submitted tx.

5. Add safety controls
- Disable execution unless a wallet is connected and on the correct testnet.
- Enforce testnet-only chain checks.
- Cap transaction size to tiny test amounts.
- Require explicit user wallet confirmation; no private keys or server-side signing will be added.
- Keep mainnet execution unavailable unless you explicitly request it later.

6. Fix the existing quote reliability issue while integrating Uniswap
- The current `uniswap-quote` function can still fail cold-starts when CoinGecko returns 429 and no warm cache exists.
- I will add deterministic fallback quote data or improve the function so the app never blanks because of an upstream rate limit.

Technical details

Expected architecture:

```text
User wallet
   |
   | signs transaction
   v
React app + Wagmi/Viem
   |
   | gets route/quote + transaction calldata
   v
Uniswap testnet integration
   |
   | tx hash / receipt
   v
KeeperLog audit trail in UI

Lovable Cloud function
   |
   | AI agent reasoning only
   v
Planner -> Researcher -> Trader -> Risk Manager -> approved trade proposal
```

Files likely to be updated:
- `package.json` for wallet/Web3 dependencies
- `src/main.tsx` or `src/App.tsx` for wallet provider setup
- `src/pages/Index.tsx` for wallet connection, execution controls, and real tx handling
- `src/components/UniswapQuoteCard.tsx` for testnet quote display
- `src/components/KeeperLog.tsx` for explorer links and real hashes
- `supabase/functions/agent-loop/index.ts` to stop creating fake execution tx hashes and return an approved execution proposal
- `supabase/functions/uniswap-quote/index.ts` to improve quote reliability and/or support testnet quote data

Notes and assumptions
- I will not store private keys.
- I will not add backend signing.
- I will not enable mainnet trading.
- If the chosen testnet token pair has poor Uniswap liquidity, I will use a safer testnet-compatible pair or make the app clearly report “no route available” rather than faking execution.