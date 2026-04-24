import { ArrowRight, MessageSquareText } from "lucide-react";
import { AgentBadge, AGENT_META, type AgentKey } from "./AgentBadge";
import { cn } from "@/lib/utils";

export interface AxlMessage {
  id: string;
  ts: number;
  sender: string;
  receiver: string;
  role: "plan" | "research" | "trade" | "risk" | "execute";
  content: string;
  metadata?: Record<string, unknown>;
}

const isAgent = (s: string): s is AgentKey =>
  ["Planner", "Researcher", "Trader", "RiskManager", "KeeperHub"].includes(s);

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface Props {
  messages: AxlMessage[];
}

export const MessageFeed = ({ messages }: Props) => {
  return (
    <div className="glass rounded-2xl flex flex-col h-full overflow-hidden">
      <header className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-primary grid place-items-center">
            <MessageSquareText className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight">P2P Agent Feed</h3>
            <p className="text-[11px] text-muted-foreground font-mono">via Gensyn AXL · sanitised</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-success/10 ring-1 ring-success/30">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-success">live</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[420px] max-h-[560px]">
        {messages.length === 0 ? (
          <div className="h-full grid place-items-center text-muted-foreground text-sm font-mono">
            Waiting for agents to broadcast…
          </div>
        ) : (
          messages.map((m) => {
            const sender = isAgent(m.sender) ? m.sender : "Planner";
            const receiver = isAgent(m.receiver) ? m.receiver : null;
            return (
              <div key={m.id} className="animate-fade-up">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono mb-1.5">
                  <span>{fmtTime(m.ts)}</span>
                  <span className="opacity-50">·</span>
                  <span className="uppercase tracking-wider">{m.role}</span>
                </div>
                <div className="flex items-start gap-2 flex-wrap">
                  <AgentBadge agent={sender as AgentKey} status="idle" />
                  {receiver && (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-2" />
                      <AgentBadge agent={receiver as AgentKey} status="idle" />
                    </>
                  )}
                  {!receiver && m.receiver === "ALL" && (
                    <>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-2" />
                      <span className="text-[11px] font-mono text-muted-foreground mt-1.5 px-2 py-1 rounded-full ring-1 ring-border bg-muted/40">
                        broadcast
                      </span>
                    </>
                  )}
                </div>
                <div
                  className={cn(
                    "mt-2 ml-1 pl-3 border-l-2 text-sm leading-relaxed",
                    AGENT_META[sender as AgentKey]?.tone.replace("text-", "border-"),
                  )}
                >
                  {m.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
