import { AGENT_META, type AgentKey } from "./AgentBadge";
import { cn } from "@/lib/utils";

interface Props {
  active: AgentKey | null;
}

const ORDER: AgentKey[] = ["Planner", "Researcher", "Trader", "RiskManager", "KeeperHub"];

export const AgentRoster = ({ active }: Props) => {
  return (
    <div className="glass rounded-2xl p-5">
      <header className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight">Agent Mesh</h3>
        <p className="text-[11px] text-muted-foreground font-mono">5 nodes · running on 0G Compute</p>
      </header>
      <div className="grid grid-cols-5 gap-2">
        {ORDER.map((k) => {
          const m = AGENT_META[k];
          const Icon = m.icon;
          const isActive = active === k;
          return (
            <div
              key={k}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-xl ring-1 transition-all duration-300",
                isActive
                  ? cn("bg-primary/10 ring-primary/40 -translate-y-0.5")
                  : "bg-muted/20 ring-border/40",
              )}
            >
              <div
                className={cn(
                  "h-10 w-10 rounded-lg grid place-items-center transition-colors",
                  isActive ? "bg-gradient-primary" : "bg-background ring-1 ring-border",
                )}
              >
                <Icon className={cn("h-5 w-5", isActive ? "text-primary-foreground" : m.tone)} />
              </div>
              <span className={cn("text-[10px] font-mono text-center leading-tight", isActive ? "text-foreground" : "text-muted-foreground")}>
                {m.label}
              </span>
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  isActive ? "bg-success animate-pulse-dot" : "bg-muted-foreground/40",
                )}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
