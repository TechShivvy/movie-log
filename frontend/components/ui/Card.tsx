import React from "react";
import { Platform, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./Card.styles";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  glass?: boolean;
}

export function Card({ children, style, glass = false }: CardProps) {
  const { theme } = useTheme();

  if (glass && Platform.OS === "web") {
    return (
      <div
        style={{
          background: `${theme.surface}cc`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${theme.divider}`,
          borderRadius: 12,
          padding: 16,
          ...(style as any),
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.divider }, style]}>
      {children}
    </View>
  );
}

