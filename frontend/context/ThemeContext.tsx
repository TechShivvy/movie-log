import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, DEFAULT_THEME, type Theme } from "../constants/themes";
import { FONT_OPTIONS, DEFAULT_FONT, type FontOption } from "../constants/fonts";
import { injectDesignSystemCss } from "../lib/designCss";

interface ThemeContextValue {
  theme: Theme;
  fontOption: FontOption;
  fontConfig: FontConfig;
  setTheme: (key: string) => void;
  setFontOption: (key: FontOption) => void;
}

type FontConfig = ReturnType<typeof getFontConfig>;

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  fontOption: DEFAULT_FONT,
  fontConfig: getFontConfig(DEFAULT_FONT),
  setTheme: () => {},
  setFontOption: () => {},
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

// ── Provider ───────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme,      setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [fontOption, setFontState]  = useState<FontOption>(DEFAULT_FONT);

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
        const t = (savedTheme ? THEMES.find((x) => x.key === savedTheme) : null) ?? DEFAULT_THEME;
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

  const setTheme = useCallback((key: string) => {
    const t = THEMES.find((x) => x.key === key) ?? DEFAULT_THEME;
    setThemeState(t);
    AsyncStorage.setItem("@cinelog/theme", key).catch(() => {});
  }, []);

  const setFontOption = useCallback((key: FontOption) => {
    setFontState(key);
    AsyncStorage.setItem("@cinelog/font", key).catch(() => {});
  }, []);

  const fontConfig = getFontConfig(fontOption);

  return (
    <ThemeContext.Provider value={{ theme, fontOption, fontConfig, setTheme, setFontOption }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
