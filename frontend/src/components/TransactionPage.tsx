import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import { encodeBytes32String, getAddress } from "ethers";
import { ensureUserTokenReady } from "../lib/demoSwap";
import { fetchJson, withTimeout } from "../lib/withTimeout";
import { fetchDemoToken, fetchSwapRouterAddress, ensureDemoChain } from "../lib/wallet";
import { fetchDemoChainPreflight } from "../lib/demoPreflight";
import {
  executeWalletDemoSwap,
  isBackendSwapExecutorAvailable,
} from "../lib/demoWalletSwap";
import { getErrorMessage } from "../lib/errorMessage";
import { SafeUnsafeToggle } from "./SafeUnsafeToggle";
import { GlobalLoading } from "./GlobalLoading";
import type {
  Route as RouteType,
  Decision,
  ExecutionPermit,
  ContractDecision,
  SwapResult,
} from "../types";
import { executionSearchParams } from "../lib/swapResult";
import { parseApiError } from "../lib/apiError";
import {
  checkSlippageBand,
  computeMaxOut,
  computeMinOut,
  formatSlippagePercent,
} from "../lib/slippage";

const API_BASE = "/api";
const PAGE_SIZE = 5;
const SLIPPAGE_PRESETS_BPS = [10, 50, 100, 300] as const;
const DEFAULT_SLIPPAGE_BPS = 100;
const UNSAFE_MAX_SLIPPAGE_BPS = 10_000;
const SDA_SWAP_TIMEOUT_MS = 180_000;

function isSdaRoute(routeId: string): boolean {
  return routeId.includes("-sda");
}

const PRE_SWAP_BLOCK_CODES = new Set(["SLIPPAGE_EXCEEDED", "QUOTE_DEVIATION_EXCEEDED"]);

function parseSwapError(data: { error?: { code?: string; message?: string } | string }): string {
  if (typeof data.error === "string") return data.error;
  if (data.error?.code === "SLIPPAGE_EXCEEDED") {
    return `滑点过低：${data.error.message ?? "实际报价低于公允价减滑点后的最低接收量"}`;
  }
  if (data.error?.code === "QUOTE_DEVIATION_EXCEEDED") {
    return `报价异常：${data.error.message ?? "报价高于公允价加滑点上限（疑似 TOXIC 池诱多报价）"}`;
  }
  return parseApiError(data.error, JSON.stringify(data));
}

class SwapApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SwapApiError";
  }
}

function buildFailedSwapResult(
  routeId: string,
  error: SwapApiError,
  opts: {
    tokenIn: string;
    tokenOut: string;
    amount: string;
    slippageBps: number;
    recipient: string;
    route?: RouteType;
    onChainFailure?: boolean;
    gasUsed?: string;
    txHash?: string;
    unsafeMode?: boolean;
  }
): SwapResult {
  const details = error.details ?? {};
  return {
    success: false,
    routeId,
    requestedRouteId: routeId,
    executedRouteId: routeId,
    tokenIn: opts.tokenIn,
    tokenOut: opts.tokenOut,
    amountIn: Number(opts.amount),
    quotedOut: Number(details.quotedOut ?? opts.route?.quotedOut ?? 0),
    expectedOut: Number(details.expectedOut ?? opts.route?.expectedOut ?? 0),
    amountOutMin: Number(details.amountOutMin ?? 0),
    amountOutMax: Number(details.amountOutMax ?? 0),
    slippageBps: Number(details.slippageBps ?? opts.slippageBps),
    actualOut: 0,
    txHash: opts.txHash ?? "",
    recipient: opts.recipient,
    gasUsed: opts.gasUsed,
    failureCode: error.code,
    failureMessage: error.message,
    onChainFailure: opts.onChainFailure,
    executionMode: "router",
    safetyMode: opts.unsafeMode ? "force" : "safe",
    agentBypassed: opts.unsafeMode ?? false,
  };
}

