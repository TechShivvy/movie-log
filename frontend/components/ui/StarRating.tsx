/**
 * StarRating — design spec: Phosphor Star icons, 26px, accent colour.
 *
 * Web: CSS hover/interactive stars via Phosphor icons.
 * Native: Pressable row with Phosphor Star icons (26px regular/fill).
 */
import React, { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { Star } from "phosphor-react-native";
import { useTheme } from "../../hooks/useTheme";

interface StarRatingProps {
  value: number;           // 0–5
  onChange?: (v: number) => void;
  size?: "normal" | "small";
  readonly?: boolean;
}

const SIZE_PX = { normal: 26, small: 16 } as const;

export function StarRating({ value, onChange, size = "normal", readonly = false }: StarRatingProps) {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(0);
  const px = SIZE_PX[size];
  const active = hovered || value;

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" } as React.CSSProperties}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            onMouseEnter={() => !readonly && setHovered(n)}
            onMouseLeave={() => !readonly && setHovered(0)}
            onClick={() => !readonly && onChange?.(n === value ? 0 : n)}
            style={{
              cursor: readonly ? "default" : "pointer",
              display: "flex",
              color: n <= active ? theme.accent : theme.divider,
              transition: "color 0.1s",
            } as React.CSSProperties}
          >
            <Star
              size={px}
              weight={n <= active ? "fill" : "regular"}
              color={n <= active ? theme.accent : theme.divider}
            />
          </span>
        ))}
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <View style={{ flexDirection: "row", gap: 4, alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => !readonly && onChange?.(n === value ? 0 : n)}
          disabled={readonly}
          style={{ padding: 2 }}
        >
          <Star
            size={px}
            weight={n <= value ? "fill" : "regular"}
            color={n <= value ? theme.accent : theme.divider}
          />
        </Pressable>
      ))}
    </View>
  );
}
