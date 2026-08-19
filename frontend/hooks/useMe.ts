import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import { useAuth } from "./useAuth";

interface Me {
  user_id: string;
  email: string;
  // Whether the caller is in the backend's flat ADMIN_USER_IDS allowlist —
  // the same gate every admin-only route uses (PATCH .../status, PATCH
  // .../nickname). This is the cheapest way to know whether to show any
  // admin-only affordance at all, without a dedicated endpoint or a
  // failed request against an admin route just to find out.
  is_admin: boolean;
}

/** GET /auth/me — verifies the current session and returns is_admin
 * alongside it. Gated on session.user existing (AuthContext) so this
 * never fires while logged out. */
export function useMe() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      if (DEMO_MODE) return { user_id: "demo", email: "demo@example.com", is_admin: false } as Me;
      const { data } = await api.get<Me>("/auth/me");
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}