function buildUnsafeSlippageError(
  route: RouteType,
  slippageBps: number
): SwapApiError | null {
  const violation = checkSlippageBand(route.quotedOut, route.expectedOut, slippageBps);
  if (!violation) return null;
  const message =
    violation.code === "QUOTE_DEVIATION_EXCEEDED"
      ? `报价 ${route.quotedOut.toFixed(4)} 高于公允价 ${route.expectedOut.toFixed(4)} 加滑点上限（疑似 TOXIC 池诱多报价）`
      : `报价 ${route.quotedOut.toFixed(4)} 低于公允价 ${route.expectedOut.toFixed(4)} 减滑点后的最低接收量 ${violation.amountOutMin.toFixed(4)}`;
  return new SwapApiError(message, violation.code, {
    quotedOut: route.quotedOut,
    expectedOut: route.expectedOut,
    amountOutMin: violation.amountOutMin,
    amountOutMax: violation.amountOutMax,
    slippageBps,
  });
}

interface Props {
  safeMode: boolean;
  onSafeModeChange: (v: boolean) => void;
}

function generateDummySignature(): string {
  return "0x" + "12".repeat(65);
}


function routeExistsInQuote(routes: RouteType[], routeId: string): boolean {
  return Boolean(routeId && routes.some((route) => route.routeId === routeId));
}

function resolveFlowTargetRoute(
  routes: RouteType[],
  selectedRouteId: string,
  recommendedRouteId?: string
): string {
  if (routeExistsInQuote(routes, selectedRouteId)) return selectedRouteId;
  if (recommendedRouteId && routeExistsInQuote(routes, recommendedRouteId)) {
    return recommendedRouteId;
  }
  return routes[0]?.routeId ?? selectedRouteId;
}

function riskLevel(score: number): "low" | "moderate" | "high" {
  if (score > 50) return "high";
  if (score > 25) return "moderate";
  return "low";
}

