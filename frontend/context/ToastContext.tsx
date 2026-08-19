/**
 * ToastContext — brief, non-blocking confirmation toasts ("Log saved",
 * "Log deleted").
 *
 * Async-UX decision for save/delete/edit (previously undesigned — these
 * actions took 1-2s with zero feedback: the screen just sat there until
 * navigation happened, no spinner, no confirmation, nothing):
 *
 *   - Delete goes through ConfirmDialog, which is already a blocking,
 *     dimmed modal the user deliberately opened — once they hit the
 *     destructive button, that dialog now stays open showing a loading
 *     state (ConfirmDialog's existing `loading` prop) until the request
 *     actually resolves, THEN navigates away and fires a toast. This is
 *     deliberately the "wait, dimmed" option rather than fire-and-forget:
 *     silently racing the API from a screen about to unmount for a
 *     destructive, unrecoverable action is the one path where "looks
 *     done" and "is done" mismatching actually matters (if it fails
 *     after we've already left, the user has no way to find out).
 *   - Save/update (LogFormScreen) already blocks its own Save button
 *     with a spinner via isPending — that part was fine. What was
 *     missing was any confirmation once it actually finished; a toast
 *     fired right as navigation happens closes that gap without adding
 *     a second blocking wait on top of the one that already existed.
 *   - A full "active jobs" side panel (the 4th option raised) is more
 *     machinery than a single-user movie-log app's handful of
 *     single-record CRUD actions justify — nothing here ever runs two
 *     independent long operations at once that a user would need to
 *     track side by side.
 */
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { CheckCircle, XCircle, Info } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";

type ToastVariant = "success" | "error" | "info";
interface ToastItem { id: number; message: string; variant: ToastVariant }

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DISMISS_MS = 2800;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const ICONS: Record<ToastVariant, React.ComponentType<any>> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  const { theme } = useTheme();
  if (toasts.length === 0) return null;

  const colorFor = (v: ToastVariant) => (v === "error" ? theme.error : v === "info" ? theme.accent : theme.accent);

  if (Platform.OS === "web") {
    return (
      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 24,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          zIndex: 500, pointerEvents: "none",
        } as React.CSSProperties}
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.variant];
          return (
            <div
              key={t.id}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: theme.surface, color: theme.text,
                padding: "10px 16px", borderRadius: 10,
                boxShadow: "var(--shadow-lg)", fontSize: 13, fontWeight: 600,
                maxWidth: 360,
              } as React.CSSProperties}
            >
              <Icon size={16} color={colorFor(t.variant)} weight="fill" />
              {t.message}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <View style={styles.nativeStack} pointerEvents="none">
      {toasts.map((t) => {
        const Icon = ICONS[t.variant];
        return (
          <View key={t.id} style={[styles.nativeToast, { backgroundColor: theme.surface }]}>
            <Icon size={16} color={colorFor(t.variant)} weight="fill" />
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", flexShrink: 1 }}>{t.message}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nativeStack: {
    position: "absolute",
    left: 0, right: 0, bottom: 100, // clears the tab bar's FAB overlap
    alignItems: "center", gap: 8,
  },
  nativeToast: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10,
    maxWidth: "88%",
    // iOS-only shadow* props, no `elevation` — Android computes an
    // elevation shadow from the view's rectangular layout bounds, not
    // its borderRadius, so a rounded pill like this rendered a visibly
    // square halo poking out past its own rounded corners (same bug,
    // same fix, as TabBar's bar/fab styles — see that file's comment).
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10,
  },
});
