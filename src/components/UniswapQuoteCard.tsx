import { useEffect, useState } from "react";
import { ArrowDownUp, Fuel, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Quote {
  timestamp: number;
  tokens: Record<string, { usd: number; change24h: number }>;
  stale?: boolean;
  sampleQuote: {
    tokenIn: string;
    tokenOut: string;
    amountIn: number;
    amountOut: number;
    route: string;
    gasEstimateUsd: number;
    priceImpactPct: number;
  };
}

interface Props {
  onQuote?: (q: Quote) => void;
}

export const UniswapQuoteCard = ({ onQuote }: Props) => {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuote = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("uniswap-quote");
      if (error) throw error;
      setQuote(data as Quote);
      onQuote?.(data as Quote);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuote();
    const id = setInterval(fetchQuote, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="glass rounded-2xl p-5 relative overflow-hidden">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-violet grid place-items-center">
            <ArrowDownUp className="h-4 w-4 text-secondary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">Sepolia Uniswap Execution</h3>
            <p className="text-[11px] text-muted-foreground font-mono">wallet-signed testnet swaps</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 ring-1 ring-success/30">
          <Activity className="h-3 w-3 text-success" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-success">
            {loading ? "syncing" : quote?.stale ? "fallback" : "live"}
          </span>
        </div>
      </header>

      {error ? (
        <div className="text-sm text-destructive font-mono">{error}</div>
      ) : !quote ? (
        <div className="h-32 animate-shimmer rounded-xl" />
      ) : (
        <>
          <div className="rounded-xl bg-muted/40 ring-1 ring-border/60 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-muted-foreground">YOU PAY</div>
                <div className="text-2xl font-semibold tabular-nums mt-1">
                  {quote.sampleQuote.amountIn} <span className="text-base text-muted-foreground">{quote.sampleQuote.tokenIn}</span>
                </div>
              </div>
              <div className="h-9 w-9 rounded-full bg-background grid place-items-center ring-1 ring-border">
                <ArrowDownUp className="h-4 w-4 text-primary" />
              </div>
              <div className="text-right">
                <div className="text-xs font-mono text-muted-foreground">YOU RECEIVE</div>
                <div className="text-2xl font-semibold tabular-nums mt-1 text-gradient">
                  {quote.sampleQuote.amountOut.toFixed(2)}
                  <span className="text-base text-muted-foreground ml-1">{quote.sampleQuote.tokenOut}</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-3 gap-2 text-[11px] font-mono">
              <div>
                <div className="text-muted-foreground">ROUTE</div>
                <div className="text-foreground/90 mt-0.5">{quote.sampleQuote.route}</div>
              </div>
              <div>
                <div className="text-muted-foreground flex items-center gap-1">
                  <Fuel className="h-3 w-3" /> GAS
                </div>
                <div className="text-foreground/90 mt-0.5">${quote.sampleQuote.gasEstimateUsd.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">IMPACT</div>
                <div className="text-success mt-0.5">{quote.sampleQuote.priceImpactPct.toFixed(3)}%</div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {Object.entries(quote.tokens).map(([sym, t]) => (
              <div key={sym} className="rounded-lg bg-background/60 ring-1 ring-border/60 p-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted-foreground">{sym}</span>
                  <span className={t.change24h >= 0 ? "text-success" : "text-destructive"}>
                    {t.change24h >= 0 ? "+" : ""}
                    {t.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="text-sm font-semibold tabular-nums mt-1">
                  ${t.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
