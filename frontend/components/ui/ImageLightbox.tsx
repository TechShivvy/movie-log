/**
 * ImageLightbox — tap an avatar or banner to see it full-size, dimmed
 * backdrop, dismiss by tapping outside, the close button, or Escape.
 * Shared by ProfileScreen and PublicProfileScreen (own + someone else's
 * profile), both web and native — neither had any way to see these
 * images larger than the small hero thumbnail before this.
 */
import React, { useEffect, useState } from "react";
import { Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, WarningCircle } from "phosphor-react-native";
import { Spinner } from "./Spinner";
import { useTheme } from "../../hooks/useTheme";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";

interface ImageLightboxProps {
  uri: string | undefined;
  onClose: () => void;
}

// How long the fade-out gets to actually play before the component
// unmounts for real — matches the CSS transition duration below.
const CLOSE_ANIM_MS = 180;

// The wrapper has no way to know the real image's dimensions before it
// actually loads (no width/height attribute is set up front — banners
// and avatars are different aspect ratios, and hardcoding one would
// letterbox the other wrong). Without *some* minimum size, an <img>/
// <Image> with no src loaded yet renders at 0×0, collapsing the whole
// wrapper (and the close button anchored to its corner) down to a single
// point — on a fast local connection the load finishes before that's
// ever visible, but on a real device over a slower connection the
// lightbox opened to what looked like nothing at all, just the close
// button floating mid-screen. This is the box shown until the image
// actually reports its own size.
const PLACEHOLDER_SIZE = 280;

