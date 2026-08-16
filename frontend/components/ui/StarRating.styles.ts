import { Platform, StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  star: {
    fontSize: 22,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as any) : {}),
  },
  starSmall: {
    fontSize: 14,
  },
});
