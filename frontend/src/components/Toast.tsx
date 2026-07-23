import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;   // ms, 0 = manual-dismiss only
}

// ── Context ────────────────────────────────────────────────────

interface ToastContextValue {
  showToast: (opts: { type: ToastType; message: string; duration?: number }) => void;
  hideToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((opts: { type: ToastType; message: string; duration?: number }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast: ToastItem = { ...opts, id, duration: opts.duration ?? 4000 };

    setToasts(prev => [...prev, toast]);

    if (toast.duration! > 0) {
      const timer = setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timersRef.current.delete(id);
      }, toast.duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, []);

  const hideToast = useCallback((id: string) => {
    clearTimer(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, [clearTimer]);

  // cleanup on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={hideToast} />
    </ToastContext.Provider>
  );
}

// ── Icon helpers ──────────────────────────────────────────────

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case "success":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#3fb950" strokeWidth="2" />
          <path d="M8 12.5l2.5 2.5 5-5" stroke="#3fb950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "error":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#f85149" strokeWidth="2" />
          <path d="M15 9l-6 6M9 9l6 6" stroke="#f85149" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "info":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#58a6ff" strokeWidth="2" />
          <path d="M12 11v4M12 8v.01" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "warning":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#d29922" strokeWidth="2" />
          <path d="M12 8v4M12 15.5v.01" stroke="#d29922" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

// ── Toast container & item ─────────────────────────────────────

const typeStyles: Record<ToastType, { bg: string; border: string; text: string }> = {
  success: { bg: "#2386361a", border: "#3fb95055", text: "#3fb950" },
  error:   { bg: "#da36331a", border: "#f8514955", text: "#f85149" },
  info:    { bg: "#1f6feb1a", border: "#58a6ff55", text: "#58a6ff" },
  warning: { bg: "#9e6a031a", border: "#d2992255", text: "#d29922" },
};

function ToastContainer({ toasts, onRemove }: { toasts: ToastItem[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: 20,
      right: 20,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      zIndex: 9999,
      maxWidth: 380,
      pointerEvents: "none",
    }}>
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          item={toast}
          onDismiss={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const styles = typeStyles[item.type];
  const [visible, setVisible] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setRemoving(true);
    setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 200);
  };

  return (
    <div
      onClick={handleClose}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 16px",
        background: styles.bg,
        border: `1px solid ${styles.border}`,
        borderRadius: 10,
        color: styles.text,
        fontSize: 13,
        fontWeight: 500,
        cursor: item.duration === 0 ? "pointer" : "default",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        pointerEvents: "auto",
        opacity: visible ? 1 : 0,
        transform: removing ? "translateX(100%)" : visible ? "translateX(0)" : "translateX(100%)",
        transition: "all 0.2s ease",
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
        backdropFilter: "blur(8px)",
      }}
    >
      <ToastIcon type={item.type} />
      <span style={{ flex: 1 }}>{item.message}</span>
      {/* dismiss button */}
      {item.duration === 0 && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6, flexShrink: 0 }}>
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  );
}
