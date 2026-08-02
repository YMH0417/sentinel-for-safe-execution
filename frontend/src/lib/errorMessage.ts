/** Normalize MetaMask / fetch / API errors into user-facing text. */
export function getErrorMessage(err: unknown, fallback = "操作失败"): string {
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  if (typeof err === "string" && err.trim()) {
    return err;
  }
  if (err && typeof err === "object") {
    const o = err as {
      message?: string;
      code?: number | string;
      reason?: string;
      data?: { message?: string };
    };
    const code = o.code;
    if (code === 4001 || code === "4001") {
      return "您已取消 MetaMask 操作";
    }
    if (code === 4902 || code === "4902") {
      return "请在 MetaMask 中添加 Demo 网络（见页面顶部提示）";
    }
    if (typeof o.reason === "string" && o.reason.trim()) {
      return o.reason;
    }
    if (typeof o.message === "string" && o.message.trim()) {
      return o.message;
    }
    if (typeof o.data?.message === "string" && o.data.message.trim()) {
      return o.data.message;
    }
  }
  return fallback;
}
