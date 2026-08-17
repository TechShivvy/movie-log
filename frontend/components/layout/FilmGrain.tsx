import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import Svg, { Defs, Filter, FeTurbulence, Rect } from "react-native-svg";

/**
 * Film-grain overlay — identical on every platform.
 *
 * Web    → <div className="grain"> (CSS injects the SVG feTurbulence background)
 * Native → react-native-svg feTurbulence tiled over the full screen,
 *           opacity 0.04, pointerEvents none.
 */
export function FilmGrain() {
  if (Platform.OS === "web") {
    return <div className="grain" />;
  }

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.overlay]}
    >
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Filter id="grain" x="0%" y="0%" width="100%" height="100%">
            <FeTurbulence
              type="fractalNoise"
              baseFrequency={0.85}
              numOctaves={2}
              stitchTiles="stitch"
            />
          </Filter>
        </Defs>
        <Rect width="100%" height="100%" filter="url(#grain)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 200,
    opacity: 0.04,
  },
});
