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
