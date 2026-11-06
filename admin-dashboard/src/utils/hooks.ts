import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isAbort } from '../api/client';
import { useNotifier } from '../components/Notifier';

export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Loads data whenever `key` changes, aborting stale requests. Errors are shown in the snackbar
 * and also returned so pages can render an inline error state.
 */
export function useLoader<T>(load: (signal: AbortSignal) => Promise<T>, key: string) {
  const { notifyError } = useNotifier();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    loadRef
      .current(ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) setData(d);
      })
      .catch((err) => {
        if (isAbort(err) || ctrl.signal.aborted) return;
        setError(err);
        notifyError(err);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [key, nonce, notifyError]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, setData, loading, error, reload };
}

/** Typed helpers for keeping list filters in the URL so Back from a detail page restores them. */
export function useQueryState() {
  const [params, setParams] = useSearchParams();
  const get = useCallback((k: string) => params.get(k) ?? '', [params]);
  const set = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(updates)) {
            if (v === undefined || v === '' || (k === 'page' && Number(v) <= 1)) next.delete(k);
            else next.set(k, String(v));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return { get, set };
}
