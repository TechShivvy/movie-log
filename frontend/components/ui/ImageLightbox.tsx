/**
 * ImageLightbox — tap an avatar or banner to see it full-size, dimmed
 * backdrop, dismiss by tapping outside, the close button, or Escape.
 * Shared by ProfileScreen and PublicProfileScreen (own + someone else's
 * profile), both web and native — neither had any way to see these
 * images larger than the small hero thumbnail before this.
 */
import React, { useEffect, useState } from "react";
import { Image, Modal, Platform, Pressable, StyleSheet } from "react-native";
import { X } from "phosphor-react-native";

interface ImageLightboxProps {
  uri: string | undefined;
  onClose: () => void;
}

// How long the fade-out gets to actually play before the component
// unmounts for real — matches the CSS transition duration below.
const CLOSE_ANIM_MS = 180;

export function ImageLightbox({ uri, onClose }: ImageLightboxProps) {
  // Local "closing" flag so the fade-out transition actually gets a
  // chance to run — the parent clears `uri` (which would unmount this
  // instantly) only after this delay, not the moment the user clicks.
  const [closing, setClosing] = useState(false);
  // `visible` drives the CSS opacity — starts false, flips true one
  // frame after mount so the fade-IN also actually transitions instead
  // of snapping straight to opacity:1 on the same frame it appears.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!uri) { setClosing(false); setVisible(false); return; }
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [uri]);

  function handleClose() {
    setClosing(true);
    setVisible(false);
    setTimeout(onClose, CLOSE_ANIM_MS);
  }

  // Escape closes it on web — nothing native-equivalent to add here;
  // Android's hardware/gesture back button already triggers
  // onRequestClose below, which is that platform's own version of the
  // same "escape" gesture.
  useEffect(() => {
    if (Platform.OS !== "web" || !uri) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

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
          style={{ position: "relative", maxWidth: "min(90vw, 720px)", maxHeight: "85vh", cursor: "default" } as React.CSSProperties}
        >
          <img
            src={uri}
            style={{ display: "block", maxWidth: "min(90vw, 720px)", maxHeight: "85vh", borderRadius: 12, objectFit: "contain" } as React.CSSProperties}
          />
          <button
            className="btn btn-icon"
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
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
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable onPress={() => {}} style={styles.imageWrap}>
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          <Pressable onPress={handleClose} style={styles.closeBtn} hitSlop={10}>
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
  imageWrap: { maxWidth: "100%", position: "relative" },
  // No fixed aspectRatio — this shows both square avatars and wide
  // banners; resizeMode:"contain" against a fixed box correctly
  // letterboxes either shape without needing to know it up front.
  image: { width: "100%", height: "70%" },
  closeBtn: {
    position: "absolute", top: -14, right: -14,
    backgroundColor: "rgba(20,20,20,0.85)", borderRadius: 999,
    width: 32, height: 32, alignItems: "center", justifyContent: "center",
  },
});
