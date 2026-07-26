import { useNavigate, useLocation } from "react-router-dom";
import { HeaderAvatar } from "./HeaderAvatar";

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Transactions", path: "/transaction" },
  ];

  return (
    <header style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: 24, paddingBottom: 16, borderBottom: "1px solid #30363d",
      paddingTop: 20,
    }}>
      {/* Left: brand + nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <div
          onClick={() => navigate("/dashboard")}
          style={{ cursor: "pointer" }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#58a6ff", margin: 0 }}>Sentinel</h1>
          <p style={{ fontSize: 13, color: "#8b949e", marginTop: 2 }}>DEFI Security Monitor</p>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                style={{
                  background: "none",
                  border: "none",
                  color: isActive ? "#58a6ff" : "#8b949e",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                  cursor: "pointer",
                  padding: "6px 12px",
                  borderRadius: 6,
                  transition: "color 0.15s, background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "#161b22";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: avatar */}
      <HeaderAvatar />
    </header>
  );
}
