import React from "react";
import { Platform, View } from "react-native";
import { styles } from "./FilmGrain.styles";

/**
 * Film grain overlay — fixed/absolute, pointer-events none.
 * On web uses an SVG feTurbulence filter via inline style.
 * On native renders a semi-transparent noise view (approximation).
 */
export function FilmGrain() {
  if (Platform.OS === "web") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none",
          opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "128px 128px",
        }}
      />
    );
  }

  // Native: lightweight semi-transparent overlay
  return <View style={styles.native} pointerEvents="none" />;
}

