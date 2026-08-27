import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1 },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  header: { alignItems: "center", marginBottom: 32 },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 4 },
  card: { width: "100%", maxWidth: 380, gap: 12 },
  cardTitle: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  googleBtn: { width: "100%" },
  magicBtn: { width: "100%", marginTop: 4 },
  divider: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12 },
  msg: { fontSize: 13, textAlign: "center" },
  err: { fontSize: 13, color: "#e53935", textAlign: "center" },
  footer: { marginTop: 32, fontSize: 12, textAlign: "center" },
});
