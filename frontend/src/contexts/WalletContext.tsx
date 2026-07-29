import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { getAddress } from "ethers";
import { connectMetaMaskWallet } from "../lib/wallet";

const STORE_KEY = "__sentinel_account__";

function getStoredAccount(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function setStoredAccount(account: string | null) {
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
  isConnecting: boolean;
  setAccount: (account: string | null) => void;
  /** MetaMask eth_requestAccounts + switch/add Anvil when in demo mode */
  connectWallet: () => Promise<string>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccountState] = useState<string | null>(getStoredAccount);
  const [isConnecting, setIsConnecting] = useState(false);

  const setAccount = useCallback((a: string | null) => {
    setAccountState(a);
    setStoredAccount(a);
    window.dispatchEvent(new CustomEvent("sentinel:wallet:change"));
  }, []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      const address = await connectMetaMaskWallet();
      setAccount(address);
      return address;
    } finally {
      setIsConnecting(false);
    }
  }, [setAccount]);

  const disconnectWallet = useCallback(() => {
    setAccount(null);
  }, [setAccount]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const onAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.length) {
        setAccount(null);
        return;
      }
      try {
        setAccount(getAddress(list[0]));
      } catch {
        setAccount(list[0] ?? null);
      }
    };

    const onChainChanged = () => {
      window.location.reload();
    };

    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);

    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, [setAccount]);

  useEffect(() => {
    const handler = () => {
      const val = getStoredAccount();
      if (val !== account) setAccountState(val);
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [account]);

  return (
    <WalletContext.Provider
      value={{
        account,
        isConnecting,
        setAccount,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
