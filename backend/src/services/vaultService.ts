// backend/src/services/vaultService.ts — Dev A: 合约调用服务
// Week 3: 模拟模式 — 部署到 anvil 后可替换为真实 cast send
import { Event } from "../types.js";

/**
 * 调用合约 executeRoute()
 * 模拟返回执行结果
 */
export async function executeRoute(
  routeId: string,
  amountIn: number,
  amountOutQuoted: number,
  deadline: number,
  riskScore: number,
  decision: string,
  maxLossBps: number
): Promise<{ success: boolean; event: Event }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const txHash = `0x${Math.random().toString(16).slice(2).padStart(64, "0")}`;
      const lossBps = Math.round(((amountIn - amountOutQuoted) / amountIn) * 10000);

      let eventType: string;
      let message: string;

      if (decision === "REJECT") {
        eventType = "ExecutionRejected";
        message = `Execution blocked by chain gate. Decision: ${decision}, RiskScore: ${riskScore}`;
      } else if (lossBps > maxLossBps) {
        eventType = "ExecutionRejected";
        message = `Execution blocked: loss ${lossBps}bps > max ${maxLossBps}bps`;
      } else {
        eventType = "ExecutionSuccess";
        message = `Executed on-chain (mock). Tx: ${txHash.slice(0, 18)}... Loss: ${lossBps}bps`;
      }

      resolve({
        success: eventType === "ExecutionSuccess",
        event: {
          id: Date.now().toString(),
          eventType,
          timestamp: Date.now(),
          routeId,
          riskScore,
          message,
          txHash: eventType === "ExecutionSuccess" ? txHash : undefined,
        },
      });
    }, 200);
  });
}
