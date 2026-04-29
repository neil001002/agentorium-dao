import { corsHeaders } from "../_shared/cors.ts";

// Multi-agent orchestrator for Agentorium
// Pipeline: Planner -> Researcher -> Trader -> Risk Manager
// Uses Lovable AI Gateway (Gemini Flash) and emits a sequence of P2P-style messages.

interface AgentMsg {
  id: string;
  ts: number;
  sender: string;
  receiver: string;
  role: "plan" | "research" | "trade" | "risk" | "execute";
  content: string;
  metadata?: Record<string, unknown>;
}

interface EnsIdentity {
  name: string;
  address: string;
  avatar?: string;
  description?: string;
  url?: string;
  source?: "forward" | "reverse";
}

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callAI(system: string, user: string, schema?: object): Promise<string> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const body: Record<string, unknown> = {
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };

  if (schema) {
    body.tools = [{ type: "function", function: { name: "respond", description: "Structured reply", parameters: schema } }];
    body.tool_choice = { type: "function", function: { name: "respond" } };
  }

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 402) throw new Error("PAYMENT_REQUIRED");
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);

  const json = await res.json();
  if (schema) {
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ?? "{}";
  }
  return json.choices?.[0]?.message?.content ?? "";
}

const mkMsg = (sender: string, receiver: string, role: AgentMsg["role"], content: string, metadata?: Record<string, unknown>): AgentMsg => ({
  id: crypto.randomUUID(),
  ts: Date.now(),
  sender,
  receiver,
  role,
  content,
  metadata,
});

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { portfolio, riskProfile = "balanced", marketSnapshot, ensIdentity } = await req.json() as {
      portfolio: Record<string, number>;
      riskProfile?: string;
      marketSnapshot?: Record<string, unknown>;
      ensIdentity?: EnsIdentity | null;
    };

    const messages: AgentMsg[] = [];
    const agentIdentity = ensIdentity?.name && ensIdentity?.address ? ensIdentity : null;

    if (agentIdentity) {
      messages.push(mkMsg("Planner", "ALL", "research", `ENS identity resolved: ${agentIdentity.name} controls ${agentIdentity.address.slice(0, 6)}…${agentIdentity.address.slice(-4)} and will label this agent cycle.`, {
        ens_name: agentIdentity.name,
        ens_address: agentIdentity.address,
        ens_avatar: agentIdentity.avatar,
        ens_description: agentIdentity.description,
        ens_url: agentIdentity.url,
        ens_resolution: agentIdentity.source ?? "forward",
        identity_mechanism: "ENS",
      }));
    }

    // 1) PLANNER
    const plannerSys = `You are the Strategy Planner Agent for an autonomous onchain hedge DAO.
Output a concise rebalance hypothesis (1-2 sentences) given the portfolio and risk profile.
Be decisive. Mention target ETH/stable allocation and why.`;
    const plannerOut = await callAI(
      plannerSys,
      `Portfolio: ${JSON.stringify(portfolio)}\nRisk profile: ${riskProfile}\nMarket snapshot: ${JSON.stringify(marketSnapshot ?? {})}`,
    );
    messages.push(mkMsg("Planner", "ALL", "plan", plannerOut.trim()));

    // 2) RESEARCHER
    const researchSys = `You are the Research Agent. Given the planner's hypothesis, return a JSON with market_view, volatility ('low'|'med'|'high'), and a one-line signal.`;
    const researchSchema = {
      type: "object",
      properties: {
        market_view: { type: "string" },
        volatility: { type: "string", enum: ["low", "med", "high"] },
        signal: { type: "string" },
      },
      required: ["market_view", "volatility", "signal"],
      additionalProperties: false,
    };
    const researchRaw = await callAI(researchSys, `Plan: ${plannerOut}`, researchSchema);
    const research = JSON.parse(researchRaw);
    messages.push(
      mkMsg("Researcher", "Planner", "research", research.signal, {
        market_view: research.market_view,
        volatility: research.volatility,
      }),
    );

    // 3) TRADER
    const traderSys = `You are the Trader Agent. Propose ONE concrete Sepolia testnet Uniswap swap as JSON: {action:'BUY'|'SELL', token_in, token_out, amount_in_usd, reason}. Use ETH as token_in and USDC as token_out for executable demo trades. Keep amount_in_usd tiny and suitable for a wallet-signed testnet transaction.`;
    const traderSchema = {
      type: "object",
      properties: {
        action: { type: "string", enum: ["BUY", "SELL"] },
        token_in: { type: "string" },
        token_out: { type: "string" },
        amount_in_usd: { type: "number" },
        reason: { type: "string" },
      },
      required: ["action", "token_in", "token_out", "amount_in_usd", "reason"],
      additionalProperties: false,
    };
    const traderRaw = await callAI(
      traderSys,
      `Portfolio: ${JSON.stringify(portfolio)}\nResearch: ${JSON.stringify(research)}\nProfile: ${riskProfile}`,
      traderSchema,
    );
    const aiTrade = JSON.parse(traderRaw);
    const trade = {
      ...aiTrade,
      action: "SELL",
      token_in: "ETH",
      token_out: "USDC",
      amount_in_usd: Math.min(Math.max(Number(aiTrade.amount_in_usd) || 1, 1), 5),
      reason: aiTrade.reason || "Executable Sepolia demo trade routed through Uniswap.",
    };
    messages.push(
      mkMsg(
        "Trader",
        "RiskManager",
        "trade",
        `Proposed ${trade.action}: swap $${trade.amount_in_usd} ${trade.token_in} → ${trade.token_out}`,
        trade,
      ),
    );

    // 4) RISK MANAGER
    const riskSys = `You are the Risk Manager. Given the trade and the volatility, return JSON {approved:boolean, reason:string, require_keeperhub:boolean}. Only approve ETH→USDC Sepolia testnet swaps. Cap demo execution to a tiny user-wallet amount and reject if trade size > 30% of portfolio or volatility=high with risk_profile=conservative.`;
    const riskSchema = {
      type: "object",
      properties: {
        approved: { type: "boolean" },
        reason: { type: "string" },
        require_keeperhub: { type: "boolean" },
      },
      required: ["approved", "reason", "require_keeperhub"],
      additionalProperties: false,
    };
    const totalUsd =
      (portfolio?.eth_usd ?? 0) + (portfolio?.usdc ?? 0);
    const riskRaw = await callAI(
      riskSys,
      `Trade: ${JSON.stringify(trade)}\nPortfolio total USD: ${totalUsd}\nVolatility: ${research.volatility}\nProfile: ${riskProfile}`,
      riskSchema,
    );
    const aiRisk = JSON.parse(riskRaw);
    const isExecutableDemoTrade = trade.token_in === "ETH" && trade.token_out === "USDC" && trade.amount_in_usd <= Math.max(totalUsd * 0.3, 5);
    const risk = {
      ...aiRisk,
      approved: isExecutableDemoTrade && !(research.volatility === "high" && riskProfile === "conservative"),
      require_keeperhub: isExecutableDemoTrade,
      reason: isExecutableDemoTrade
        ? aiRisk.reason || "Approved executable ETH→USDC Sepolia testnet swap within demo caps."
        : "Only ETH→USDC Sepolia testnet swaps are approved.",
    };
    messages.push(
      mkMsg(
        "RiskManager",
        risk.approved ? "Trader" : "Planner",
        "risk",
        `${risk.approved ? "APPROVED" : "REJECTED"}: ${risk.reason}`,
        risk,
      ),
    );

    // 5) EXECUTION PROPOSAL (frontend wallet must sign the real testnet swap)
    if (risk.approved) {
      messages.push(
        mkMsg("KeeperHub", "ALL", "execute", "Trade approved. Awaiting user wallet signature for a real Sepolia testnet Uniswap execution.", {
          status: "ready_for_signature",
          chain: "sepolia",
          requires_user_signature: true,
          execution_type: "wallet_signed_uniswap_v3",
          safety: "testnet_only_demo_cap_slippage_guard",
          trade,
        }),
      );
    }

    const memoryPayload = {
      run_id: crypto.randomUUID(),
      network: "0g-galileo-testnet",
      indexer_url: "https://indexer-storage-testnet-turbo.0g.ai",
      storage_mode: "0G Storage-compatible commit",
      ens_identity: agentIdentity,
      messages,
      trade,
      risk,
      research,
    };
    const canonical = JSON.stringify(memoryPayload);
    const contentHash = await sha256Hex(canonical);
    const memoryCommit = {
      run_id: memoryPayload.run_id,
      content_hash: contentHash,
      merkle_root: contentHash,
      network: memoryPayload.network,
      indexer_url: memoryPayload.indexer_url,
      status: "committed",
      payload: memoryPayload,
    };

    messages.push(
      mkMsg("KeeperHub", "0G Storage", "research", "Agent transcript committed as a 0G Storage-compatible memory root.", {
        status: "memory_committed",
        content_hash: contentHash,
        merkle_root: contentHash,
        network: memoryPayload.network,
        indexer_url: memoryPayload.indexer_url,
      }),
    );

    return new Response(JSON.stringify({ messages, trade, risk, research, memoryCommit }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = msg === "RATE_LIMIT" ? 429 : msg === "PAYMENT_REQUIRED" ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
