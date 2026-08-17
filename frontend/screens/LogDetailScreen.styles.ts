import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: 80 },

  // ── Hero (mobile) ──────────────────────────────────────────────────────────
  heroContainer: { position: "relative", width: "100%", aspectRatio: 2 / 3 },
  heroPoster: { width: "100%", height: "100%" },
  heroGradient: { position: "absolute", bottom: 0, left: 0, right: 0, height: "60%" },

  // ── Web layout ─────────────────────────────────────────────────────────────
  webRow: { flexDirection: "row", gap: 32, padding: 32 },
  webPosterCol: { width: 220 },
  webPoster: { width: 220, height: 330, borderRadius: 12 },
  webContentCol: { flex: 1, minWidth: 0 },

  // ── Content padding (mobile) ───────────────────────────────────────────────
  contentPad: { paddingHorizontal: 16, paddingTop: 16 },

  // ── Title row ──────────────────────────────────────────────────────────────
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 },
  title: { fontSize: 24, fontWeight: "800", flex: 1, marginRight: 8 },
  visibilityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: "flex-start", marginTop: 4 },
  visibilityText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },

  // ── Rating row ─────────────────────────────────────────────────────────────
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  dateText: { fontSize: 13, opacity: 0.6 },

  // ── Badges row ─────────────────────────────────────────────────────────────
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 16 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipText: { fontSize: 12, fontWeight: "700" },

  // ── Edited badge ───────────────────────────────────────────────────────────
  editedBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  editedText: { fontSize: 11 },

  // ── Meta grid ──────────────────────────────────────────────────────────────
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  metaCard: { width: "47%", borderRadius: 12, padding: 14 },
  metaLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4, opacity: 0.6, textTransform: "uppercase" },
  metaValue: { fontSize: 14, fontWeight: "600" },

  // ── Section heading ────────────────────────────────────────────────────────
  sectionHead: { fontSize: 16, fontWeight: "700", marginBottom: 12 },

  // ── Notes ──────────────────────────────────────────────────────────────────
  notesCard: { borderRadius: 12, padding: 16, marginBottom: 20 },
  notesText: { fontSize: 14, lineHeight: 22 },

  // ── Provenance ─────────────────────────────────────────────────────────────
  provenanceChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start", marginBottom: 16 },
  provenanceText: { fontSize: 11, fontWeight: "600" },

  // ── Action row (like / archive / edit) ────────────────────────────────────
  actionRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { fontSize: 14, fontWeight: "600" },

  // ── Divider ────────────────────────────────────────────────────────────────
  divider: { height: 1, marginBottom: 20 },

  // ── Comments ───────────────────────────────────────────────────────────────
  commentCard: { borderRadius: 12, padding: 12, marginBottom: 10 },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  commentAuthor: { fontSize: 13, fontWeight: "700" },
  commentTime: { fontSize: 12, opacity: 0.5 },
  commentBody: { fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: "row", gap: 12, marginTop: 6 },
  commentActionText: { fontSize: 12 },

  // ── Reply indent ───────────────────────────────────────────────────────────
  replyIndent: { marginLeft: 28, marginTop: 6 },

  // ── Compose ────────────────────────────────────────────────────────────────
  composeRow: { flexDirection: "row", gap: 10, alignItems: "flex-end", marginBottom: 20 },
  composeInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  sendBtnText: { fontSize: 14, fontWeight: "700" },

  // ── Loading / empty ────────────────────────────────────────────────────────
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  errorText: { fontSize: 16, textAlign: "center", marginTop: 12 },
});