export function TransactionPage({ safeMode, onSafeModeChange }: Props) {
  const navigate = useNavigate();
  const { account, connectWallet, isConnecting } = useWallet();
  const { showToast } = useToast();
  const [tokenIn, setTokenIn] = useState("USDC");
  const [tokenOut, setTokenOut] = useState("GOOD");
  const [amount, setAmount] = useState("100");
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [selectedRoute, setSelectedRoute] = useState("");
  const [quoteMeta, setQuoteMeta] = useState<{ referencePrice?: number; recommendedRouteId?: string }>({});
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [recommendedRouteId, setRecommendedRouteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [executionElapsedSeconds, setExecutionElapsedSeconds] = useState<number | null>(null);
  const executionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const executionStartedAtRef = useRef<number | null>(null);

  const startExecutionTimer = () => {
    executionStartedAtRef.current = performance.now();
    setExecutionElapsedSeconds(0);
    if (executionTimerRef.current) clearInterval(executionTimerRef.current);
    executionTimerRef.current = setInterval(() => {
      if (executionStartedAtRef.current !== null) {
        setExecutionElapsedSeconds(
          (performance.now() - executionStartedAtRef.current) / 1000
        );
      }
    }, 100);
  };

  const stopExecutionTimer = () => {
    if (executionTimerRef.current) clearInterval(executionTimerRef.current);
    executionTimerRef.current = null;
    executionStartedAtRef.current = null;
    setExecutionElapsedSeconds(null);
  };

  useEffect(() => () => stopExecutionTimer(), []);

  useEffect(() => {
    setDecision(null);
    setError("");
    setRecommendedRouteId(null);
  }, [safeMode]);

  const selectedRouteData = routes.find((r) => r.routeId === selectedRoute);
  const maxReceiveOut =
    !safeMode && selectedRouteData?.expectedOut !== undefined
      ? computeMaxOut(selectedRouteData.expectedOut, slippageBps)
      : null;
  const minReceiveOut =
    !safeMode && selectedRouteData?.expectedOut !== undefined
      ? computeMinOut(selectedRouteData.expectedOut, slippageBps)
      : null;

  const loadRoutes = async (options?: {
    preserveSelection?: boolean;
  }): Promise<{
    routes: RouteType[];
    recommendedRouteId?: string;
    selectedRouteId: string;
  } | null> => {
    setLoading("Loading routes...");
    const previousSelection = selectedRoute;
    try {
      const { res, data } = await fetchJson<{
        routes: RouteType[];
        recommendedRouteId?: string;
        referencePrice?: number;
        error?: string | { code?: string; message?: string };
      }>(`${API_BASE}/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amount=${amount}`);
      if (!res.ok) throw new Error(parseApiError(data.error, "Quote failed"));
      const nextRoutes = data.routes;
      const recommended = data.recommendedRouteId ?? nextRoutes[0]?.routeId;
      const keepSelection =
        options?.preserveSelection &&
        routeExistsInQuote(nextRoutes, previousSelection);
      const nextSelected = keepSelection
        ? previousSelection
        : resolveFlowTargetRoute(nextRoutes, previousSelection, recommended);
      setRoutes(nextRoutes);
      setQuoteMeta({
        referencePrice: data.referencePrice,
        recommendedRouteId: data.recommendedRouteId,
      });
      if (nextSelected) setSelectedRoute(nextSelected);
      setPage(0);
      setDecision(null);
      setError("");
      return {
        routes: nextRoutes,
        recommendedRouteId: recommended,
        selectedRouteId: nextSelected,
      };
    } catch (e: unknown) {
      setError(`Failed to load routes: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setLoading("");
    }
  };

  const evaluateRoute = async (routeId?: string): Promise<Decision | null> => {
    const target = routeId ?? selectedRoute;
    if (!target) return null;
    setLoading("Evaluating route with Safety Agent...");
    try {
      const { res, data } = await fetchJson<Decision & { error?: string | { message?: string } }>(
        `${API_BASE}/evaluate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            routeId: target,
            configProfile: "normal",
            tokenIn,
            tokenOut,
            amountIn: Number(amount),
          }),
        }
      );
      if (!res.ok) throw new Error(parseApiError(data.error, "Evaluate failed"));
      setDecision(data);
      if (data.decision === "FALLBACK_TO_SAFE_ROUTE" && data.fallbackRouteId) {
        setRecommendedRouteId(data.fallbackRouteId);
      } else {
        setRecommendedRouteId(null);
      }
      return data;
    } catch (e: unknown) {
      setError(`Evaluate failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      setLoading("");
    }
  };

  const getChainMode = async (): Promise<"mock" | "demo" | "rpc"> => {
    const { res, data } = await fetchJson<{ chainMode?: string }>(`${API_BASE}/debug/status`);
    if (!res.ok) {
      throw new Error("无法读取后端链模式，请确认服务已启动");
    }
    if (data.chainMode === "mock" || data.chainMode === "demo" || data.chainMode === "rpc") {
      return data.chainMode;
    }
    return "rpc";
  };

  const getNonce = async (user: string): Promise<string> => {
    const res = await fetch(`${API_BASE}/execute/nonce?user=${encodeURIComponent(user)}`);
    const data = await res.json();
    return String(data.nonce);
  };

  /** Demo swap via MetaMask (wallet executor) or backend when configured. */
  const executeDemoSwap = async (routeId: string, force: boolean): Promise<SwapResult> => {
    if (!account) {
      throw new Error("请先连接 MetaMask 再执行链上交易");
    }
    const checksumAddr = getAddress(account);
    const preflight = await fetchDemoChainPreflight();
    await ensureDemoChain(preflight.chain);

    const useBackendExecutor = await isBackendSwapExecutorAvailable();

    if (!useBackendExecutor) {
      return executeWalletDemoSwap({
        routeId,
        amountIn: amount,
        tokenIn,
        tokenOut,
        recipient: checksumAddr,
        force,
        slippageBps: force ? slippageBps : undefined,
      });
    }

    const [tokenMeta, swapRouter] = await Promise.all([
      fetchDemoToken(tokenIn),
      fetchSwapRouterAddress(),
    ]);

    await withTimeout(
      ensureUserTokenReady({
        owner: checksumAddr,
        tokenAddress: tokenMeta.address,
        tokenSymbol: tokenMeta.symbol,
        tokenDecimals: tokenMeta.decimals,
        spender: swapRouter,
        amountHuman: amount,
      }),
      45_000,
      "MetaMask 代币授权超时：请在弹窗中点击「确认」完成 Approve"
    );

    const endpoint = force ? `${API_BASE}/swap/force` : `${API_BASE}/swap/safe`;
    const { res, data } = await fetchJson<
      SwapResult & {
        error?: { code?: string; message?: string; details?: Record<string, unknown> } | string;
      }
    >(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId,
          amountIn: Number(amount),
          tokenIn,
          tokenOut,
          recipient: checksumAddr,
          useRouter: true,
          configProfile: "normal",
          ...(force ? { slippageBps } : {}),
        }),
      },
      force && isSdaRoute(routeId) ? SDA_SWAP_TIMEOUT_MS : 120_000
    );
    if (!res.ok) {
      const errPayload = data.error;
      if (typeof errPayload === "object" && errPayload?.code === "INSUFFICIENT_ALLOWANCE") {
        throw new Error(
          "USDC 尚未授权 DemoSwapRouter。请在 MetaMask 中确认 Approve 交易后重试"
        );
      }
      if (typeof errPayload === "object" && errPayload?.code) {
        throw new SwapApiError(
          parseSwapError(data),
          errPayload.code,
          errPayload.details
        );
      }
      throw new Error(parseSwapError(data));
    }
    return data;
  };

  const executeMockVault = async (
    activeDecision: Decision,
    executionRouteId: string
  ) => {
    if (!account) throw new Error("链上执行需要连接 MetaMask 钱包");

    const route = routes.find((r) => r.routeId === executionRouteId);
    if (!route) throw new Error(`Route ${executionRouteId} not found`);

    const contractDecisionMap: Record<string, ContractDecision> = {
      ALLOW: 0,
      REJECT: 1,
      FALLBACK_TO_SAFE_ROUTE: 2,
    };

    const checksumAddr = getAddress(account);
    const nonce = await getNonce(checksumAddr);
    const deadline = Math.floor(Date.now() / 1000) + 3600;

    const permit: ExecutionPermit = {
      user: checksumAddr,
      routeId: encodeBytes32String(executionRouteId),
      amountIn: String(route.amountIn),
      amountOutQuoted: String(route.quotedOut),
      deadline: String(deadline),
      riskScore: String(activeDecision.riskScore),
      decision: contractDecisionMap[activeDecision.decision],
      nonce,
    };

    const { res, data } = await fetchJson<{
      success?: boolean;
      event?: { txHash?: string; routeId?: string };
      error?: { message?: string; reason?: string } | string;
    }>(`${API_BASE}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluation: {
          decision: activeDecision.decision,
          riskScore: activeDecision.riskScore,
          reason: activeDecision.reason,
          routeId: activeDecision.routeId,
          fallbackRouteId: activeDecision.fallbackRouteId,
          flags: activeDecision.flags,
        },
        permit,
        signature: generateDummySignature(),
      }),
    });

    if (!res.ok) {
      throw new Error(parseApiError(data.error, JSON.stringify(data)));
    }
    return { data, route, executionRouteId };
  };

  const resolveExecutionRouteId = (
    _activeDecision: Decision | null | undefined,
    routeIdOverride?: string
  ): string => {
    if (routeIdOverride) return routeIdOverride;
    return selectedRoute;
  };

  const navigateUnsafeSlippageBlock = (
    routeId: string,
    slipError: SwapApiError,
    routeData?: RouteType
  ) => {
    const failedSwap = buildFailedSwapResult(routeId, slipError, {
      tokenIn,
      tokenOut,
      amount,
      slippageBps,
      recipient: account ?? "",
      route: routeData,
      onChainFailure: false,
      unsafeMode: true,
    });
    navigate("/execution", { state: { swap: failedSwap, decision: null } });
    showToast({
      type: "error",
      message:
        slipError.code === "QUOTE_DEVIATION_EXCEEDED"
          ? "报价异常偏高，交易被拦截（未上链）"
          : "滑点过低，交易被拦截（未上链）",
    });
  };

  const executeRoute = async (
    activeDecision?: Decision | null,
    routeIdOverride?: string
  ) => {
    const evalDecision = activeDecision ?? decision;
    if (safeMode && !evalDecision) {
      const msg = "Safe 模式需先完成「风险评估」再执行";
      setError(msg);
      showToast({ type: "warning", message: msg });
      return;
    }
    if (safeMode && evalDecision?.decision === "REJECT") {
      const msg = "当前路由已被 Safety Agent 拒绝，请手动选择其他路由后再执行";
      setError(msg);
      showToast({ type: "error", message: msg });
      return;
    }
    if (safeMode && evalDecision?.decision === "FALLBACK_TO_SAFE_ROUTE") {
      const msg = `Agent 建议切换到 ${evalDecision.fallbackRouteId ?? "安全路由"}，请手动切换后重新执行（不会自动改路由）`;
      setError(msg);
      showToast({ type: "warning", message: msg });
      return;
    }

    const routeId = resolveExecutionRouteId(evalDecision, routeIdOverride);
    const routeData = routes.find((r) => r.routeId === routeId);
    if (!routeData) {
      const msg = "请先获取报价并选择有效路由";
      setError(msg);
      showToast({ type: "error", message: msg });
      return;
    }

    if (!safeMode) {
      const slipError = buildUnsafeSlippageError(routeData, slippageBps);
      if (slipError) {
        setError(slipError.message);
        navigateUnsafeSlippageBlock(routeId, slipError, routeData);
        return;
      }
    }

    setLoading("Executing route on-chain...");
    startExecutionTimer();
    if (!safeMode) {
      setDecision(null);
    }
    try {
      const chainMode = await getChainMode();

      if (chainMode === "demo") {
        if (!window.ethereum) {
          throw new Error("请先安装 MetaMask 浏览器插件");
        }
        if (!account) {
          setError("链上执行需要连接 MetaMask 钱包。您仍可游客预览报价与风险评估。");
          showToast({ type: "error", message: "请先连接 MetaMask 再执行链上交易" });
          return;
        }
        setLoading("等待 MetaMask 确认（代币授权 / 签名）...");
        const swap = await executeDemoSwap(routeId, !safeMode);

        const finalDecision: Decision | null = safeMode
          ? (evalDecision ?? {
              decision: swap.agentDecision ?? "ALLOW",
              riskScore: 0,
              reason: swap.success
                ? "Swap executed"
                : swap.failureMessage ?? "Swap settlement failed",
              routeId: swap.requestedRouteId ?? routeId,
              fallbackRouteId:
                swap.executedRouteId !== swap.requestedRouteId
                  ? swap.executedRouteId ?? null
                  : null,
              flags: [],
            })
          : null;
        if (finalDecision) {
          setDecision(finalDecision);
        }
        if (swap.success) {
          const sdaNote =
            swap.sdaExecutionWindow && swap.sdaWaitedSeconds
              ? `（SDA 窗口等待 ${swap.sdaWaitedSeconds}s）`
              : "";
          showToast({ type: "success", message: `Swap 链上结算成功${sdaNote}` });
        } else {
          showToast({
            type: "error",
            message: swap.failureMessage ?? "链上交易已发送，但结算未通过校验",
          });
        }
        navigate(executionSearchParams(swap.txHash), {
          state: { swap, decision: finalDecision },
        });
        return;
      }

      if (!account) {
        setError("链上执行需要连接 MetaMask 钱包。您仍可游客预览报价与风险评估。");
        showToast({ type: "error", message: "请先连接 MetaMask 再执行链上交易" });
        return;
      }

      if (!evalDecision) throw new Error("Evaluate the route before executing in mock mode");
      const mockResult = await executeMockVault(evalDecision, routeId);
      const executedRoute = mockResult.route;
      showToast({
        type: mockResult.data.success === false ? "error" : "success",
        message:
          mockResult.data.success === false
            ? "Mock execution rejected"
            : "Execution completed",
      });
      navigate("/execution", {
        state: {
          swap: {
            success: mockResult.data.success !== false,
            routeId: mockResult.executionRouteId,
            requestedRouteId: evalDecision.routeId,
            executedRouteId: mockResult.executionRouteId,
            tokenIn,
            tokenOut,
            amountIn: Number(amount),
            quotedOut: executedRoute.quotedOut,
            actualOut: executedRoute.quotedOut,
            txHash: mockResult.data.event?.txHash ?? "",
            recipient: account,
            agentDecision: evalDecision.decision,
          } as SwapResult,
          decision: evalDecision,
        },
      });
    } catch (e: unknown) {
      if (e instanceof SwapApiError && PRE_SWAP_BLOCK_CODES.has(e.code)) {
        const failedSwap = buildFailedSwapResult(routeId, e, {
          tokenIn,
          tokenOut,
          amount,
          slippageBps,
          recipient: account ?? "",
          route: routeData,
          onChainFailure: false,
          unsafeMode: !safeMode,
        });
        navigate("/execution", {
          state: { swap: failedSwap, decision: safeMode ? evalDecision ?? null : null },
        });
        showToast({
          type: "error",
          message:
            e.code === "QUOTE_DEVIATION_EXCEEDED"
              ? "报价异常偏高，交易被拦截（未上链）"
              : "滑点过低，交易被拦截（未上链）",
        });
        return;
      }
      const msg = getErrorMessage(e, "Execute failed");
      setError(`Execute failed: ${msg}`);
      showToast({ type: "error", message: msg });
    } finally {
      stopExecutionTimer();
      setLoading("");
    }
  };

  const runFullFlow = async () => {
    setLoading("Running full flow...");
    setError("");

    try {
      const quote = await loadRoutes({ preserveSelection: true });
      if (!quote?.routes.length) {
        setError("无法加载路由报价，请检查后端服务是否运行");
        return;
      }

      await new Promise((r) => setTimeout(r, 300));

      if (!safeMode) {
        await executeRoute(null, quote.selectedRouteId);
        return;
      }

      let targetRouteId = quote.selectedRouteId;
      let latestDecision = await evaluateRoute(targetRouteId);
      await new Promise((r) => setTimeout(r, 300));

      if (latestDecision?.decision === "REJECT") {
        const msg = "Safety Agent 拒绝了当前路由，请手动选择其他路由";
        setError(msg);
        showToast({ type: "error", message: msg });
        return;
      }
      if (latestDecision?.decision === "FALLBACK_TO_SAFE_ROUTE") {
        const msg = `Agent 建议 ${latestDecision.fallbackRouteId ?? "安全路由"}，请点击 Safety Panel 手动切换后再执行`;
        setError(msg);
        showToast({ type: "warning", message: msg });
        return;
      }

      await executeRoute(latestDecision, targetRouteId);
    } catch (e: unknown) {
      const msg = getErrorMessage(e, "完整流程执行失败");
      setError(msg);
      showToast({ type: "error", message: msg });
    } finally {
      setLoading("");
    }
  };

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
      showToast({ type: "success", message: "MetaMask 已连接并切换到 Anvil Local (31337)" });
    } catch (e: unknown) {
      const msg = getErrorMessage(e, "连接失败");
      setError(msg);
      showToast({ type: "error", message: msg });
    }
  };

  const pageCount = Math.max(1, Math.ceil(routes.length / PAGE_SIZE));
  const pagedRoutes = routes.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const primaryFlowButtonLabel = (() => {
    if (executionElapsedSeconds !== null && !!loading) {
      return `执行中 ${executionElapsedSeconds.toFixed(1)}s`;
    }
    if (loading === "Running full flow...") return "流程执行中...";
    if (loading === "Loading routes...") return "加载报价中...";
    if (loading === "Executing route on-chain...") return "链上执行中...";
    if (loading === "Evaluating route with Safety Agent...") return "评估中...";
    if (loading?.includes("MetaMask")) return "等待 MetaMask...";
    if (loading) return "处理中...";
    return safeMode ? "一键完整流程（含执行）" : "无安全模式执行";
  })();

  return (
    <div>
      <GlobalLoading active={!!loading} message={loading || undefined} />

      {!account && (
        <div
          className="sentinel-card"
          style={{
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            borderColor: "rgba(88, 166, 255, 0.35)",
            background: "rgba(88, 166, 255, 0.06)",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
            请先连接 MetaMask（可选账户）；获取报价无需钱包，执行 swap 时仅需代币 Approve 确认
          </span>
          <button
            type="button"
            className="sentinel-btn sentinel-btn-primary"
            onClick={handleConnectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? "正在连接钱包" : "连接 MetaMask"}
          </button>
        </div>
      )}

      <div className="sentinel-tx-grid">
        <div className="sentinel-card">
          <div className="sentinel-label">Swap 参数</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Token In</label>
              <select className="sentinel-select" value={tokenIn} onChange={(e) => setTokenIn(e.target.value)}>
                {["USDC", "GOOD", "BAD", "BAIT"].map((t) => (
                  <option key={t} value={t} disabled={t === tokenOut}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Token Out</label>
              <select className="sentinel-select" value={tokenOut} onChange={(e) => setTokenOut(e.target.value)}>
                {["USDC", "GOOD", "BAD", "BAIT"].map((t) => (
                  <option key={t} value={t} disabled={t === tokenIn}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Amount</label>
              <input className="sentinel-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <SafeUnsafeToggle safeMode={safeMode} onChange={onSafeModeChange} />
            {safeMode ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: "rgba(35,134,54,0.08)",
                  border: "1px solid rgba(35,134,54,0.25)",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                }}
              >
                Safe 模式由 <strong style={{ color: "var(--text)" }}>Safety Agent</strong> 负责评估；
                FALLBACK 仅作建议，需手动切换路由，不会自动改路。
              </div>
            ) : (
            <div>
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 12,
                  background: "rgba(218,54,51,0.08)",
                  border: "1px solid rgba(218,54,51,0.25)",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                }}
              >
                Unsafe 模式<strong style={{ color: "var(--red)" }}> 绕过 Safety Agent</strong>，
                仅通过滑点带宽（相对 SAFE 公允价）拦截异常报价。
              </div>
              <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
                滑点容忍（Unsafe 唯一保护）
              </label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {SLIPPAGE_PRESETS_BPS.map((bps) => (
                  <button
                    key={bps}
                    type="button"
                    className={`sentinel-btn ${slippageBps === bps ? "sentinel-btn-primary" : "sentinel-btn-secondary"}`}
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => setSlippageBps(bps)}
                  >
                    {formatSlippagePercent(bps)}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="sentinel-input"
                  type="number"
                  min={0}
                  max={UNSAFE_MAX_SLIPPAGE_BPS}
                  step={1}
                  value={slippageBps}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isNaN(next)) {
                      setSlippageBps(Math.min(UNSAFE_MAX_SLIPPAGE_BPS, Math.max(0, Math.round(next))));
                    }
                  }}
                  style={{ maxWidth: 100 }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  bps（Unsafe 上限 {UNSAFE_MAX_SLIPPAGE_BPS} = 100%）
                </span>
              </div>
              {selectedRouteData && minReceiveOut !== null && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                  允许接收区间{" "}
                  <strong style={{ color: "var(--text)" }}>
                    {minReceiveOut.toFixed(4)} ~ {maxReceiveOut?.toFixed(4)} {tokenOut}
                  </strong>
                  {" "}（公允价 {selectedRouteData.expectedOut.toFixed(4)} ± {formatSlippagePercent(slippageBps)}）
                  {selectedRouteData.quotedOut < minReceiveOut && (
                    <span style={{ display: "block", color: "var(--danger, #f85149)", marginTop: 4 }}>
                      报价 {selectedRouteData.quotedOut.toFixed(4)} 低于下限，将因滑点失败
                    </span>
                  )}
                  {maxReceiveOut !== null && selectedRouteData.quotedOut > maxReceiveOut && (
                    <span style={{ display: "block", color: "var(--danger, #f85149)", marginTop: 4 }}>
                      报价 {selectedRouteData.quotedOut.toFixed(4)} 高于上限，将因滑点失败
                    </span>
                  )}
                </div>
              )}
            </div>
            )}
            <button type="button" className="sentinel-btn sentinel-btn-secondary" onClick={() => void loadRoutes()} disabled={!!loading}>
              {loading === "Loading routes..." ? "加载中..." : "获取报价"}
            </button>
          </div>
        </div>

        <div className="sentinel-card">
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: 16,
            }}
          >
            风险指标
          </div>
          <div className="tx-risk-box">
            <div className="tx-risk-flex">
              <RiskIndicator
                label="池子风险"
                value={selectedRouteData?.poolRiskScore ?? "—"}
                level={selectedRouteData ? riskLevel(selectedRouteData.poolRiskScore) : "low"}
              />
              <RiskIndicator
                label="报价偏差"
                value={selectedRouteData?.warningFlags.includes("quote_deviation") ? "高" : "低"}
                level={selectedRouteData?.warningFlags.includes("quote_deviation") ? "high" : "low"}
              />
            </div>
            <div className="tx-risk-flex">
              <RiskIndicator
                label="Agent 决策"
                value={safeMode ? (decision?.decision ?? "待评估") : "已绕过"}
                level={
                  safeMode
                    ? decision?.decision === "REJECT"
                      ? "high"
                      : decision?.decision === "FALLBACK_TO_SAFE_ROUTE"
                        ? "moderate"
                        : "low"
                    : "high"
                }
              />
              <RiskIndicator
                label="安全模式"
                value={safeMode ? "Safe" : "Unsafe"}
                level={safeMode ? "low" : "high"}
              />
            </div>
            
          </div>
        </div>
      </div>

      {routes.length > 0 && (
        <div className="sentinel-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
            <div className="sentinel-label" style={{ margin: 0 }}>路由分析</div>
            {quoteMeta.recommendedRouteId && (
              <span className="sentinel-badge sentinel-badge-green">推荐: {quoteMeta.recommendedRouteId}</span>
            )}
          </div>
          <table className="sentinel-table">
            <thead>
              <tr>
                <th>路由</th>
                <th>输出</th>
                <th>预期</th>
                <th>风险分</th>
                <th>标记</th>
              </tr>
            </thead>
            <tbody>
              {pagedRoutes.map((route) => {
                const isSelected = route.routeId === selectedRoute;
                const isRecommended = (recommendedRouteId ?? quoteMeta.recommendedRouteId) === route.routeId;
                const rl = riskLevel(route.poolRiskScore);
                return (
                  <tr
                    key={route.routeId}
                    className={isSelected ? "selected" : undefined}
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      setSelectedRoute(route.routeId);
                      setRecommendedRouteId(null);
                      setDecision(null);
                    }}
                  >
                    <td>
                      <strong>{route.label}</strong>
                      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{route.routeId}</div>
                      {isRecommended && <span className="sentinel-badge sentinel-badge-green" style={{ marginTop: 4 }}>推荐</span>}
                    </td>
                    <td>{route.quotedOut}</td>
                    <td>{route.expectedOut}</td>
                    <td>
                      <span className={`sentinel-badge ${rl === "high" ? "sentinel-badge-red" : rl === "moderate" ? "sentinel-badge-yellow" : "sentinel-badge-green"}`}>
                        {route.poolRiskScore}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: "var(--red)" }}>
                      {route.warningFlags.length > 0 ? route.warningFlags.join(", ") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button type="button" className="sentinel-btn sentinel-btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={{ padding: "6px 12px", fontSize: 12 }}>
                上一页
              </button>
              <span style={{ fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>
                {page + 1} / {pageCount}
              </span>
              <button type="button" className="sentinel-btn sentinel-btn-ghost" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} style={{ padding: "6px 12px", fontSize: 12 }}>
                下一页
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="sentinel-btn sentinel-btn-ghost"
              onClick={() => evaluateRoute()}
              disabled={!!loading || !selectedRoute || !safeMode}
              title={!safeMode ? "Unsafe 模式不经过 Agent" : undefined}
            >
              {loading === "Evaluating route with Safety Agent..." ? "评估中..." : "风险评估"}
            </button>
            {!safeMode && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Unsafe 下 Agent 不生效，请直接执行并依赖滑点保护
              </span>
            )}
            <button
              type="button"
              className="sentinel-btn sentinel-btn-primary"
              onClick={runFullFlow}
              disabled={!!loading}
              style={{ flex: 1, minWidth: 200 }}
            >
              {primaryFlowButtonLabel}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="sentinel-card"
          style={{
            marginTop: 16,
            borderColor: "var(--red)",
            background: "rgba(248, 81, 73, 0.08)",
            color: "var(--red)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function RiskIndicator({
  label,
  value,
  level,
}: {
  label: string;
  value: string | number;
  level: "low" | "moderate" | "high";
}) {
  const color = level === "high" ? "var(--red)" : level === "moderate" ? "var(--yellow)" : "var(--cyan)";
  return (
    <div className={`tx-risk-card tx-risk-card-${level}`}>
      <div className="tx-risk-card-label" style={{ color }}>{label}</div>
      <div className="tx-risk-card-value" style={{ color }}>{value}</div>
    </div>
  );
}
