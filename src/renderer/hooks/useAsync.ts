import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Runs `load` whenever `deps` change, ignoring results from a stale run (e.g. the
 * account id changed before the previous call resolved). Returns a manual `reload`
 * that re-runs the same loader without needing new deps.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const requestId = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(() => {
    const id = ++requestId.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    loadRef
      .current()
      .then((data) => {
        if (id === requestId.current) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (id === requestId.current) {
          setState({ data: null, loading: false, error: errorMessage(error) });
        }
      });
  }, []);

  useEffect(() => {
    run();
    // `deps` intentionally drives re-fetching; `run` itself is stable.
  }, deps);

  return { ...state, reload: run };
}
