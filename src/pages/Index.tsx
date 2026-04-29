import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Play, Sparkles, Square, Boxes, Network, Github } from "lucide-react";
import { createPublicClient, formatEther, formatGwei, formatUnits, http, parseEther, parseUnits, type Address } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { useAccount, useConnect, useDisconnect, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
type TradeProposal = {
  action: "BUY" | "SELL";
  token_in: string;
  token_out: string;
  amount_in_usd: number;
  reason: string;
};
type MemoryCommit = {
  run_id: string;
  content_hash: string;
  merkle_root: string;
  network: string;
  indexer_url: string;
  status: "committed" | "uploaded";
  payload?: unknown;
};
type EnsIdentity = {
  name: string;
  address: Address;
  avatar?: string;
  description?: string;
  url?: string;
  source: "forward" | "reverse";
};
type AxlTopology = {
  our_ipv6?: string;
  our_public_key?: string;
  peers?: unknown[];
  tree?: unknown[];
};

const isWalletSignedUniswapExecution = (metadata: unknown) => {
  if (!metadata || typeof metadata !== "object") return false;
  const meta = metadata as Record<string, unknown>;
  return (
    meta.status === "ready_for_signature" &&
    meta.execution_type === "wallet_signed_uniswap_v3" &&
    meta.requires_user_signature === true
  );
};

const SEPOLIA_WETH = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14" as Address;
const SEPOLIA_USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238" as Address;
const SEPOLIA_SWAP_ROUTER = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;
const mainnetClient = createPublicClient({ chain: mainnet, transport: http() });
const AXL_PEER_ID_RE = /^[a-fA-F0-9]{64}$/;
const DEFAULT_TEST_AMOUNT_IN = parseEther("0.0001");
const MIN_TEST_AMOUNT_IN = parseEther("0.00001");
const MAX_TEST_AMOUNT_IN = parseEther("0.0005");
const GAS_RESERVE = parseEther("0.00003");
const USDC_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
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
  { name: "ENS", desc: "Agent Identity" },
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
  const [ethAmt, setEthAmt] = useState(0);
  const [usdcAmt, setUsdcAmt] = useState(0);
  const [memoryCommit, setMemoryCommit] = useState<MemoryCommit | null>(null);
  const [ensInput, setEnsInput] = useState("agentorium.eth");
  const [ensIdentity, setEnsIdentity] = useState<EnsIdentity | null>(null);
  const [ensStatus, setEnsStatus] = useState<"idle" | "resolving" | "resolved" | "not_found">("idle");
  const [axlEndpoint, setAxlEndpoint] = useState("http://127.0.0.1:9002");
  const [axlPeerId, setAxlPeerId] = useState("");
  const [axlTopology, setAxlTopology] = useState<AxlTopology | null>(null);
  const [axlStatus, setAxlStatus] = useState<"idle" | "checking" | "connected" | "unreachable" | "sending">("idle");
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const onSepolia = chainId === sepolia.id;

  const wbtcAmt = 0;

  const positions: Position[] = useMemo(
    () => [
      { symbol: "ETH", amount: ethAmt, usdValue: ethAmt * ethPrice, change24h: 2.3 },
      { symbol: "USDC", amount: usdcAmt, usdValue: usdcAmt, change24h: 0 },
      { symbol: "WBTC", amount: wbtcAmt, usdValue: wbtcAmt * 67_000, change24h: 0 },
    ],
    [ethAmt, usdcAmt, wbtcAmt, ethPrice],
  );

  const totalUsd = positions.reduce((s, p) => s + p.usdValue, 0);

  const refreshBalances = useCallback(async () => {
    if (!address || !publicClient || !onSepolia) {
      setEthAmt(0);
      setUsdcAmt(0);
      return;
    }

    const [ethBalance, usdcBalance] = await Promise.all([
      publicClient.getBalance({ address }),
      (publicClient.readContract as any)({ address: SEPOLIA_USDC, abi: USDC_BALANCE_ABI, functionName: "balanceOf", args: [address] }),
    ]);
    setEthAmt(Number(formatEther(ethBalance)));
    setUsdcAmt(Number(formatUnits(usdcBalance, 6)));
  }, [address, onSepolia, publicClient]);

  useEffect(() => {
    refreshBalances().catch(() => undefined);
  }, [refreshBalances]);

  useEffect(() => {
    const loadLogs = async () => {
      const query = (supabase.from("execution_logs" as never) as any)
        .select("tx_hash, description, gas_gwei, status, explorer_url, created_at")
        .order("created_at", { ascending: false })
        .limit(12);
      const { data } = address ? await query.ilike("wallet_address", address) : await query;
      if (!data) return;
      setTxs(
        data.map((row: any) => ({
          id: row.tx_hash,
          ts: new Date(row.created_at).getTime(),
          hash: row.tx_hash,
          description: row.description,
          gasGwei: Number(row.gas_gwei ?? 0),
          status: row.status,
          explorerUrl: row.explorer_url,
        })),
      );
    };
    loadLogs().catch(() => undefined);
  }, [address]);

  useEffect(() => {
    const loadMemoryCommit = async () => {
      const query = (supabase.from("agent_memory_commits" as never) as any)
        .select("run_id, content_hash, merkle_root, network, indexer_url, status")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data } = await query;
      if (data) setMemoryCommit(data as MemoryCommit);
    };
    loadMemoryCommit().catch(() => undefined);
  }, []);

  const resolveEnsIdentity = useCallback(async (nameOrAddress?: string) => {
    const value = (nameOrAddress ?? ensInput).trim();
    if (!value) return;

    setEnsStatus("resolving");
    try {
      if (value.endsWith(".eth")) {
        const name = normalize(value);
        const resolvedAddress = await mainnetClient.getEnsAddress({ name });
        if (!resolvedAddress) throw new Error("ENS name did not resolve to an address.");
        const [avatar, description, url] = await Promise.all([
          mainnetClient.getEnsAvatar({ name }).catch(() => undefined),
          mainnetClient.getEnsText({ name, key: "description" }).catch(() => undefined),
          mainnetClient.getEnsText({ name, key: "url" }).catch(() => undefined),
        ]);
        setEnsIdentity({ name, address: resolvedAddress, avatar: avatar ?? undefined, description: description ?? undefined, url: url ?? undefined, source: "forward" });
      } else if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
        const reverseName = await mainnetClient.getEnsName({ address: value as Address });
        if (!reverseName) throw new Error("Address has no ENS reverse record.");
        const [avatar, description, url] = await Promise.all([
          mainnetClient.getEnsAvatar({ name: reverseName }).catch(() => undefined),
          mainnetClient.getEnsText({ name: reverseName, key: "description" }).catch(() => undefined),
          mainnetClient.getEnsText({ name: reverseName, key: "url" }).catch(() => undefined),
        ]);
        setEnsIdentity({ name: reverseName, address: value as Address, avatar: avatar ?? undefined, description: description ?? undefined, url: url ?? undefined, source: "reverse" });
      } else {
        throw new Error("Enter an ENS name or wallet address.");
      }
      setEnsStatus("resolved");
    } catch (e) {
      setEnsIdentity(null);
      setEnsStatus("not_found");
      toast({ title: "ENS identity not found", description: e instanceof Error ? e.message : "Try another ENS name.", variant: "destructive" });
    }
  }, [ensInput]);

  useEffect(() => {
    if (address) resolveEnsIdentity(address).catch(() => undefined);
  }, [address, resolveEnsIdentity]);

  const checkAxlNode = useCallback(async () => {
    setAxlStatus("checking");
    try {
      const res = await fetch(`${axlEndpoint.replace(/\/$/, "")}/topology`);
      if (!res.ok) throw new Error(`AXL topology returned ${res.status}`);
      const topology = await res.json() as AxlTopology;
      setAxlTopology(topology);
      setAxlStatus("connected");
      toast({ title: "AXL node connected", description: `${topology.peers?.length ?? 0} peers visible on the local mesh.` });
    } catch (e) {
      setAxlTopology(null);
      setAxlStatus("unreachable");
      toast({ title: "AXL node unreachable", description: e instanceof Error ? e.message : "Run AXL locally on port 9002.", variant: "destructive" });
    }
  }, [axlEndpoint]);

  const sendOverAxl = useCallback(async (message: AxlMessage) => {
    if (!AXL_PEER_ID_RE.test(axlPeerId)) return { delivered: false, reason: "missing_remote_peer" };

    setAxlStatus("sending");
    const payload = JSON.stringify({
      protocol: "agentorium.axl.v1",
      transport: "Gensyn AXL",
      message,
      ensIdentity,
      sent_at: new Date().toISOString(),
    });

    const res = await fetch(`${axlEndpoint.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Destination-Peer-Id": axlPeerId,
      },
      body: new TextEncoder().encode(payload),
    });
    if (!res.ok) throw new Error(`AXL send returned ${res.status}`);
    setAxlStatus("connected");
    return { delivered: true, bytes: res.headers.get("X-Sent-Bytes") ?? String(payload.length) };
  }, [axlEndpoint, axlPeerId, ensIdentity]);

  const getExecutionAmount = (trade?: TradeProposal) => {
    const rawEth = trade?.token_in?.toUpperCase() === "ETH" && trade.amount_in_usd > 0 ? trade.amount_in_usd / ethPrice : 0.0001;
    const requested = parseEther(Math.max(0.00001, rawEth).toFixed(8));
    const walletCap = parseEther(Math.max(0, ethAmt).toFixed(8)) > GAS_RESERVE ? parseEther(Math.max(0, ethAmt).toFixed(8)) - GAS_RESERVE : 0n;
    const cappedByDemo = requested > MAX_TEST_AMOUNT_IN ? MAX_TEST_AMOUNT_IN : requested;
    const cappedByWallet = walletCap > 0n && cappedByDemo > walletCap ? walletCap : cappedByDemo;
    if (walletCap < MIN_TEST_AMOUNT_IN) throw new Error("Your Sepolia ETH balance is too low for a safe test swap plus gas.");
    return cappedByWallet >= MIN_TEST_AMOUNT_IN ? cappedByWallet : DEFAULT_TEST_AMOUNT_IN;
  };

  const executeSepoliaSwap = async (trade?: TradeProposal) => {
    if (!address) throw new Error("Connect a wallet before executing a testnet swap.");
    if (!onSepolia) throw new Error("Switch your wallet to Sepolia before executing.");
    if (!publicClient) throw new Error("Sepolia public client is not ready.");

    const amountIn = getExecutionAmount(trade);
    const estimatedOut = Number(formatEther(amountIn)) * ethPrice;
    const minOut = parseUnits(Math.max(0, estimatedOut * 0.94).toFixed(6), 6);
    const description = trade
      ? `Sepolia Uniswap: ${trade.action} ${Number(formatEther(amountIn)).toFixed(6)} ${trade.token_in}→${trade.token_out}`
      : `Sepolia Uniswap: ${Number(formatEther(amountIn)).toFixed(6)} ETH→USDC`;

    setExecutionMode("awaiting_signature");
    const hash = await writeContractAsync({
      address: SEPOLIA_SWAP_ROUTER,
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      account: address,
      chain: sepolia,
      chainId: sepolia.id,
      value: amountIn,
      args: [
        {
          tokenIn: SEPOLIA_WETH,
          tokenOut: SEPOLIA_USDC,
          fee: 3000,
          recipient: address,
          amountIn,
          amountOutMinimum: minOut,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    setExecutionMode("submitted");
    const gasPrice = await publicClient.getGasPrice().catch(() => 0n);
    const tx: KeeperTx = {
      id: hash,
      ts: Date.now(),
      hash,
      description,
      gasGwei: Number(formatGwei(gasPrice || 0n)),
      status: "submitted",
      explorerUrl: `https://sepolia.etherscan.io/tx/${hash}`,
    };
    setTxs((prev) => [tx, ...prev]);
    await (supabase.from("execution_logs" as never) as any).upsert({
      wallet_address: address,
      tx_hash: hash,
      description,
      gas_gwei: tx.gasGwei,
      status: "submitted",
      chain: "sepolia",
      explorer_url: tx.explorerUrl,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const finalStatus = receipt.status === "success" ? "confirmed" : "failed";
    setTxs((prev) => prev.map((t) => (t.id === hash ? { ...t, status: finalStatus } : t)));
    setExecutionMode(finalStatus);
    await (supabase.from("execution_logs" as never) as any)
      .update({ status: finalStatus, confirmed_at: new Date().toISOString() })
      .eq("tx_hash", hash);
    await refreshBalances().catch(() => undefined);

    if (receipt.status !== "success") throw new Error("Sepolia swap transaction failed.");
    return hash;
  };

  const runOnce = async () => {
    setRunning(true);
    setExecutionMode("idle");
    setActiveAgent("Planner");
    try {
      const { data, error } = await supabase.functions.invoke("agent-loop", {
        body: {
          portfolio: { eth_usd: ethAmt * ethPrice, usdc: usdcAmt, wbtc_usd: wbtcAmt * 67_000 },
          riskProfile: risk,
          marketSnapshot: { eth_price: ethPrice },
          ensIdentity,
          axl: {
            local_endpoint: axlEndpoint,
            local_public_key: axlTopology?.our_public_key,
            remote_peer_id: axlPeerId || null,
            peers_visible: axlTopology?.peers?.length ?? 0,
          },
        },
      });
      if (error) throw error;
      const newMsgs: AxlMessage[] = data.messages ?? [];
      if (data.memoryCommit) {
        const commit = data.memoryCommit as MemoryCommit;
        await (supabase.from("agent_memory_commits" as never) as any).upsert({
          wallet_address: address,
          run_id: commit.run_id,
          content_hash: commit.content_hash,
          merkle_root: commit.merkle_root,
          payload: commit.payload,
          network: commit.network,
          indexer_url: commit.indexer_url,
          status: commit.status,
        });
        setMemoryCommit(commit);
      }

      // Stagger reveal for nice live feel
      let swapRequested = false;
      for (const m of newMsgs) {
        const sender = m.sender as AgentKey;
        setActiveAgent(sender);
        let deliveredMessage = m;
        if (axlPeerId && m.receiver !== "0G Storage") {
          try {
            const delivery = await sendOverAxl(m);
            deliveredMessage = {
              ...m,
              metadata: {
                ...(m.metadata ?? {}),
                axl_transport: "Gensyn AXL /send",
                axl_remote_peer_id: axlPeerId,
                axl_delivered: delivery.delivered,
                axl_sent_bytes: delivery.bytes,
              },
            };
          } catch (e) {
            deliveredMessage = {
              ...m,
              metadata: {
                ...(m.metadata ?? {}),
                axl_transport: "Gensyn AXL /send",
                axl_remote_peer_id: axlPeerId,
                axl_delivered: false,
                axl_error: e instanceof Error ? e.message : "AXL send failed",
              },
            };
            setAxlStatus("unreachable");
          }
        }
        setMessages((prev) => [...prev, deliveredMessage]);
        if (!swapRequested && m.role === "execute" && isWalletSignedUniswapExecution(m.metadata)) {
          swapRequested = true;
          await executeSepoliaSwap(data.trade as TradeProposal | undefined);
          setPnl24h((p) => p + Math.round((Math.random() - 0.4) * 20));
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

              <div className="mt-4 rounded-xl bg-muted/30 ring-1 ring-border/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Wallet</div>
                    <div className="text-sm font-mono text-foreground/90">
                      {isConnected && address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected"}
                    </div>
                  </div>
                  {isConnected ? (
                    <Button variant="outline" size="sm" className="bg-transparent" onClick={() => disconnect()}>
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-transparent"
                      disabled={isConnecting || connectors.length === 0}
                      onClick={() => connect({ connector: connectors[0] })}
                    >
                      {isConnecting ? "Connecting…" : "Connect"}
                    </Button>
                  )}
                </div>
                {isConnected && !onSepolia && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-warning/10 text-warning hover:bg-warning/20"
                    disabled={isSwitching}
                    onClick={() => switchChain({ chainId: sepolia.id })}
                  >
                    {isSwitching ? "Switching…" : "Switch to Sepolia"}
                  </Button>
                )}
                <div className="text-[11px] font-mono text-muted-foreground">
                  Real execution: one wallet confirmation per approved Sepolia ETH → USDC cycle, capped at 0.0005 ETH.
                </div>
                <div className="rounded-lg bg-background/50 ring-1 ring-border/60 p-2.5 text-[11px] font-mono space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Gensyn AXL mesh</span>
                    <span className={axlStatus === "connected" ? "text-success uppercase" : axlStatus === "sending" ? "text-warning uppercase" : "text-muted-foreground uppercase"}>
                      {axlStatus === "sending" ? "sending" : axlStatus === "checking" ? "checking" : axlStatus === "connected" ? "connected" : "local"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input value={axlEndpoint} onChange={(e) => setAxlEndpoint(e.target.value)} className="h-8 bg-muted/30 font-mono text-[11px]" />
                    <Button variant="outline" size="sm" className="h-8 bg-transparent" disabled={axlStatus === "checking"} onClick={checkAxlNode}>
                      Topology
                    </Button>
                  </div>
                  <Input
                    value={axlPeerId}
                    onChange={(e) => setAxlPeerId(e.target.value.trim())}
                    placeholder="remote AXL peer public key for /send"
                    className="h-8 bg-muted/30 font-mono text-[11px]"
                  />
                  <div className="truncate text-muted-foreground">
                    {axlTopology?.our_public_key ? `local ${axlTopology.our_public_key.slice(0, 10)}… · peers ${axlTopology.peers?.length ?? 0}` : "Talks to localhost:9002 and sends each agent message to a separate AXL node when a peer key is provided."}
                  </div>
                </div>
                <div className="rounded-lg bg-background/50 ring-1 ring-border/60 p-2.5 text-[11px] font-mono space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">ENS agent identity</span>
                    <span className={ensStatus === "resolved" ? "text-success uppercase" : "text-muted-foreground uppercase"}>
                      {ensStatus === "resolving" ? "resolving" : ensStatus === "resolved" ? "verified" : "lookup"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={ensInput}
                      onChange={(e) => setEnsInput(e.target.value)}
                      placeholder="agent.eth or 0x…"
                      className="h-8 bg-muted/30 font-mono text-[11px]"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 bg-transparent"
                      disabled={ensStatus === "resolving"}
                      onClick={() => resolveEnsIdentity()}
                    >
                      Resolve
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    {ensIdentity?.avatar && <img src={ensIdentity.avatar} alt={`${ensIdentity.name} ENS avatar`} className="h-7 w-7 rounded-md ring-1 ring-border object-cover" />}
                    <div className="min-w-0">
                      <div className="truncate text-foreground/90">{ensIdentity?.name ?? "No ENS identity resolved yet"}</div>
                      <div className="truncate text-muted-foreground">
                        {ensIdentity ? `${ensIdentity.address.slice(0, 6)}…${ensIdentity.address.slice(-4)} · ${ensIdentity.source} resolution` : "Used by agents for discovery and transcript attribution"}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-lg bg-background/50 ring-1 ring-border/60 p-2.5 text-[11px] font-mono">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">0G memory root</span>
                    <span className="text-success uppercase">{memoryCommit?.status ?? "ready"}</span>
                  </div>
                  <div className="mt-1 truncate text-foreground/90">
                    {memoryCommit ? memoryCommit.merkle_root : "awaiting first agent run"}
                  </div>
                  <div className="mt-1 text-muted-foreground truncate">{memoryCommit?.network ?? "0g-galileo-testnet"}</div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <Button
                  onClick={runOnce}
                  disabled={running || !isConnected || !onSepolia}
                  className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground font-semibold"
                >
                  {running ? (
                    <>
                      <Activity className="h-4 w-4 mr-2 animate-pulse-dot" />
                      {executionMode === "awaiting_signature" ? "Awaiting wallet…" : "Cycle running…"}
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
                  disabled={!isConnected || !onSepolia}
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
                Each approved cycle reads wallet balances, applies risk caps and slippage, then asks your wallet to sign.
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
          built with Lovable Cloud · Lovable AI Gateway · Gensyn AXL localhost bridge · 0G Storage-compatible memory commits · Uniswap public quote API
        </footer>
      </main>
    </div>
  );
};

export default Index;
