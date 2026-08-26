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
import React from "react";
import { ScrollView, Text, View } from "react-native";
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
import { Button } from "../components/ui/Button";
import type { NotificationType } from "../types";
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

function notifText(n: any): string {
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

// Mock notifications for demo — no useNotifications hook exists yet
// (GET /notifications is unwired here), so this screen is demo-data only
// for now; the type/field names below at least match the real Notification
// shape (types/index.ts) so wiring the real hook in later is a drop-in.
const DEMO_NOTIFS = [
  { id: "1", type: "follow_request" as NotificationType, actor_username: "cinephile99", read: false, created_at: new Date(Date.now() - 120000).toISOString() },
  { id: "2", type: "log_like" as NotificationType, actor_username: "sarah_films", movie: "Dune: Part Two", read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: "3", type: "new_comment" as NotificationType, actor_username: "moviejunkie", movie: "Oppenheimer", read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
  { id: "4", type: "comment_like" as NotificationType, actor_username: "filmcritic", read: true, created_at: new Date(Date.now() - 172800000).toISOString() },
];

// ─── Notification Row ─────────────────────────────────────────────────────────

function NotifRow({ notif, theme }: { notif: typeof DEMO_NOTIFS[0]; theme: any }) {
  const isFollowRequest = notif.type === "follow_request";

  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
      opacity: notif.read ? 0.65 : 1,
    }}>
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
          <Button variant="primary" label="Accept" />
          <Button variant="secondary" label="Ignore" />
        </View>
      )}

      {/* Unread dot */}
      {!notif.read && (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, flexShrink: 0 }} />
      )}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const notifs = DEMO_NOTIFS;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={{
        paddingTop: isMobile ? 16 : 28,
        paddingHorizontal: isMobile ? 16 : 32,
        paddingBottom: isMobile ? 100 : 40,
      }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={{ maxWidth: isMobile ? undefined : 660, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        <Text style={{
          fontSize: isMobile ? fontSizes.display : fontSizes.h1,
          fontWeight: isMobile ? "800" : "700",
          color: theme.text,
          marginBottom: isMobile ? 16 : 24,
          letterSpacing: isMobile ? undefined : -0.5,
        }}>
          Notifications
        </Text>
        {notifs.map((n) => <NotifRow key={n.id} notif={n} theme={theme} />)}
      </View>
    </ScrollView>
  );
}
