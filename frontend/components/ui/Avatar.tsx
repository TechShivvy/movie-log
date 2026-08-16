import React from "react";
import { Image, Text, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./Avatar.styles";

interface AvatarProps {
  name?: string;
  uri?: string;
  size?: number;
}

export function Avatar({ name, uri, size = 40 }: AvatarProps) {
  const { theme } = useTheme();
  const initials = name
    ? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `${theme.accent}33` },
      ]}
    >
      <Text style={[styles.initials, { color: theme.accent, fontSize: size * 0.36 }]}>
        {initials}
      </Text>
    </View>
  );
}

