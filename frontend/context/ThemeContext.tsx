import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, DEFAULT_THEME, buildTheme, type Theme, type RawTheme } from "../constants/themes";
import { FONT_OPTIONS, DEFAULT_FONT, type FontOption } from "../constants/fonts";
import { injectDesignSystemCss } from "../lib/designCss";

interface ThemeContextValue {
  theme: Theme;
  fontOption: FontOption;
  fontConfig: FontConfig;
  /** A known THEMES key selects that built-in theme; a full RawTheme (the
   * custom-theme picker's Apply) selects — and persists — that instead.
   * Distinguished by typeof at the call site: a plain key is always a
   * string, a custom pick is always an object. */
  setTheme: (keyOrCustom: string | RawTheme) => void;
  setFontOption: (key: FontOption) => void;
  /** Single source of truth for whether CustomThemeEditor is open —
   * every entry point that can open it (SettingsScreen's theme grid,
   * both of Sidebar's palette pickers) calls openCustomThemeEditor()
   * instead of managing its own local boolean. That used to mean two
   * independent useState()s in two independently-mounted components
   * (Sidebar is always part of the authenticated shell; SettingsScreen
   * is mounted as its children whenever /settings is open), each
   * rendering its own <CustomThemeEditor> — opening it from Settings
   * while Sidebar's own trigger was also clicked (or vice versa) showed
   * two independent modal instances stacked on top of each other, with
   * no relationship to one another. Lifting the visibility flag here
   * (this provider already wraps the whole app, above Sidebar) and
   * mounting exactly one <CustomThemeEditor> — in Sidebar.tsx, the one
   * place guaranteed to always be part of the authenticated shell —
   * removes the whole class of bug, not just today's two triggers. */
  customThemeEditorVisible: boolean;
  openCustomThemeEditor: () => void;
  closeCustomThemeEditor: () => void;
}

/** What actually gets persisted under "@cinelog/theme" — JSON now, not a
 * bare key string (see the migration note in the load effect below). */
type StoredTheme = { key: string } | { custom: true; raw: RawTheme };

type FontConfig = ReturnType<typeof getFontConfig>;

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  fontOption: DEFAULT_FONT,
  fontConfig: getFontConfig(DEFAULT_FONT),
  setTheme: () => {},
  setFontOption: () => {},
  customThemeEditorVisible: false,
  openCustomThemeEditor: () => {},
  closeCustomThemeEditor: () => {},
});

function getFontConfig(key: FontOption) {
  return FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
}

// ── CSS var injection (web only) ───────────────────────────────────────────────

/** Injects a complete set of design-system CSS custom properties onto :root */
function injectWebCSSVars(theme: Theme, fontCfg: FontConfig) {
  if (Platform.OS !== "web") return;
  const doc = (globalThis as any).document;
  if (!doc) return;
  const root = doc.documentElement?.style as CSSStyleDeclaration | undefined;
  if (!root) return;

  // ── Base tokens ────────────────────────────────────────────────────────
  root.setProperty("--color-bg",      theme.bg);
  root.setProperty("--color-surface", theme.surface);
  root.setProperty("--color-text",    theme.text);
  root.setProperty("--color-accent",  theme.accent);

  // public/index.html hardcodes this to a fixed red — correct for the
  // default theme, but never updated again after that, so a mobile
  // browser's own chrome (status bar / URL bar background, standalone
  // PWA title bar) stayed red regardless of which theme was actually
  // selected in-app. Mirrors it to the current theme's own accent900
  // (closest existing token to a "chrome background" shade) every time
  // the theme changes.
  const themeColorTag = doc.querySelector('meta[name="theme-color"]');
  if (themeColorTag) themeColorTag.setAttribute("content", theme.accent900);

  // ── Derived tokens (pre-computed so they work without color-mix) ──────
  root.setProperty("--color-accent-100",   theme.accent100);
  root.setProperty("--color-accent-700",   theme.accent700);
  root.setProperty("--color-accent-800",   theme.accent800);
  root.setProperty("--color-accent-900",   theme.accent900);
  root.setProperty("--color-neutral-100",  theme.neutral100);
  root.setProperty("--color-neutral-800",  theme.neutral800);
  root.setProperty("--color-neutral-900",  theme.neutral900);
  root.setProperty("--color-divider",      theme.divider);
  root.setProperty("--color-surface-high", theme.surfaceHigh);
  root.setProperty("--color-error",        theme.error);
  root.setProperty("--color-success",      theme.success);
  root.setProperty("--color-on-accent",    theme.onAccent);

  // ── Shadow tokens ──────────────────────────────────────────────────────
  const t = theme.text;
  const textRgba = (a: number) => {
    const hex = t.replace("#", "");
    const [rr, gg, bb] = [hex.slice(0,2), hex.slice(2,4), hex.slice(4,6)].map((h) => parseInt(h, 16));
    return `rgba(${rr},${gg},${bb},${a})`;
  };
  root.setProperty("--shadow-sm", `0 0 0 1px ${textRgba(0.14)}`);
  root.setProperty("--shadow-md", `0 0 0 1px ${textRgba(0.12)}, 0 6px 18px rgba(0,0,0,.5)`);
  // support.js themeVars(): shadow-lg is text 20%, not 10%
  root.setProperty("--shadow-lg", `0 0 0 1px ${textRgba(0.20)}, 0 16px 40px rgba(0,0,0,.6)`);

  // ── Typography tokens ──────────────────────────────────────────────────
  // webHeading/webBody are real CSS family names + fallbacks
  // ("Plus Jakarta Sans", not "PlusJakartaSans" — the latter matches nothing
  // and silently drops every glyph to system-ui).
  root.setProperty("--font-heading", fontCfg.webHeading);
  root.setProperty("--font-body",    fontCfg.webBody);
  root.setProperty("--font-mono",    "'JetBrains Mono', ui-monospace, monospace");
  root.setProperty("--font-heading-weight", fontCfg.headingWeight);
}

