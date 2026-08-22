/**
 * Theme definitions matching CineLog Web.dc.html → themeDefs() exactly.
 * All hex values sourced verbatim from the design JS.
 */

export interface Theme {
  key: string;
  label: string;
  // ── Base tokens ──────────────────────────────────────────────────
  bg: string;
  surface: string;
  text: string;
  accent: string;
  // ── Derived tokens ────────────────────────────────────────────────
  /** accent 30% over white — tag-accent text */
  accent100: string;
  /** accent 60% over black — pressed / dark accent shade */
  accent700: string;
  /** accent 26% over bg — tag-accent background, cine-bg blobs */
  accent800: string;
  /** accent 15% over bg — active navitem background */
  accent900: string;
  /** same as text — neutral tag text */
  neutral100: string;
  /** text 13% over bg — neutral tag bg, scrollbar thumb */
  neutral800: string;
  /** text 7% over bg — very subtle bg fill */
  neutral900: string;
  /** text at 15% opacity — borders / dividers */
  divider: string;
  /** text 6% over surface — slightly elevated surface */
  surfaceHigh: string;
  /** fixed error red */
  error: string;
  /** fixed success green — same "fixed, not derived" reasoning as error:
   * a semantic status color, not a brand color, so it doesn't vary by
   * theme. Was previously referenced as `theme.success` in two places
   * that both compiled fine but always evaluated to undefined (no such
   * field existed) and silently fell back to a hardcoded literal either
   * way — same value, now a real token instead of dead optional-chaining. */
  success: string;
  /** Text/icon color for content sitting directly on a solid theme.accent
   * fill (a primary button, a filled badge) — computed per-theme (see
   * contrastingOnColor below), not a blanket white. Every accent color
   * here was chosen for its own theme's dark bg, not for content sitting
   * on TOP of it — white text turns out to fail WCAG AA (4.5:1) against
   * 11 of these 12 accents; only Cinematic's deep red actually favors it. */
  onAccent: string;
}

// ── Colour math ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m || m.length < 3) return null;
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}

/** blend hexA at `opacity` (0-1) over opaque hexB → hex string */
function blend(hexA: string, opacity: number, hexB: string): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  return rgbToHex(
    Math.round(a.r * opacity + b.r * (1 - opacity)),
    Math.round(a.g * opacity + b.g * (1 - opacity)),
    Math.round(a.b * opacity + b.b * (1 - opacity)),
  );
}

/** text at alpha over transparent → rgba string */
function rgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

