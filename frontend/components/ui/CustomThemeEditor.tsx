/**
 * CustomThemeEditor — pick four base colors (bg/surface/text/accent) and
 * preview the real derived theme (buildTheme's own accent shades,
 * neutrals, divider, contrast-safe onAccent — the exact same derivation
 * every built-in theme already goes through) before committing to it.
 *
 * Per the confirmed product decision for this feature: never apply
 * colors directly as they're picked — edits only ever touch local
 * `draft` state here, rendered into a preview card via buildTheme(draft),
 * until the user taps Apply. A soft (non-blocking) WCAG contrast warning
 * shows when text/bg or text/surface falls under AA's 4.5:1 — the editor
 * stays fully usable either way; a user who wants low-contrast reads for
 * their own theme isn't locked out of it, just told about it.
 *
 * Shared by every entry point that can open it (SettingsScreen's theme
 * grid, both of Sidebar's palette pickers) rather than three separate
 * copies of the same four-field form.
 */
import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { buildTheme, contrastRatio, type RawTheme } from "../../constants/themes";
import { Button } from "./Button";
import { Input } from "./Input";
import { Icon } from "./Icon";
import { type as fontSizes } from "../../constants/fonts";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface CustomThemeEditorProps {
  visible: boolean;
  /** Seed values — the current custom pick if one exists, otherwise the
   * active built-in theme's own colors (a reasonable starting point,
   * not a blank slate). */
  initial: RawTheme;
  onApply: (raw: RawTheme) => void;
  onCancel: () => void;
}

function ColorField({ label, value, onChangeText, theme }: {
  label: string; value: string; onChangeText: (v: string) => void; theme: any;
}) {
  const swatchColor = HEX_RE.test(value) ? value : theme.surfaceHigh;
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600" }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {/* Web gets a real native color-picker swatch alongside the hex
            field — native has no equivalent picker component in this
            app's dependencies (and adding one is out of scope here), so
            it gets the hex field alone, same as the plan calls for. */}
        {Platform.OS === "web" ? (
          <input
            type="color"
            value={swatchColor}
            onChange={(e) => onChangeText((e.target as HTMLInputElement).value)}
            style={{
              width: 36, height: 36, padding: 0, cursor: "pointer",
              border: `1px solid ${theme.divider}`, borderRadius: 8, background: "none",
            } as React.CSSProperties}
          />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: swatchColor, borderWidth: 1, borderColor: theme.divider }} />
        )}
        <View style={{ flex: 1 }}>
          <Input
            value={value}
            onChangeText={onChangeText}
            placeholder="#000000"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={7}
          />
        </View>
      </View>
    </View>
  );
}

export function CustomThemeEditor({ visible, initial, onApply, onCancel }: CustomThemeEditorProps) {
  // The REAL active theme (for the modal's own chrome — buttons, borders,
  // labels), never the draft being edited. The draft only ever renders
  // inside the preview card below.
  const { theme } = useTheme();
  const [draft, setDraft] = useState<RawTheme>(initial);

  // Re-seed whenever the editor opens (not on every `initial` change —
  // `initial` is the caller's current-best-guess seed, computed fresh
  // each render; re-seeding on every keystroke elsewhere in the app
  // would fight the user's own in-progress edits here).
  useEffect(() => {
    if (visible) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible) return null;

  const preview = buildTheme(draft);
  const textOnBg = HEX_RE.test(draft.text) && HEX_RE.test(draft.bg) ? contrastRatio(draft.text, draft.bg) : 21;
  const textOnSurface = HEX_RE.test(draft.text) && HEX_RE.test(draft.surface) ? contrastRatio(draft.text, draft.surface) : 21;
  const lowContrast = textOnBg < 4.5 || textOnSurface < 4.5;

  const setField = (k: keyof RawTheme) => (v: string) => setDraft((p) => ({ ...p, [k]: v }));

  const body = (
    <>
      <Text style={{ fontSize: fontSizes.xl, fontWeight: "700", color: theme.text }}>Custom theme</Text>

      <ColorField label="Background" value={draft.bg} onChangeText={setField("bg")} theme={theme} />
      <ColorField label="Surface" value={draft.surface} onChangeText={setField("surface")} theme={theme} />
      <ColorField label="Text" value={draft.text} onChangeText={setField("text")} theme={theme} />
      <ColorField label="Accent" value={draft.accent} onChangeText={setField("accent")} theme={theme} />

      {/* Preview — the app's real component palette rendered with the
          draft's own derived tokens, not a schematic. Never wired to the
          real ThemeContext; this card is the only place these colors
          show up until Apply. */}
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: theme.divider, overflow: "hidden" }}>
        <View style={{ backgroundColor: preview.bg, padding: 16, gap: 10 }}>
          <Text style={{ fontSize: fontSizes.lg, fontWeight: "700", color: preview.text }}>Preview</Text>
          <View style={{ backgroundColor: preview.surface, borderRadius: 8, padding: 12, gap: 6 }}>
            <Text style={{ fontSize: fontSizes.base, color: preview.text }}>Films this year</Text>
            <Text style={{ fontSize: fontSizes.sm, color: `${preview.text}88` }}>A sample row, on the surface color.</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ backgroundColor: preview.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}>
              <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: preview.onAccent }}>Log a screening</Text>
            </View>
            {/* "Secondary action", not "Cancel" — this card sits right
                above the editor's own real Cancel button, and reusing
                that exact word here read as if it belonged to the same
                control. */}
            <View style={{ borderWidth: 1, borderColor: preview.divider, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}>
              <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: preview.text }}>Secondary action</Text>
            </View>
          </View>
        </View>
      </View>

      {lowContrast && (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 8, backgroundColor: `${theme.error}1a` }}>
          <Icon name="warning-circle" size={16} color={theme.error} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: fontSizes.sm, color: theme.error, lineHeight: 18 }}>
            Low contrast between text and background — some text may be hard to read. You can still apply this theme.
          </Text>
        </View>
      )}
    </>
  );

  const actions = (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
      <Button variant="secondary" label="Cancel" onPress={onCancel} />
      <Button label="Apply" onPress={() => onApply({ ...draft, key: "custom", label: "Custom" })} />
    </View>
  );

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div className="dialog-backdrop" onClick={onCancel}>
        <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, gap: 14 } as React.CSSProperties}>
          {body}
          {actions}
        </div>
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 }} onPress={onCancel}>
        <Pressable
          style={{ width: "100%", maxWidth: 420, maxHeight: "85%", borderRadius: 14, backgroundColor: theme.surface }}
          onPress={() => {}}
        >
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
            {body}
            {actions}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