export function ImageLightbox({ uri, onClose }: ImageLightboxProps) {
  const { theme } = useTheme();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Local "closing" flag so the fade-out transition actually gets a
  // chance to run — the parent clears `uri` (which would unmount this
  // instantly) only after this delay, not the moment the user clicks.
  const [closing, setClosing] = useState(false);
  // `visible` drives the CSS opacity — starts false, flips true one
  // frame after mount so the fade-IN also actually transitions instead
  // of snapping straight to opacity:1 on the same frame it appears.
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!uri) { setClosing(false); setVisible(false); return; }
    setLoaded(false);
    setErrored(false);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [uri]);

  function handleClose() {
    setClosing(true);
    setVisible(false);
    setTimeout(onClose, CLOSE_ANIM_MS);
  }

  useEscapeToClose(!!uri, handleClose);

  if (!uri && !closing) return null;

  if (Platform.OS === "web") {
    return (
      <div
        onClick={handleClose}
        style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 32, cursor: "pointer",
          opacity: visible ? 1 : 0,
          transition: `opacity ${CLOSE_ANIM_MS}ms ease`,
        } as React.CSSProperties}
      >
        {/* X anchored to the IMAGE's own corner, not the viewport's — it
            used to sit at a fixed top-right screen position independent
            of the (centered, but narrower-than-the-viewport) image, so
            it read as a lone, disconnected anchor pulling the eye
            rightward against an image that actually sits dead-center.
            Tying it to the same box the image centers in makes the
            whole framed composition (image + its own close button)
            read as one centered unit. */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative", cursor: "default",
            // Pinned to the placeholder size until the image reports its
            // own dimensions — see PLACEHOLDER_SIZE above. Once loaded,
            // minWidth/minHeight stop constraining anything (the image's
            // own maxWidth/maxHeight take over) since they're a floor,
            // not a fixed size.
            minWidth: loaded ? undefined : PLACEHOLDER_SIZE,
            minHeight: loaded ? undefined : PLACEHOLDER_SIZE,
            maxWidth: "min(90vw, 720px)", maxHeight: "85vh",
          } as React.CSSProperties}
        >
          {!errored && (
            <img
              src={uri}
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
              style={{
                display: loaded ? "block" : "none",
                maxWidth: "min(90vw, 720px)", maxHeight: "85vh",
                borderRadius: 12, objectFit: "contain",
              } as React.CSSProperties}
            />
          )}
          {!loaded && !errored && (
            <div
              className="pulse-loading"
              style={{
                width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, borderRadius: 12,
                background: theme.surfaceHigh,
              } as React.CSSProperties}
            />
          )}
          {errored && (
            <div
              style={{
                width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE, borderRadius: 12,
                background: theme.surfaceHigh, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8, color: theme.text,
              } as React.CSSProperties}
            >
              <WarningCircle size={28} color={theme.error} />
              <span style={{ fontSize: 13, opacity: 0.7 } as React.CSSProperties}>Couldn't load image</span>
            </div>
          )}
          <button
            className="btn btn-icon"
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            title="Close"
            aria-label="Close"
            style={{
              position: "absolute", top: -14, right: -14,
              backgroundColor: "rgba(20,20,20,0.85)", border: "none", color: "#fff",
              borderRadius: 999, width: 32, height: 32, minHeight: 0,
            } as React.CSSProperties}
          >
            <X size={16} color="#fff" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      {/* Extra top padding by the safe-area inset — the close button is
          anchored at top:-14 relative to the (centered, up-to-85%-of-
          window-height) image box below, with no safe-area awareness of
          its own. On a device with a notch/dynamic island, a tall image
          left little enough room above it that -14 could land the
          button under/behind system UI. Padding the box's own available
          area down by insets.top keeps its top edge — and therefore the
          button anchored just above it — clear of that area on any
          device, and is a no-op (insets.top === 0) on web/most phones. */}
      <Pressable style={[styles.overlay, { paddingTop: 24 + insets.top }]} onPress={handleClose}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.imageWrap,
            // A real, DEFINITE width+height, always — was only given an
            // explicit size while !loaded (the PLACEHOLDER_SIZE
            // fallback); once `loaded` flipped true this dropped to
            // just `maxWidth:"100%"` with no height at all, and the
            // child Image's own `height:"70%"` (styles.image) had
            // nothing but an indeterminate, shrink-to-fit parent to
            // resolve a percentage against — a max-width/max-height
            // alone doesn't fix this either (those only cap an
            // otherwise-computed size, they don't establish one) — so
            // Yoga couldn't solve the circularity and the image
            // rendered at 0 height: the exact "opens to nothing, just
            // the close button" collapse this component's own
            // PLACEHOLDER_SIZE fix was supposed to have already closed
            // (that fix only ever covered the *pre-load* case). Sized
            // the same way the web branch's own bounding box is
            // (`min(90vw,720px)` × `85vh`), computed from the real
            // window size since RN has no vw/vh units; styles.image
            // below fills these exact bounds and resizeMode:"contain"
            // does the letterboxing for either a square avatar or a
            // wide banner.
            loaded
              ? { width: Math.min(winWidth * 0.9, 720), height: winHeight * 0.85 }
              : { width: PLACEHOLDER_SIZE, height: PLACEHOLDER_SIZE },
          ]}
        >
          {!errored && (
            <Image
              source={{ uri }}
              style={loaded ? styles.image : styles.imageHidden}
              resizeMode="contain"
              onLoad={() => setLoaded(true)}
              onError={() => setErrored(true)}
            />
          )}
          {!loaded && !errored && (
            <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: theme.surfaceHigh }]}>
              <Spinner />
            </View>
          )}
          {errored && (
            <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: theme.surfaceHigh, gap: 8 }]}>
              <WarningCircle size={28} color={theme.error} />
              <Text style={{ fontSize: 13, color: theme.text, opacity: 0.7 }}>Couldn't load image</Text>
            </View>
          )}
          <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={10} accessibilityLabel="Close">
            <X size={16} color="#fff" />
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  // Close button positioned relative to this wrapper (the image's own
  // box), not the screen — same reasoning as the web branch above.
  imageWrap: { maxWidth: "100%", borderRadius: 12, overflow: "hidden", position: "relative" },
  // No fixed aspectRatio — this shows both square avatars and wide
  // banners; resizeMode:"contain" against a fixed box correctly
  // letterboxes either shape without needing to know it up front.
  // Both 100% — imageWrap now always has a real, definite width+height
  // (see its own style override above) for these to resolve against.
  image: { width: "100%", height: "100%" },
  // Kept mounted (not conditionally rendered) while loading so onLoad
  // still fires — just invisible and out of layout, so it can't be the
  // thing collapsing imageWrap to nothing the way an absent Image would.
  imageHidden: { width: 0, height: 0, opacity: 0 },
  placeholder: { alignItems: "center", justifyContent: "center", borderRadius: 12 },
  closeBtn: {
    position: "absolute", top: -14, right: -14,
    backgroundColor: "rgba(20,20,20,0.85)", borderRadius: 999,
    width: 32, height: 32, alignItems: "center", justifyContent: "center",
  },
});
