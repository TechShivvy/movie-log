/**
 * OnboardingScreen — the one thing every new account was missing
 * (confirmed by checking LoginScreen.tsx's signUp(): it creates the
 * Supabase account and drops the caller straight into the app with
 * nothing else ever collected). Gated from (app)/_layout.tsx: signed
 * in but no username set yet redirects here instead of the normal app
 * shell. Username is the one required field — it's the one that's
 * actually load-bearing elsewhere (public profile URLs, @handles,
 * search) — display name and avatar are offered on the same screen but
 * skippable, and editable later from Edit Profile either way.
 */
import React, { useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { PencilSimple, Shuffle } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useAuth } from "../hooks/useAuth";
import { useUpdateUsername, useUpdateProfile, useUsernameAvailability } from "../hooks/useProfile";
import { avatarUrl, pickAndUploadImage } from "../lib/storage";
import { suggestAvailableUsername } from "../lib/usernameGenerator";
import { useToast } from "../context/ToastContext";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";

function UsernameStatus({ status, theme }: { status: string; theme: any }) {
  if (status === "checking") return <Text style={{ fontSize: 12, color: `${theme.text}66`, marginTop: 4 }}>Checking…</Text>;
  if (status === "available") return <Text style={{ fontSize: 12, color: "#22C55E", marginTop: 4 }}>Username available</Text>;
  if (status === "taken") return <Text style={{ fontSize: 12, color: theme.error, marginTop: 4 }}>Username not available</Text>;
  if (status === "invalid") return <Text style={{ fontSize: 12, color: theme.error, marginTop: 4 }}>3-30 lowercase letters, digits, or underscores</Text>;
  return null;
}

export function OnboardingScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const updateUsername = useUpdateUsername();
  const updateProfile = useUpdateProfile();

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState((user?.user_metadata?.full_name as string | undefined) ?? "");
  const [avatarPath, setAvatarPath] = useState<string | undefined>(undefined);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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

  // No debounce hook needed here the way EditProfileModal needs one for
  // a live-typing field that already has a saved value to compare
  // against — reusing it anyway keeps the exact same available/taken/
  // checking behavior new users see here and everyone sees later in
  // Edit Profile, one implementation either way.
  const [debounced, setDebounced] = useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(username), 400);
    return () => clearTimeout(t);
  }, [username]);
  const availability = useUsernameAvailability(debounced, undefined);

  const trimmed = username.trim().toLowerCase();
  const canContinue = availability.status === "available";
  const saving = updateUsername.isPending || updateProfile.isPending;

  async function handleUpload() {
    if (!user) return;
    setUploadingAvatar(true);
    try {
      const path = await pickAndUploadImage("avatar-images", user.id);
      if (path) setAvatarPath(path);
    } catch (e: any) {
      showToast(e?.message || "Couldn't upload image — try again", "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleContinue() {
    if (!canContinue) return;
    try {
      await updateUsername.mutateAsync(trimmed);
      // display_name/avatar are optional here — only sent if the caller
      // actually set one, same "only touch what changed" shape Edit
      // Profile's own save uses.
      if (displayName.trim() || avatarPath) {
        await updateProfile.mutateAsync({
          display_name: displayName.trim() || undefined,
          avatar_path: avatarPath ?? undefined,
        });
      }
      router.replace("/(app)");
    } catch (e: any) {
      const msg = e?.response?.data?.message || "Couldn't save — try again";
      showToast(msg, "error");
    }
  }

  const avatarPreview = avatarUrl(avatarPath);

  const content = (
    // A real View, not a bare Fragment — the web branch below renders
    // this inside a plain <div>, and react-native-web's <Text> has no
    // block-level layout of its own outside RN's View/flex system, so
    // consecutive <Text> siblings (the heading + subtitle) ran together
    // on one line instead of stacking. View gives it real column flow
    // on both platforms.
    <View>
      <Text style={{ fontSize: 26, fontWeight: "800", color: theme.text, marginBottom: 6, textAlign: "center" }}>
        Welcome to CineLog
      </Text>
      <Text style={{ fontSize: 14, color: `${theme.text}88`, marginBottom: 28, textAlign: "center", lineHeight: 20 }}>
        Pick a username to get started — you can add a photo and change your name any time from Edit Profile.
      </Text>

      <Pressable onPress={handleUpload} style={{ alignItems: "center", marginBottom: 24 }}>
        <View>
          <Avatar name={displayName || trimmed || "?"} uri={avatarPreview} size="xl" />
          <View style={{
            position: "absolute", bottom: 0, right: 0, backgroundColor: theme.accent,
            borderRadius: 12, padding: 5, borderWidth: 2, borderColor: theme.bg,
          }}>
            {uploadingAvatar ? <ActivityIndicator size="small" color="#fff" /> : <PencilSimple size={12} color="#fff" />}
          </View>
        </View>
        <Text style={{ fontSize: 12, color: theme.accent, marginTop: 8, fontWeight: "600" }}>Add a photo (optional)</Text>
      </Pressable>

      <Input
        label="Username *"
        value={username}
        onChangeText={(t) => setUsername(t.toLowerCase())}
        placeholder="lowercase_letters_digits"
        autoCapitalize="none"
        autoFocus
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <UsernameStatus status={availability.status} theme={theme} />
        <Pressable onPress={handleSuggest} disabled={suggesting} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {suggesting ? <ActivityIndicator size="small" color={theme.accent} /> : <Shuffle size={12} color={theme.accent} />}
          <Text style={{ fontSize: 12, color: theme.accent, fontWeight: "600" }}>{suggesting ? "Checking…" : "Suggest one"}</Text>
        </Pressable>
      </View>
      <View style={{ height: 12 }} />
      <Input
        label="Display name (optional)"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
        maxLength={100}
      />
    </View>
  );

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: theme.bg } as React.CSSProperties}>
        <div style={{ width: "100%", maxWidth: 400 } as React.CSSProperties}>
          {content}
          <button className="btn btn-primary btn-block" onClick={handleContinue} disabled={!canContinue || saving} style={{ marginTop: 20 } as React.CSSProperties}>
            {saving && <span className="spin">◌</span>}
            {saving ? "Saving…" : "Continue"}
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => signOut()} style={{ marginTop: 10 } as React.CSSProperties}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
    >
      {content}
      <Pressable
        onPress={handleContinue}
        disabled={!canContinue || saving}
        style={{
          backgroundColor: theme.accent, borderRadius: 10, paddingVertical: 12,
          alignItems: "center", marginTop: 20, opacity: (!canContinue || saving) ? 0.5 : 1,
          flexDirection: "row", justifyContent: "center", gap: 8,
        }}
      >
        {saving && <ActivityIndicator size="small" color="#fff" />}
        <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{saving ? "Saving…" : "Continue"}</Text>
      </Pressable>
      <Pressable onPress={() => signOut()} style={{ alignItems: "center", marginTop: 14, padding: 8 }}>
        <Text style={{ color: `${theme.text}66`, fontSize: 13 }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
