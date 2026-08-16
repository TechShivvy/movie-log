import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    gap: 12,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  searchWrap: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 6,
    ...(Platform.OS === "web" ? ({ cursor: "text" } as any) : {}),
  },
  searchIcon: {
    fontSize: 14,
  },
  searchPlaceholder: {
    fontSize: 13,
    flex: 1,
  },
  installBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  installText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
