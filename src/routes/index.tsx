import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Home,
  Compass,
  ArrowLeftRight,
  History,
  Settings as SettingsIcon,
  Wifi,
  Smartphone,
  Activity,
  Check,
  AlertCircle,
  ChevronRight,
  Zap,
  RefreshCw,
  Star,
  ArrowUpRight,
  ArrowDownLeft,
  User,
  Copy,
  Plus,
  RotateCcw,
  Info,
  Sliders,
  Bell,
  SlidersHorizontal,
  ChevronLeft,
  LogOut,
} from "lucide-react";
import {
  getServerState,
  toggleHotspotState,
  dispatchSellOrder,
  dispatchBuyOrder,
  updateSettingsState,
  updateSpeedTestState,
  resetNodeState,
  executeP2PSwap,
} from "../lib/server-functions";

export const Route = createFileRoute("/")({
  component: Index,
});

type Tx = {
  id: string;
  type: "sell" | "buy";
  gb: number;
  price: number;
  counterparty: string;
  at: string;
  status: "confirmed" | "mining";
};

const MY_ADDR = "0x71C...3A9";

function Index() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Get logged-in username directly from localStorage (always available client-side)
  const currentUsername: string =
    typeof window !== "undefined" ? (localStorage.getItem("currentUser") ?? "") : "";

  // Redirect to login if no session (client-side guard)
  useEffect(() => {
    if (!currentUsername) {
      navigate({ to: "/login" });
    }
  }, [currentUsername, navigate]);

  // Mobile app tab navigation
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "simulator" | "radar" | "trade" | "history" | "settings"
  >("dashboard");

  // React Query server state — no initialData, let it fetch fresh
  const { data: db, isLoading } = useQuery({
    queryKey: ["serverState", currentUsername],
    queryFn: () => getServerState({ data: currentUsername }),
    enabled: !!currentUsername,
    refetchInterval: 1000,
  });

  const user = (db as any)?.user || {
    nodeName: "---",
    address: "---",
    balanceDc: 0,
    usedGb: 0,
    planGb: 2.0,
    balanceGb: 0,
    autoShare: true,
    throttlePercent: 100,
    isHotspotActive: false,
    sharedAmount: 0.0,
    speedMbps: 0,
    pingMs: 0,
  };

  const txs = (db as any)?.user?.txs || [];
  const listings = (db as any)?.peers || [];

  // Local override states for on-device network parameters
  const [deviceNetworkStats, setDeviceNetworkStats] = useState<{
    speed: number;
    ping: number;
    accumulatedMb: number;
  }>({
    speed: 0,
    ping: 0,
    accumulatedMb: 0,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Fetch real network connection properties if supported
    const conn =
      (navigator as any).connection ||
      (navigator as any).mozConnection ||
      (navigator as any).webkitConnection;
    if (conn) {
      const updateConn = () => {
        setDeviceNetworkStats((prev) => ({
          ...prev,
          speed: conn.downlink ? +(conn.downlink * 8).toFixed(1) : 64.2, // Convert Mb to Mbps
          ping: conn.rtt ? conn.rtt : 24,
        }));
      };
      conn.addEventListener("change", updateConn);
      updateConn();
    }

    // 2. Performance Observer to track real bytes loaded in this web session
    const observedEntries = new Set<string>();
    const updateBytes = () => {
      const resources = window.performance.getEntriesByType("resource");
      let newBytes = 0;
      resources.forEach((entry: any) => {
        if (!observedEntries.has(entry.name)) {
          observedEntries.add(entry.name);
          if (entry.transferSize) {
            newBytes += entry.transferSize;
          }
        }
      });
      if (newBytes > 0) {
        const mb = newBytes / (1024 * 1024);
        setDeviceNetworkStats((prev) => ({
          ...prev,
          accumulatedMb: +(prev.accumulatedMb + mb).toFixed(3),
        }));
      }
    };

    // Poll performance entries every 2 seconds
    const interval = setInterval(updateBytes, 2000);
    updateBytes();

    return () => clearInterval(interval);
  }, []);

  const nodeName = user.nodeName;
  const PLAN_GB = user.planGb;
  const isHotspotActive = user.isHotspotActive;
  const sharedAmount = user.sharedAmount;

  // Compute live on-device values
  const speedMbps = deviceNetworkStats.speed || user.speedMbps;
  const pingMs = deviceNetworkStats.ping || user.pingMs;
  const usedGb = +(user.usedGb + deviceNetworkStats.accumulatedMb / 1024).toFixed(3);
  const balanceGb = Math.max(
    0,
    +(user.balanceGb - deviceNetworkStats.accumulatedMb / 1024).toFixed(3),
  );

  // Local Settings form state synchronized on load
  const [settingsNodeName, setSettingsNodeName] = useState("");
  const [settingsAutoShare, setSettingsAutoShare] = useState(true);
  const [settingsThrottlePercent, setSettingsThrottlePercent] = useState(100);
  const [hasSyncedSettings, setHasSyncedSettings] = useState(false);

  useEffect(() => {
    const dbUser = (db as any)?.user;
    if (dbUser && !hasSyncedSettings) {
      setSettingsNodeName(dbUser.nodeName);
      setSettingsAutoShare(dbUser.autoShare);
      setSettingsThrottlePercent(dbUser.throttlePercent);
      setHasSyncedSettings(true);
    }
  }, [db, hasSyncedSettings]);

  // Speed test state (retains client-side animation, updates server at finish)
  const [isTesting, setIsTesting] = useState(false);
  const [testSpeed, setTestSpeed] = useState(0); // 0 to 100 for dial needle

  // Trade form inputs
  const [tradeType, setTradeType] = useState<"sell" | "buy">("sell");
  const [sellAmount, setSellAmount] = useState("0.5");
  const [sellPrice, setSellPrice] = useState("2.10");
  const [buyAmount, setBuyAmount] = useState("1.0");

  // Swipe-to-sell slider progress (0 to 100)
  const [swipeProgress, setSwipeProgress] = useState(0);

  // Radar Interactive states
  const [selectedPeer, setSelectedPeer] = useState<any | null>(null);
  const [isScanning, setIsScanning] = useState(true);

  // Transaction verification progress overlay
  const [isBuying, setIsBuying] = useState(false);
  const [buyStep, setBuyStep] = useState(0); // 0: Channel, 1: Escrow, 2: Smart Contract, 3: Completed
  const [buyActivePeer, setBuyActivePeer] = useState<any | null>(null);

  // Simulator states
  const [selectedSimPeerId, setSelectedSimPeerId] = useState("l2");
  const [simAmountGb, setSimAmountGb] = useState("0.5");
  const [isSimulatingSwap, setIsSimulatingSwap] = useState(false);
  const [swapAnimationDirection, setSwapAnimationDirection] = useState<"sell" | "buy">("sell");

  function triggerSimSwap(direction: "sell" | "buy", peer: any) {
    const amount = parseFloat(simAmountGb);
    if (direction === "sell") {
      if (balanceGb < amount) {
        toast.error("Insufficient excess data to sell");
        return;
      }
      if (peer.balanceDc < amount * peer.pricePerGb) {
        toast.error(`${peer.seller} node has insufficient DataCoins`);
        return;
      }
    } else {
      if (peer.gb < amount) {
        toast.error(`${peer.seller} node has insufficient excess data`);
        return;
      }
      const cost = amount * peer.pricePerGb + 0.05;
      if (user.balanceDc < cost) {
        toast.error("Insufficient DataCoins to buy");
        return;
      }
    }

    setSwapAnimationDirection(direction);
    setIsSimulatingSwap(true);

    setTimeout(() => {
      executeP2PSwapMutation.mutate({
        amountGb: amount,
        direction,
        peerId: peer.id,
      });
      setIsSimulatingSwap(false);
    }, 1500);
  }

  // Computed values
  const excess = Math.max(0, balanceGb);
  const usedPct = Math.min(100, (usedGb / PLAN_GB) * 100);
  const remainingGb = Math.max(0, balanceGb); // Synced with available balanceGb
  const remainingPct = Math.min(100, Math.max(0, (remainingGb / PLAN_GB) * 100));

  const sellGb = parseFloat(sellAmount) || 0;
  const sellPr = parseFloat(sellPrice) || 0;
  const receiveDC = +(sellGb * sellPr).toFixed(2);

  // Logout handler
  function handleLogout() {
    localStorage.removeItem("currentUser");
    queryClient.clear();
    navigate({ to: "/login" });
  }

  // Mutations
  const hotspotMutation = useMutation({
    mutationFn: (active: boolean) =>
      toggleHotspotState({ data: { username: currentUsername, active } }),
    onSuccess: (updatedDb) => {
      queryClient.setQueryData(["serverState", currentUsername], updatedDb);
    },
  });

  const sellMutation = useMutation({
    mutationFn: (payload: { gb: number; price: number }) =>
      dispatchSellOrder({ data: { username: currentUsername, ...payload } }),
    onSuccess: (updatedDb) => {
      queryClient.setQueryData(["serverState", currentUsername], updatedDb);
      toast.success("Selling Order Dispatched", {
        description: `Offered ${sellGb} GB for ${receiveDC} DC`,
      });
    },
    onError: (err: any) => {
      toast.error("Transaction Failed", {
        description: err.message || "Failed to dispatch sell order",
      });
    },
  });

  const buyMutation = useMutation({
    mutationFn: (payload: { gb: number; price: number; seller: string }) =>
      dispatchBuyOrder({ data: { username: currentUsername, ...payload } }),
    onSuccess: (updatedDb, variables) => {
      queryClient.setQueryData(["serverState", currentUsername], updatedDb);
      toast.success(`Purchase Completed!`, {
        description: `Acquired ${variables.gb} GB from node ${variables.seller}`,
      });
    },
    onError: (err: any) => {
      setIsBuying(false);
      setBuyActivePeer(null);
      toast.error("Purchase Failed", {
        description: err.message || "Failed to purchase bandwidth",
      });
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (payload: { nodeName: string; autoShare: boolean; throttlePercent: number }) =>
      updateSettingsState({ data: { username: currentUsername, ...payload } }),
    onSuccess: (updatedDb) => {
      queryClient.setQueryData(["serverState", currentUsername], updatedDb);
    },
  });

  const speedTestMutation = useMutation({
    mutationFn: (payload: { speedMbps: number; pingMs: number }) =>
      updateSpeedTestState({ data: { username: currentUsername, ...payload } }),
    onSuccess: (updatedDb) => {
      queryClient.setQueryData(["serverState", currentUsername], updatedDb);
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetNodeState({ data: currentUsername }),
    onSuccess: (updatedDb: any) => {
      queryClient.setQueryData(["serverState", currentUsername], updatedDb);
      if (updatedDb?.user) {
        setSettingsNodeName(updatedDb.user.nodeName);
        setSettingsAutoShare(updatedDb.user.autoShare);
        setSettingsThrottlePercent(updatedDb.user.throttlePercent);
      }
      toast.info("Node data reset successfully!");
    },
  });

  const executeP2PSwapMutation = useMutation({
    mutationFn: (payload: { amountGb: number; direction: "sell" | "buy"; peerId: string }) =>
      executeP2PSwap({ data: { username: currentUsername, ...payload } }),
    onSuccess: (updatedDb: any, variables) => {
      queryClient.setQueryData(["serverState", currentUsername], updatedDb);
      const peer = updatedDb.peers.find((p: any) => p.id === variables.peerId);
      const peerName = peer?.seller || "Peer";
      if (variables.direction === "sell") {
        toast.success(`✅ Sold ${variables.amountGb} GB to ${peerName}!`, {
          description: `Your excess data reduced. DataCoins earned and credited.`,
        });
      } else {
        toast.success(`✅ Bought ${variables.amountGb} GB from ${peerName}!`, {
          description: `Your data balance increased. DataCoins deducted.`,
        });
      }
    },
    onError: (err: any) => {
      toast.error("Swap Failed", { description: err.message || "P2P exchange failed" });
    },
  });

  // Track pending transaction confirmations to display chain confirmation toasts
  const prevTxsRef = useRef<Tx[]>([]);
  useEffect(() => {
    if (txs.length > 0) {
      txs.forEach((tx: any) => {
        const prevTx = prevTxsRef.current.find((t) => t.id === tx.id);
        if (prevTx && prevTx.status === "mining" && tx.status === "confirmed") {
          toast.success("Transaction Confirmed on Chain", {
            description: `${tx.gb} GB swap successfully mined.`,
          });
        }
      });
      prevTxsRef.current = txs;
    }
  }, [txs]);

  // Run mock speed test
  function runSpeedTest() {
    if (isTesting) return;
    setIsTesting(true);
    setTestSpeed(0);

    const duration = 2500;
    const startTime = Date.now();

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        clearInterval(timer);
        const finalSpeed = +(55 + Math.random() * 40).toFixed(1);
        const finalPing = Math.floor(10 + Math.random() * 12);

        speedTestMutation.mutate({ speedMbps: finalSpeed, pingMs: finalPing });
        setTestSpeed(finalSpeed);
        setIsTesting(false);
        toast.success("Speed test complete!", {
          description: `Download: ${finalSpeed} Mbps · Ping: ${finalPing} ms`,
        });
      } else {
        const oscillation = Math.sin(progress * Math.PI * 4) * 12;
        const current = progress * 80 + oscillation;
        setTestSpeed(Math.min(100, Math.max(0, current)));
      }
    }, 50);
  }

  // Handle Selling
  function handleSell() {
    if (!sellGb || sellGb > excess) {
      toast.error("Insufficient Sellable Data", {
        description: "Please check your available balance.",
      });
      return;
    }
    sellMutation.mutate({ gb: sellGb, price: receiveDC });
  }

  // Simulate buying protocol animation
  function startBuyingProtocol(peer: (typeof listings)[number]) {
    const buyGb = parseFloat(buyAmount) || 0;
    if (!buyGb || buyGb > peer.gb) {
      toast.error("Invalid purchase amount", {
        description: `Max available: ${peer.gb} GB`,
      });
      return;
    }

    setBuyActivePeer(peer);
    setIsBuying(true);
    setBuyStep(0);

    setTimeout(() => setBuyStep(1), 800);
    setTimeout(() => setBuyStep(2), 1600);
    setTimeout(() => setBuyStep(3), 2400);
    setTimeout(() => {
      buyMutation.mutate({
        gb: buyGb,
        price: +(buyGb * peer.pricePerGb).toFixed(2),
        seller: peer.seller,
      });
    }, 3200);
  }

  const earned = txs
    .filter((t) => t.type === "sell" && t.status === "confirmed")
    .reduce((s, t) => s + t.price, 0);
  const spent = txs
    .filter((t) => t.type === "buy" && t.status === "confirmed")
    .reduce((s, t) => s + t.price, 0);

  // Copy wallet address helper
  const copyAddress = () => {
    navigator.clipboard.writeText(MY_ADDR);
    toast.success("Wallet address copied to clipboard!");
  };

  // Reset demo application
  const resetDemo = () => {
    resetMutation.mutate();
  };

  return (
    <>
      {/* Show loading spinner while user data is being fetched (first load after login) */}
      {isLoading || !db || !(db as any)?.user ? (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
          <div className="h-10 w-10 rounded-full border-2 border-neon border-t-transparent animate-spin" />
          <p className="text-xs font-mono text-muted-foreground animate-pulse">
            Loading your node...
          </p>
        </div>
      ) : (
        <div className="device-simulator-container">
          {/* 3D Glassmorphic Device Simulator Container */}
          <div className="phone-mockup">
            {/* Bezel details */}
            <div className="phone-speaker" />
            <div className="phone-reflection" />

            {/* Device screen containing the app */}
            <div className="phone-screen bg-background text-foreground flex flex-col justify-between select-none">
              {/* iOS Status Bar */}
              <div className="h-10 px-6 flex items-center justify-between z-40 bg-background/85 backdrop-blur-md select-none text-xs font-semibold text-foreground/80 tracking-wider">
                <span>19:56</span>
                {/* Dynamic Island cutout */}
                <div className="h-5 w-24 bg-black rounded-full shadow-[inset_0_0_2px_rgba(255,255,255,0.15)] flex items-center justify-center">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse mr-2" />
                  <span className="font-mono text-[8px] uppercase text-green-400 tracking-widest scale-95">
                    L2 node
                  </span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  <Wifi className="h-3 w-3 text-neon" />
                  <span className="text-[10px]">5G</span>
                  <div className="h-3 w-5 border border-foreground/30 rounded-sm p-[1px] flex items-center">
                    <div className="h-full w-[85%] bg-neon rounded-[1px]" />
                  </div>
                </div>
              </div>

              {/* Core App Header */}
              <header className="px-5 py-3 border-b border-border/40 bg-card/40 flex items-center justify-between z-30">
                <div className="flex items-center gap-2">
                  <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-tr from-cyan to-neon shadow-[0_0_10px_oklch(0.85_0.24_145/_30%)]">
                    <Zap className="h-4.5 w-4.5 text-background fill-background" />
                  </div>
                  <div className="leading-none">
                    <span className="text-sm font-bold tracking-tight bg-gradient-to-r from-neon to-cyan bg-clip-text text-transparent">
                      DataSwap
                    </span>
                    <p className="text-[8px] font-mono text-muted-foreground uppercase tracking-widest">
                      v1.2.0 · L2 P2P
                    </p>
                  </div>
                </div>

                {/* Quick Wallet pill */}
                <div
                  onClick={copyAddress}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-secondary/50 cursor-pointer hover:bg-secondary transition active:scale-95"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-neon animate-pulse" />
                  <span className="font-mono text-xs font-bold text-foreground">
                    150.2
                    <span className="text-[10px] text-muted-foreground font-normal ml-0.5">DC</span>
                  </span>
                </div>
              </header>

              {/* Tab Screen Content */}
              <main className="flex-1 overflow-y-auto relative p-4 pb-24 space-y-4">
                {/* Ambient Background Glow meshes */}
                <div className="hero-orb anim-drift bg-primary/10 w-48 h-48 -top-10 -left-10" />
                <div
                  className="hero-orb anim-drift bg-cyan/10 w-40 h-40 bottom-10 -right-10"
                  style={{ animationDelay: "-3s" }}
                />

                {/* VIEW 1: DASHBOARD TAB */}
                {activeTab === "dashboard" && (
                  <div className="space-y-4 animate-fade-in">
                    {/* Intro Greeting */}
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-lg font-bold">Welcome, Node</h2>
                        <p className="text-xs text-muted-foreground">
                          ID: {nodeName} · {MY_ADDR}
                        </p>
                      </div>
                      <button
                        onClick={() => setActiveTab("settings")}
                        className="p-2 rounded-full border border-border bg-card/60 hover:bg-secondary transition active:scale-95"
                      >
                        <Sliders className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>

                    {/* Circular Wave Gauge */}
                    <div className="card-panel p-5 flex flex-col items-center relative overflow-hidden bg-gradient-to-b from-card to-card/60">
                      <span className="absolute top-3 left-4 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                        Daily Allowance Gauge
                      </span>

                      {/* Glowing Wave Bubble */}
                      <div className="wave-bubble mt-4">
                        {/* Sliding Liquid boundary */}
                        <div
                          className="wave-liquid"
                          style={{ transform: `translateY(${100 - remainingPct}%)` }}
                        />
                        {/* Rotating masks creating wave effect */}
                        <div className="wave-mask" style={{ bottom: `${remainingPct}%` }} />
                        <div
                          className="wave-mask-secondary"
                          style={{ bottom: `${remainingPct}%` }}
                        />

                        {/* Inner textual progress overlay */}
                        <div className="relative z-10 text-center flex flex-col items-center">
                          <span className="font-mono text-3xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                            {remainingGb.toFixed(2)}
                            <span className="text-xs font-normal ml-0.5 text-white/80">GB</span>
                          </span>
                          <span className="text-[9px] font-mono font-bold tracking-widest text-neon uppercase mt-1 drop-shadow-[0_1px_4px_rgba(0,0,0,0.4)]">
                            REMAINING
                          </span>
                        </div>
                      </div>

                      <div className="w-full mt-5 flex justify-between items-center px-2 text-xs font-mono">
                        <div className="text-left">
                          <p className="text-muted-foreground text-[10px] uppercase">Daily Limit</p>
                          <p className="font-bold text-foreground">{PLAN_GB.toFixed(1)} GB</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground text-[10px] uppercase">Used Today</p>
                          <p className="font-bold text-neon">{usedGb.toFixed(2)} GB</p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground text-[10px] uppercase">Status</p>
                          <p className="font-bold text-cyan-glow">
                            {remainingPct.toFixed(0)}% Left
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Hotspot Toggle P2P Hotspot active */}
                    <div
                      className={`card-panel p-4 flex items-center justify-between transition-all duration-300 ${isHotspotActive ? "border-neon/50 bg-neon-soft/5" : ""}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`grid h-10 w-10 place-items-center rounded-full border transition-all ${isHotspotActive ? "border-neon bg-neon/10 ring-pulse" : "border-border bg-secondary"}`}
                        >
                          <Activity
                            className={`h-5 w-5 ${isHotspotActive ? "text-neon" : "text-muted-foreground"}`}
                          />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold">P2P Cellular Hotspot</h4>
                          <p className="text-xs text-muted-foreground">
                            {isHotspotActive
                              ? `Sharing active · +${sharedAmount} GB shared`
                              : "Offline · share excess data"}
                          </p>
                        </div>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isHotspotActive}
                          onChange={(e) => hotspotMutation.mutate(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-neon" />
                      </label>
                    </div>

                    {/* Speedometer network testing */}
                    <div className="card-panel p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">Mesh Connection Health</h4>
                          <p className="text-xs text-muted-foreground font-mono">
                            Ping: {pingMs} ms · L2 Channel
                          </p>
                        </div>
                        <button
                          onClick={runSpeedTest}
                          disabled={isTesting}
                          className="px-3 py-1 rounded-lg border border-border bg-secondary hover:text-neon text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${isTesting ? "animate-spin text-neon" : ""}`}
                          />
                          {isTesting ? "Testing" : "Test Speed"}
                        </button>
                      </div>

                      {/* SVG Speed dial meter */}
                      <div className="relative flex justify-center py-2">
                        <svg width="180" height="110" viewBox="0 0 100 60">
                          <defs>
                            <linearGradient
                              id="neon-glow-gradient"
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="0%"
                            >
                              <stop offset="0%" stopColor="oklch(0.82 0.14 210)" />
                              <stop offset="100%" stopColor="oklch(0.88 0.26 145)" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M 15 50 A 35 35 0 0 1 85 50"
                            fill="none"
                            strokeWidth="6"
                            className="speedometer-track"
                          />
                          <path
                            d="M 15 50 A 35 35 0 0 1 85 50"
                            fill="none"
                            strokeWidth="6"
                            className="speedometer-progress"
                            style={{ strokeDashoffset: 110 - (110 * testSpeed) / 100 }}
                          />
                          {/* Needle */}
                          <polygon
                            points="48,50 52,50 50,18"
                            fill="oklch(0.88 0.26 145)"
                            className="needle-transition"
                            style={{ transform: `rotate(${-90 + (180 * testSpeed) / 100}deg)` }}
                          />
                          <circle cx="50" cy="50" r="4.5" fill="#fff" />
                        </svg>

                        <div className="absolute bottom-2 text-center">
                          <p className="font-mono text-2xl font-black tracking-tight text-cyan-glow">
                            {isTesting ? testSpeed.toFixed(0) : speedMbps.toFixed(1)}
                            <span className="text-xs font-semibold text-muted-foreground ml-0.5">
                              Mbps
                            </span>
                          </p>
                          <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Active Bandwidth
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Earnings Overview */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="card-panel p-3">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">
                          DC Earned
                        </p>
                        <p className="text-xl font-bold font-mono text-neon mt-1">
                          +{earned.toFixed(2)}
                        </p>
                        <p className="text-[8px] text-muted-foreground">From data sales</p>
                      </div>
                      <div className="card-panel p-3">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-mono">
                          DC Spent
                        </p>
                        <p className="text-xl font-bold font-mono text-cyan-glow mt-1">
                          -{spent.toFixed(2)}
                        </p>
                        <p className="text-[8px] text-muted-foreground">Purchased bandwidth</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ============================================ */}
                {/* VIEW: P2P SIMULATOR TAB                     */}
                {/* ============================================ */}
                {activeTab === "simulator" &&
                  (() => {
                    const listings = db?.peers ?? [];
                    const simPeer =
                      listings.find((p: any) => p.id === selectedSimPeerId) ?? listings[0];
                    if (!simPeer) return null;
                    const swapAmount = parseFloat(simAmountGb) || 0;
                    const swapCost = +(swapAmount * simPeer.pricePerGb).toFixed(2);
                    const userExcess = Math.max(0, user.balanceGb);
                    const peerExcess = Math.max(0, simPeer.gb);

                    return (
                      <div className="space-y-4 animate-fade-in">
                        {/* Header */}
                        <div>
                          <h2 className="text-lg font-bold">P2P Data Swap</h2>
                          <p className="text-xs text-muted-foreground">
                            Live cellular data exchange between nodes
                          </p>
                        </div>

                        {/* Dual Phone Cards with animated connector */}
                        <div className="relative flex items-stretch gap-2">
                          {/* YOUR PHONE CARD */}
                          <div className="flex-1 card-panel p-3 border border-neon/30 bg-gradient-to-b from-card to-card/80 space-y-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="h-5 w-5 rounded-full bg-neon/20 border border-neon flex items-center justify-center">
                                <span className="text-[8px] font-bold text-neon">YOU</span>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold">{user.nodeName}</p>
                                <p className="text-[8px] font-mono text-muted-foreground">
                                  {user.address}
                                </p>
                              </div>
                            </div>

                            {/* Data Gauge */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-mono">
                                <span className="text-muted-foreground">Data Plan</span>
                                <span className="font-bold">
                                  {user.usedGb.toFixed(1)}/{user.planGb.toFixed(1)} GB
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${Math.min(100, (user.usedGb / user.planGb) * 100)}%`,
                                    background: "var(--gradient-neon)",
                                  }}
                                />
                              </div>
                            </div>

                            {/* Excess Data Highlight */}
                            <div className="bg-neon/10 border border-neon/20 rounded-lg p-2 text-center">
                              <p className="text-[8px] text-muted-foreground uppercase font-mono">
                                Excess Available
                              </p>
                              <p className="text-lg font-bold text-neon leading-tight">
                                {userExcess.toFixed(2)}
                              </p>
                              <p className="text-[9px] text-muted-foreground">GB</p>
                            </div>

                            {/* DC Balance */}
                            <div className="flex items-center justify-between text-[9px] font-mono bg-secondary/60 rounded-lg px-2 py-1.5">
                              <span className="text-muted-foreground">DataCoins</span>
                              <span className="font-bold text-cyan-glow">
                                {user.balanceDc.toFixed(2)} DC
                              </span>
                            </div>
                          </div>

                          {/* ANIMATED CONNECTOR MIDDLE */}
                          <div className="flex flex-col items-center justify-center min-w-[36px] relative">
                            {/* Vertical dashed line */}
                            <svg
                              width="36"
                              height="100%"
                              className="absolute inset-0 h-full"
                              style={{ minHeight: "180px" }}
                            >
                              <line
                                x1="18"
                                y1="0"
                                x2="18"
                                y2="100%"
                                stroke="oklch(0.85 0.24 145 / 0.25)"
                                strokeWidth="1"
                                strokeDasharray="4 4"
                                className="anim-dash-offset"
                              />
                            </svg>

                            {/* Center Animated swap icon */}
                            <div
                              className={`relative z-10 h-9 w-9 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                                isSimulatingSwap
                                  ? "border-neon bg-neon/20 shadow-[0_0_20px_var(--color-neon)] scale-125"
                                  : "border-border bg-card"
                              }`}
                            >
                              <ArrowLeftRight
                                className={`h-4 w-4 transition-all duration-300 ${isSimulatingSwap ? "text-neon animate-pulse" : "text-muted-foreground"}`}
                              />
                            </div>

                            {/* Floating data packet animation */}
                            {isSimulatingSwap && (
                              <>
                                {[0, 1, 2].map((i) => (
                                  <div
                                    key={i}
                                    className="absolute z-20 h-2 w-2 rounded-full bg-neon shadow-[0_0_8px_var(--color-neon)]"
                                    style={{
                                      top: `${30 + i * 20}%`,
                                      animation: `${swapAnimationDirection === "sell" ? "flowRight" : "flowLeft"} 1.4s ease-in-out ${i * 0.25}s infinite`,
                                    }}
                                  />
                                ))}
                              </>
                            )}
                          </div>

                          {/* PEER PHONE CARD */}
                          <div className="flex-1 card-panel p-3 border border-cyan/30 bg-gradient-to-b from-card to-card/80 space-y-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <div className="h-5 w-5 rounded-full bg-cyan/20 border border-cyan flex items-center justify-center">
                                <User className="h-3 w-3 text-cyan-glow" />
                              </div>
                              <div>
                                <p className="text-[10px] font-bold">{simPeer.seller}</p>
                                <p className="text-[8px] font-mono text-muted-foreground">
                                  {simPeer.addr}
                                </p>
                              </div>
                            </div>

                            {/* Data Gauge */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-mono">
                                <span className="text-muted-foreground">Data Plan</span>
                                <span className="font-bold">
                                  {simPeer.usedGb.toFixed(1)}/{simPeer.planGb.toFixed(1)} GB
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{
                                    width: `${Math.min(100, (simPeer.usedGb / simPeer.planGb) * 100)}%`,
                                    background:
                                      "linear-gradient(90deg, oklch(0.75 0.18 195), oklch(0.65 0.20 215))",
                                  }}
                                />
                              </div>
                            </div>

                            {/* Excess Data Highlight */}
                            <div className="bg-cyan/10 border border-cyan/20 rounded-lg p-2 text-center">
                              <p className="text-[8px] text-muted-foreground uppercase font-mono">
                                Excess Available
                              </p>
                              <p className="text-lg font-bold text-cyan-glow leading-tight">
                                {peerExcess.toFixed(2)}
                              </p>
                              <p className="text-[9px] text-muted-foreground">GB</p>
                            </div>

                            {/* DC Balance */}
                            <div className="flex items-center justify-between text-[9px] font-mono bg-secondary/60 rounded-lg px-2 py-1.5">
                              <span className="text-muted-foreground">DataCoins</span>
                              <span className="font-bold text-neon">
                                {simPeer.balanceDc.toFixed(2)} DC
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Peer Selector */}
                        <div className="card-panel p-3 space-y-2">
                          <p className="text-[10px] font-mono uppercase text-muted-foreground">
                            Select Peer Node
                          </p>
                          <div className="grid grid-cols-4 gap-1.5">
                            {listings.map((peer: any) => (
                              <button
                                key={peer.id}
                                onClick={() => setSelectedSimPeerId(peer.id)}
                                className={`flex flex-col items-center py-2 px-1 rounded-lg border text-center transition cursor-pointer ${
                                  selectedSimPeerId === peer.id
                                    ? "border-neon bg-neon/10 text-neon"
                                    : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <User className="h-3.5 w-3.5 mb-0.5" />
                                <span className="text-[9px] font-bold">{peer.seller}</span>
                                <span className="text-[8px] font-mono">
                                  {peer.gb.toFixed(1)} GB
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Amount selector + Swap Controls */}
                        <div className="card-panel p-3 space-y-3">
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] font-mono">
                              <span className="text-muted-foreground uppercase">Swap Amount</span>
                              <span className="font-bold text-neon">{simAmountGb} GB</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {["0.1", "0.2", "0.5", "1.0", "2.0"].map((v) => (
                                <button
                                  key={v}
                                  onClick={() => setSimAmountGb(v)}
                                  className={`py-1.5 rounded-lg border text-[9px] font-bold cursor-pointer transition ${
                                    simAmountGb === v
                                      ? "border-neon bg-neon/15 text-neon"
                                      : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Transaction cost preview */}
                          <div className="flex items-center justify-between text-[9px] font-mono bg-secondary/50 rounded-lg px-3 py-2">
                            <span className="text-muted-foreground">
                              Rate: {simPeer.pricePerGb.toFixed(2)} DC/GB
                            </span>
                            <span className="font-bold text-foreground">
                              Cost: {swapCost.toFixed(2)} DC
                            </span>
                          </div>

                          {/* Sell / Buy Buttons */}
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => triggerSimSwap("sell", simPeer)}
                              disabled={isSimulatingSwap || executeP2PSwapMutation.isPending}
                              className="py-2.5 rounded-xl border border-neon bg-neon/15 text-neon font-bold text-xs cursor-pointer hover:bg-neon/25 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                            >
                              <span className="text-base leading-none">↗</span>
                              Sell to {simPeer.seller}
                            </button>
                            <button
                              onClick={() => triggerSimSwap("buy", simPeer)}
                              disabled={isSimulatingSwap || executeP2PSwapMutation.isPending}
                              className="py-2.5 rounded-xl border border-cyan bg-cyan/15 text-cyan-glow font-bold text-xs cursor-pointer hover:bg-cyan/25 transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                            >
                              <span className="text-base leading-none">↙</span>
                              Buy from {simPeer.seller}
                            </button>
                          </div>

                          {isSimulatingSwap && (
                            <div className="text-center text-[10px] text-neon font-mono animate-pulse">
                              ⚡ Transmitting data packets over mesh...
                            </div>
                          )}
                        </div>

                        {/* Recent swap transactions */}
                        {db?.txs && db.txs.length > 0 && (
                          <div className="card-panel p-3 space-y-2">
                            <p className="text-[10px] font-mono uppercase text-muted-foreground">
                              Recent Swaps
                            </p>
                            <div className="space-y-1.5">
                              {db.txs.slice(0, 3).map((tx: any) => (
                                <div
                                  key={tx.id}
                                  className="flex items-center justify-between text-[10px] font-mono bg-secondary/40 rounded-lg px-2.5 py-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={
                                        tx.type === "sell" ? "text-neon" : "text-cyan-glow"
                                      }
                                    >
                                      {tx.type === "sell" ? "↗" : "↙"}
                                    </span>
                                    <div>
                                      <span className="font-bold">
                                        {tx.type === "sell" ? "Sold" : "Bought"} {tx.gb} GB
                                      </span>
                                      <span className="text-muted-foreground ml-1">
                                        · {tx.counterparty}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span
                                      className={
                                        tx.type === "sell"
                                          ? "text-neon font-bold"
                                          : "text-red-400 font-bold"
                                      }
                                    >
                                      {tx.type === "sell" ? "+" : "-"}
                                      {tx.price.toFixed(2)} DC
                                    </span>
                                    <div
                                      className={`text-[8px] ${tx.status === "confirmed" ? "text-neon/60" : "text-yellow-400"}`}
                                    >
                                      {tx.status}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* VIEW 2: RADAR TAB */}
                {activeTab === "radar" && (
                  <div className="space-y-4 animate-fade-in relative flex flex-col items-center">
                    <div className="w-full text-left">
                      <h2 className="text-lg font-bold">Mesh Scanning</h2>
                      <p className="text-xs text-muted-foreground">
                        Searching for local peer connections &lt; 50m
                      </p>
                    </div>

                    {/* Animated Radar Grid */}
                    <div className="radar-grid flex items-center justify-center my-4">
                      {/* Rotating Conic Sweep Beam */}
                      {isScanning && <div className="radar-sweep-beam" />}

                      {/* Concentric helper rings */}
                      <div className="radar-ring-mid" />
                      <div className="radar-ring-inner" />

                      {/* Center Dot (User node) */}
                      <div className="relative z-10 h-7 w-7 rounded-full bg-neon flex items-center justify-center shadow-[0_0_12px_var(--color-neon)]">
                        <div className="h-2.5 w-2.5 rounded-full bg-background animate-pulse" />
                      </div>

                      {/* Peer Nodes floating on Radar positions */}
                      {listings.map((peer) => (
                        <button
                          key={peer.id}
                          onClick={() => setSelectedPeer(peer)}
                          className="absolute z-20 transition hover:scale-125 focus:outline-none cursor-pointer"
                          style={{
                            left: `${peer.x}%`,
                            top: `${peer.y}%`,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <div className="relative">
                            <div className="h-5 w-5 rounded-full border border-neon bg-background/90 shadow-[0_0_8px_var(--color-neon)] flex items-center justify-center">
                              <User className="h-3 w-3 text-neon" />
                            </div>
                            {/* Dynamic ripple rings */}
                            <div
                              className="absolute -inset-2 rounded-full border border-neon/30 animate-ping opacity-60 pointer-events-none"
                              style={{ animationDuration: "3s" }}
                            />
                            <span className="absolute left-6 top-0 font-mono text-[8px] font-bold text-neon bg-black/60 px-1 rounded truncate max-w-[50px]">
                              {peer.seller}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Scan controller */}
                    <button
                      onClick={() => setIsScanning(!isScanning)}
                      className="px-4 py-1.5 rounded-full border border-border bg-card hover:text-neon text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${isScanning ? "animate-spin text-neon" : ""}`}
                      />
                      {isScanning ? "Active Scanning..." : "Restart Radar Scan"}
                    </button>

                    {/* Clicked Peer Details bottom sheet overlay */}
                    {selectedPeer ? (
                      <div className="w-full card-panel p-4 border border-neon/30 space-y-3 relative animate-slide-up mt-2 bg-gradient-to-t from-[#0d1410] to-[#080d0a]">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full border border-neon/50 bg-secondary flex items-center justify-center">
                              <User className="h-5 w-5 text-neon" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold">{selectedPeer.seller}</h4>
                              <p className="text-[10px] font-mono text-muted-foreground">
                                {selectedPeer.addr} · {selectedPeer.distance} away
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-neon text-neon" />
                            <span className="text-xs font-bold">{selectedPeer.rating}</span>
                          </div>
                        </div>

                        <hr className="border-border/30" />

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div>
                            <p className="text-muted-foreground text-[9px] uppercase">
                              Available GB
                            </p>
                            <p className="font-bold text-foreground">
                              {selectedPeer.gb.toFixed(1)} GB
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[9px] uppercase">Offer Rate</p>
                            <p className="font-bold text-cyan-glow">
                              {selectedPeer.pricePerGb.toFixed(2)} DC/GB
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setTradeType("buy");
                              setBuyAmount(Math.min(1.0, selectedPeer.gb).toString());
                              setSelectedPeer(null);
                              setActiveTab("trade");
                            }}
                            className="flex-1 neon-btn py-2 text-xs font-semibold cursor-pointer"
                          >
                            Trade with Node
                          </button>
                          <button
                            onClick={() => setSelectedPeer(null)}
                            className="px-3 rounded-lg border border-border bg-secondary hover:text-red-400 text-xs font-semibold cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full text-center border border-dashed border-border/60 rounded-2xl py-6 px-4 bg-secondary/20">
                        <Compass className="h-6 w-6 text-muted-foreground mx-auto animate-pulse" />
                        <p className="text-xs text-muted-foreground mt-2">
                          Tap any peer node on the radar grid to fetch real-time data pricing and
                          start swapping.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW 3: TRADE TAB */}
                {activeTab === "trade" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">Swap Portal</h2>
                        <p className="text-xs text-muted-foreground">
                          P2P exchange mechanism via Smart Escrow
                        </p>
                      </div>
                      <span className="pill text-[9px] font-mono">Fee: 0.1%</span>
                    </div>

                    {/* Sell/Buy Tab Control */}
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/40 p-1">
                      <button
                        onClick={() => setTradeType("sell")}
                        className={`rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                          tradeType === "sell"
                            ? "text-neon border border-[var(--color-neon)]/40 bg-neon-soft"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        ↗ Sell Excess Data
                      </button>
                      <button
                        onClick={() => setTradeType("buy")}
                        className={`rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                          tradeType === "buy"
                            ? "text-cyan-glow border border-[var(--color-cyan)]/40 bg-secondary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        ↙ Buy Bandwidth
                      </button>
                    </div>

                    {tradeType === "sell" ? (
                      <div className="space-y-4">
                        {/* Sell Form */}
                        <div className="card-panel p-4 space-y-4">
                          {/* Range sliders */}
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs font-mono">
                              <span className="text-muted-foreground uppercase text-[9px] tracking-wider">
                                Amount (GB)
                              </span>
                              <span className="font-bold text-neon">{sellGb} GB</span>
                            </div>
                            <input
                              type="range"
                              min="0.1"
                              max={excess > 0 ? excess : 1.0}
                              step="0.1"
                              value={sellAmount}
                              disabled={excess === 0}
                              onChange={(e) => setSellAmount(e.target.value)}
                              className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-neon"
                            />
                            <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                              <span>0.1 GB</span>
                              <span>Max: {excess} GB</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-xs font-mono">
                              <span className="text-muted-foreground uppercase text-[9px] tracking-wider">
                                Price (DC/GB)
                              </span>
                              <span className="font-bold text-cyan-glow">{sellPrice} DC</span>
                            </div>
                            <input
                              type="range"
                              min="1.00"
                              max="3.00"
                              step="0.05"
                              value={sellPrice}
                              onChange={(e) => setSellPrice(e.target.value)}
                              className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-cyan"
                            />
                            <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
                              <span>1.00 DC/GB</span>
                              <span>3.00 DC/GB</span>
                            </div>
                          </div>

                          <hr className="border-border/30" />

                          <div className="flex justify-between items-center py-1">
                            <div>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                ESTIMATED YIELD
                              </p>
                              <p className="text-2xl font-black text-neon font-mono">
                                {receiveDC.toFixed(2)}
                                <span className="text-xs text-muted-foreground font-bold ml-0.5">
                                  DC
                                </span>
                              </p>
                            </div>
                            <div className="text-right text-[9px] font-mono text-muted-foreground">
                              <p>Escrow gas: 0.05 DC</p>
                              <p>Instant Fill: Yes</p>
                            </div>
                          </div>
                        </div>

                        {/* Premium Swipe-to-Confirm Button */}
                        <div className="relative swipe-track">
                          {/* Transparent input slider for robust touch & desktop swipe handling */}
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={swipeProgress}
                            disabled={excess === 0}
                            onChange={(e) => setSwipeProgress(parseInt(e.target.value))}
                            onMouseUp={() => {
                              if (swipeProgress >= 85) {
                                setSwipeProgress(100);
                                handleSell();
                                setTimeout(() => setSwipeProgress(0), 1000);
                              } else {
                                setSwipeProgress(0);
                              }
                            }}
                            onTouchEnd={() => {
                              if (swipeProgress >= 85) {
                                setSwipeProgress(100);
                                handleSell();
                                setTimeout(() => setSwipeProgress(0), 1000);
                              } else {
                                setSwipeProgress(0);
                              }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                          />
                          {/* Swipe Handle driven by react progress state */}
                          <div
                            className="swipe-handle transition-transform"
                            style={{
                              transform: `translateX(${swipeProgress * 2.82}px)`,
                            }}
                          >
                            <ChevronRight className="h-5 w-5 text-black" />
                          </div>
                          <span className="swipe-label font-bold text-xs uppercase tracking-wider">
                            {swipeProgress > 80 ? "Release to Sign Contract" : "Swipe to Sell Data"}
                          </span>
                        </div>

                        {excess === 0 && (
                          <p className="text-center font-mono text-[9px] text-red-400 uppercase tracking-widest">
                            ⚠️ Zero available data excess. Increase limits in settings.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Buy Form */}
                        <div className="card-panel p-3.5 space-y-3">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground uppercase font-mono text-[9px]">
                              Select Purchase Size
                            </span>
                            <div className="flex items-center gap-1.5 font-mono">
                              <input
                                type="number"
                                step="0.1"
                                min="0.1"
                                value={buyAmount}
                                onChange={(e) => setBuyAmount(e.target.value)}
                                className="w-12 bg-secondary border border-border rounded text-center py-0.5 text-xs text-foreground font-bold outline-none focus:border-neon"
                              />
                              <span className="text-muted-foreground">GB</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {["0.5", "1.0", "2.0"].map((q) => (
                              <button
                                key={q}
                                onClick={() => setBuyAmount(q)}
                                className={`flex-1 py-1 rounded border font-mono text-xs transition cursor-pointer ${
                                  buyAmount === q
                                    ? "border-neon bg-neon-soft text-neon"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                {q} GB
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Listings */}
                        <div className="space-y-2">
                          <p className="font-mono text-[9px] text-muted-foreground uppercase tracking-widest px-1">
                            AVAILABLE PEER OFFERS
                          </p>

                          {listings.map((l) => (
                            <div
                              key={l.id}
                              className="card-panel p-3 flex justify-between items-center bg-card/50 hover:bg-card/75 transition-all"
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold">{l.seller}</span>
                                  <div className="flex items-center gap-0.5 text-yellow-400 text-[10px]">
                                    <Star className="h-2.5 w-2.5 fill-current" />
                                    <span>{l.rating}</span>
                                  </div>
                                </div>
                                <p className="font-mono text-[10px] text-muted-foreground">
                                  {l.addr} · {l.distance} · {l.gb.toFixed(1)} GB max
                                </p>
                              </div>

                              <div className="text-right flex flex-col items-end gap-1.5">
                                <span className="font-mono text-sm font-bold text-cyan-glow">
                                  {l.pricePerGb.toFixed(2)} DC/GB
                                </span>
                                <button
                                  onClick={() => startBuyingProtocol(l)}
                                  className="px-3.5 py-1 rounded bg-cyan/15 text-cyan-glow border border-cyan/30 text-xs font-semibold hover:bg-cyan/30 transition active:scale-95 cursor-pointer"
                                >
                                  Buy
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW 4: LEDGER TAB */}
                {activeTab === "history" && (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">Chain Ledger</h2>
                        <p className="text-xs text-muted-foreground">
                          Proof of Swap smart contract transaction logs
                        </p>
                      </div>
                      <button
                        onClick={resetDemo}
                        className="p-1.5 rounded border border-border bg-card text-muted-foreground hover:text-neon transition cursor-pointer"
                        title="Reset Logs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {txs.map((t, idx) => {
                        const isSell = t.type === "sell";
                        const isMined = t.status === "confirmed";

                        return (
                          <div
                            key={t.id || idx}
                            className={`card-panel p-3 flex justify-between items-center transition-all ${!isMined ? "border-dashed border-yellow-500/50 bg-yellow-500/5" : ""}`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-9 w-9 rounded-lg border flex items-center justify-center ${
                                  isSell
                                    ? "border-neon/40 bg-neon-soft/5 text-neon"
                                    : "border-cyan/40 bg-cyan/10 text-cyan-glow"
                                }`}
                              >
                                {isSell ? (
                                  <ArrowUpRight className="h-5 w-5" />
                                ) : (
                                  <ArrowDownLeft className="h-5 w-5" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold capitalize">
                                    {t.type} Order
                                  </span>
                                  <span
                                    className={`text-[8px] uppercase tracking-widest font-mono px-1 rounded ${
                                      isMined
                                        ? "bg-card text-muted-foreground"
                                        : "bg-yellow-500/20 text-yellow-400 animate-pulse"
                                    }`}
                                  >
                                    {isMined ? "confirmed" : "mining"}
                                  </span>
                                </div>
                                <p className="font-mono text-[10px] text-muted-foreground">
                                  {t.gb.toFixed(2)} GB · {t.counterparty} · {t.at}
                                </p>
                              </div>
                            </div>

                            <div className="text-right">
                              <span
                                className={`font-mono text-sm font-bold ${isSell ? "text-neon" : "text-cyan-glow"}`}
                              >
                                {isSell ? "+" : "-"}
                                {t.price.toFixed(2)} DC
                              </span>
                              <p className="text-[8px] font-mono text-muted-foreground">
                                gas: 0.05 DC
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* VIEW 5: SETTINGS TAB */}
                {activeTab === "settings" && (
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <h2 className="text-lg font-bold">Node Settings</h2>
                      <p className="text-xs text-muted-foreground">
                        Adjust P2P node identifiers and wallet limits
                      </p>
                    </div>

                    <div className="card-panel p-4 space-y-4">
                      {/* Node Name */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Node Identifier
                        </label>
                        <input
                          type="text"
                          value={settingsNodeName}
                          onChange={(e) => {
                            setSettingsNodeName(e.target.value);
                            settingsMutation.mutate({
                              nodeName: e.target.value,
                              autoShare: settingsAutoShare,
                              throttlePercent: settingsThrottlePercent,
                            });
                          }}
                          className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-neon text-foreground"
                        />
                      </div>

                      {/* Wallet address display */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Smart Wallet Key (L2)
                        </label>
                        <div className="w-full bg-secondary/60 border border-border rounded-lg px-3 py-2 flex items-center justify-between text-xs font-mono">
                          <span className="text-foreground">{MY_ADDR}</span>
                          <button
                            onClick={copyAddress}
                            className="text-muted-foreground hover:text-neon transition cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Auto-share switch */}
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-bold">Auto-Exchange Empty Slots</h5>
                          <p className="text-[10px] text-muted-foreground">
                            Auto sell unused bandwidth before 24h cycle
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={settingsAutoShare}
                            onChange={(e) => {
                              setSettingsAutoShare(e.target.checked);
                              settingsMutation.mutate({
                                nodeName: settingsNodeName,
                                autoShare: e.target.checked,
                                throttlePercent: settingsThrottlePercent,
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-neon" />
                        </label>
                      </div>

                      {/* Bandwidth cap throttle */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-muted-foreground uppercase">
                            Hotspot Throttle Limit
                          </span>
                          <span className="font-bold text-neon">
                            {settingsThrottlePercent}% speed
                          </span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          step="10"
                          value={settingsThrottlePercent}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setSettingsThrottlePercent(val);
                            settingsMutation.mutate({
                              nodeName: settingsNodeName,
                              autoShare: settingsAutoShare,
                              throttlePercent: val,
                            });
                          }}
                          className="w-full h-1 bg-secondary rounded-lg appearance-none cursor-pointer accent-neon"
                        />
                      </div>
                    </div>

                    <div className="card-panel p-4 space-y-2">
                      <button
                        onClick={resetDemo}
                        className="w-full py-2 border border-dashed border-red-500/50 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-mono text-xs rounded-lg transition active:scale-95 cursor-pointer"
                      >
                        Reset Simulated Node Ledger
                      </button>
                      <p className="text-center text-[8px] font-mono text-muted-foreground uppercase">
                        ⚠️ All trades are simulated for local client demonstration.
                      </p>
                    </div>

                    {/* Logout Section */}
                    <div className="card-panel p-4 space-y-2 border border-border/50">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="text-xs font-bold">Logged in as</p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {currentUsername}
                          </p>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-neon/20 border border-neon/40 flex items-center justify-center">
                          <User className="h-4 w-4 text-neon" />
                        </div>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full py-2 flex items-center justify-center gap-2 border border-border bg-secondary/40 hover:bg-secondary text-foreground font-semibold text-xs rounded-lg transition active:scale-95 cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </main>

              {/* Core App Bottom Tab Bar */}
              <nav className="h-16 px-4 bg-card/90 backdrop-blur-lg border-t border-border/40 flex items-center justify-around z-30 select-none">
                {[
                  { id: "dashboard", icon: Home, label: "Home" },
                  { id: "simulator", icon: ArrowLeftRight, label: "P2P Swap" },
                  { id: "radar", icon: Compass, label: "Radar" },
                  { id: "history", icon: History, label: "Ledger" },
                  { id: "settings", icon: SettingsIcon, label: "Settings" },
                ].map((t) => {
                  const Icon = t.icon;
                  const isActive = activeTab === t.id;

                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedPeer(null);
                        setActiveTab(t.id as any);
                      }}
                      className="flex flex-col items-center justify-center w-12 py-1.5 focus:outline-none transition active:scale-90 relative cursor-pointer"
                    >
                      <Icon
                        className={`h-5.5 w-5.5 transition-colors ${
                          isActive ? "text-neon" : "text-muted-foreground hover:text-foreground"
                        }`}
                      />
                      <span
                        className={`text-[8.5px] font-bold tracking-tight mt-0.5 transition-colors ${
                          isActive ? "text-neon" : "text-muted-foreground"
                        }`}
                      >
                        {t.label}
                      </span>

                      {/* Subtle glowing active dot */}
                      {isActive && (
                        <div className="absolute -top-1 w-1 h-1 rounded-full bg-neon shadow-[0_0_8px_var(--color-neon)]" />
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Buyer Progress Overlay Simulator */}
              {isBuying && buyActivePeer && (
                <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-center items-center p-6 text-center select-none animate-fade-in animate-duration-300">
                  <div className="w-full max-w-xs card-panel p-6 space-y-6 relative overflow-hidden bg-gradient-to-b from-card to-secondary">
                    <div className="flex flex-col items-center">
                      {buyStep < 3 ? (
                        <div className="h-12 w-12 rounded-full border border-dashed border-cyan animate-spin flex items-center justify-center text-cyan-glow">
                          <RefreshCw className="h-6 w-6" />
                        </div>
                      ) : (
                        <div className="h-12 w-12 rounded-full border border-neon bg-neon-soft text-neon flex items-center justify-center shadow-[0_0_15px_oklch(0.85_0.24_145)]">
                          <Check className="h-6 w-6 stroke-[3px]" />
                        </div>
                      )}

                      <h3 className="mt-4 text-base font-bold">
                        {buyStep === 0 && "Initiating Node Connection"}
                        {buyStep === 1 && "Verifying Escrow Lock"}
                        {buyStep === 2 && "Validating Smart Contract"}
                        {buyStep === 3 && "Swap Successful!"}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 min-h-[40px]">
                        {buyStep === 0 && `Opening direct channels to ${buyActivePeer.seller}...`}
                        {buyStep === 1 && `Depositing DataCoins into escrow vault...`}
                        {buyStep === 2 && `Authorizing network bandwidth handover...`}
                        {buyStep === 3 && `Swap finalized. ${buyAmount} GB has been added.`}
                      </p>
                    </div>

                    {/* Progress dot checks */}
                    <div className="flex justify-between px-4">
                      {[0, 1, 2, 3].map((stepIndex) => (
                        <div key={stepIndex} className="flex items-center">
                          <div
                            className={`h-3 w-3 rounded-full transition-all duration-300 ${
                              buyStep >= stepIndex
                                ? stepIndex === 3
                                  ? "bg-neon"
                                  : "bg-cyan"
                                : "bg-secondary border border-border"
                            }`}
                          />
                        </div>
                      ))}
                    </div>

                    {/* Confirm Close Button */}
                    <button
                      disabled={buyStep < 3}
                      onClick={() => {
                        setIsBuying(false);
                        setBuyActivePeer(null);
                        setActiveTab("history"); // jump to ledger to verify
                      }}
                      className="w-full py-2.5 neon-btn text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {buyStep < 3 ? "Verifying Transaction..." : "Return to Ledger"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
