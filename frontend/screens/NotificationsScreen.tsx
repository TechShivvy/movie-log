/**
 * NotificationsScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:660px):
 *   h1 "Notifications" + list of notification rows
 *     Each: 40px/12px icon box (accent-800 bg, accent-100 icon) + text + time
 *           + optional Accept/Ignore btns for follow requests
 *
 * Mobile: scrollable list with same card layout
 */
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
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
import type { NotificationType } from "../types";

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

  if (Platform.OS === "web") {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 0",
        borderBottom: `1px solid ${theme.divider}`,
        opacity: notif.read ? 0.65 : 1,
      } as React.CSSProperties}>
        {/* Icon box — 40×40px, accent-800 bg */}
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: theme.accent800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        } as React.CSSProperties}>
          {notifIcon(notif.type, theme.accent)}
        </div>

        {/* Text */}
        <div style={{ flex: 1 } as React.CSSProperties}>
          <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.4 } as React.CSSProperties}>
            {notifText(notif)}
          </div>
          <div style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 3 } as React.CSSProperties}>
            {relTime(notif.created_at)}
          </div>
        </div>

        {/* Actions for follow requests */}
        {isFollowRequest && (
          <div style={{ display: "flex", gap: 6 } as React.CSSProperties}>
            <button className="btn btn-primary" style={{ fontSize: 12, padding: "4px 12px" } as React.CSSProperties}>
              Accept
            </button>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 12px" } as React.CSSProperties}>
              Ignore
            </button>
          </div>
        )}

        {/* Unread dot */}
        {!notif.read && (
          <div style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: theme.accent,
            flexShrink: 0,
          } as React.CSSProperties} />
        )}
      </div>
    );
  }

  return (
    <View style={{
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.divider,
      opacity: notif.read ? 0.65 : 1,
    }}>
      {/* Icon box */}
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
        <Text style={{ fontSize: 13, color: theme.text, lineHeight: 18 }}>{notifText(notif)}</Text>
        <Text style={{ fontSize: 11, color: `${theme.text}55`, marginTop: 3 }}>{relTime(notif.created_at)}</Text>
      </View>

      {/* Follow actions */}
      {isFollowRequest && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable style={{
            backgroundColor: theme.accent,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Accept</Text>
          </Pressable>
          <Pressable style={{
            borderWidth: 1,
            borderColor: theme.divider,
            borderRadius: 6,
            paddingHorizontal: 10,
            paddingVertical: 5,
          }}>
            <Text style={{ color: `${theme.text}88`, fontSize: 12, fontWeight: "600" }}>Ignore</Text>
          </Pressable>
        </View>
      )}

      {/* Unread dot */}
      {!notif.read && (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent }} />
      )}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function NotificationsScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const notifs = DEMO_NOTIFS;

  if (Platform.OS === "web" && !isMobile) {
    return (
      /* width:"100%" alongside maxWidth — see LibraryScreen.tsx's root div;
         same shrink-wrap-instead-of-filling bug as every other screen
         below this maxWidth+margin:auto shape. */
      <div style={{ padding: "28px 32px 40px", maxWidth: 660, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: theme.text, margin: "0 0 24px", letterSpacing: -0.5 } as React.CSSProperties}>
          Notifications
        </h1>
        {notifs.map((n) => <NotifRow key={n.id} notif={n} theme={theme} />)}
      </div>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 100 }} contentInsetAdjustmentBehavior="automatic">
      <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text, marginBottom: 16 }}>Notifications</Text>
      {notifs.map((n) => <NotifRow key={n.id} notif={n} theme={theme} />)}
    </ScrollView>
  );
}
