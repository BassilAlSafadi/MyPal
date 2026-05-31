import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal data-fetching hook (the app has no react-query provider).
 * Runs `fn` on mount and whenever `deps` change, exposing loading/error/refetch.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoFn = useCallback(fn, deps);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const result = await memoFn();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [memoFn]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    memoFn()
      .then((d) => { if (active) { setData(d); setError(null); } })
      .catch((e) => { if (active) setError(e as Error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [memoFn]);

  return { data, loading, error, refetch: run };
}
