/**
 * SettingsScreen — one JSX tree, breakpoint-driven (see Part C of the
 * architecture-unification plan). This was the worst duplication in the
 * app: five sections, each hand-rolled twice (Web*Section/Native*Section
 * pairs), with useAuth/useMyBlocks/useBlockUser and their useStates each
 * instantiated a second time inside whichever pair happened to be
 * mounted. Fixed in two parts:
 *   - the hooks are lifted above the section switch, once, here — not
 *     because calling a TanStack Query hook twice built two different
 *     sources of truth (it doesn't; both reads hit the same cache), but
 *     because only one of the five sections is ever visible at a time
 *     anyway, so hoisting means Account/Privacy's data starts loading
 *     the moment Settings opens instead of only once that tab is picked
 *   - each Web/Native pair merged into one component; nav placement
 *     (a persistent 190px left rail on wide screens vs a horizontal chip
 *     scroller on narrow ones) is a genuine, real layout difference kept
 *     breakpoint-driven per the plan's own call, but the section content
 *     underneath was never actually different — same fields, same
 *     copy, same buttons, just two independent implementations of each.
 *     Normalized every section onto one heading style (was sentence-
 *     case h3 on web, uppercase-letterspaced micro-labels on native) and
 *     onto the shared Button component (Sign out / Export JSON / Delete
 *     account were all hand-rolled Pressables or raw <button>s on both
 *     platforms before this).
 */
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { CheckCircle } from "phosphor-react-native";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useAuth } from "../hooks/useAuth";
import { useMyProfile, useUpdatePrivacy } from "../hooks/useProfile";
import { useMyBlocks, useBlockUser } from "../hooks/useSocial";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { avatarUrl } from "../lib/storage";
import { THEMES } from "../constants/themes";
import { FONT_OPTIONS } from "../constants/fonts";
import { type as fontSizes } from "../constants/fonts";
import { Icon } from "../components/ui/Icon";

type Section = "appearance" | "account" | "privacy" | "ai" | "data";

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "account",    label: "Account" },
  { id: "privacy",    label: "Privacy" },
  { id: "ai",         label: "AI & keys" },
  { id: "data",       label: "Data" },
];

function SectionHeading({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={{ fontSize: fontSizes.md, fontWeight: "700", color: theme.text, marginBottom: 12 }}>{children}</Text>;
}

// ─── Theme swatch ───────────────────────────────────────────────────────────

function ThemeSwatch({ t, active, onSelect, curTheme }: { t: any; active: boolean; onSelect: () => void; curTheme: any }) {
  return (
    <Pressable
      onPress={onSelect}
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: active ? curTheme.accent : curTheme.divider,
        backgroundColor: active ? curTheme.accent900 : "transparent",
        padding: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: "row", gap: 4 }}>
        {[t.bg, t.surface, t.accent].map((c: string, i: number) => (
          <View key={i} style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: c }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: fontSizes.base, color: curTheme.text, flex: 1 }}>{t.label}</Text>
        {active && <CheckCircle size={16} color={curTheme.accent} weight="fill" />}
      </View>
    </Pressable>
  );
}

// ─── Appearance ─────────────────────────────────────────────────────────────

/** A "Custom…" tile in the theme grid — a real live preview of the
 * user's own last custom pick once one exists (theme.key === "custom"),
 * a plain dashed placeholder before that (nothing to preview yet). Opens
 * the shared CustomThemeEditor either way; Apply there is what actually
 * calls setTheme. */
function CustomThemeTile({ theme, onPress }: { theme: any; onPress: () => void }) {
  const isActive = theme.key === "custom";
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: isActive ? "solid" : "dashed",
        borderColor: isActive ? theme.accent : theme.divider,
        backgroundColor: isActive ? theme.accent900 : "transparent",
        padding: 12,
        gap: 8,
      }}
    >
      {isActive ? (
        <View style={{ flexDirection: "row", gap: 4 }}>
          {[theme.bg, theme.surface, theme.accent].map((c: string, i: number) => (
            <View key={i} style={{ width: 13, height: 13, borderRadius: 3, backgroundColor: c }} />
          ))}
        </View>
      ) : (
        <Icon name="palette" size={16} color={`${theme.text}66`} />
      )}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ fontSize: fontSizes.base, color: theme.text, flex: 1 }}>{isActive ? "Custom" : "Custom…"}</Text>
        {isActive && <CheckCircle size={16} color={theme.accent} weight="fill" />}
      </View>
    </Pressable>
  );
}

