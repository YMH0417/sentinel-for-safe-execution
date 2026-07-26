interface RouteItem {
  routeId: string;
  label: string;
  quotedOut: number;
  expectedOut: number;
  poolRiskScore: number;
  warningFlags: string[];
}

interface Props {
  routes: RouteItem[];
  selected: string;
  onSelect: (id: string) => void;
  /** Highlight a recommended route (e.g. fallback suggestion) */
  recommendedRouteId?: string | null;
}

export function RouteList({ routes, selected, onSelect, recommendedRouteId }: Props) {
  return (
    <div style={{
      background: "#161b22",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      border: "1px solid #30363d",
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#8b949e", textTransform: "uppercase", letterSpacing: 1 }}>
        Routes
      </h3>
      {routes.map(route => {
        const isSelected = route.routeId === selected;
        const isRecommended = recommendedRouteId === route.routeId;
        const riskLevel = route.poolRiskScore > 50 ? "high" : route.poolRiskScore > 25 ? "moderate" : "low";
        const borderColor = riskLevel === "high" ? "#f85149" : riskLevel === "moderate" ? "#d29922" : "#3fb950";
        const effectiveBorder = isRecommended ? "#3fb950" : isSelected ? borderColor : "#30363d";

        return (
          <div
            key={route.routeId}
            onClick={() => onSelect(route.routeId)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 16px",
              marginBottom: 8,
              borderRadius: 8,
              background: isSelected ? "#1c2333" : isRecommended ? "#122117" : "#0d1117",
              border: `2px solid ${effectiveBorder}`,
              cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: isRecommended ? "0 0 0 1px #3fb95044" : undefined,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {route.label}
                <span style={{ marginLeft: 8, fontSize: 11, color: "#484f58" }}>ID: {route.routeId}</span>
                {isRecommended && (
                  <span style={{
                    marginLeft: 8,
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "#3fb95022",
                    color: "#3fb950",
                  }}>
                    推荐安全路由
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#8b949e", marginTop: 2 }}>
                {route.quotedOut} / expected {route.expectedOut}
                {route.warningFlags.length > 0 && (
                  <span style={{ marginLeft: 8, color: "#f85149" }}>
                    ⚠ {route.warningFlags.join(", ")}
                  </span>
                )}
              </div>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: borderColor,
              }} />
              <span style={{ fontSize: 12, color: "#8b949e" }}>
                Risk: {route.poolRiskScore}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
