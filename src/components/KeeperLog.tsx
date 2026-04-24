import { CheckCircle2, ExternalLink, Cpu } from "lucide-react";

export interface KeeperTx {
  id: string;
  ts: number;
  hash: string;
  description: string;
  gasGwei: number;
  status: "submitted" | "confirmed" | "failed";
}

interface Props {
  txs: KeeperTx[];
}

const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export const KeeperLog = ({ txs }: Props) => {
  return (
    <div className="glass rounded-2xl p-5">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-emerald grid place-items-center">
            <Cpu className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">KeeperHub Audit Trail</h3>
            <p className="text-[11px] text-muted-foreground font-mono">private routing · gas-aware retries</p>
          </div>
        </div>
      </header>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {txs.length === 0 ? (
          <div className="text-sm text-muted-foreground font-mono py-6 text-center">No executions yet.</div>
        ) : (
          txs.map((tx) => (
            <div
              key={tx.id}
              className="rounded-xl bg-muted/30 ring-1 ring-border/60 p-3 flex items-center gap-3 animate-fade-up"
            >
              <div className="h-8 w-8 rounded-lg bg-success/10 ring-1 ring-success/30 grid place-items-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{tx.description}</div>
                <div className="text-[11px] font-mono text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>{shortHash(tx.hash)}</span>
                  <span className="opacity-50">·</span>
                  <span>{tx.gasGwei.toFixed(1)} gwei</span>
                  <span className="opacity-50">·</span>
                  <span>{new Date(tx.ts).toLocaleTimeString()}</span>
                </div>
              </div>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="open tx"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
