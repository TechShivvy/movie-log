/**
 * Avatar — matches design-system avatar styles exactly.
 *
 * Design spec (from design HTML avatar() helper):
 *   background: linear-gradient(135deg, hsl(hue 45% 42%), hsl((hue+40)%360 45% 26%))
 *
 * Size variants:
 *   lg:  38×38, border-radius:12px, font:14px
 *   sm:  32×32, border-radius:9px,  font:12px
 *   xl:  96×96, border-radius:26px, font:40px, border:4px solid bg
 */
import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../hooks/useTheme";

type AvatarSize = "sm" | "lg" | "xl";

interface AvatarProps {
  name?: string;
  uri?: string;
  size?: AvatarSize;
  hue?: number;
}

const SIZE_MAP: Record<AvatarSize, { w: number; r: number; fs: number }> = {
  sm: { w: 32, r: 9,  fs: 12 },
  lg: { w: 38, r: 12, fs: 14 },
  xl: { w: 96, r: 26, fs: 40 },
};

/** HSL to hex for native LinearGradient (which requires hex/rgba) */
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = ln - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function getHue(name?: string): number {
  if (!name) return 220;
  return Array.from(name).reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
}

export function Avatar({ name, uri, size = "lg", hue: hueOverride }: AvatarProps) {
  const { theme } = useTheme();
  const { w, r, fs } = SIZE_MAP[size];
  const hue = hueOverride ?? getHue(name);
  const initials = name
    ? name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.img,
          { width: w, height: w, borderRadius: r },
          size === "xl" && { borderWidth: 4, borderColor: theme.bg },
        ]}
      />
    );
  }

  // Web: CSS gradient via inline style
  if (Platform.OS === "web") {
    return (
      <div
        style={{
          width: w, height: w, borderRadius: r, flexShrink: 0,
          background: `linear-gradient(135deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 45% 26%))`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: fs, fontWeight: 700, color: "#fff",
          ...(size === "xl" ? { border: `4px solid ${theme.bg}` } : {}),
        } as React.CSSProperties}
      >
        {initials}
      </div>
    );
  }

  // Native: LinearGradient
  const c1 = hslToHex(hue, 45, 42);
  const c2 = hslToHex((hue + 40) % 360, 45, 26);

  return (
    <LinearGradient
      colors={[c1, c2]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        { width: w, height: w, borderRadius: r, alignItems: "center", justifyContent: "center" },
        size === "xl" && { borderWidth: 4, borderColor: theme.bg },
      ]}
    >
      <Text style={{ fontSize: fs, fontWeight: "700", color: "#fff" }}>{initials}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  img: { resizeMode: "cover" },
});
