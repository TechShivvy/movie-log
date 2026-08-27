/**
 * Corner-radius scale — TS mirror of lib/designCss.ts's --radius-* CSS
 * custom properties, for the same reason spacing.ts exists: native code
 * can't read CSS vars, so it was hand-picking borderRadius literals
 * instead of sharing one source of truth with the web stylesheet.
 */
export const radius = {
  sm: 4,
  md: 8,
  lg: 14,
} as const;

export type RadiusKey = keyof typeof radius;
