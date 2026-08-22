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
import { useRouter, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PencilSimple, Shuffle } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { useUpdateUsername, useUpdateProfile, useUsernameAvailability, useMyProfile } from "../hooks/useProfile";
import { avatarUrl, pickAndUploadImage } from "../lib/storage";
import { suggestAvailableUsername } from "../lib/usernameGenerator";
import { useToast } from "../context/ToastContext";
import { Avatar } from "../components/ui/Avatar";
import { Input } from "../components/ui/Input";
import { UsernameStatus } from "../components/ui/UsernameStatus";
import { ThemedText } from "../components/ui/ThemedText";

export function OnboardingScreen() {
  const { theme } = useTheme();
  const { isMobile } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, session, signOut } = useAuth();
  const { showToast } = useToast();
  const updateUsername = useUpdateUsername();
  const updateProfile = useUpdateProfile();
  // Reachable by typing the URL directly, not just the (app)/_layout.tsx
  // redirect that sends a no-username account here — an account that
  // already has one just sat on this form with nothing to send them
  // back out. isSuccess (not just `profile` being truthy) so this only
  // ever fires off a confirmed, resolved answer, never a still-loading
  // or errored one — same "don't redirect off anything but a real
  // success" reasoning as (app)/_layout.tsx's own gate.
  const { data: profile, isLoading: profileLoading, isSuccess: profileLoaded } = useMyProfile();

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
      const msg = e?.message || "Couldn't save — try again";
      showToast(msg, "error");
    }
  }

  // This route sits outside (app)/_layout.tsx's own tree (deliberately,
  // so it renders without the Sidebar/TabBar shell — see app/_layout.tsx's
  // comment on why it's a sibling of (app), not nested inside it) — which
  // also means it never inherited that layout's own "no session -> back
  // to /(auth)" guard. Signing out from the "Sign out" link below only
  // clears the Supabase session; without this check, this screen kept
  // right on rendering afterward with nothing to send the caller
  // anywhere, an authenticated-only screen quietly still showing/working
  // with no session behind it.
  if (!session) {
    return <Redirect href="/(auth)" />;
  }

  // Mirror image of (app)/_layout.tsx's own gate — that one sends a
  // no-username account HERE; this one sends an already-onboarded
  // account back OUT, for exactly the same reason the (auth) group's
  // own layout bounces an already-signed-in caller away from the login
  // screen. Without it, typing /onboarding into the address bar (or
  // any other way of landing here directly) just sat on the form
  // forever, even for an account that's long since set a username.
  if (profileLoaded && profile?.username) {
    return <Redirect href="/(app)" />;
  }
  if (profileLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
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
      <ThemedText size="display" fontRole="heading" weight={700} style={{ marginBottom: 6, textAlign: "center" }}>
        Welcome to CineLog
      </ThemedText>
      <ThemedText size="base" color={`${theme.text}88`} style={{ marginBottom: 28, textAlign: "center", lineHeight: 20 }}>
        Pick a username to get started — you can add a photo and change your name any time from Edit Profile.
      </ThemedText>

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
        <UsernameStatus status={availability.status} />
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

  // ── Web (desktop/tablet only — narrower falls through to native) ──────────
  if (Platform.OS === "web" && !isMobile) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom, background: theme.bg } as React.CSSProperties}>
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

  // ── Native (also mobile web — see the isMobile comment above) ───────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{
        flexGrow: 1, justifyContent: "center", padding: 24,
        paddingTop: 24 + insets.top, paddingBottom: 24 + insets.bottom,
      }}
      contentInsetAdjustmentBehavior="automatic"
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
        {saving && <ActivityIndicator size="small" color={theme.onAccent} />}
        <Text style={{ color: theme.onAccent, fontSize: 15, fontWeight: "700" }}>{saving ? "Saving…" : "Continue"}</Text>
      </Pressable>
      <Pressable onPress={() => signOut()} style={{ alignItems: "center", marginTop: 14, padding: 8 }}>
        <Text style={{ color: `${theme.text}66`, fontSize: 13 }}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
