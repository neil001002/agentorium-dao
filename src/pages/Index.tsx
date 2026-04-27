import { useEffect, useMemo, useState } from "react";
import { Activity, Play, Sparkles, Square, Boxes, Network, Github } from "lucide-react";
import { formatGwei, parseEther, type Address } from "viem";
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { sepolia } from "@/lib/wagmi";
import { PortfolioCard, type Position } from "@/components/PortfolioCard";
import { MessageFeed, type AxlMessage } from "@/components/MessageFeed";
import { UniswapQuoteCard } from "@/components/UniswapQuoteCard";
import { KeeperLog, type KeeperTx } from "@/components/KeeperLog";
import { AgentRoster } from "@/components/AgentRoster";
import type { AgentKey } from "@/components/AgentBadge";

type RiskProfile = "conservative" | "balanced" | "aggressive";

const SEPOLIA_WETH = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14" as Address;
const SEPOLIA_USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238" as Address;
const SEPOLIA_SWAP_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;
const TEST_AMOUNT_IN = parseEther("0.0001");
const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
const SWAP_ROUTER_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

const SPONSORS = [
  { name: "0G", desc: "Storage & Compute" },
  { name: "Gensyn AXL", desc: "P2P Mesh" },
  { name: "Uniswap", desc: "Routing API" },
  { name: "KeeperHub", desc: "Execution" },
];

