import { corsHeaders } from "@supabase/supabase-js/cors";

// Live ETH price from CoinGecko (Uniswap-aligned reference price). No auth required.
// Used by the Trader Agent panel to display real market data.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,wrapped-bitcoin&vs_currencies=usd&include_24hr_change=true";
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const data = await res.json();

    const out = {
      timestamp: Date.now(),
      tokens: {
        ETH: { usd: data.ethereum?.usd ?? 0, change24h: data.ethereum?.usd_24h_change ?? 0 },
        USDC: { usd: data["usd-coin"]?.usd ?? 1, change24h: data["usd-coin"]?.usd_24h_change ?? 0 },
        WBTC: { usd: data["wrapped-bitcoin"]?.usd ?? 0, change24h: data["wrapped-bitcoin"]?.usd_24h_change ?? 0 },
      },
      // Synthesised "Uniswap quote" example (ETH -> USDC)
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

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
