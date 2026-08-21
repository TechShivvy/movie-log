/**
 * ImageLightbox — tap an avatar or banner to see it full-size, dimmed
 * backdrop, dismiss by tapping outside or the close button. Shared by
 * ProfileScreen and PublicProfileScreen (own + someone else's profile),
 * both web and native — neither had any way to see these images larger
 * than the small hero thumbnail before this.
 */
import React from "react";
import { Image, Modal, Platform, Pressable, StyleSheet } from "react-native";
import { X } from "phosphor-react-native";

interface ImageLightboxProps {
  uri: string | undefined;
  onClose: () => void;
}

export function ImageLightbox({ uri, onClose }: ImageLightboxProps) {
  if (!uri) return null;

  if (Platform.OS === "web") {
    return (
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 32, cursor: "pointer",
        } as React.CSSProperties}
      >
        <button
          className="btn btn-icon"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            position: "absolute", top: 20, right: 24,
            backgroundColor: "rgba(255,255,255,0.12)", border: "none", color: "#fff",
          } as React.CSSProperties}
        >
          <X size={18} color="#fff" />
        </button>
        {/* stopPropagation so tapping the image itself doesn't close it —
            only the dimmed backdrop and the X do. */}
        <img
          src={uri}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "min(90vw, 720px)", maxHeight: "85vh", borderRadius: 12, objectFit: "contain", cursor: "default" } as React.CSSProperties}
        />
      </div>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ maxWidth: "100%" }}>
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        </Pressable>
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <X size={20} color="#fff" />
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
  // No fixed aspectRatio — this shows both square avatars and wide
  // banners; resizeMode:"contain" against a fixed box correctly
  // letterboxes either shape without needing to know it up front.
  image: { width: "100%", height: "70%" },
  closeBtn: {
    position: "absolute", top: 48, right: 20,
    backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, padding: 10,
  },
});
