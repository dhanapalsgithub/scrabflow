import { useCallback, useEffect, useRef, useState } from "react";

export function usePolling(fetcher, interval = 8000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const ref = useRef(fetcher);
  ref.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const d = await ref.current();
      setData(d);
      setLastSync(new Date());
    } catch (e) {
      console.error("Polling failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, interval);
    return () => clearInterval(t);
  }, [refresh, interval]);

  return { data, loading, refresh, setData, lastSync };
}
