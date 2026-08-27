import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Escape closes a dialog/modal on web. Every dialog in this app already
 * wires native's back-button equivalent (`Modal`'s `onRequestClose`) —
 * this was the one piece only `ImageLightbox.tsx` had (its own inline
 * copy of this exact effect), and every other `.dialog-backdrop` web
 * dialog (ConfirmDialog, CustomThemeEditor, AITicketModal,
 * EditProfileModal, LikesListModal) had neither, just a backdrop-click
 * dismiss. No native-equivalent listener is added here — Android's
 * hardware/gesture back button already reaches `onRequestClose`, which
 * is that platform's own version of this same gesture.
 *
 * `active` gates the listener the same way each dialog's own `visible`
 * prop already gates its render — pass that straight through, not a
 * constant `true` (an unmounted-but-still-subscribed dialog would
 * otherwise catch Escape presses meant for whatever's open on top of/
 * after it).
 */
export function useEscapeToClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (Platform.OS !== "web" || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, onClose]);
}
