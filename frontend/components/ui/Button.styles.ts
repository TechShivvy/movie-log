import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  icon: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
});
