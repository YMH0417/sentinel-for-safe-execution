import { useState, useEffect, useCallback } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "sentinel-theme";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const isLight = theme === "light";

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggle}
      title={isLight ? "切换到夜晚模式" : "切换到白天模式"}
      aria-label={isLight ? "切换到夜晚模式" : "切换到白天模式"}
    >
      {isLight ? (
        /* Moon icon — click to go dark */
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M14.5 10.5A6 6 0 017.5 3.5a6 6 0 100 12 6 6 0 007-5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        /* Sun icon — click to go light */
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M9 1.5v2M9 14.5v2M2.5 9h-2M17.5 9h-2M3.9 3.9L2.5 2.5M15.5 15.5l-1.4-1.4M3.9 14.1l-1.4 1.4M15.5 2.5l-1.4 1.4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