function AppearanceSection({ theme, fontOption, setTheme, setFontOption, isMobile }: any) {
  const swatchWidth = isMobile ? "47%" : "31%";
  // openCustomThemeEditor from ThemeContext — this tile is a trigger
  // only, not a second render site. See ThemeContext's own comment: a
  // local boolean + a local <CustomThemeEditor> instance here, mirrored
  // by another local boolean + instance in Sidebar.tsx, meant two
  // independent modals could both be open at once (opening from this
  // tile while Sidebar's own palette trigger was also clicked showed
  // two stacked, unrelated instances). app/(app)/_layout.tsx renders the
  // single shared instance now (not Sidebar — Sidebar doesn't mount at
  // mobile width); this only needs to open it.
  const { openCustomThemeEditor } = useTheme();
  return (
    <View style={{ gap: isMobile ? 24 : 28 }}>
      <View>
        <SectionHeading theme={theme}>Typeface</SectionHeading>
        <View style={{
          flexDirection: "row", alignSelf: isMobile ? undefined : "flex-start",
          borderWidth: 1, borderColor: theme.divider, borderRadius: 8, overflow: "hidden",
        }}>
          {FONT_OPTIONS.map((f, i) => (
            <Pressable
              key={f.key}
              onPress={() => setFontOption(f.key)}
              style={{
                flex: isMobile ? 1 : undefined,
                paddingVertical: 8,
                paddingHorizontal: isMobile ? undefined : 16,
                alignItems: "center",
                backgroundColor: fontOption === f.key ? theme.accent900 : "transparent",
                borderRightWidth: i < FONT_OPTIONS.length - 1 ? 1 : 0,
                borderRightColor: theme.divider,
              }}
            >
              <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: fontOption === f.key ? theme.accent : theme.text }}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <SectionHeading theme={theme}>Theme</SectionHeading>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: isMobile ? 10 : 12 }}>
          {THEMES.map((t) => (
            <View key={t.key} style={{ width: swatchWidth }}>
              <ThemeSwatch t={t} active={theme.key === t.key} onSelect={() => setTheme(t.key)} curTheme={theme} />
            </View>
          ))}
          <View style={{ width: swatchWidth }}>
            <CustomThemeTile theme={theme} onPress={openCustomThemeEditor} />
          </View>
        </View>
      </View>

      {/* No <CustomThemeEditor> rendered here — app/(app)/_layout.tsx
          renders the single shared instance (see ThemeContext's own
          comment); this screen only needs to trigger it via
          openCustomThemeEditor() above. That layout wraps every
          authenticated screen regardless of platform/width, so the
          instance is always available to open — unlike Sidebar, which
          isn't mounted at mobile width. */}
    </View>
  );
}

// ─── AI keys ────────────────────────────────────────────────────────────────

function AiSection({ theme }: any) {
  return (
    <View>
      <SectionHeading theme={theme}>AI & Keys</SectionHeading>
      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
        <Text style={{ fontSize: fontSizes.base, color: `${theme.text}66`, lineHeight: 20 }}>
          AI provider key management — coming soon.{"\n\n"}Add your OpenAI, Gemini, or Anthropic keys here to enable ticket scanning.
        </Text>
      </View>
    </View>
  );
}

// ─── Account ────────────────────────────────────────────────────────────────

