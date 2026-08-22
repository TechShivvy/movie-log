/**
 * AITicketModal — AI-powered ticket extraction
 * Tabs: Single photo | Batch (≤20) | Link URL
 */
import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { X, Ticket, Robot, WarningCircle, CheckCircle, Camera } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import {
  useExtractTicket,
  useExtractTicketFromLink,
  useStartBatchExtraction,
  useBatchJobStatus,
} from "../hooks/useExtractTicket";
import type { ExtractionResult, BatchExtractionItem } from "../types";
import { styles } from "./AITicketModal.styles";
import { type as fontSizes } from "../constants/fonts";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "single" | "batch" | "link";

interface Props {
  visible: boolean;
  llmKey?: string;
  onClose: () => void;
  /** Called with first successful extraction to pre-fill the log form */
  onResult: (result: ExtractionResult) => void;
  /** Called with all batch results when user taps "Add N logs" */
  onBatchResults?: (results: ExtractionResult[]) => void;
}

// ─── Status chip colours ──────────────────────────────────────────────────────

// Real per-item statuses are just "queued" | "completed" | "failed" — no
// separate "processing" state exists per-item (the whole batch is either
// still processing or terminal; an individual item is only ever reported
// once it's done, success or failure).
function statusColour(status: BatchExtractionItem["status"], accent: string) {
  switch (status) {
    case "completed": return { bg: "#4caf7a22", text: "#4caf7a" };
    case "failed": return { bg: "#ff000022", text: "#ff4444" };
    default: return { bg: accent + "22", text: accent };
  }
}

