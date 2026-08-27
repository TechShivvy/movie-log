import { useRef, useCallback } from "react";
import { useRouter } from "expo-router";

// How long a navigation stays "in flight" for guard purposes — long
// enough to cover a real route transition (Metro's own lazy per-route
// chunk load included, per this repo's own run-frontend skill notes on
// first-hit timing), short enough that a genuinely separate later tap
// (the user came back to this same screen and pressed the button again)
// isn't accidentally swallowed.
const GUARD_MS = 800;

/**
 * Wraps expo-router's router.push so a second tap before the first
 * navigation has actually landed is a no-op, instead of pushing a
 * second (or third, or fourth...) entry onto the stack. Found at 6
 * call sites — the log-a-screening FAB/CTA (TabBar, Sidebar's web+
 * native, LibraryScreen's empty state, MovieDetailScreen's "Log this")
 * and LogDetailScreen's Edit button (both instances) — none of which
 * had ANY guard: a bare router.push(...) directly in onPress, so rapid
 * repeated taps (a slow route transition, a slow device, an
 * accidentally-double-tap) each independently pushed their own stacked
 * entry.
 */
export function useNavigateOnce() {
  const router = useRouter();
  const guarding = useRef(false);

  const push = useCallback(
    (href: Parameters<typeof router.push>[0]) => {
      if (guarding.current) return;
      guarding.current = true;
      router.push(href);
      setTimeout(() => { guarding.current = false; }, GUARD_MS);
    },
    [router],
  );

  return push;
}
