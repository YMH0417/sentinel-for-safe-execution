import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const STORE_KEY = "__sentinel_account__";

function getAccount(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function setAccountRaw(account: string | null) {
  try {
    if (account) {
      localStorage.setItem(STORE_KEY, account);
    } else {
      localStorage.removeItem(STORE_KEY);
    }
  } catch {
    /* ignore */
  }
}

interface WalletContextValue {
  account: string | null;
  /** Set the connected wallet address (persists to localStorage) */
  setAccount: (account: string | null) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * WalletProvider — single source of truth for the wallet account.
 *
 * Sync strategy:
 *   - Initializes from localStorage (so a refresh keeps the same account)
 *   - setAccount() updates state + localStorage
 *   - Listens to "storage" events (cross-tab sync) + polls every 3s
 *     to catch MetaMask extension changes within the same tab
 */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccountState] = useState<string | null>(getAccount);

  const setAccount = useCallback((a: string | null) => {
    setAccountState(a);
    setAccountRaw(a);
    // Also fire a custom event for components that listen locally
    window.dispatchEvent(new CustomEvent("sentinel:wallet:change"));
  }, []);

  // Cross-tab sync via storage event
  useEffect(() => {
    const handler = () => {
      const val = getAccount();
      if (val !== account) setAccountState(val);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [account]);

  // Poll for MetaMask extension changes (same tab)
  useEffect(() => {
    const interval = setInterval(() => {
      const val = getAccount();
      if (val !== account) setAccountState(val);
    }, 3000);
    return () => clearInterval(interval);
  }, [account]);

  return (
    <WalletContext.Provider value={{ account, setAccount }}>
      {children}
    </WalletContext.Provider>
  );
}

/** Hook to access wallet account from any component inside WalletProvider. */
export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
