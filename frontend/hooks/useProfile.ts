// Own-profile read/write — distinct from useSocial.ts's usePublicProfile,
// which is keyed by username and can only ever be used once a username
// is already set (chicken-and-egg for a brand-new account, and the
// wrong semantics for "read my own settings row regardless of whether
// I've finished onboarding yet").
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { useAuth } from "./useAuth";
import type { ProfileLink } from "../types";

export interface MyProfile {
  user_id: string;
  username?: string;
  display_name?: string;
  bio?: string;
  account_visibility: "public" | "followers_only" | "private";
  avatar_path?: string;
  banner_path?: string;
  profile_links: ProfileLink[];
}

// Scoped by user id, not a bare ["my-profile"] — a fixed, unscoped key
// meant every account sharing this browser/QueryClient (every throwaway
// test account this session, or just signing out and back in as
// someone else) could read back WHOEVER was cached last: sign out
// doesn't clear the query cache, so a stale `null` or a different
// account's row could sit in that one slot and get served to the next
// session for up to staleTime (30s) — including a stale "no username"
// read that would incorrectly bounce a real, already-onboarded account
// back into the onboarding redirect. Scoping by user_id gives every
// account its own cache slot, so switching sessions can never serve
// one account's data (or absence of it) to another.
function myProfileKey(userId: string | undefined) {
  return ["my-profile", userId];
}

/**
 * GET /public/me/profile.
 *
 * enabled requires a real session, not just !DEMO_MODE — this query
 * used to start fetching the instant the component mounted, racing
 * AuthContext's own initial supabase.auth.getSession() resolution. A
 * request that went out before the session was ready got a 401 — see
 * below for why that no longer gets treated as a real answer.
 *
 * queryFn deliberately does NOT catch/swallow errors into `null`
 * anymore (an earlier version did, back when this endpoint didn't
 * exist yet and any failure needed a graceful "no profile" fallback).
 * Once GET /public/me/profile went live, that swallow became actively
 * harmful: ANY transient failure — not just the pre-session-ready 401
 * above, but also e.g. the OAuth callback flow's own token-exchange
 * window, which has a wider/less predictable timing gap than a plain
 * password sign-in's more synchronous one — got cached as a confirmed
 * "no username", which the onboarding redirect gate below then reads
 * as gospel and bounces an already-onboarded account right back into
 * onboarding. Letting it throw means `data` just stays undefined
 * during any transient failure (react-query retries once by default)
 * instead of settling on a false negative — the gate only ever
 * redirects once a fetch has genuinely SUCCEEDED and confirmed there's
 * no username, never off an error.
 */
export function useMyProfile() {
  const { session, loading: authLoading } = useAuth();
  return useQuery({
    queryKey: myProfileKey(session?.user?.id),
    queryFn: async (): Promise<MyProfile> => {
      const { data } = await api.get<MyProfile>("/public/me/profile");
      return data;
    },
    enabled: !DEMO_MODE && !authLoading && !!session,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (patch: {
      display_name?: string | null;
      bio?: string | null;
      avatar_path?: string | null;
      banner_path?: string | null;
      profile_links?: ProfileLink[];
    }) => {
      const { data } = await api.patch<MyProfile>("/public/me/profile", patch);
      return data;
    },
    onSuccess: (data) => {
      qc.setQueryData(myProfileKey(session?.user?.id), data);
      if (data.username) qc.invalidateQueries({ queryKey: ["public-profile", data.username] });
    },
  });
}

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

/**
 * Live availability check for the username field — reuses
 * GET /public/users/{username} (already public, read-only, no side
 * effects) rather than a dedicated endpoint that doesn't exist: a 404
 * means nobody has that username, a 200 means someone does. No
 * PATCH /me/username call happens here, so typing never actually claims
 * anything — only the real Save does that.
 *
 * `username` is expected to already be debounced by the caller (this
 * hook doesn't debounce itself, since the caller also needs the raw
 * keystroke value for the input's own controlled `value`).
 */
export function useUsernameAvailability(username: string, currentUsername?: string) {
  const trimmed = username.trim().toLowerCase();
  const isCurrent = !!currentUsername && trimmed === currentUsername;
  const validFormat = USERNAME_PATTERN.test(trimmed);

  const query = useQuery({
    queryKey: ["username-availability", trimmed],
    queryFn: async (): Promise<boolean> => {
      try {
        await api.get(`/public/users/${trimmed}`);
        return false; // 200 = someone already has it
      } catch (e: any) {
        if (e?.status === 404) return true; // nobody has it
        throw e;
      }
    },
    enabled: !DEMO_MODE && validFormat && !isCurrent,
    staleTime: 10_000,
    retry: false,
  });

  if (!trimmed) return { status: "idle" as const };
  if (!validFormat) return { status: "invalid" as const };
  if (isCurrent) return { status: "current" as const };
  if (query.isFetching) return { status: "checking" as const };
  if (query.data === true) return { status: "available" as const };
  if (query.data === false) return { status: "taken" as const };
  return { status: "idle" as const };
}

export function useUpdateUsername() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (username: string) => {
      const { data } = await api.patch<MyProfile>("/public/me/username", { username });
      return data;
    },
    onSuccess: (data) => qc.setQueryData(myProfileKey(session?.user?.id), data),
  });
}

export function useUpdatePrivacy() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (account_visibility: "public" | "followers_only" | "private") => {
      const { data } = await api.patch<MyProfile>("/public/me/privacy", { account_visibility });
      return data;
    },
    // Real optimistic update, same onMutate/onError/onSettled shape
    // useSocial.ts's useLikeLog already establishes — this used to only
    // flip the SegmentedControl after the full PATCH round-trip landed,
    // reading as a visible one-beat lag on every tap. onMutate writes the
    // new value into cache immediately; onError rolls back to the exact
    // pre-mutation snapshot if the request fails; onSuccess (kept, not
    // onSettled — this mutation's response IS the authoritative new
    // profile, no separate invalidate/refetch needed) reconciles with
    // whatever the server actually persisted.
    onMutate: async (account_visibility) => {
      const key = myProfileKey(session?.user?.id);
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<MyProfile>(key);
      if (snapshot) qc.setQueryData<MyProfile>(key, { ...snapshot, account_visibility });
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) qc.setQueryData(myProfileKey(session?.user?.id), context.snapshot);
    },
    onSuccess: (data) => qc.setQueryData(myProfileKey(session?.user?.id), data),
  });
}
