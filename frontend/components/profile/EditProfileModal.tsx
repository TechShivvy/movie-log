/**
 * EditProfileModal — display_name, bio, username, avatar + banner
 * upload, all in one place, same "bundled into one edit screen" shape
 * the backend's ProfileUpdate schema itself describes (username gets
 * its own PATCH call underneath since it has its own uniqueness
 * semantics, but from here it's one form / one Save).
 */
import React, { useEffect, useState } from "react";
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { PencilSimple, Shuffle } from "phosphor-react-native";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";
import { useUpdateProfile, useUpdateUsername, useUsernameAvailability, type MyProfile } from "../../hooks/useProfile";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { avatarUrl, bannerUrl, pickAndUploadImage } from "../../lib/storage";
import { suggestAvailableUsername } from "../../lib/usernameGenerator";
import { useToast } from "../../context/ToastContext";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { UsernameStatus } from "../ui/UsernameStatus";
import { Spinner } from "../ui/Spinner";
import { type as fontSizes } from "../../constants/fonts";

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
  const [suggesting, setSuggesting] = useState(false);

  async function handleSuggest() {
    setSuggesting(true);
    try {
      setUsername(await suggestAvailableUsername());
    } catch {
      showToast("Couldn't get a suggestion — try again", "error");
    } finally {
      setSuggesting(false);
    }
  }

  // Only for the rare race (someone else grabs the name between the
  // live check and the actual Save) or a genuinely malformed value —
  // the live check below is what normally decides this before Save is
  // even pressable, replacing the old "type it, hit Save, get a toast
  // back" round trip.
  const [usernameError, setUsernameError] = useState<string | undefined>(undefined);
  const debouncedUsername = useDebouncedValue(username, 400);
  const availability = useUsernameAvailability(debouncedUsername, profile?.username);

  // Re-seed local form state from the current profile every time the
  // modal opens — not on every profile change, so mid-edit local state
  // (e.g. a just-picked avatar not yet saved) doesn't get clobbered by
  // an unrelated background refetch while the modal is still open.
  // display_name falls back to the Google-OAuth-provided full_name (same
  // source Sidebar.tsx already uses) rather than opening blank when
  // profile is null — profile is only ever null while GET /public/me/
  // profile hasn't resolved (or isn't deployed yet), not because the
  // account has nothing worth prefilling.
  const metadataName = user?.user_metadata?.full_name as string | undefined;
  useEffect(() => {
    if (!visible) return;
    setUsername(profile?.username ?? "");
    setDisplayName(profile?.display_name ?? metadataName ?? "");
    setBio(profile?.bio ?? "");
    setAvatarPath(profile?.avatar_path);
    setBannerPath(profile?.banner_path);
    setUsernameError(undefined);
  }, [visible, profile, metadataName]);

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
    const changingUsername = trimmedUsername && trimmedUsername !== profile?.username;
    // The live check below already keeps Save disabled for 'checking'/
    // 'taken'/'invalid' — this is just the same guard against a
    // double-click slipping through before the disabled state re-renders.
    if (changingUsername && availability.status !== "available") return;
    setUsernameError(undefined);
    try {
      if (changingUsername) {
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
      // USERNAME_TAKEN surfaces inline under the field (same spot the
      // live check itself reports through) instead of a toast — the
      // live check makes this the rare "someone else grabbed it in the
      // last second" race rather than the normal path, but it's still
      // possible.
      if (e?.code === "USERNAME_TAKEN") {
        setUsernameError("That username is already taken.");
        return;
      }
      const msg = e?.message || "Couldn't save your profile — try again";
      showToast(msg, "error");
    }
  }

  const avatarPreview = avatarUrl(avatarPath);
  const bannerPreview = bannerUrl(bannerPath);
  // Blocks Save only when the username is actually being changed to
  // something not yet confirmed available — leaving it untouched (or
  // reverting to the current one) never blocks on this.
  const usernameChanging = !!username.trim() && username.trim().toLowerCase() !== profile?.username;
  const usernameBlocking = usernameChanging && availability.status !== "available";

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
        {/* height:30 (14px icon + 8px padding × 2) — fixed so the pill
            can't reshape when the spinner (a slightly different
            intrinsic size than the icon it replaces) swaps in. */}
        <View style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20, height: 30, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 6 }}>
          {uploadingBanner ? <Spinner size={14} color="#fff" scaleToSize /> : <PencilSimple size={14} color="#fff" />}
          <Text style={{ color: "#fff", fontSize: fontSizes.sm, fontWeight: "600" }}>{bannerPreview ? "Change banner" : "Add banner"}</Text>
        </View>
      </Pressable>

      {/* Avatar preview + upload */}
      <Pressable
        onPress={() => handleUpload("avatar-images", setAvatarPath, setUploadingAvatar)}
        style={{ alignItems: "center", marginBottom: 16 }}
      >
        <View>
          <Avatar name={displayName || username || "?"} uri={avatarPreview} size="xl" />
          {/* Fixed 26x26 — a content-sized badge reshapes when its
              content changes size, which is exactly what balloons a
              12px icon into a ~20px ActivityIndicator mid-upload. */}
          <View style={{
            position: "absolute", bottom: 0, right: 0, backgroundColor: theme.accent,
            borderRadius: 13, width: 26, height: 26, alignItems: "center", justifyContent: "center",
            borderWidth: 2, borderColor: theme.surface,
          }}>
            {uploadingAvatar
              ? <Spinner size={12} color={theme.onAccent} scaleToSize />
              : <PencilSimple size={12} color={theme.onAccent} />}
          </View>
        </View>
      </Pressable>

      <Input label="Username" value={username} onChangeText={(t) => { setUsername(t.toLowerCase()); setUsernameError(undefined); }} placeholder="lowercase_letters_digits" autoCapitalize="none" error={usernameError} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <UsernameStatus status={availability.status} />
        <Pressable onPress={handleSuggest} disabled={suggesting} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {suggesting ? <Spinner size={12} color={theme.accent} scaleToSize /> : <Shuffle size={12} color={theme.accent} />}
          <Text style={{ fontSize: fontSizes.sm, color: theme.accent, fontWeight: "600" }}>{suggesting ? "Checking…" : "Suggest one"}</Text>
        </Pressable>
      </View>
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
        <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto" } as React.CSSProperties}>
          <div className="dialog-title">Edit profile</div>
          <div style={{ marginTop: 12 } as React.CSSProperties}>{body}</div>
          <div className="dialog-actions" style={{ marginTop: 16 } as React.CSSProperties}>
            <Button variant="secondary" label="Cancel" onPress={onClose} disabled={saving} />
            <Button
              label={saving ? "Saving…" : "Save"}
              loading={saving}
              onPress={handleSave}
              disabled={saving || uploadingAvatar || uploadingBanner || usernameBlocking}
            />
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
            <Button variant="secondary" label="Cancel" onPress={onClose} disabled={saving} />
            <Button
              label={saving ? "Saving…" : "Save"}
              loading={saving}
              onPress={handleSave}
              disabled={saving || uploadingAvatar || uploadingBanner || usernameBlocking}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  title: { fontSize: fontSizes.xl, fontWeight: "700" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
});
