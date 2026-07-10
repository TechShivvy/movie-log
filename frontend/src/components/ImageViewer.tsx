import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme";

interface Props {
  uri: string;
  /** Height of the thumbnail */
  height?: number;
}

export function ImageViewer({ uri, height = 180 }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.thumb, { height }]}
      >
        <Image source={{ uri }} style={styles.thumbImage} contentFit="cover" />
        <View style={styles.zoomBadge}>
          <Ionicons
            name="expand-outline"
            size={14}
            color={colors.textPrimary}
          />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.fullPane}>
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </Pressable>
            <Image
              source={{ uri }}
              style={styles.fullImage}
              contentFit="contain"
              allowDownscaling={false}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbImage: { width: "100%", height: "100%" },
  zoomBadge: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: radii.sm,
    padding: 4,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
  },
  fullPane: {
    width: "92%",
    maxWidth: 780,
    maxHeight: "90%",
    minHeight: 320,
    borderRadius: radii.xl,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  closeBtn: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: radii.full,
    padding: 6,
  },
  fullImage: { width: "100%", flex: 1, minHeight: 300 },
});
