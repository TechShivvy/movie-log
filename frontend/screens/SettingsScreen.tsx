/**
 * SettingsScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:1000px):
 *   Two-column: 190px left nav + flex:1 content
 *     Left nav: navitems (Appearance active, Account, Privacy, AI & keys, Data)
 *     Content sections:
 *       — Typeface: seg (Cinematic·Sora / Inter / System)
 *       — Theme grid: grid-template-columns:repeat(3,1fr); gap:12px
 *           Each: border:1px divider (active: border:1px accent, bg:accent-900)
 *                 padding:12px + 3 small swatches (13×13px) + name + check
 *       — AI keys: provider rows (icon + name + masked key + Active tag + trash)
 *       — Danger zone: error border card + Delete button
 *
 * Mobile: scrollable stacked layout
 */
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { CheckCircle, Palette, User, Lock, Robot, Database, Trash } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { THEMES } from "../constants/themes";
import { FONT_OPTIONS } from "../constants/fonts";

type Section = "appearance" | "account" | "privacy" | "ai" | "data";

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: null },
  { id: "account",    label: "Account",    icon: null },
  { id: "privacy",    label: "Privacy",    icon: null },
  { id: "ai",         label: "AI & keys",  icon: null },
  { id: "data",       label: "Data",       icon: null },
];

// ─── Theme swatch card ────────────────────────────────────────────────────────

// ─── Native theme swatch ──────────────────────────────────────────────────────

function NativeThemeSwatch({
  t, active, onSelect, curTheme,
}: {
  t: any; active: boolean; onSelect: () => void; curTheme: any;
}) {
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
        <Text style={{ fontSize: 14, color: curTheme.text, flex: 1 }}>{t.label}</Text>
        {active && <CheckCircle size={16} color={curTheme.accent} weight="fill" />}
      </View>
    </Pressable>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const { theme, fontOption, setTheme, setFontOption } = useTheme();
  const [section, setSection] = useState<Section>("appearance");

  // ── Web layout ─────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ padding: "28px 32px 40px", maxWidth: 1000, margin: "0 auto" } as React.CSSProperties}>
        {/* Header */}
        <h1 style={{
          fontSize: 32, fontWeight: 700, color: theme.text, margin: "0 0 28px",
          letterSpacing: -0.5,
        } as React.CSSProperties}>
          Settings
        </h1>

        <div style={{ display: "flex", gap: 32, alignItems: "flex-start" } as React.CSSProperties}>
          {/* Left nav — 190px */}
          <nav style={{ width: 190, flexShrink: 0 } as React.CSSProperties}>
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`navitem${section === item.id ? " active" : ""}`}
                onClick={() => setSection(item.id)}
                style={{ width: "100%", textAlign: "left", border: "none", background: "none" } as React.CSSProperties}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
            {section === "appearance" && (
              <WebAppearanceSection theme={theme} fontOption={fontOption} setTheme={setTheme} setFontOption={setFontOption} />
            )}
            {section === "ai" && <WebAiSection theme={theme} />}
            {section === "data" && <WebDataSection theme={theme} />}
            {(section === "account" || section === "privacy") && (
              <div className="card" style={{ color: `${theme.text}66`, fontSize: 14 } as React.CSSProperties}>
                {section === "account" ? "Account settings — coming soon." : "Privacy settings — coming soon."}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Mobile layout ──────────────────────────────────────────────────────────
  return (
    <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Text style={{ fontSize: 24, fontWeight: "800", color: theme.text, marginBottom: 20 }}>Settings</Text>

      {/* Section selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {NAV_ITEMS.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setSection(item.id)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: section === item.id ? theme.accent900 : theme.neutral800,
                borderWidth: 1,
                borderColor: section === item.id ? theme.accent : "transparent",
              }}
            >
              <Text style={{
                fontSize: 13, fontWeight: "600",
                color: section === item.id ? theme.accent : theme.neutral100,
              }}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {section === "appearance" && (
        <NativeAppearanceSection theme={theme} fontOption={fontOption} setTheme={setTheme} setFontOption={setFontOption} />
      )}
      {section === "ai" && <NativeAiSection theme={theme} />}
      {section === "data" && <NativeDataSection theme={theme} />}
      {(section === "account" || section === "privacy") && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
          <Text style={{ color: `${theme.text}66`, fontSize: 14 }}>
            {section === "account" ? "Account settings — coming soon." : "Privacy settings — coming soon."}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Appearance section — Web ─────────────────────────────────────────────────

function WebAppearanceSection({
  theme, fontOption, setTheme, setFontOption,
}: any) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 } as React.CSSProperties}>
      {/* Typeface */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: "0 0 12px" } as React.CSSProperties}>Typeface</h3>
        <div className="seg" style={{ display: "inline-flex" } as React.CSSProperties}>
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.key}
              className={`seg-opt${fontOption === f.key ? " active" : ""}`}
              onClick={() => setFontOption(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Theme grid */}
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: "0 0 12px" } as React.CSSProperties}>Theme</h3>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        } as React.CSSProperties}>
          {THEMES.map((t) => (
            <div
              key={t.key}
              onClick={() => setTheme(t.key)}
              style={{
                borderRadius: 8,
                border: theme.key === t.key
                  ? `1px solid ${theme.accent}`
                  : `1px solid ${theme.divider}`,
                background: theme.key === t.key ? theme.accent900 : "transparent",
                padding: 12,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              } as React.CSSProperties}
              className="tapc"
            >
              {/* Swatches */}
              <div style={{ display: "flex", gap: 4 } as React.CSSProperties}>
                {[t.bg, t.surface, t.accent].map((c, i) => (
                  <div key={i} style={{ width: 13, height: 13, borderRadius: 3, background: c } as React.CSSProperties} />
                ))}
              </div>
              {/* Name + check */}
              <div style={{ display: "flex", alignItems: "center" } as React.CSSProperties}>
                <span style={{ fontSize: 14, color: theme.text, flex: 1, fontFamily: "var(--font-heading)" } as React.CSSProperties}>
                  {t.label}
                </span>
                {theme.key === t.key && <CheckCircle size={16} color={theme.accent} weight="fill" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI keys section — Web ────────────────────────────────────────────────────

function WebAiSection({ theme }: any) {
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: "0 0 16px" } as React.CSSProperties}>AI & Keys</h3>
      <div className="card" style={{ color: `${theme.text}66`, fontSize: 14 } as React.CSSProperties}>
        AI provider key management — coming soon.
        <br /><br />
        Add your OpenAI, Gemini, or Anthropic keys here to enable ticket scanning.
      </div>
    </div>
  );
}

// ─── Data / Danger Zone — Web ─────────────────────────────────────────────────

function WebDataSection({ theme }: any) {
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: theme.text, margin: "0 0 16px" } as React.CSSProperties}>Data</h3>

      {/* Export */}
      <div className="card" style={{ marginBottom: 16 } as React.CSSProperties}>
        <h4 style={{ fontSize: 14, fontWeight: 600, color: theme.text, margin: "0 0 8px" } as React.CSSProperties}>Export data</h4>
        <p style={{ fontSize: 13, color: `${theme.text}66`, margin: "0 0 12px" } as React.CSSProperties}>Download all your logs as JSON or CSV.</p>
        <button className="btn btn-secondary">Export JSON</button>
      </div>

      {/* Danger zone */}
      <div style={{
        borderRadius: 8,
        border: `1px solid ${theme.error}44`,
        padding: 16,
      } as React.CSSProperties}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: theme.error, margin: "0 0 8px" } as React.CSSProperties}>Danger zone</h4>
        <p style={{ fontSize: 13, color: `${theme.text}66`, margin: "0 0 14px" } as React.CSSProperties}>
          Permanently delete your account and all data. This action cannot be undone.
        </p>
        <button
          className="btn"
          style={{ backgroundColor: theme.error, color: "#fff", border: "none" } as React.CSSProperties}
          onClick={() => window.confirm("Are you sure? This cannot be undone.") && alert("Account deletion — coming soon.")}
        >
          <Trash size={14} color="#fff" />
          Delete account
        </button>
      </div>
    </div>
  );
}

