import { Platform } from "react-native";

/**
 * Film-grain overlay.
 *
 * Web    → <div className="grain"> whose CSS injects an SVG feTurbulence
 *           background-image (supported by all modern browsers).
 * Native → No-op. react-native-svg does not support feTurbulence/feBlend
 *           filter primitives on iOS/Android, so we omit the grain on native
 *           rather than log warnings. The cinematic atmosphere comes from the
 *           CinematicBg gradient instead.
 */
export function FilmGrain() {
  if (Platform.OS !== "web") return null;

  // The .grain class is injected by lib/designCss.ts on web.
  // It sets position:fixed, inset:0, z-index:9999, pointer-events:none and
  // an SVG feTurbulence background-image at 4% opacity.
  return <div className="grain" />;
}
