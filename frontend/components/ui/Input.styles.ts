import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  wrapper: { gap: 4 },
  label: { fontSize: 12, fontWeight: "500", marginBottom: 2 },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  multiline: {
    height: "auto",
    minHeight: 88,
    paddingTop: 10,
    paddingBottom: 10,
    textAlignVertical: "top",
  },
  error: { color: "#e53935", fontSize: 11 },
});
