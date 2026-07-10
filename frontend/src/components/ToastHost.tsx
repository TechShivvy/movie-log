import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  dismissToast,
  type Toast,
  type ToastVariant,
} from "../store/uiSlice";
import { useAppDispatch, useAppSelector } from "../store";
import { colors, radii, spacing, typography } from "../theme";

const ICON: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  error: "alert-circle",
  warning: "warning",
  info: "information-circle",
};

const BG: Record<ToastVariant, string> = {
  success: "#14532D",
  error: colors.errorMuted,
  warning: "#451A03",
  info: colors.indigoMuted,
};

const ICON_COLOR: Record<ToastVariant, string> = {
  success: colors.success,
  error: colors.error,
  warning: colors.warning,
  info: colors.indigo,
};

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 20,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -8,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => dispatch(dismissToast(toast.id)));
    }, toast.duration ?? 4000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={[
        styles.item,
        {
          backgroundColor: BG[toast.variant],
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Ionicons
        name={ICON[toast.variant]}
        size={18}
        color={ICON_COLOR[toast.variant]}
        style={styles.icon}
      />
      <Text style={styles.message} numberOfLines={3}>
        {toast.message}
      </Text>
      <Pressable onPress={() => dispatch(dismissToast(toast.id))} hitSlop={8}>
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const toasts = useAppSelector((s) => s.ui.toasts);
  if (!toasts.length) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: Platform.OS === "web" ? spacing.lg : 60,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 9999,
    rowGap: spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    rowGap: spacing.sm,
    // web shadow
    ...Platform.select({
      web: { boxShadow: "0 4px 24px rgba(0,0,0,0.5)" } as object,
    }),
  },
  icon: { flexShrink: 0 },
  message: { ...typography.body, flex: 1, lineHeight: 20 },
});
