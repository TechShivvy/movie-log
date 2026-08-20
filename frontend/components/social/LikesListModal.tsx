/**
 * LikesListModal — "who liked this", shared between a log's likes and a
 * comment's likes (same LikeEntry shape either way). Opened by tapping
 * the like count itself, not the heart icon — the icon stays a
 * single-tap toggle.
 */
import React from "react";
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../../hooks/useTheme";
import { avatarUrl } from "../../lib/storage";
import { Avatar } from "../ui/Avatar";
import type { LikeEntry } from "../../hooks/useSocial";

interface LikesListModalProps {
  visible: boolean;
  entries: LikeEntry[] | undefined;
  isLoading: boolean;
  onClose: () => void;
}

export function LikesListModal({ visible, entries, isLoading, onClose }: LikesListModalProps) {
  const { theme } = useTheme();
  const router = useRouter();
  if (!visible) return null;

  const goToProfile = (username?: string) => {
    if (!username) return;
    onClose();
    router.push(`/(app)/profile/${username}` as any);
  };

  const rows = entries ?? [];

  const list = isLoading ? (
    <View style={{ paddingVertical: 30, alignItems: "center" }}>
      {Platform.OS === "web"
        ? <span className="spin" style={{ fontSize: 22, color: theme.accent } as React.CSSProperties}>◌</span>
        : <ActivityIndicator color={theme.accent} />}
    </View>
  ) : rows.length === 0 ? (
    <Text style={{ color: `${theme.text}55`, fontSize: 14, textAlign: "center", paddingVertical: 30 }}>No likes yet.</Text>
  ) : Platform.OS === "web" ? (
    <div style={{ maxHeight: 360, overflowY: "auto" } as React.CSSProperties}>
      {rows.map((r) => (
        <div
          key={r.user_id}
          className="tapc"
          onClick={() => goToProfile(r.username)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", cursor: r.username ? "pointer" : "default" } as React.CSSProperties}
        >
          <Avatar name={r.display_name ?? r.username ?? "?"} uri={avatarUrl(r.avatar_path)} size="sm" />
          <span style={{ fontSize: 14, fontWeight: 600, color: theme.text } as React.CSSProperties}>
            {r.display_name ?? r.username ?? "Someone"}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <FlatList
      style={{ maxHeight: 360 }}
      data={rows}
      keyExtractor={(r) => r.user_id}
      renderItem={({ item: r }) => (
        <Pressable onPress={() => goToProfile(r.username)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
          <Avatar name={r.display_name ?? r.username ?? "?"} uri={avatarUrl(r.avatar_path)} size="sm" />
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>{r.display_name ?? r.username ?? "Someone"}</Text>
        </Pressable>
      )}
    />
  );

  if (Platform.OS === "web") {
    return (
      <div className="dialog-backdrop" onClick={onClose}>
        <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 340 } as React.CSSProperties}>
          <div className="dialog-title">Likes</div>
          <div style={{ marginTop: 8 } as React.CSSProperties}>{list}</div>
        </div>
      </div>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.dialog, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.text }]}>Likes</Text>
          <View style={{ marginTop: 8 }}>{list}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 },
  dialog: { width: "100%", maxWidth: 340, borderRadius: 14, padding: 20 },
  title: { fontSize: 18, fontWeight: "700" },
});
