/**
 * Design tokens — cinema-dark theme.
 *
 * Palette philosophy:
 *  - Deep near-black surfaces, never pure black (easier on eyes in dark rooms)
 *  - Single warm accent (amber) used sparingly on CTAs/highlights only
 *  - Muted slate secondaries; cool indigo for informational highlights
 *  - All foreground/background pairs meet WCAG AA contrast (4.5:1+)
 */

export const colors = {
  // Surfaces
  bg: "#0D0F14", // page background
  surface: "#15181F", // card / panel background
  surfaceElevated: "#1C2029", // modals, popovers
  surfaceMuted: "#20242E", // subtle inset areas, input bg

  // Accent — use on primary CTAs, progress, active states only
  accent: "#E8930A", // warm amber (less saturated than F5A524, less harsh)
  accentFg: "#0D0F14", // text on accent background

  // Indigo — informational (badges, info toasts, active tab indicator)
  indigo: "#6366F1",
  indigoMuted: "#312E81",

  // Text
  textPrimary: "#ECEEF3",
  textSecondary: "#8C93A8",
  textDisabled: "#494F62",

  // Semantic
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  errorMuted: "#2D1215",

  // Borders
  border: "#252A37",
  borderStrong: "#353C50",
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  h3: { fontSize: 17, fontWeight: "600" as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: "400" as const, color: colors.textPrimary },
  caption: {
    fontSize: 12,
    fontWeight: "400" as const,
    color: colors.textSecondary,
  },
  label: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: "uppercase" as const,
  },
  mono: {
    fontSize: 13,
    fontWeight: "400" as const,
    color: colors.textSecondary,
    fontFamily: "monospace",
  },
};
