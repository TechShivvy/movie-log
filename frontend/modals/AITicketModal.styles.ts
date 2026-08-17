/**
 * AITicketModal styles — centered dialog (not bottom sheet).
 *
 * Design spec (.dialog-backdrop, .dialog):
 *   backdrop: position:fixed; inset:0; display:grid; place-items:center; background:rgba(0,0,0,.5)
 *   dialog:   width:min(460px,100%); border-radius:14px; padding:16px; gap:8.4px
 *             background:surface; box-shadow:shadow-lg
 */
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  // Native dialog backdrop: centered (not bottom-anchored)
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 16,
  },
  dialog: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 14,
    maxHeight: "85%",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    marginBottom: 8.4,
  },
  title: { fontSize: 20, fontWeight: "600" },
  closeBtn: { padding: 4 },

  segWrapper: { paddingHorizontal: 16, marginBottom: 14 },

  // Scanning area
  scanArea: { paddingHorizontal: 16, gap: 14 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  pickBtnText: { fontSize: 14, fontWeight: "600" },

  // Progress (design spec: height:6px, border-radius:3px)
  progressWrap: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 8, marginHorizontal: 16 },
  progressBar: { height: "100%", borderRadius: 3 },
  progressLabel: { textAlign: "center", fontSize: 12, marginTop: 6, opacity: 0.65, marginHorizontal: 16 },

  // Item list (max-height:250px in CSS; native: ScrollView handles)
  itemList: { paddingHorizontal: 16 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemTitle: { flex: 1, fontSize: 13, fontWeight: "500" },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: "700" },

  // Stalled warning
  stalledBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 16,
    marginTop: 8,
  },
  stalledText: { fontSize: 13 },

  // Attribution
  attribution: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  attributionText: { fontSize: 12, opacity: 0.5 },

  // Dialog actions row (design spec: .dialog-actions justify-content:flex-end, gap:5.6px)
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 5.6,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 5.6,
  },
  cancelBtn: {
    paddingVertical: 5.6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5.6,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  applyBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },

  autoInsertRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  autoInsertLabel: { fontSize: 14 },
});
