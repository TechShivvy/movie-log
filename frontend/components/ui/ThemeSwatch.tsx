/**
 * ThemeSwatch — the small diagonal-split preview tile in Sidebar's palette
 * picker (bg color / accent color, split corner-to-corner).
 *
 * Used to be a plain <button>/<Pressable> with a CSS
 * `linear-gradient(135deg, bg 45%, accent 45%)` background and
 * `border-radius`. Reproduced in total isolation (a bare HTML file, none of
 * this app's other CSS involved): border-radius doesn't reliably re-clip a
 * hard-stop gradient to its own rounded corner in Chromium — a sliver of
 * the gradient's own color consistently leaked past the curve, worse on an
 * unselected swatch (transparent border, nothing to visually compete with
 * the leak). Neither `overflow:hidden` nor softening the gradient's stop
 * fixed it (both tested); switching the gradient to an actual SVG shape
 * clipped by an SVG <clipPath> did — vector clipping isn't the same code
 * path as a CSS box's rounded-corner background clip, so it doesn't hit
 * this. Same SVG on both platforms; only the pressable wrapper differs.
 */
import React, { useId } from "react";
import { Platform, Pressable } from "react-native";
import Svg, { ClipPath, Defs, G, Polygon, Rect } from "react-native-svg";

interface ThemeSwatchProps {
  bg: string;
  accent: string;
  active: boolean;
  activeColor: string;
  onPress: () => void;
  size?: number;
  radius?: number;
  /** Web only — the tooltip shown on hover. */
  title?: string;
}

export function ThemeSwatch({
  bg, accent, active, activeColor, onPress, size = 22, radius = 6, title,
}: ThemeSwatchProps) {
  // SVG <clipPath id> is matched document-wide, not scoped to this <svg> —
  // every swatch sharing a literal id would clip against whichever one the
  // browser resolves first. useId() keeps each instance's id unique.
  const clipId = `theme-swatch-clip-${useId()}`;
  const ringColor = active ? activeColor : "transparent";

  const svg = (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Rect width={size} height={size} rx={radius} ry={radius} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`}>
        <Rect width={size} height={size} fill={bg} />
        <Polygon points={`${size},0 ${size},${size} 0,${size}`} fill={accent} />
      </G>
    </Svg>
  );

  if (Platform.OS === "web") {
    return (
      <button
        type="button"
        title={title}
        onClick={onPress}
        style={{
          width: size, height: size, padding: 0, cursor: "pointer",
          borderRadius: radius, border: `2px solid ${ringColor}`,
          display: "block", lineHeight: 0,
        } as React.CSSProperties}
      >
        {svg}
      </button>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={{ width: size, height: size, borderRadius: radius, borderWidth: 2, borderColor: ringColor }}
    >
      {svg}
    </Pressable>
  );
}
