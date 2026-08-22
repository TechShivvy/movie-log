/**
 * Space scale — TS mirror of lib/designCss.ts's --space-* CSS custom
 * properties, so native code (which can't read CSS vars) has the same
 * scale available instead of each screen hand-picking its own padding/
 * margin numbers.
 *
 * Deliberately NOT a round 4/8/16/24 grid — these are the design system's
 * real values (see designCss.ts's own comment at the CSS var block). Any
 * future drift-audit of padding/margin literals should compare against
 * THESE numbers, not a generic 4pt grid, or it will wildly overstate how
 * much padding/margin actually drifts from the real system.
 */
export const spacing = {
  space1: 2.8,
  space2: 5.6,
  space3: 8.4,
  space4: 11.2,
  space6: 16.8,
  space8: 22.4,
} as const;

export type SpacingKey = keyof typeof spacing;
