export interface Theme {
  key: string;
  label: string;
  bg: string;
  surface: string;
  text: string;
  accent: string;
  // Derived tokens (computed from above)
  accentDim: string;   // accent at 15% opacity over bg
  divider: string;     // text at 15% opacity
  neutral: string;     // text at 13% opacity over bg
  surfaceHigh: string; // slightly lighter surface
}

// Helper: blend hexA at opacity over hexB
function blend(hexA: string, opacity: number, hexB: string): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const r = Math.round(a.r * opacity + b.r * (1 - opacity));
  const g = Math.round(a.g * opacity + b.g * (1 - opacity));
  const bl = Math.round(a.b * opacity + b.b * (1 - opacity));
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return null;
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

function rgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

function buildTheme(raw: Omit<Theme, "accentDim" | "divider" | "neutral" | "surfaceHigh">): Theme {
  return {
    ...raw,
    accentDim: blend(raw.accent, 0.15, raw.bg),
    divider: rgba(raw.text, 0.15),
    neutral: blend(raw.text, 0.13, raw.bg),
    surfaceHigh: blend(raw.text, 0.06, raw.surface),
  };
}

export const THEMES: Theme[] = [
  buildTheme({ key: "cinematic",   label: "Cinematic",   bg: "#0b1326", surface: "#0f1b33", text: "#e8eaf0", accent: "#e50914" }),
  buildTheme({ key: "nocturne",    label: "Nocturne",    bg: "#0a0a0f", surface: "#111118", text: "#e5e5f0", accent: "#7c6aed" }),
  buildTheme({ key: "cinema",      label: "Cinema",      bg: "#1a0a00", surface: "#241200", text: "#f0e8dc", accent: "#ff6b1a" }),
  buildTheme({ key: "indigo-dusk", label: "Indigo Dusk", bg: "#0d0f1a", surface: "#13162a", text: "#dde1f5", accent: "#5c73f2" }),
  buildTheme({ key: "amber-glow",  label: "Amber Glow",  bg: "#1a1400", surface: "#241c00", text: "#f5eed8", accent: "#ffb800" }),
  buildTheme({ key: "nord",        label: "Nord",        bg: "#1e2430", surface: "#252d3b", text: "#d8dee9", accent: "#88c0d0" }),
  buildTheme({ key: "sakura",      label: "Sakura",      bg: "#1a0f14", surface: "#24141c", text: "#f5dde8", accent: "#f06292" }),
  buildTheme({ key: "forest",      label: "Forest",      bg: "#0a1a0f", surface: "#0f2414", text: "#d8f0e0", accent: "#4caf7a" }),
  buildTheme({ key: "sunset",      label: "Sunset",      bg: "#1a0f0a", surface: "#24140f", text: "#f5e0d8", accent: "#ff7043" }),
  buildTheme({ key: "crimson",     label: "Crimson",     bg: "#1a0008", surface: "#24000f", text: "#f5d8e0", accent: "#d50032" }),
  buildTheme({ key: "champagne",   label: "Champagne",   bg: "#f5f0e8", surface: "#fffdf8", text: "#1a1510", accent: "#b8860b" }),
  buildTheme({ key: "monochrome",  label: "Monochrome",  bg: "#0a0a0a", surface: "#141414", text: "#e5e5e5", accent: "#ffffff" }),
];

export const DEFAULT_THEME = THEMES[0]; // Cinematic
