import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { getAddress } from "ethers";
import { connectMetaMaskWallet, restoreMetaMaskSession, revokeMetaMaskAccess } from "../lib/wallet";
import { getErrorMessage } from "../lib/errorMessage";

interface WalletContextValue {
  account: string | null;
  isConnecting: boolean;
  /** False until the initial eth_accounts probe finishes (page load / refresh). */
  isWalletReady: boolean;
  setAccount: (account: string | null) => void;
  /** MetaMask eth_requestAccounts + switch/add demo chain when in demo mode */
  connectWallet: () => Promise<string>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccountState] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWalletReady, setIsWalletReady] = useState(false);

  const setAccount = useCallback((a: string | null) => {
    setAccountState(a);
    window.dispatchEvent(new CustomEvent("sentinel:wallet:change"));
  }, []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      const address = await connectMetaMaskWallet();
      setAccount(address);
      return address;
    } catch (err) {
      throw new Error(getErrorMessage(err, "连接 MetaMask 失败"));
    } finally {
      setIsConnecting(false);
    }
  }, [setAccount]);

  const disconnectWallet = useCallback(() => {
    void revokeMetaMaskAccess();
    setAccount(null);
  }, [setAccount]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await restoreMetaMaskSession();
      if (cancelled) return;
      if (restored) setAccount(restored);
      setIsWalletReady(true);
    })();

    return () => {
      cancelled = true;
    };
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
      void (async () => {
        try {
          const list = (await eth.request({ method: "eth_accounts" })) as string[];
          if (!list?.length) {
            setAccount(null);
            return;
          }
          setAccount(getAddress(list[0]));
        } catch {
          setAccount(null);
        }
      })();
    };

    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);

    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, [setAccount]);

  return (
    <WalletContext.Provider
      value={{
        account,
        isConnecting,
        isWalletReady,
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
