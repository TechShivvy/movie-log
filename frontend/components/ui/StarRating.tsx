import React from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "./StarRating.styles";

interface StarRatingProps {
  value: number;        // 0–5
  onChange?: (v: number) => void;
  size?: "normal" | "small";
  readonly?: boolean;
}

export function StarRating({ value, onChange, size = "normal", readonly = false }: StarRatingProps) {
  const starStyle = size === "small" ? styles.starSmall : styles.star;

  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value);
        return (
          <Pressable
            key={n}
            onPress={() => !readonly && onChange?.(n === value ? 0 : n)}
            disabled={readonly}
          >
            <Text style={starStyle}>{filled ? "★" : "☆"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
