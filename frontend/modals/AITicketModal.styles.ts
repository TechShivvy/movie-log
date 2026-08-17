import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
    opacity: 0.3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: "700" },
  closeBtn: { padding: 6 },

  segWrapper: { paddingHorizontal: 20, marginBottom: 20 },

  // ── Scanning area ───────────────────────────────────────────────────────────
  scanArea: { paddingHorizontal: 20, gap: 14 },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 36,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  pickBtnText: { fontSize: 15, fontWeight: "600" },
  orText: { textAlign: "center", fontSize: 13, opacity: 0.5 },

  // ── Progress ────────────────────────────────────────────────────────────────
  progressWrap: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 8 },
  progressBar: { height: "100%", borderRadius: 2 },
  progressLabel: { textAlign: "center", fontSize: 12, marginTop: 6, opacity: 0.65 },

  // ── Item list ───────────────────────────────────────────────────────────────
  itemList: { paddingHorizontal: 20 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: "500" },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: "700" },

  // ── Stalled warning ────────────────────────────────────────────────────────
  stalledBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 20,
    marginTop: 8,
  },
  stalledText: { fontSize: 13 },

  // ── Attribution ─────────────────────────────────────────────────────────────
  attribution: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  attributionText: { fontSize: 12, opacity: 0.5 },

  // ── Bottom action ──────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },
  applyBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  applyBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  autoInsertRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  autoInsertLabel: { fontSize: 14 },
});
