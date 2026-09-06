import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import type { Notification } from "../types";

// GET /notifications — a real endpoint the frontend never wired up;
// NotificationsScreen.tsx was rendering hardcoded DEMO_NOTIFS regardless
// of what was actually in the account. Rows are only ever written by
// database triggers server-side (see the backend's own router
// docstring) — this hook is read/mark-read only, same split as the
// backend itself.
const NOTIFICATIONS_KEY = ["notifications"] as const;

export function useNotifications(opts?: { unreadOnly?: boolean; limit?: number }) {
  const unreadOnly = opts?.unreadOnly ?? false;
  const limit = opts?.limit ?? 30;
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, { unreadOnly, limit }],
    queryFn: async () => {
      const { data } = await api.get<Notification[]>("/notifications", {
        params: { unread_only: unreadOnly, limit },
      });
      return data;
    },
    enabled: !DEMO_MODE,
    // Notifications table has Supabase Realtime enabled server-side (per
    // the backend's own docstring), but no client-side subscription exists
    // yet — polling on a short interval is the honest stand-in for "stays
    // roughly current" without pretending to be push/real-time.
    refetchInterval: 60_000,
  });
}

// No GET /notifications/unread-count endpoint exists (see the comment on
// Notification in types/index.ts) — this is exactly the
// `unread_only=true` list-length derivation that comment already
// recommends, in one place so both the bell badge and the screen itself
// can share it.
export function useUnreadNotificationCount() {
  const { data } = useNotifications({ unreadOnly: true, limit: 100 });
  return data?.length ?? 0;
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      if (DEMO_MODE) return;
      await api.post(`/notifications/${notificationId}/read`);
    },
    // Optimistic — flips `read` on every cached notifications list this
    // id appears in (unread-only and "all" are two separate cached
    // queries under the same key prefix), same
    // scan-every-matching-query-and-patch-it approach useLikeLog already
    // established for logs.
    onMutate: async (notificationId) => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const snapshots = qc.getQueriesData<Notification[]>({ queryKey: NOTIFICATIONS_KEY });
      snapshots.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<Notification[]>(key, data.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));
      });
      return { snapshots };
    },
    onError: (_err, _id, context) => {
      context?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (DEMO_MODE) return;
      const { data } = await api.post<{ marked_read: number }>("/notifications/read-all");
      return data;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_KEY });
      const snapshots = qc.getQueriesData<Notification[]>({ queryKey: NOTIFICATIONS_KEY });
      snapshots.forEach(([key, data]) => {
        if (!data) return;
        qc.setQueryData<Notification[]>(key, data.map((n) => ({ ...n, read: true })));
      });
      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
  });
}
