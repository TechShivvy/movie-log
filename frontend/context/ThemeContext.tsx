import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, DEFAULT_THEME, type Theme } from "../constants/themes";
import { FONT_OPTIONS, DEFAULT_FONT, type FontOption } from "../constants/fonts";

interface ThemeContextValue {
  theme: Theme;
  fontOption: FontOption;
  setTheme: (key: string) => void;
  setFontOption: (key: FontOption) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  fontOption: DEFAULT_FONT,
  setTheme: () => {},
  setFontOption: () => {},
});

function injectWebCSSVars(theme: Theme, fontCfg: ReturnType<typeof getFontConfig>) {
  if (Platform.OS !== "web") return;
  const root = (globalThis as any).document?.documentElement?.style;
  if (!root) return;
  root.setProperty("--color-bg", theme.bg);
  root.setProperty("--color-surface", theme.surface);
  root.setProperty("--color-text", theme.text);
  root.setProperty("--color-accent", theme.accent);
  root.setProperty("--color-accent-dim", theme.accentDim);
  root.setProperty("--color-divider", theme.divider);
  root.setProperty("--color-neutral", theme.neutral);
  root.setProperty("--color-surface-high", theme.surfaceHigh);
  root.setProperty("--font-heading", fontCfg.heading);
  root.setProperty("--font-body", fontCfg.body);
  root.setProperty("--font-mono", fontCfg.mono);
}

function getFontConfig(key: FontOption) {
  return FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const [fontOption, setFontState] = useState<FontOption>(DEFAULT_FONT);

  // Persist & load on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedFont] = await Promise.all([
          AsyncStorage.getItem("@cinelog/theme"),
          AsyncStorage.getItem("@cinelog/font"),
        ]);
        if (savedTheme) {
          const t = THEMES.find((x) => x.key === savedTheme) ?? DEFAULT_THEME;
          setThemeState(t);
          injectWebCSSVars(t, getFontConfig(savedFont as FontOption ?? DEFAULT_FONT));
        }
        if (savedFont && FONT_OPTIONS.some((f) => f.key === savedFont)) {
          setFontState(savedFont as FontOption);
        }
      } catch {}
    })();
  }, []);

  const setTheme = useCallback((key: string) => {
    const t = THEMES.find((x) => x.key === key) ?? DEFAULT_THEME;
    setThemeState(t);
    injectWebCSSVars(t, getFontConfig(fontOption));
    AsyncStorage.setItem("@cinelog/theme", key).catch(() => {});
  }, [fontOption]);

  const setFontOption = useCallback((key: FontOption) => {
    setFontState(key);
    injectWebCSSVars(theme, getFontConfig(key));
    AsyncStorage.setItem("@cinelog/font", key).catch(() => {});
  }, [theme]);

  // Inject on every render so web page always matches
  useEffect(() => {
    injectWebCSSVars(theme, getFontConfig(fontOption));
  }, [theme, fontOption]);

  return (
    <ThemeContext.Provider value={{ theme, fontOption, setTheme, setFontOption }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useThemeContext = () => useContext(ThemeContext);