/** Parses whatever's under "@cinelog/theme" into a real Theme. Handles
 * three shapes: the new JSON `{key}` (a built-in pick made after this
 * feature shipped), the new JSON `{custom:true,raw}` (a custom pick),
 * and the OLD format — a bare, unquoted key string ("cinematic"), which
 * isn't valid JSON on its own and so throws in JSON.parse, letting the
 * catch block fall back to treating it as that legacy shape instead of
 * silently losing every pre-existing user's saved theme the moment this
 * shipped. */
function resolveStoredTheme(saved: string | null): Theme {
  if (!saved) return DEFAULT_THEME;
  try {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === "object" && parsed.custom && parsed.raw) {
      return buildTheme(parsed.raw as RawTheme);
    }
    if (parsed && typeof parsed === "object" && typeof parsed.key === "string") {
      return THEMES.find((x) => x.key === parsed.key) ?? DEFAULT_THEME;
    }
    return DEFAULT_THEME;
  } catch {
    // Legacy bare-key format.
    return THEMES.find((x) => x.key === saved) ?? DEFAULT_THEME;
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme,      setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [fontOption, setFontState]  = useState<FontOption>(DEFAULT_FONT);
  const [customThemeEditorVisible, setCustomThemeEditorVisible] = useState(false);

  // Inject design-system stylesheet once (web only)
  useEffect(() => {
    if (Platform.OS === "web") injectDesignSystemCss();
  }, []);

  // Load persisted prefs on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedFont] = await Promise.all([
          AsyncStorage.getItem("@cinelog/theme"),
          AsyncStorage.getItem("@cinelog/font"),
        ]);
        const t = resolveStoredTheme(savedTheme);
        const f = (savedFont && FONT_OPTIONS.some((x) => x.key === savedFont) ? savedFont : DEFAULT_FONT) as FontOption;
        setThemeState(t);
        setFontState(f);
        injectWebCSSVars(t, getFontConfig(f));
      } catch {}
    })();
  }, []);

  // Sync CSS vars whenever theme or font changes
  useEffect(() => {
    injectWebCSSVars(theme, getFontConfig(fontOption));
  }, [theme, fontOption]);

  const setTheme = useCallback((keyOrCustom: string | RawTheme) => {
    if (typeof keyOrCustom === "string") {
      const t = THEMES.find((x) => x.key === keyOrCustom) ?? DEFAULT_THEME;
      setThemeState(t);
      const stored: StoredTheme = { key: t.key };
      AsyncStorage.setItem("@cinelog/theme", JSON.stringify(stored)).catch(() => {});
    } else {
      const t = buildTheme(keyOrCustom);
      setThemeState(t);
      const stored: StoredTheme = { custom: true, raw: keyOrCustom };
      AsyncStorage.setItem("@cinelog/theme", JSON.stringify(stored)).catch(() => {});
    }
  }, []);

  const setFontOption = useCallback((key: FontOption) => {
    setFontState(key);
    AsyncStorage.setItem("@cinelog/font", key).catch(() => {});
  }, []);

  const openCustomThemeEditor = useCallback(() => setCustomThemeEditorVisible(true), []);
  const closeCustomThemeEditor = useCallback(() => setCustomThemeEditorVisible(false), []);

  const fontConfig = getFontConfig(fontOption);

  return (
    <ThemeContext.Provider value={{
      theme, fontOption, fontConfig, setTheme, setFontOption,
      customThemeEditorVisible, openCustomThemeEditor, closeCustomThemeEditor,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