/** WCAG relative luminance (sRGB, gamma-corrected) — 0 (black) to 1 (white). */
function relativeLuminance(hex: string): number {
  const c = hexToRgb(hex);
  if (!c) return 0;
  const [rs, gs, bs] = [c.r, c.g, c.b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG contrast ratio between two colors, 1 (none) to 21 (max). */
function contrastRatio(hexA: string, hexB: string): number {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Pure white or pure black, whichever reads better on `bg` — used for
 * onAccent, where the surface is a saturated brand color no theme's other
 * tokens are designed to sit on top of, so blending toward an existing
 * token (the way every other derived color above does) doesn't reliably
 * clear WCAG AA the way the flat white/black choice does. */
function contrastingOnColor(bg: string): string {
  return contrastRatio(bg, "#ffffff") >= contrastRatio(bg, "#000000") ? "#ffffff" : "#000000";
}

type RawTheme = Pick<Theme, "key" | "label" | "bg" | "surface" | "text" | "accent">;

function buildTheme(raw: RawTheme): Theme {
  return {
    ...raw,
    // Design source (CineLog Web.dc.html) hardcodes this as
    // mix(accent, 30%, #ffffff) unconditionally — meant to read as light
    // text over the dark-ish accent800 background every OTHER theme
    // produces (accent blended only 26% into a dark bg stays dark). That
    // source itself already knows Champagne is the one light theme (it
    // branches on `t.key !== "champagne"` for other things) but never
    // special-cased this formula: for Champagne, accent800 blends into a
    // *light* bg and stays light, while accent100 still blends toward
    // white — both end up nearly the same pale cream, so tag-accent's
    // "5 stars"/"All"-style filled chips render as invisible near-white
    // text on a near-white chip (confirmed via computed styles: bg
    // rgb(234,219,195) vs text rgb(234,220,197)). Blending toward
    // raw.text instead of a fixed white fixes Champagne (raw.text is
    // dark there, giving real contrast against the light accent800) and
    // is a no-op change everywhere else (every other theme's raw.text is
    // already light, so this still lands close to white).
    accent100:   blend(raw.accent, 0.30, raw.text),
    accent700:   blend(raw.accent, 0.60, "#000000"),
    accent800:   blend(raw.accent, 0.26, raw.bg),
    accent900:   blend(raw.accent, 0.15, raw.bg),
    neutral100:  raw.text,
    neutral800:  blend(raw.text,   0.13, raw.bg),
    neutral900:  blend(raw.text,   0.07, raw.bg),
    divider:     rgba(raw.text, 0.15),
    surfaceHigh: blend(raw.text,   0.06, raw.surface),
    error:       "#EF4444",
    success:     "#22C55E",
    onAccent:    contrastingOnColor(raw.accent),
  };
}

// ── Theme catalogue (exact values from design HTML themeDefs()) ────────────────

export const THEMES: Theme[] = [
  buildTheme({ key: "cinematic",  label: "Cinematic",  bg: "#0b1326", surface: "#171f33", text: "#dae2fd", accent: "#e50914" }),
  buildTheme({ key: "nocturne",   label: "Nocturne",   bg: "#161826", surface: "#232532", text: "#e9e9ed", accent: "#9184d9" }),
  buildTheme({ key: "cinema",     label: "Cinema",     bg: "#0D0F14", surface: "#15181F", text: "#ECEEF3", accent: "#E8930A" }),
  buildTheme({ key: "indigo",     label: "Indigo",     bg: "#0E1020", surface: "#191C33", text: "#E6E8F5", accent: "#6366F1" }),
  buildTheme({ key: "amber",      label: "Amber",      bg: "#14100A", surface: "#1F1A10", text: "#F3ECDD", accent: "#F5A524" }),
  buildTheme({ key: "nord",       label: "Nord",       bg: "#2E3440", surface: "#3B4252", text: "#ECEFF4", accent: "#88C0D0" }),
  buildTheme({ key: "sakura",     label: "Sakura",     bg: "#120B1A", surface: "#1F1429", text: "#F8F1FF", accent: "#E91E63" }),
  buildTheme({ key: "forest",     label: "Forest",     bg: "#14231F", surface: "#1E322D", text: "#E8F3F1", accent: "#4CAF50" }),
  buildTheme({ key: "sunset",     label: "Sunset",     bg: "#1A1423", surface: "#2D1E3E", text: "#FFF0F0", accent: "#FF7043" }),
  buildTheme({ key: "crimson",    label: "Crimson",    bg: "#1A0505", surface: "#2D0D0D", text: "#FFF5F5", accent: "#FF4D4D" }),
  buildTheme({ key: "champagne",  label: "Champagne",  bg: "#FCF8F2", surface: "#F5EFE6", text: "#4A4031", accent: "#B8893C" }),
  buildTheme({ key: "mono",       label: "Mono",       bg: "#0E0E10", surface: "#1A1A1D", text: "#EDEDED", accent: "#9AA0A8" }),
];

export const DEFAULT_THEME = THEMES[0]; // Cinematic

// ── Poster / avatar gradient helpers ──────────────────────────────────────────

/** HSL gradient for a poster tile.  hue 0-360, dark = dark theme. */
export function posterGradient(hue: number, dark = true) {
  const [l1, l2] = dark ? [20, 8] : [26, 12];
  return `linear-gradient(155deg, hsl(${hue} 42% ${l1}%), hsl(${(hue + 30) % 360} 38% ${l2}%))`;
}

/** HSL gradient for an avatar tile. hue 0-360. */
export function avatarGradient(hue: number) {
  return `linear-gradient(135deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 45% 26%))`;
}
