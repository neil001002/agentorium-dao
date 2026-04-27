const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Live ETH price from CoinGecko (Uniswap-aligned reference price). No auth required.
// Used by the Trader Agent panel to display real market data.

interface QuoteResponse {
  timestamp: number;
  tokens: Record<string, { usd: number; change24h: number }>;
  sampleQuote: {
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    route: string;
    gasEstimateUsd: number;
    priceImpactPct: number;
  };
  stale?: boolean;
}

// In-memory cache (persists across warm invocations) to absorb CoinGecko 429s.
let cache: { data: QuoteResponse; fetchedAt: number } | null = null;
const FRESH_MS = 60_000; // serve cached payload for 60s without re-fetching

const fallbackQuote: QuoteResponse = {
  timestamp: Date.now(),
  tokens: {
    ETH: { usd: 2300, change24h: 0 },
    USDC: { usd: 1, change24h: 0 },
    WBTC: { usd: 77000, change24h: 0 },
  },
  sampleQuote: {
    tokenIn: "ETH",
    tokenOut: "USDC",
    amountIn: 1,
    amountOut: 2300,
    route: "Sepolia testnet · WETH → USDC",
    gasEstimateUsd: 0,
    priceImpactPct: 0,
  },
  stale: true,
};

function buildPayload(data: any): QuoteResponse {
  return {
    timestamp: Date.now(),
    tokens: {
      ETH: { usd: data.ethereum?.usd ?? 0, change24h: data.ethereum?.usd_24h_change ?? 0 },
      USDC: { usd: data["usd-coin"]?.usd ?? 1, change24h: data["usd-coin"]?.usd_24h_change ?? 0 },
      WBTC: { usd: data["wrapped-bitcoin"]?.usd ?? 0, change24h: data["wrapped-bitcoin"]?.usd_24h_change ?? 0 },
    },
    sampleQuote: {
      tokenIn: "ETH",
      tokenOut: "USDC",
      amountIn: 1,
      amountOut: data.ethereum?.usd ?? 0,
      route: "ETH → USDC (v3 0.05%)",
      gasEstimateUsd: 1.84,
      priceImpactPct: 0.02,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Serve fresh cache without hitting upstream
  if (cache && Date.now() - cache.fetchedAt < FRESH_MS) {
    return new Response(JSON.stringify(cache.data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,wrapped-bitcoin&vs_currencies=usd&include_24hr_change=true";
    const res = await fetch(url, { headers: { accept: "application/json" } });

    if (!res.ok) {
      // Upstream rate-limited or down — fall back to last good data if we have it.
      if (cache) {
        return new Response(
          JSON.stringify({ ...cache.data, stale: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ...fallbackQuote, timestamp: Date.now() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    const payload = buildPayload(data);
    cache = { data: payload, fetchedAt: Date.now() };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Network/parse failure — serve cached if available
    if (cache) {
      return new Response(
        JSON.stringify({ ...cache.data, stale: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ ...fallbackQuote, timestamp: Date.now() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
