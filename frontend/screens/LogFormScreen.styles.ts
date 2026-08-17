import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, paddingBottom: 60 },
  // Web 2-col
  webLayout: {
    flexDirection: "row",
    gap: 32,
    maxWidth: 960,
    alignSelf: "center",
    width: "100%",
  },
  posterCol: { width: 220 },
  formCol: { flex: 1 },
  // Poster preview
  posterPreview: {
    width: 220,
    height: 330,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  posterPlaceholder: { alignItems: "center", gap: 8 },
  posterIcon: { fontSize: 48 },
  posterHint: { fontSize: 13, textAlign: "center" },
  // Section headers
  sectionTitle: { fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  // Format chips
  formatRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formatChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  formatChipText: { fontSize: 13, fontWeight: "500" },
  // Row layouts
  rowTwo: { flexDirection: "row", gap: 12 },
  halfField: { flex: 1 },
  // FDFS toggle
  fdfsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  fdfsLabel: { fontSize: 14, fontWeight: "500" },
  fdfsHint: { fontSize: 12, marginTop: 2 },
  // AI scan
  aiScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: 4,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  aiScanText: { fontSize: 13, fontWeight: "600" },
  // Submit
  submitBtn: { marginTop: 24 },
  // Movie search
  searchResult: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 2,
  },
  searchResultTitle: { fontSize: 14, fontWeight: "600" },
  searchResultMeta: { fontSize: 12, marginTop: 2 },
  searchResultsList: { maxHeight: 200 },
});
