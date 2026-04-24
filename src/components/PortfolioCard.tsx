import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Position {
  symbol: string;
  amount: number;
  usdValue: number;
  change24h: number;
}

interface Props {
  positions: Position[];
  totalUsd: number;
  pnl24h: number;
}

const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const PortfolioCard = ({ positions, totalUsd, pnl24h }: Props) => {
  const pnlPct = totalUsd > 0 ? (pnl24h / totalUsd) * 100 : 0;
  const positive = pnl24h >= 0;

  return (
    <div className="glass-elevated rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-mono uppercase tracking-wider">DAO Treasury</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-primary/10 ring-1 ring-primary/30 text-primary">
            on 0G storage
          </span>
        </div>

        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-4xl font-bold tracking-tight tabular-nums">{fmtUsd(totalUsd)}</span>
          <div
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-md text-sm font-mono",
              positive ? "text-success bg-success/10" : "text-destructive bg-destructive/10",
            )}
          >
            {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            <span>
              {positive ? "+" : ""}
              {pnl24h.toFixed(0)} ({pnlPct.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {positions.map((p) => (
            <div key={p.symbol} className="rounded-xl bg-muted/40 ring-1 ring-border/60 p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-muted-foreground">{p.symbol}</span>
                <span
                  className={cn(
                    "text-[11px] font-mono",
                    p.change24h >= 0 ? "text-success" : "text-destructive",
                  )}
                >
                  {p.change24h >= 0 ? "+" : ""}
                  {p.change24h.toFixed(2)}%
                </span>
              </div>
              <div className="mt-1.5 text-lg font-semibold tabular-nums">{fmtUsd(p.usdValue)}</div>
              <div className="text-xs font-mono text-muted-foreground tabular-nums">
                {p.amount.toFixed(p.symbol === "USDC" ? 0 : 4)} {p.symbol}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