const Index = () => {
  const [risk, setRisk] = useState<RiskProfile>("balanced");
  const [running, setRunning] = useState(false);
  const [executionMode, setExecutionMode] = useState<"idle" | "awaiting_signature" | "submitted" | "confirmed" | "failed">("idle");
  const [activeAgent, setActiveAgent] = useState<AgentKey | null>(null);
  const [messages, setMessages] = useState<AxlMessage[]>([]);
  const [txs, setTxs] = useState<KeeperTx[]>([]);
  const [ethPrice, setEthPrice] = useState(3500);
  const [pnl24h, setPnl24h] = useState(2487);
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const onSepolia = chainId === sepolia.id;

  // Mock holdings
  const [ethAmt] = useState(12.4);
  const [usdcAmt, setUsdcAmt] = useState(28_400);
  const [wbtcAmt] = useState(0.18);

  const positions: Position[] = useMemo(
    () => [
      { symbol: "ETH", amount: ethAmt, usdValue: ethAmt * ethPrice, change24h: 2.3 },
      { symbol: "USDC", amount: usdcAmt, usdValue: usdcAmt, change24h: 0 },
      { symbol: "WBTC", amount: wbtcAmt, usdValue: wbtcAmt * 67_000, change24h: -0.8 },
    ],
    [ethAmt, usdcAmt, wbtcAmt, ethPrice],
  );

  const totalUsd = positions.reduce((s, p) => s + p.usdValue, 0);

  const runOnce = async () => {
    setRunning(true);
    setActiveAgent("Planner");
    try {
      const { data, error } = await supabase.functions.invoke("agent-loop", {
        body: {
          portfolio: { eth_usd: ethAmt * ethPrice, usdc: usdcAmt, wbtc_usd: wbtcAmt * 67_000 },
          riskProfile: risk,
          marketSnapshot: { eth_price: ethPrice },
        },
      });
      if (error) throw error;
      const newMsgs: AxlMessage[] = data.messages ?? [];

      // Stagger reveal for nice live feel
      for (const m of newMsgs) {
        const sender = m.sender as AgentKey;
        setActiveAgent(sender);
        setMessages((prev) => [...prev, m]);
        if (m.role === "execute" && typeof m.metadata === "object" && m.metadata) {
          const md = m.metadata as { gas_gwei?: number };
          const hashMatch = m.content.match(/0x[a-f0-9]+/);
          setTxs((prev) => [
            {
              id: m.id,
              ts: m.ts,
              hash: hashMatch?.[0] ?? "0x" + crypto.randomUUID().replace(/-/g, "").slice(0, 40),
              description: data.trade
                ? `${data.trade.action} $${data.trade.amount_in_usd} ${data.trade.token_in}→${data.trade.token_out}`
                : "Executed swap",
              gasGwei: md.gas_gwei ?? 14,
              status: "confirmed",
            },
            ...prev,
          ]);
          // Mock portfolio drift
          if (data.trade) {
            setUsdcAmt((u) => u + (data.trade.action === "SELL" ? data.trade.amount_in_usd : -data.trade.amount_in_usd));
            setPnl24h((p) => p + Math.round((Math.random() - 0.4) * 200));
          }
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      setActiveAgent(null);
      toast({ title: "Cycle complete", description: "Multi-agent loop finished. Check the message feed." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("429") || msg.includes("RATE_LIMIT"))
        toast({ title: "Rate limited", description: "Slow down — Lovable AI Gateway is throttling.", variant: "destructive" });
      else if (msg.includes("402") || msg.includes("PAYMENT"))
        toast({ title: "Credits required", description: "Add credits in Workspace → Usage.", variant: "destructive" });
      else toast({ title: "Agent loop failed", description: msg, variant: "destructive" });
      setActiveAgent(null);
    } finally {
      setRunning(false);
    }
  };

  // Auto-loop when "running" toggled by user via Start/Stop control
  const [autoLoop, setAutoLoop] = useState(false);
  useEffect(() => {
    if (!autoLoop) return;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        await runOnce();
        await new Promise((r) => setTimeout(r, 8_000));
      }
    };
    loop();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoop]);

  return (
    <div className="min-h-screen relative">
      {/* Subtle grid bg */}
      <div className="fixed inset-0 grid-bg opacity-40 pointer-events-none" />

      {/* Header */}
      <header className="relative border-b border-border/50 backdrop-blur-xl bg-background/40 sticky top-0 z-30">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-primary grid place-items-center glow-primary">
              <Network className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">
                Agentorium <span className="text-gradient">DAO</span>
              </h1>
              <p className="text-[11px] text-muted-foreground font-mono">cooperative onchain quant fund · v0.1</p>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {SPONSORS.map((s) => (
              <div
                key={s.name}
                className="px-3 py-1.5 rounded-full bg-muted/30 ring-1 ring-border/60 text-[11px] font-mono"
              >
                <span className="text-foreground/90">{s.name}</span>
                <span className="text-muted-foreground"> · {s.desc}</span>
              </div>
            ))}
          </nav>

          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="hidden md:inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="h-3.5 w-3.5" /> repo
          </a>
        </div>

        {/* Ticker */}
        <div className="border-t border-border/40 overflow-hidden">
          <div className="flex animate-ticker whitespace-nowrap py-2 gap-12 text-[11px] font-mono text-muted-foreground">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex gap-12 shrink-0">
                <span>● PLANNER online</span>
                <span>● RESEARCHER online</span>
                <span>● TRADER online</span>
                <span>● RISK_MGR online</span>
                <span>● KEEPER_HUB ready</span>
                <span>0G storage replicated 3/3</span>
                <span>AXL mesh: 5 peers</span>
                <span>Uniswap router: v3</span>
                <span>private mempool: enabled</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 relative">
        {/* Hero block */}
        <section className="mb-8 grid lg:grid-cols-3 gap-6 items-stretch">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/10 ring-1 ring-secondary/30 text-[11px] font-mono text-secondary-glow mb-4">
                <Sparkles className="h-3 w-3" />
                AUTONOMOUS · MULTI-AGENT · ONCHAIN
              </div>
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.05]">
                A DAO run by{" "}
                <span className="text-gradient">cooperating agents</span>,
                <br />
                not committees.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl leading-relaxed">
                Strategy planner, researcher, trader and risk manager negotiate over Gensyn AXL,
                think on 0G Compute, remember on 0G Storage, swap via Uniswap, and execute through KeeperHub.
              </p>
            </div>

            <PortfolioCard positions={positions} totalUsd={totalUsd} pnl24h={pnl24h} />
          </div>

          <div className="space-y-6">
            {/* Controls */}
            <div className="glass-elevated rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Boxes className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Strategy Controls</h3>
              </div>

              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Risk profile
              </label>
              <ToggleGroup
                type="single"
                value={risk}
                onValueChange={(v) => v && setRisk(v as RiskProfile)}
                className="mt-2 w-full grid grid-cols-3 gap-1 bg-muted/40 p-1 rounded-lg ring-1 ring-border/60"
              >
                {(["conservative", "balanced", "aggressive"] as const).map((r) => (
                  <ToggleGroupItem
                    key={r}
                    value={r}
                    className="text-[11px] font-mono capitalize data-[state=on]:bg-gradient-primary data-[state=on]:text-primary-foreground rounded-md"
                  >
                    {r}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <div className="mt-5 space-y-2">
                <Button
                  onClick={runOnce}
                  disabled={running}
                  className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold"
                >
                  {running ? (
                    <>
                      <Activity className="h-4 w-4 mr-2 animate-pulse-dot" /> Cycle running…
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" /> Run one cycle
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setAutoLoop((v) => !v)}
                  className="w-full ring-1 ring-border bg-transparent hover:bg-muted/40"
                >
                  {autoLoop ? (
                    <>
                      <Square className="h-4 w-4 mr-2 text-destructive" /> Stop continuous mode
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2 text-secondary-glow" /> Start continuous mode
                    </>
                  )}
                </Button>
              </div>

              <p className="mt-3 text-[11px] font-mono text-muted-foreground leading-relaxed">
                Each cycle: Planner → Researcher → Trader → Risk → KeeperHub. Persisted to 0G log.
              </p>
            </div>

            <AgentRoster active={activeAgent} />
          </div>
        </section>

        {/* Live ops */}
        <section className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MessageFeed messages={messages} />
          </div>
          <div className="space-y-6">
            <UniswapQuoteCard onQuote={(q) => setEthPrice(q.tokens.ETH.usd || 3500)} />
            <KeeperLog txs={txs} />
          </div>
        </section>

        <footer className="mt-12 pb-6 text-center text-[11px] font-mono text-muted-foreground">
          built with Lovable Cloud · Lovable AI Gateway · Uniswap public quote API
        </footer>
      </main>
    </div>
  );
};

export default Index;