// ─── Appearance section — Native ──────────────────────────────────────────────

function NativeAppearanceSection({ theme, fontOption, setTheme, setFontOption }: any) {
  return (
    <View style={{ gap: 24 }}>
      {/* Typeface */}
      <View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: `${theme.text}88`, letterSpacing: 0.5, marginBottom: 12 }}>TYPEFACE</Text>
        <View style={{
          flexDirection: "row",
          borderWidth: 1,
          borderColor: theme.divider,
          borderRadius: 8,
          overflow: "hidden",
        }}>
          {FONT_OPTIONS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFontOption(f.key)}
              style={{
                flex: 1,
                paddingVertical: 8,
                alignItems: "center",
                backgroundColor: fontOption === f.key ? theme.accent900 : "transparent",
                borderRightWidth: 1,
                borderRightColor: theme.divider,
              }}
            >
              <Text style={{
                fontSize: 13,
                fontWeight: "600",
                color: fontOption === f.key ? theme.accent : theme.text,
              }}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Theme grid (2-col on mobile) */}
      <View>
        <Text style={{ fontSize: 13, fontWeight: "700", color: `${theme.text}88`, letterSpacing: 0.5, marginBottom: 12 }}>THEME</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {THEMES.map((t) => (
            <View key={t.key} style={{ width: "47%" }}>
              <NativeThemeSwatch t={t} active={theme.key === t.key} onSelect={() => setTheme(t.key)} curTheme={theme} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── AI section — Native ──────────────────────────────────────────────────────

function NativeAiSection({ theme }: any) {
  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 8 }}>AI & Keys</Text>
      <Text style={{ fontSize: 14, color: `${theme.text}66`, lineHeight: 20 }}>
        AI provider key management — coming soon.{"\n\n"}Add your OpenAI, Gemini, or Anthropic keys to enable ticket scanning.
      </Text>
    </View>
  );
}

// ─── Data section — Native ────────────────────────────────────────────────────

function NativeDataSection({ theme }: any) {
  return (
    <View style={{ gap: 14 }}>
      {/* Export */}
      <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 16 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text, marginBottom: 6 }}>Export data</Text>
        <Text style={{ fontSize: 13, color: `${theme.text}66`, marginBottom: 12 }}>Download all your logs as JSON or CSV.</Text>
        <Pressable style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.divider,
          alignSelf: "flex-start",
        }}>
          <Database size={14} color={theme.text} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>Export JSON</Text>
        </Pressable>
      </View>

      {/* Danger zone */}
      <View style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.error + "44",
        padding: 16,
      }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: theme.error, marginBottom: 6 }}>Danger zone</Text>
        <Text style={{ fontSize: 13, color: `${theme.text}66`, lineHeight: 18, marginBottom: 14 }}>
          Permanently delete your account and all data. This cannot be undone.
        </Text>
        <Pressable
          onPress={() => Alert.alert("Delete account", "Are you sure? This cannot be undone.", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => Alert.alert("Coming soon", "Account deletion is not yet available.") },
          ])}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: theme.error,
            borderRadius: 8,
            paddingHorizontal: 14,
            paddingVertical: 8,
            alignSelf: "flex-start",
          }}
        >
          <Trash size={14} color="#fff" />
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#fff" }}>Delete account</Text>
        </Pressable>
      </View>
    </View>
  );
}