function statusLabel(status: BatchExtractionItem["status"]) {
  switch (status) {
    case "completed": return "Read ✓";
    case "failed": return "Error";
    default: return "Queued";
  }
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function AITicketModal({ visible, llmKey, onClose, onResult, onBatchResults }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("single");
  const [linkUrl, setLinkUrl] = useState("");
  const [autoInsert, setAutoInsert] = useState(false);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [batchImageCount, setBatchImageCount] = useState(0);

  const extractSingle = useExtractTicket(llmKey);
  const extractLink = useExtractTicketFromLink(llmKey);
  const startBatch = useStartBatchExtraction(llmKey);
  const batchJob = useBatchJobStatus(batchJobId, tab === "batch" && !!batchJobId);

  // ── Single pick ──────────────────────────────────────────────────────────
  // No base64/toBase64 step needed — the picked asset (its uri) is sent
  // straight through as a real multipart file part (see lib/api.ts's
  // appendTicketImage), not converted to a JSON string first.
  const handlePickSingle = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    try {
      const extracted = await extractSingle.mutateAsync(result.assets[0]);
      onResult(extracted);
      onClose();
    } catch (err: any) {
      // NOT_A_TICKET (422): show in UI, don't close
      console.warn("Extraction failed:", err?.message);
    }
  }, [extractSingle, onResult, onClose]);

  // ── Link extract ─────────────────────────────────────────────────────────
  const handleExtractLink = useCallback(async () => {
    if (!linkUrl.trim()) return;
    try {
      const extracted = await extractLink.mutateAsync(linkUrl.trim());
      onResult(extracted);
      onClose();
    } catch (err: any) {
      console.warn("Link extraction failed:", err?.message);
    }
  }, [linkUrl, extractLink, onResult, onClose]);

  // ── Batch pick ───────────────────────────────────────────────────────────
  // autoInsert is sent to the backend itself, not handled by re-POSTing
  // /movie-logs per item afterward — see useStartBatchExtraction.
  const handlePickBatch = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    setBatchImageCount(result.assets.length);
    try {
      const { id } = await startBatch.mutateAsync({ images: result.assets, autoInsert });
      setBatchJobId(id);
    } catch (err: any) {
      console.warn("Batch start failed:", err?.message);
    }
  }, [startBatch, autoInsert]);

  // ── Batch progress ───────────────────────────────────────────────────────
  const items = batchJob.data?.items ?? [];
  const total = batchJob.data?.total_items ?? batchImageCount;
  const doneCount = (batchJob.data?.completed_items ?? 0) + (batchJob.data?.failed_items ?? 0);
  const progress = total > 0 ? doneCount / total : 0;
  // "failed" here means the whole batch failed outright (e.g. STALLED) —
  // distinct from an individual item failing, which is a normal, expected
  // per-item outcome that doesn't stop the rest of the batch.
  const isStalled = batchJob.data?.status === "failed" && batchJob.data?.error_code === "STALLED";
  const batchDone = batchJob.data?.status === "completed" || batchJob.data?.status === "failed";
  const successResults = items
    .filter((i) => i.status === "completed" && i.result?.is_ticket)
    .map((i) => i.result as ExtractionResult);

  // ── Provenance ────────────────────────────────────────────────────────────
  const firstResult =
    extractSingle.data ?? extractLink.data ?? (batchJob.data?.items[0]?.result);
  const provenance =
    firstResult && (firstResult.used_provider || firstResult.used_model)
      ? [firstResult.used_provider, firstResult.used_model].filter(Boolean).join(" · ")
      : null;

  // ── Close & reset ────────────────────────────────────────────────────────
  const handleClose = () => {
    setBatchJobId(null);
    setBatchImageCount(0);
    setLinkUrl("");
    extractSingle.reset?.();
    extractLink.reset?.();
    startBatch.reset?.();
    onClose();
  };

  // Inner content shared between web and native renders
  const dialogContent = (
    <>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 18 }}>🎟</Text>
              <Text style={[styles.title, { color: theme.text }]}>AI ticket scan</Text>
            </View>
            <Pressable onPress={handleClose} style={styles.closeBtn}>
              <X size={20} color={theme.text} />
            </Pressable>
          </View>

          {/* Tabs */}
          <View style={styles.segWrapper}>
            <SegmentedControl
              options={[
                { label: "Single", value: "single" },
                { label: `Batch${batchImageCount > 0 ? ` · ${batchImageCount}` : ""}`, value: "batch" },
                { label: "Link", value: "link" },
              ]}
              value={tab}
              onChange={(v) => setTab(v as Tab)}
            />
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
            {/* ── Single tab ─────────────────────────────────────────────────── */}
            {tab === "single" && (
              <View style={styles.scanArea}>
                <Pressable
                  onPress={handlePickSingle}
                  disabled={extractSingle.isPending}
                  style={[
                    styles.pickBtn,
                    { borderColor: theme.accent, backgroundColor: theme.bg },
                  ]}
                >
                  {extractSingle.isPending ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : (
                    <>
                      <Camera size={26} color={theme.accent} />
                      <Text style={[styles.pickBtnText, { color: theme.accent }]}>
                        Choose photo from library
                      </Text>
                    </>
                  )}
                </Pressable>
                {extractSingle.isError && (
                  <Text style={{ color: "#ff4444", textAlign: "center", fontSize: fontSizes.sm }}>
                    {(extractSingle.error as any)?.detail ?? (extractSingle.error as any)?.message ?? "Extraction failed. Make sure it's a valid ticket photo."}
                  </Text>
                )}
              </View>
            )}

            {/* ── Batch tab ──────────────────────────────────────────────────── */}
            {tab === "batch" && (
              <View style={styles.scanArea}>
                {!batchJobId ? (
                  <>
                    {/* Auto-insert toggle */}
                    <View style={styles.autoInsertRow}>
                      <Text style={[styles.autoInsertLabel, { color: theme.text }]}>
                        Auto-create logs
                      </Text>
                      <Switch
                        value={autoInsert}
                        onValueChange={setAutoInsert}
                        trackColor={{ true: theme.accent }}
                      />
                    </View>

                    <Pressable
                      onPress={handlePickBatch}
                      disabled={startBatch.isPending}
                      style={[
                        styles.pickBtn,
                        { borderColor: theme.accent, backgroundColor: theme.bg },
                      ]}
                    >
                      {startBatch.isPending ? (
                        <ActivityIndicator color={theme.accent} />
                      ) : (
                        <>
                          <Camera size={26} color={theme.accent} />
                          <Text style={[styles.pickBtnText, { color: theme.accent }]}>
                            Choose up to 20 photos
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </>
                ) : (
                  <>
                    {/* Progress bar */}
                    <View style={[styles.progressWrap, { backgroundColor: theme.neutral800 }]}>
                      <View
                        style={[
                          styles.progressBar,
                          { width: `${Math.round(progress * 100)}%` as any, backgroundColor: theme.accent },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressLabel, { color: theme.text }]}>
                      {doneCount} / {total} processed
                    </Text>

                    {/* Stalled warning */}
                    {isStalled && (
                      <View style={[styles.stalledBox, { backgroundColor: "#FFB80022" }]}>
                        <WarningCircle size={16} color="#FFB800" />
                        <Text style={[styles.stalledText, { color: "#FFB800" }]}>
                          Taking longer than expected…
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* Item list */}
                {items.length > 0 && (
                  <View style={styles.itemList}>
                    {items.map((item) => {
                      const col = statusColour(item.status, theme.accent);
                      return (
                        <View
                          key={item.id}
                          style={[styles.itemRow, { borderBottomColor: theme.divider }]}
                        >
                          <Ticket size={16} color={theme.text} />
                          <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                            {item.result?.movie ?? item.error_message ?? `Image ${item.position + 1}`}
                          </Text>
                          <View style={[styles.statusChip, { backgroundColor: col.bg }]}>
                            <Text style={[styles.statusText, { color: col.text }]}>
                              {statusLabel(item.status)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ── Link tab ───────────────────────────────────────────────────── */}
            {tab === "link" && (
              <View style={styles.scanArea}>
                <TextInput
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  placeholder="https://tickets.example.com/booking/123"
                  placeholderTextColor={theme.text + "55"}
                  style={{
                    backgroundColor: theme.bg,
                    color: theme.text,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: fontSizes.base,
                    borderWidth: 1,
                    borderColor: theme.divider,
                  }}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Pressable
                  onPress={handleExtractLink}
                  disabled={!linkUrl.trim() || extractLink.isPending}
                  style={[styles.applyBtn, { backgroundColor: theme.accent }]}
                >
                  {extractLink.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.applyBtnText}>Extract from link</Text>
                  )}
                </Pressable>
                {extractLink.isError && (
                  <Text style={{ color: "#ff4444", textAlign: "center", fontSize: fontSizes.sm }}>
                    {(extractLink.error as any)?.detail ?? (extractLink.error as any)?.message ?? "Link extraction failed."}
                  </Text>
                )}
              </View>
            )}

            {/* Provenance attribution */}
            {provenance && (
              <View style={styles.attribution}>
                <Robot size={13} color={theme.text} />
                <Text style={[styles.attributionText, { color: theme.text }]}>{provenance}</Text>
              </View>
            )}
          </ScrollView>

          {/* Dialog actions */}
          <View style={styles.footer}>
            <Pressable onPress={handleClose} style={[styles.cancelBtn, { borderColor: theme.divider }]}>
              <Text style={{ color: `${theme.text}88`, fontSize: fontSizes.base }}>Cancel</Text>
            </Pressable>
            {tab === "batch" && batchDone && successResults.length > 0 ? (
              <Pressable
                onPress={() => {
                  // auto_insert=true means the backend already created
                  // these logs during processing (see each item's own
                  // auto_insert_status/movie_log_id) — nothing left for
                  // the client to do but close. Only re-surface the
                  // results for the caller to create logs from when
                  // auto-insert was off.
                  if (!autoInsert) onBatchResults?.(successResults);
                  handleClose();
                }}
                style={[styles.applyBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.applyBtnText}>
                  {autoInsert
                    ? `Done — ${successResults.length} log${successResults.length !== 1 ? "s" : ""} added`
                    : `Add ${successResults.length} log${successResults.length !== 1 ? "s" : ""}`}
                </Text>
              </Pressable>
            ) : (tab === "batch" && !!batchJobId && !batchDone) ? (
              <View style={[styles.applyBtn, { backgroundColor: theme.neutral800 }]}>
                <ActivityIndicator color={theme.accent} size="small" />
                <Text style={[styles.applyBtnText, { color: theme.text }]}>Processing…</Text>
              </View>
            ) : null}
          </View>
    </>
  );

  // ── Web: centered dialog using CSS classes ────────────────────────────────
  if (Platform.OS === "web" && visible) {
    return (
      <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && handleClose()}>
        <div className="dialog">
          {dialogContent}
        </div>
      </div>
    );
  }

  // ── Native: Modal with centered dialog (not bottom sheet) ─────────────────
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: theme.surface }]}>
          {dialogContent}
        </View>
      </View>
    </Modal>
  );
}