function AccountSection({ theme, user, signOut }: any) {
  const [confirming, setConfirming] = useState(false);
  return (
    <View>
      <SectionHeading theme={theme}>Account</SectionHeading>
      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 4 }}>Signed in as</Text>
        <Text style={{ fontSize: fontSizes.base, color: theme.text, fontWeight: "700" }}>{user?.email}</Text>
      </View>
      <Button variant="secondary" icon="sign-out" label="Sign out" onPress={() => setConfirming(true)} style={{ alignSelf: "flex-start" }} />
      <ConfirmDialog
        visible={confirming}
        title="Sign out"
        message="You'll need to sign in again to keep logging screenings."
        confirmLabel="Sign out"
        onConfirm={() => { setConfirming(false); signOut(); }}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

// ─── Privacy / Blocked accounts ─────────────────────────────────────────────
//
// Account visibility (public/followers_only/private) has a real backend
// field, type, and mutation hook (useUpdatePrivacy, PATCH /public/me/
// privacy) — this file used to claim the control for it "lives" in
// ProfileScreen's own edit flow, but it never actually did (grep-
// confirmed empty of any visibility-related code there); the hook was
// simply never called from any UI in the app, so there was no way to
// change it after account creation at all. Wired in directly below —
// this genuinely is the one privacy-adjacent settings surface, blocking
// included.

const VISIBILITY_OPTS = [
  { label: "Public",         value: "public" },
  { label: "Followers only", value: "followers_only" },
  { label: "Private",        value: "private" },
];

