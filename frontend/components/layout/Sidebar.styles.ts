import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row" },
  sidebar: {
    borderRightWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 4,
    ...(Platform.OS === "web" ? ({ transition: "width 0.2s" } as any) : {}),
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  logoText: { fontSize: 18, fontWeight: "800" },
  collapseBtn: { padding: 4 },
  nav: { flex: 1, gap: 2 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  navIcon: { fontSize: 18 },
  navLabel: { fontSize: 14, fontWeight: "500" },
  badgeWrap: { marginLeft: "auto" },
  fab: {
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
    marginHorizontal: 4,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  fabText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  signOut: { alignItems: "center", paddingVertical: 8, marginTop: 4 },
  main: { flex: 1 },
});
