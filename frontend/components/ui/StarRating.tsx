/**
 * StarRating — design spec: Phosphor Star icons, 26px, accent colour.
 *
 * Half-star support: the backend accepts ratings in 0.5 steps (0.5-5,
 * schemas/movie_logs.py's _check_half_star) and readonly displays already
 * rendered a half-filled star correctly, but there was no way to actually
 * *set* a half value from this component — every tap/click only ever
 * produced a whole number 1-5, on both platforms. Each star is now two
 * invisible half-width tap zones (left = n-0.5, right = n) layered over
 * one icon that shows empty/half/full — same structure on web and native,
 * rather than web using continuous mouse-position tracking and native
 * using discrete zones; one interaction model to reason about.
 *
 * Web: CSS hover preview via the same half-zone split.
 * Native: Pressable row with Phosphor Star/StarHalf icons.
 */
import React, { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Star, StarHalf } from "phosphor-react-native";
import { useTheme } from "../../hooks/useTheme";

interface StarRatingProps {
  value: number;           // 0–5, in 0.5 steps
  onChange?: (v: number) => void;
  size?: "normal" | "small";
  readonly?: boolean;
}

const SIZE_PX = { normal: 26, small: 16 } as const;

function starWeight(n: number, active: number): "fill" | "regular" | "half" {
  if (n <= active) return "fill";
  if (n - 0.5 === active) return "half";
  return "regular";
}

export function StarRating({ value, onChange, size = "normal", readonly = false }: StarRatingProps) {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(0);
  const px = SIZE_PX[size];
  const active = hovered || value;

  function pick(n: number) {
    if (readonly) return;
    onChange?.(n === value ? 0 : n);
  }

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" } as React.CSSProperties}>
        {[1, 2, 3, 4, 5].map((n) => {
          const weight = starWeight(n, active);
          const filled = weight !== "regular";
          return (
            <div
              key={n}
              style={{
                position: "relative", width: px, height: px, flexShrink: 0,
                color: filled ? theme.accent : theme.divider,
              } as React.CSSProperties}
            >
              {weight === "half"
                ? <StarHalf size={px} weight="fill" color={theme.accent} />
                : <Star size={px} weight={weight === "fill" ? "fill" : "regular"} color={filled ? theme.accent : theme.divider} />}
              {!readonly && (
                <>
                  <span
                    onMouseEnter={() => setHovered(n - 0.5)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => pick(n - 0.5)}
                    style={{ position: "absolute", inset: "0 50% 0 0", cursor: "pointer" } as React.CSSProperties}
                  />
                  <span
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    onClick={() => pick(n)}
                    style={{ position: "absolute", inset: "0 0 0 50%", cursor: "pointer" } as React.CSSProperties}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const weight = starWeight(n, value);
        const filled = weight !== "regular";
        return (
          <View key={n} style={{ width: px + 4, height: px + 4, padding: 2 }}>
            <View style={{ position: "relative", width: px, height: px }}>
              {weight === "half"
                ? <StarHalf size={px} weight="fill" color={theme.accent} />
                : <Star size={px} weight={weight === "fill" ? "fill" : "regular"} color={filled ? theme.accent : theme.divider} />}
              {!readonly && (
                <>
                  <Pressable onPress={() => pick(n - 0.5)} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: px / 2 }} />
                  <Pressable onPress={() => pick(n)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: px / 2 }} />
                </>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
