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

function statusColour(status: BatchExtractionItem["status"], accent: string) {
  switch (status) {
    case "done": return { bg: "#4caf7a22", text: "#4caf7a" };
    case "error": return { bg: "#ff000022", text: "#ff4444" };
    case "processing": return { bg: accent + "22", text: accent };
    default: return { bg: "#88888822", text: "#888888" };
  }
}

function statusLabel(status: BatchExtractionItem["status"]) {
  switch (status) {
    case "done": return "Read ✓";
    case "error": return "Error";
    case "processing": return "Reading…";
    default: return "Queued";
  }
}

// ─── Convert ImagePicker result to base64 ────────────────────────────────────

async function toBase64(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (asset.base64) return asset.base64;
  // Fallback: fetch and convert (web only usually)
  const res = await fetch(asset.uri);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function AITicketModal({ visible, llmKey, onClose, onResult, onBatchResults }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>("single");
  const [linkUrl, setLinkUrl] = useState("");
  const [autoInsert, setAutoInsert] = useState(false);
  const [batchJobId, setBatchJobId] = useState<string | null>(null);
  const [batchImages, setBatchImages] = useState<string[]>([]);

  const extractSingle = useExtractTicket(llmKey);
  const extractLink = useExtractTicketFromLink(llmKey);
  const startBatch = useStartBatchExtraction(llmKey);
  const batchJob = useBatchJobStatus(batchJobId, tab === "batch" && !!batchJobId);

  // ── Single pick ──────────────────────────────────────────────────────────
  const handlePickSingle = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    try {
      const b64 = await toBase64(result.assets[0]);
      const extracted = await extractSingle.mutateAsync(b64);
      onResult(extracted);
      onClose();
    } catch (err: any) {
      // NOT_A_TICKET: show in UI, don't close
      console.warn("Extraction failed:", err?.response?.data?.detail ?? err?.message);
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
      console.warn("Link extraction failed:", err?.response?.data?.detail ?? err?.message);
    }
  }, [linkUrl, extractLink, onResult, onClose]);

  // ── Batch pick ───────────────────────────────────────────────────────────
  const handlePickBatch = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 20,
      quality: 0.8,
    });
    if (result.canceled || !result.assets.length) return;
    const b64s = await Promise.all(result.assets.map(toBase64));
    setBatchImages(b64s);
    try {
      const { job_id } = await startBatch.mutateAsync({ images: b64s, autoInsert });
      setBatchJobId(job_id);
    } catch (err: any) {
      console.warn("Batch start failed:", err?.message);
    }
  }, [startBatch, autoInsert]);

  // ── Batch progress ───────────────────────────────────────────────────────
  const items = batchJob.data?.items ?? [];
  const total = batchJob.data?.total ?? batchImages.length;
  const doneCount = batchJob.data?.done_count ?? items.filter((i) => i.status === "done").length;
  const progress = total > 0 ? doneCount / total : 0;
  const isStalled = batchJob.data?.status === "stalled";
  const batchDone = batchJob.data?.status === "done";
  const successResults = items
    .filter((i) => i.status === "done" && i.result?.is_ticket)
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
    setBatchImages([]);
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
                { label: `Batch${batchImages.length > 0 ? ` · ${batchImages.length}` : ""}`, value: "batch" },
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
                  <Text style={{ color: "#ff4444", textAlign: "center", fontSize: 13 }}>
                    {(extractSingle.error as any)?.response?.data?.detail ?? "Extraction failed. Make sure it's a valid ticket photo."}
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
                          key={item.image_index}
                          style={[styles.itemRow, { borderBottomColor: theme.divider }]}
                        >
                          <Ticket size={16} color={theme.text} />
                          <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
                            {item.result?.movie_title ?? item.error ?? `Image ${item.image_index + 1}`}
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
                    fontSize: 14,
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
                  <Text style={{ color: "#ff4444", textAlign: "center", fontSize: 13 }}>
                    {(extractLink.error as any)?.response?.data?.detail ?? "Link extraction failed."}
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
              <Text style={{ color: `${theme.text}88`, fontSize: 14 }}>Cancel</Text>
            </Pressable>
            {tab === "batch" && batchDone && successResults.length > 0 ? (
              <Pressable
                onPress={() => { onBatchResults?.(successResults); handleClose(); }}
                style={[styles.applyBtn, { backgroundColor: theme.accent }]}
              >
                <Text style={styles.applyBtnText}>
                  Add {successResults.length} log{successResults.length !== 1 ? "s" : ""}
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
