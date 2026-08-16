import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  card: { borderRadius: 8, overflow: "hidden", position: "relative" },
  poster: { borderRadius: 8 },
  placeholder: {
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: 8,
  },
  gradientFill: { ...StyleSheet.absoluteFillObject },
  titleText: { fontSize: 11, fontWeight: "600", textAlign: "center", zIndex: 1 },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: "700" },
  formatChip: {
    position: "absolute",
    bottom: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  formatText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  fdfsBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fdfsText: { color: "#fff", fontSize: 8, fontWeight: "700" },
});