function PrivacySection({ theme, profile, updatePrivacy, blocked, isLoading, unblock }: any) {
  const rows = blocked ?? [];
  return (
    <View style={{ gap: 24 }}>
      <View>
        <SectionHeading theme={theme}>Account visibility</SectionHeading>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 12, lineHeight: 18 }}>
          Who can see your logs, favorites, and theatres by default — a log's own
          visibility (set per-entry) can still be more private than this, never
          more public.
        </Text>
        {profile ? (
          <SegmentedControl
            options={VISIBILITY_OPTS}
            value={profile.account_visibility}
            onChange={(v: string) => updatePrivacy.mutate(v)}
          />
        ) : (
          <Spinner size="sm" />
        )}
      </View>

      <View>
        <SectionHeading theme={theme}>Blocked accounts</SectionHeading>
        {isLoading ? (
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 24, alignItems: "center" }}>
            <Spinner size="md" />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
            <Text style={{ color: `${theme.text}66`, fontSize: fontSizes.base }}>You haven't blocked anyone. Block someone from their profile page.</Text>
          </View>
        ) : (
          <View style={{ backgroundColor: theme.surface, borderRadius: 12, overflow: "hidden" }}>
            {rows.map((r: any, i: number) => (
              <View
                key={r.user_id}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.divider,
                }}
              >
                <Avatar name={r.display_name ?? r.username ?? "?"} uri={avatarUrl(r.avatar_path)} size="sm" />
                <Text style={{ flex: 1, fontSize: fontSizes.base, fontWeight: "700", color: theme.text }}>
                  {r.display_name ?? (r.username ? `@${r.username}` : "Someone")}
                </Text>
                <Button
                  variant="secondary"
                  label="Unblock"
                  loading={unblock.isPending && unblock.variables?.username === r.username}
                  onPress={() => r.username && unblock.mutate({ username: r.username, blocked: true })}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Data / Danger zone ─────────────────────────────────────────────────────

function DataSection({ theme }: any) {
  // Account deletion isn't implemented on the backend yet — replaced with
  // the same ConfirmDialog LogDetailScreen's delete flow uses (works
  // identically on both platforms), which used to matter more here: this
  // screen used to be window.confirm/Alert.alert depending on platform,
  // and Alert.alert is a documented hard no-op on web, so the native-
  // styled branch silently did nothing at all when rendered there.
  const [confirmingDeleteAccount, setConfirmingDeleteAccount] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  return (
    <View>
      <SectionHeading theme={theme}>Data</SectionHeading>

      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.text, marginBottom: 6 }}>Export data</Text>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, marginBottom: 12 }}>Download all your logs as JSON or CSV.</Text>
        <Button variant="secondary" icon="database" label="Export JSON" style={{ alignSelf: "flex-start" }} />
      </View>

      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: `${theme.error}44`, padding: 16 }}>
        <Text style={{ fontSize: fontSizes.base, fontWeight: "700", color: theme.error, marginBottom: 6 }}>Danger zone</Text>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, lineHeight: 18, marginBottom: 14 }}>
          Permanently delete your account and all data. This action cannot be undone.
        </Text>
        {/* Every other destructive action in the app (ConfirmDialog's own
            confirm button included) is outlined + theme.error, not a solid
            fill — this used to be the one place with a one-off solid-red
            button; brought in line with that instead of keeping a second
            destructive treatment. */}
        <Button icon="trash" label="Delete account" color={theme.error} onPress={() => setConfirmingDeleteAccount(true)} style={{ alignSelf: "flex-start" }} />
      </View>

      <ConfirmDialog
        visible={confirmingDeleteAccount}
        title="Delete account"
        message="Are you sure? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => { setConfirmingDeleteAccount(false); setShowComingSoon(true); }}
        onCancel={() => setConfirmingDeleteAccount(false)}
      />
      <ConfirmDialog
        visible={showComingSoon}
        title="Coming soon"
        message="Account deletion is not yet available."
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setShowComingSoon(false)}
        onCancel={() => setShowComingSoon(false)}
      />
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const { theme, fontOption, setTheme, setFontOption } = useTheme();
  const { isMobile } = useBreakpoint();
  const [section, setSection] = useState<Section>("appearance");

  // Lifted above the section switch — see this file's header comment.
  const { user, signOut } = useAuth();
  const { data: profile } = useMyProfile();
  const updatePrivacy = useUpdatePrivacy();
  const { data: blocked, isLoading: blockedLoading } = useMyBlocks();
  const unblock = useBlockUser();

  const nav = isMobile ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {NAV_ITEMS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setSection(item.id)}
            style={{
              paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8,
              backgroundColor: section === item.id ? theme.accent900 : theme.neutral800,
              borderWidth: 1, borderColor: section === item.id ? theme.accent : "transparent",
            }}
          >
            <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: section === item.id ? theme.accent : theme.neutral100 }}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  ) : (
    <View style={{ width: 190, flexShrink: 0 }}>
      {NAV_ITEMS.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => setSection(item.id)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 11,
            paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8,
            backgroundColor: section === item.id ? `${theme.accent}22` : "transparent",
          }}
        >
          <Text style={{ fontSize: fontSizes.base, color: section === item.id ? theme.accent : `${theme.text}88` }}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  const content =
    section === "appearance" ? <AppearanceSection theme={theme} fontOption={fontOption} setTheme={setTheme} setFontOption={setFontOption} isMobile={isMobile} /> :
    section === "ai"         ? <AiSection theme={theme} /> :
    section === "data"       ? <DataSection theme={theme} /> :
    section === "account"    ? <AccountSection theme={theme} user={user} signOut={signOut} /> :
                                <PrivacySection theme={theme} profile={profile} updatePrivacy={updatePrivacy} blocked={blocked} isLoading={blockedLoading} unblock={unblock} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={{ paddingTop: isMobile ? 16 : 28, paddingHorizontal: isMobile ? 16 : 32, paddingBottom: isMobile ? 60 : 40 }}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={{ maxWidth: isMobile ? undefined : 1000, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        <Text style={{
          fontSize: isMobile ? fontSizes.display : fontSizes.h1,
          fontWeight: isMobile ? "800" : "700",
          color: theme.text,
          marginBottom: isMobile ? 20 : 28,
          letterSpacing: isMobile ? undefined : -0.5,
        }}>
          Settings
        </Text>

        {isMobile ? (
          <>
            {nav}
            {content}
          </>
        ) : (
          <View style={{ flexDirection: "row", gap: 32, alignItems: "flex-start" }}>
            {nav}
            <View style={{ flex: 1, minWidth: 0 }}>{content}</View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
