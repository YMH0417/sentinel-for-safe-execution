import { useCallback, useEffect, useState } from "react";
import { api, type PlatformPolicy } from "../api/client";
import {
  DEFAULT_PLATFORM_POLICY,
  normalizePlatformPolicy,
  readPlatformPolicyFromStorage,
  writePlatformPolicyToStorage,
} from "../lib/platformPolicy";

export function usePlatformPolicy() {
  const [policy, setPolicy] = useState<PlatformPolicy>(
    () => readPlatformPolicyFromStorage() ?? DEFAULT_PLATFORM_POLICY
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = normalizePlatformPolicy(await api.getPlatformPolicy());
      setPolicy(next);
      writePlatformPolicyToStorage(next);
    } catch {
      const cached = readPlatformPolicyFromStorage();
      if (cached) setPolicy(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onPolicyChange = () => {
      const cached = readPlatformPolicyFromStorage();
      if (cached) setPolicy(cached);
      else void refresh();
    };
    window.addEventListener("sentinel:platform-policy:change", onPolicyChange);
    window.addEventListener("focus", onPolicyChange);
    return () => {
      window.removeEventListener("sentinel:platform-policy:change", onPolicyChange);
      window.removeEventListener("focus", onPolicyChange);
    };
  }, [refresh]);

  return { policy, loading, refresh };
}
