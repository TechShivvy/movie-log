// Own-profile read/write — distinct from useSocial.ts's usePublicProfile,
// which is keyed by username and can only ever be used once a username
// is already set (chicken-and-egg for a brand-new account, and the
// wrong semantics for "read my own settings row regardless of whether
// I've finished onboarding yet").
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
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

const MY_PROFILE_KEY = ["my-profile"];

/**
 * GET /public/me/profile — as of this writing, requested from the
 * backend but not yet deployed (see the backend prompt this session
 * handed off). Until it lands, any error here is swallowed and treated
 * as "no profile row yet" rather than surfaced as a screen-level error,
 * so ProfileScreen falls back to the auth session's own email instead
 * of showing a broken/error state. No frontend change will be needed
 * once the endpoint ships — it'll just start returning real data.
 */
export function useMyProfile() {
  return useQuery({
    queryKey: MY_PROFILE_KEY,
    queryFn: async (): Promise<MyProfile | null> => {
      try {
        const { data } = await api.get<MyProfile>("/public/me/profile");
        return data;
      } catch {
        return null;
      }
    },
    enabled: !DEMO_MODE,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
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
      qc.setQueryData(MY_PROFILE_KEY, data);
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
        if (e?.response?.status === 404) return true; // nobody has it
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
  return useMutation({
    mutationFn: async (username: string) => {
      const { data } = await api.patch<MyProfile>("/public/me/username", { username });
      return data;
    },
    onSuccess: (data) => qc.setQueryData(MY_PROFILE_KEY, data),
  });
}

export function useUpdatePrivacy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (account_visibility: "public" | "followers_only" | "private") => {
      const { data } = await api.patch<MyProfile>("/public/me/privacy", { account_visibility });
      return data;
    },
    onSuccess: (data) => qc.setQueryData(MY_PROFILE_KEY, data),
  });
}
