/**
 * NotificationsScreen — one JSX tree, breakpoint-driven (see Part C of the
 * architecture-unification plan). NotifRow used to fork on Platform.OS for
 * a structurally-identical row (icon box + text + Accept/Ignore + unread
 * dot) that only really needed the shared <Button> component's own
 * per-platform rendering for Accept/Ignore — hand-rolling a second
 * Pressable-based copy of it here had also let the message/time font
 * sizes silently drift between the two branches (web: base/sm, native:
 * sm/xs), not a deliberate design choice.
 */
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Heart,
  ChatCircle,
  UserPlus,
  Bell,
  Star,
  Info,
} from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "../hooks/useNotifications";
import { useAcceptFollowRequest, useIgnoreFollowRequest } from "../hooks/useSocial";
import { Button } from "../components/ui/Button";
import { ScreenLoader } from "../components/ui/Spinner";
import { Icon } from "../components/ui/Icon";
import type { Notification, NotificationType } from "../types";
import { type as fontSizes } from "../constants/fonts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notifIcon(type: NotificationType, color: string) {
  const props = { size: 18, color, weight: "fill" as const };
  switch (type) {
    case "follow_request":
    case "follow_accepted":
    case "new_follower":     return <UserPlus {...props} />;
    case "log_like":
    case "comment_like":     return <Heart {...props} />;
    case "new_comment":
    case "comment_reply":    return <ChatCircle {...props} />;
    case "report_resolved":
    case "auto_insert_complete":
    case "batch_extraction_complete": return <Info {...props} />;
    default:                 return <Bell {...props} />;
  }
}

function notifText(n: Notification): string {
  switch (n.type as NotificationType) {
    case "follow_request":
      return `${n.actor_username ?? "Someone"} wants to follow you`;
    case "follow_accepted":
      return `${n.actor_username ?? "Someone"} accepted your follow request`;
    case "new_follower":
      return `${n.actor_username ?? "Someone"} started following you`;
    case "log_like":
      return `${n.actor_username ?? "Someone"} liked your log${n.movie ? ` of ${n.movie}` : ""}`;
    case "new_comment":
      return `${n.actor_username ?? "Someone"} commented on ${n.movie ?? "your log"}`;
    case "comment_reply":
      return `${n.actor_username ?? "Someone"} replied to your comment`;
    case "comment_like":
      return `${n.actor_username ?? "Someone"} liked your comment`;
    case "report_resolved":
      return "Your report has been resolved";
    case "auto_insert_complete":
      return `${n.movie ?? "A ticket"} was auto-logged from your extraction settings`;
    case "batch_extraction_complete":
      return `Your batch of ${n.batch_total_items ?? "several"} tickets finished processing`;
    default:
      return "You have a new notification";
  }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Where tapping a notification (not its Accept/Ignore buttons) should
// go — a log for the content types, the actor's own profile for the
// follow-related ones (nothing else to show for those). report_resolved
// has no useful destination (report_id isn't a route anywhere in this
// app) and auto/batch-extraction ones aren't emitted by the backend at
// all yet (see NotificationType's own comment in types/index.ts) — all
// three fall through to no navigation.
function notifTarget(n: Notification): string | undefined {
  switch (n.type) {
    case "follow_request":
    case "follow_accepted":
    case "new_follower":
      return n.actor_username ? `/(app)/profile/${n.actor_username}` : undefined;
    case "log_like":
    case "new_comment":
    case "comment_reply":
    case "comment_like":
      // ?from=notifications — a log lives under the Library tab's own
      // Stack, a different one than this screen (Profile tab); expo-
      // router's <Tabs> resolves that kind of push by switching tabs and
      // replacing history for the target tab rather than pushing a new
      // entry, so router.back() from the log screen has nothing of
      // Notifications left to land on (confirmed live — it lands on the
      // Library tab's own index instead). LogDetailScreen reads this
      // param back and routes its own "Back" button here explicitly
      // instead of trusting history for it. The follow-related cases
      // above don't need this — profile/{username} lives in this same
      // Profile tab's Stack, a normal same-tab push with working history.
      return n.movie_log_id ? `/(app)/log/${n.movie_log_id}?from=notifications` : undefined;
    default:
      return undefined;
  }
}

// ─── Notification Row ─────────────────────────────────────────────────────────

function NotifRow({ notif, theme, onOpen, onAccept, onIgnore, accepting, ignoring }: {
  notif: Notification; theme: any; onOpen: () => void;
  onAccept: () => void; onIgnore: () => void;
  accepting: boolean; ignoring: boolean;
}) {
  const isFollowRequest = notif.type === "follow_request";

  return (
    <Pressable
      onPress={onOpen}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.divider,
        opacity: notif.read ? 0.65 : 1,
      }}
    >
      {/* Icon box — 40×40, accent-800 bg */}
      <View style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: theme.accent800,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        {notifIcon(notif.type, theme.accent)}
      </View>

      {/* Text */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSizes.base, color: theme.text, lineHeight: 20 }}>{notifText(notif)}</Text>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 3 }}>{relTime(notif.created_at)}</Text>
      </View>

      {/* Follow-request actions — <Button> already handles the real
          per-platform rendering (CSS .btn classes + hover on web, a
          Pressable on native), so this row needs no branch of its own. */}
      {isFollowRequest && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Button variant="primary" label="Accept" loading={accepting} onPress={onAccept} />
          <Button variant="secondary" label="Ignore" loading={ignoring} onPress={onIgnore} />
        </View>
      )}

      {/* Unread dot */}
      {!notif.read && (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, flexShrink: 0 }} />
      )}
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const { data: notifs, isLoading, refetch } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const acceptRequest = useAcceptFollowRequest();
  const ignoreRequest = useIgnoreFollowRequest();

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  function openNotif(n: Notification) {
    if (!n.read) markRead.mutate(n.id);
    const target = notifTarget(n);
    if (target) router.push(target as any);
  }

  if (isLoading) return <ScreenLoader />;

  const hasUnread = !!notifs?.some((n) => !n.read);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={{
        paddingTop: isMobile ? 16 : 28,
        paddingHorizontal: isMobile ? 16 : 32,
        paddingBottom: isMobile ? 100 : 40,
      }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.accent} colors={[theme.accent]} />}
    >
      <View style={{ maxWidth: isMobile ? undefined : 660, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: isMobile ? 16 : 24 }}>
          <Text style={{
            fontSize: isMobile ? fontSizes.display : fontSizes.h1,
            fontWeight: isMobile ? "800" : "700",
            color: theme.text,
            letterSpacing: isMobile ? undefined : -0.5,
          }}>
            Notifications
          </Text>
          {hasUnread && (
            <Button
              variant="ghost"
              label="Mark all read"
              loading={markAllRead.isPending}
              onPress={() => markAllRead.mutate()}
            />
          )}
        </View>

        {!notifs || notifs.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 8 }}>
            <Icon name="bell" size={36} color={`${theme.text}33`} />
            <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.base }}>Nothing yet.</Text>
          </View>
        ) : (
          notifs.map((n) => (
            <NotifRow
              key={n.id}
              notif={n}
              theme={theme}
              onOpen={() => openNotif(n)}
              onAccept={() => n.actor_username && acceptRequest.mutate(n.actor_username)}
              onIgnore={() => n.actor_username && ignoreRequest.mutate(n.actor_username)}
              accepting={acceptRequest.isPending}
              ignoring={ignoreRequest.isPending}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}
