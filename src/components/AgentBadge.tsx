import { Activity, Brain, LineChart, Shield, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentKey = "Planner" | "Researcher" | "Trader" | "RiskManager" | "KeeperHub";

export const AGENT_META: Record<
  AgentKey,
  { label: string; icon: typeof Brain; tone: string; ring: string; bg: string }
> = {
  Planner: {
    label: "Strategy Planner",
    icon: Brain,
    tone: "text-primary",
    ring: "ring-primary/30",
    bg: "bg-primary/10",
  },
  Researcher: {
    label: "Researcher",
    icon: LineChart,
    tone: "text-secondary-glow",
    ring: "ring-secondary/30",
    bg: "bg-secondary/10",
  },
  Trader: {
    label: "Trader",
    icon: Activity,
    tone: "text-success",
    ring: "ring-success/30",
    bg: "bg-success/10",
  },
  RiskManager: {
    label: "Risk Manager",
    icon: Shield,
    tone: "text-warning",
    ring: "ring-warning/30",
    bg: "bg-warning/10",
  },
  KeeperHub: {
    label: "KeeperHub",
    icon: Cpu,
    tone: "text-primary-glow",
    ring: "ring-primary/40",
    bg: "bg-primary/15",
  },
};

interface Props {
  agent: AgentKey;
  status: "idle" | "active" | "thinking";
  className?: string;
}

export const AgentBadge = ({ agent, status, className }: Props) => {
  const m = AGENT_META[agent];
  const Icon = m.icon;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 ring-1 backdrop-blur",
        m.bg,
        m.ring,
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", m.tone)} />
      <span className={cn("text-xs font-mono font-medium tracking-tight", m.tone)}>{m.label}</span>
      {status !== "idle" && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            status === "thinking" ? "bg-warning animate-pulse-dot" : "bg-success animate-pulse-dot",
          )}
        />
      )}
    </div>
  );
};
