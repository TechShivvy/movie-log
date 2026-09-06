import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    height: 64,
    borderTopWidth: 1,
    alignItems: "center",
    paddingBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 6,
    gap: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
  fabWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabIcon: {
    color: "#fff",
    fontSize: 26,
    lineHeight: 30,
  },
  badgeWrap: {
    position: "absolute",
    top: 2,
    right: 8,
  },
});
