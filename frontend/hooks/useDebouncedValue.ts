import { useEffect, useState } from "react";

/**
 * Returns `value`, but only after it's stopped changing for `delayMs`.
 * Search inputs (movie title, theatre, the global search tab) fed their
 * live keystroke value straight into useMovieSearch/useVenueSearch — a
 * fresh React Query key, and so a fresh network request, on every single
 * keystroke, with nothing to cancel the ones a fast typist immediately
 * made stale. Wrapping the value passed in with this hook is enough:
 * the query hooks themselves stay generic/unaware of debouncing, and
 * only actually see (and fetch for) the settled value.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
