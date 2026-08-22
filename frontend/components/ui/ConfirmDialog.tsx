/**
 * ConfirmDialog — a themed, always-dimmed confirm/cancel prompt, one
 * implementation shared by every screen that needs one.
 *
 * Two real bugs prompted this:
 *  1. react-native-web's Alert.alert is a hard no-op (see
 *     node_modules/react-native-web/dist/exports/Alert — `static alert()
 *     {}`) — every screen calling it on web (SettingsScreen's "Delete
 *     account") silently did nothing at all when clicked.
 *  2. Even where a screen worked around that with a web-only inline
 *     .dialog-backdrop block (LogDetailScreen's delete confirm), native
 *     still fell back to the OS's own Alert — bare system chrome with no
 *     relation to the app's theme, and no guaranteed dimming across
 *     every OS/device (unlike this component's explicit rgba(0,0,0,.5)
 *     overlay, which always renders the same way).
 *
 * Renders nothing when !visible (rather than being conditionally
 * mounted by the caller) so a single JSX node can be dropped once into
 * a screen regardless of which of its platform branches ends up
 * returned.
 */
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View, Platform } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { Button } from "./Button";
import { type as fontSizes } from "../../constants/fonts";

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tints the confirm button theme.error instead of theme.accent. */
  destructive?: boolean;
  /** Disables both buttons and swaps the confirm label to "…" mid-flight. */
  loading?: boolean;
  /** Single-button variant for plain acknowledgements ("Coming soon…"). */
  hideCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  hideCancel = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { theme } = useTheme();
  if (!visible) return null;

  const confirmColor = destructive ? theme.error : theme.accent;

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      // Backdrop click is a dismiss gesture — disabled mid-request so the
      // dialog can't be dismissed out from under a delete that's still
      // actually in flight (the whole point of blocking here instead of
      // firing-and-navigating: the user should never lose sight of a
      // destructive action before it's actually done).
      <div className="dialog-backdrop" onClick={loading ? undefined : onCancel}>
        <div className="dialog" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 } as React.CSSProperties}>
          <div className="dialog-title">{title}</div>
          {message && <div className="dialog-body">{message}</div>}
          <div className="dialog-actions">
            {!hideCancel && (
              <Button variant="secondary" label={cancelLabel} onPress={onCancel} disabled={loading} />
            )}
            <Button
              color={confirmColor}
              label={loading ? "Working…" : confirmLabel}
              loading={loading}
              onPress={onConfirm}
              disabled={loading}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !loading && onCancel()}>
      <Pressable style={styles.overlay} onPress={() => !loading && onCancel()}>
        {/* Swallow taps inside the card so they don't bubble to the
            overlay's onPress and dismiss the dialog. */}
        <Pressable style={[styles.dialog, { backgroundColor: theme.surface }]} onPress={() => {}}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {message && <Text style={[styles.message, { color: `${theme.text}99` }]}>{message}</Text>}
          <View style={styles.actions}>
            {!hideCancel && (
              <Button variant="secondary" label={cancelLabel} onPress={onCancel} disabled={loading} />
            )}
            <Button
              color={confirmColor}
              label={loading ? "Working…" : confirmLabel}
              loading={loading}
              onPress={onConfirm}
              disabled={loading}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 16,
  },
  dialog: { width: "100%", maxWidth: 340, borderRadius: 14, padding: 20, gap: 10 },
  title: { fontSize: fontSizes.xl, fontWeight: "700" },
  message: { fontSize: fontSizes.base, lineHeight: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 6 },
});
