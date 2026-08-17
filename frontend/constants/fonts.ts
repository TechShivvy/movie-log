/**
 * Font configuration.
 *
 * Two loading mechanisms, one per platform — deliberately:
 *   • Web    → Google Fonts @import in lib/designCss.ts gives real variable
 *              weights, so `font-family: Sora; font-weight: 600` works.
 *              Family names here must be the REAL CSS family names
 *              ("Plus Jakarta Sans", not "PlusJakartaSans").
 *   • Native → bundled TTFs registered by useFonts() in app/_layout.tsx.
 *              React Native has no synthetic weights, so each weight is a
 *              separate registered family; use fontFamily(key, weight) to
 *              pick the right one instead of relying on fontWeight.
 */
import { Platform, type TextStyle } from "react-native";

export type FontOption = "cinematic" | "inter" | "system";

export interface FontConfig {
  key: FontOption;
  label: string;
  /** CSS font stacks for web (real family names + fallbacks). */
  webHeading: string;
  webBody: string;
  /** Heading weight used by the design system on web. */
  headingWeight: string;
  /** Native registered-family prefixes (see NATIVE_FONTS below). */
  nativeHeading: string | undefined;
  nativeBody: string | undefined;
}

const SYSTEM_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const FONT_OPTIONS: FontConfig[] = [
  {
    key: "cinematic",
    label: "Cinematic · Sora",
    webHeading: `'Sora', ${SYSTEM_STACK}`,
    webBody: `'Plus Jakarta Sans', ${SYSTEM_STACK}`,
    headingWeight: "600",
    nativeHeading: "Sora",
    nativeBody: "PlusJakartaSans",
  },
  {
    key: "inter",
    label: "Inter",
    webHeading: `'Inter', ${SYSTEM_STACK}`,
    webBody: `'Inter', ${SYSTEM_STACK}`,
    headingWeight: "500",
    nativeHeading: "Inter",
    nativeBody: "Inter",
  },
  {
    key: "system",
    label: "System",
    webHeading: SYSTEM_STACK,
    webBody: SYSTEM_STACK,
    headingWeight: "600",
    // undefined → RN falls back to the platform system font
    nativeHeading: undefined,
    nativeBody: undefined,
  },
];

export const DEFAULT_FONT: FontOption = "cinematic";

export function getFontConfig(key: FontOption): FontConfig {
  return FONT_OPTIONS.find((f) => f.key === key) ?? FONT_OPTIONS[0];
}

/** Weights we actually register/bundle on native. */
export type FontWeightKey = 400 | 500 | 600 | 700;

const WEIGHT_SUFFIX: Record<FontWeightKey, string> = {
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
};

/**
 * Resolve a concrete fontFamily for a given role + weight.
 *
 * Native: "Sora" + 600 → "Sora_600SemiBold" (the family useFonts registered).
 * Web:    returns the CSS stack; pair it with a normal fontWeight.
 *
 * Returns undefined when the "system" option is active so RN/CSS just use
 * the platform default rather than a bogus family name.
 */
export function fontFamily(
  cfg: FontConfig,
  role: "heading" | "body",
  weight: FontWeightKey = 400
): string | undefined {
  if (Platform.OS === "web") {
    return role === "heading" ? cfg.webHeading : cfg.webBody;
  }
  const base = role === "heading" ? cfg.nativeHeading : cfg.nativeBody;
  if (!base) return undefined;
  return `${base}_${weight}${WEIGHT_SUFFIX[weight]}`;
}

/**
 * Convenience for native text styles: returns { fontFamily } plus an explicit
 * fontWeight only on web (native gets weight from the family itself, and
 * setting both causes Android to pick a wrong synthetic face).
 */
export function fontStyle(
  cfg: FontConfig,
  role: "heading" | "body",
  weight: FontWeightKey = 400
): TextStyle {
  const family = fontFamily(cfg, role, weight);
  if (Platform.OS === "web") {
    return { fontFamily: family, fontWeight: String(weight) as TextStyle["fontWeight"] };
  }
  return family ? { fontFamily: family } : { fontWeight: String(weight) as TextStyle["fontWeight"] };
}
