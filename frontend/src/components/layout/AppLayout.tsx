import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useWallet } from "../../contexts/WalletContext";
import { useToast } from "../Toast";
import { getAddress } from "ethers";

const NAV = [
  { to: "/", label: "首页", end: true },
  { to: "/dashboard", label: "仪表盘" },
  { to: "/profile", label: "账户" },
  { to: "/transaction", label: "交易" },
  { to: "/execution", label: "执行结果" },
  { to: "/risk-rules", label: "风控规则" },
  { to: "/profile", label: "勋章墙" },
  { to: "/settings", label: "设置" },
];

export function AppLayout() {
  const { account, connectWallet, disconnectWallet, isConnecting } = useWallet();
  const { showToast } = useToast();
  const location = useLocation();
  const isLanding = location.pathname === "/";

  const handleConnect = async () => {
    try {
      await connectWallet();
      showToast({ type: "success", message: "MetaMask 已连接" });
    } catch (e) {
      showToast({ type: "error", message: e instanceof Error ? e.message : "连接失败" });
    }
  };

  const shortAddr = account
    ? `${getAddress(account).slice(0, 6)}...${getAddress(account).slice(-4)}`
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(10, 14, 23, 0.95)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <NavLink to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22, color: "var(--cyan)" }}>⬡</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: "var(--text)", fontFamily: "var(--font-display)" }}>
              Sentinel
            </span>
          </NavLink>

          <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
            {NAV.map((item) => (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  textDecoration: "none",
                  color: isActive ? "var(--cyan)" : "var(--text-muted)",
                  background: isActive ? "rgba(0, 255, 255, 0.08)" : "transparent",
                  fontWeight: isActive ? 600 : 400,
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {account ? (
              <>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--green)" }}>{shortAddr}</span>
                <button type="button" className="sentinel-btn sentinel-btn-ghost" onClick={disconnectWallet} style={{ padding: "6px 12px", fontSize: 12 }}>
                  断开
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sentinel-btn sentinel-btn-primary"
                onClick={handleConnect}
                disabled={isConnecting}
                style={{ padding: "8px 16px", fontSize: 13 }}
              >
                {isConnecting ? "连接中..." : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
        <div style={{ height: 2, background: "var(--gradient-brand)", opacity: 0.6 }} />
      </header>

      <main className={isLanding ? "" : "sentinel-page"}>
        <Outlet />
      </main>
    </div>
  );
}
