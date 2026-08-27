/**
 * StarRating — design spec: Phosphor Star icons, 26px, accent colour.
 *
 * Interaction (Letterboxd/Google-style single tap-target per star, not
 * a left/right split): tapping star N sets the rating to N (full).
 * Tapping the SAME star again — it's already at N — steps it down to
 * N-0.5 (half). Tapping it a third time — already at N-0.5 — clears to
 * 0. Tapping any other star always jumps straight to that star's full
 * value. A left/right-half-zone version of this shipped first but was
 * explicitly rejected: fewer, larger tap targets per star (one, not
 * two) matches how Letterboxd/Google actually behave and is easier to
 * hit accurately on a phone.
 *
 * Web: CSS hover preview — shows what the pending tap on the hovered
 * star would produce, using the same cycle rule as an actual click.
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

/** full -> half -> clear -> full, tapping a different star always jumps to its full value. */
function nextValue(current: number, n: number): number {
  if (current === n) return n - 0.5;
  if (current === n - 0.5) return 0;
  return n;
}

export function StarRating({ value, onChange, size = "normal", readonly = false }: StarRatingProps) {
  const { theme } = useTheme();
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const px = SIZE_PX[size];
  const previewValue = hoveredStar != null ? nextValue(value, hoveredStar) : null;
  const active = previewValue ?? value;

  function pick(n: number) {
    if (readonly) return;
    onChange?.(nextValue(value, n));
  }

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" } as React.CSSProperties}>
        {[1, 2, 3, 4, 5].map((n) => {
          const weight = starWeight(n, active);
          const filled = weight !== "regular";
          return (
            <span
              key={n}
              onMouseEnter={() => !readonly && setHoveredStar(n)}
              onMouseLeave={() => !readonly && setHoveredStar(null)}
              onClick={() => pick(n)}
              style={{ display: "flex", cursor: readonly ? "default" : "pointer" } as React.CSSProperties}
            >
              {weight === "half"
                ? <StarHalf size={px} weight="fill" color={theme.accent} />
                : <Star size={px} weight={weight === "fill" ? "fill" : "regular"} color={filled ? theme.accent : theme.divider} />}
            </span>
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
          <Pressable key={n} onPress={() => pick(n)} disabled={readonly} style={{ padding: 2 }}>
            {weight === "half"
              ? <StarHalf size={px} weight="fill" color={theme.accent} />
              : <Star size={px} weight={weight === "fill" ? "fill" : "regular"} color={filled ? theme.accent : theme.divider} />}
          </Pressable>
        );
      })}
    </View>
  );
}
