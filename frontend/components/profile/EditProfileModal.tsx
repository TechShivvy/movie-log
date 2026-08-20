/**
 * EditProfileModal — display_name, bio, username, avatar + banner
 * upload, all in one place, same "bundled into one edit screen" shape
 * the backend's ProfileUpdate schema itself describes (username gets
 * its own PATCH call underneath since it has its own uniqueness
 * semantics, but from here it's one form / one Save).
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PencilSimple } from "phosphor-react-native";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";
import { useUpdateProfile, useUpdateUsername, type MyProfile } from "../../hooks/useProfile";
import { avatarUrl, bannerUrl, pickAndUploadImage } from "../../lib/storage";
import { useToast } from "../../context/ToastContext";
import { Avatar } from "../ui/Avatar";
import { Input } from "../ui/Input";

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

interface EditProfileModalProps {
  visible: boolean;
  profile: MyProfile | null;
  onClose: () => void;
}

export function EditProfileModal({ visible, profile, onClose }: EditProfileModalProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { showToast } = useToast();
  const updateProfile = useUpdateProfile();
  const updateUsername = useUpdateUsername();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | undefined>(undefined);
  const [bannerPath, setBannerPath] = useState<string | undefined>(undefined);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [usernameError, setUsernameError] = useState<string | undefined>(undefined);

  // Re-seed local form state from the current profile every time the
  // modal opens — not on every profile change, so mid-edit local state
  // (e.g. a just-picked avatar not yet saved) doesn't get clobbered by
  // an unrelated background refetch while the modal is still open.
  useEffect(() => {
    if (!visible) return;
    setUsername(profile?.username ?? "");
    setDisplayName(profile?.display_name ?? "");
    setBio(profile?.bio ?? "");
    setAvatarPath(profile?.avatar_path);
    setBannerPath(profile?.banner_path);
    setUsernameError(undefined);
  }, [visible, profile]);

  if (!visible) return null;

  const saving = updateProfile.isPending || updateUsername.isPending;

  async function handleUpload(bucket: "avatar-images" | "banner-images", setter: (p: string) => void, setBusy: (b: boolean) => void) {
    if (!user) return;
    setBusy(true);
    try {
      const path = await pickAndUploadImage(bucket, user.id);
      if (path) setter(path);
    } catch (e: any) {
      showToast(e?.message || "Couldn't upload image — try again", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername && !USERNAME_PATTERN.test(trimmedUsername)) {
      setUsernameError("3-30 lowercase letters, digits, or underscores");
      return;
    }
    setUsernameError(undefined);
    try {
      if (trimmedUsername && trimmedUsername !== profile?.username) {
        await updateUsername.mutateAsync(trimmedUsername);
      }
      await updateProfile.mutateAsync({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_path: avatarPath ?? null,
        banner_path: bannerPath ?? null,
      });
      showToast("Profile updated", "success");
      onClose();
    } catch (e: any) {
      const msg = e?.response?.data?.message || "Couldn't save your profile — try again";
      showToast(msg, "error");
    }
  }

  const avatarPreview = avatarUrl(avatarPath);
  const bannerPreview = bannerUrl(bannerPath);

  const body = (
    <>
      {/* Banner preview + upload */}
      <Pressable
        onPress={() => handleUpload("banner-images", setBannerPath, setUploadingBanner)}
        style={{
          height: 100, borderRadius: 10, overflow: "hidden", marginBottom: 16,
          backgroundColor: theme.accent900, alignItems: "center", justifyContent: "center",
        }}
      >
        {bannerPreview && <Image source={{ uri: bannerPreview }} style={{ position: "absolute", width: "100%", height: "100%" }} resizeMode="cover" />}
        <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, padding: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          {uploadingBanner ? <ActivityIndicator size="small" color="#fff" /> : <PencilSimple size={14} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{bannerPreview ? "Change banner" : "Add banner"}</Text>
        </View>
      </Pressable>

      {/* Avatar preview + upload */}
      <Pressable
        onPress={() => handleUpload("avatar-images", setAvatarPath, setUploadingAvatar)}
        style={{ alignItems: "center", marginBottom: 16 }}
      >
        <View>
          <Avatar name={displayName || username || "?"} uri={avatarPreview} size="xl" />
          <View style={{
            position: "absolute", bottom: 0, right: 0, backgroundColor: theme.accent,
            borderRadius: 12, padding: 5, borderWidth: 2, borderColor: theme.surface,
          }}>
            {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <PencilSimple size={12} color="#fff" />}
          </View>
        </View>
      </Pressable>

      <Input label="Username" value={username} onChangeText={(t) => setUsername(t.toLowerCase())} placeholder="lowercase_letters_digits" autoCapitalize="none" error={usernameError} />
      <View style={{ height: 12 }} />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} placeholder="Your name" maxLength={100} />
      <View style={{ height: 12 }} />
      <Input label="Bio" value={bio} onChangeText={setBio} placeholder="Telugu/Tamil cinema, always front row." multiline numberOfLines={3} maxLength={500} />
    </>
  );

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div className="dialog-backdrop" onClick={saving ? undefined : onClose}>
        <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: 420, maxHeight: "85vh", overflowY: "auto" } as React.CSSProperties}>
          <div className="dialog-title">Edit profile</div>
          <div style={{ marginTop: 12 } as React.CSSProperties}>{body}</div>
          <div className="dialog-actions" style={{ marginTop: 16 } as React.CSSProperties}>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploadingAvatar || uploadingBanner}>
              {saving && <span className="spin">◌</span>}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !saving && onClose()}>
      <Pressable style={styles.overlay} onPress={() => !saving && onClose()}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.bg }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.text }]}>Edit profile</Text>
          <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable onPress={onClose} disabled={saving} style={[styles.btn, { borderColor: theme.divider }]}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving || uploadingAvatar || uploadingBanner} style={[styles.btn, { borderColor: theme.accent, flexDirection: "row", gap: 6, alignItems: "center" }]}>
              {saving && <ActivityIndicator size="small" color={theme.accent} />}
              <Text style={{ color: theme.accent, fontSize: 14, fontWeight: "600" }}>{saving ? "Saving…" : "Save"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  title: { fontSize: 18, fontWeight: "700" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  btn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1 },
});
