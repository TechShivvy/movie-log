import { useMutation, useQuery } from "@tanstack/react-query";
import type { ImagePickerAsset } from "expo-image-picker";
import { api, appendTicketImage, DEMO_MODE, withLLMKey } from "../lib/api";
import type { BatchExtractionJob, ExtractionResult } from "../types";

// POST /movie-metadata/extract and /extract-batch are both real multipart
// file uploads (see lib/api.ts's appendTicketImage) — never a JSON body
// with a base64 string.

// ─── Single ticket (photo) ────────────────────────────────────────────────

export function useExtractTicket(llmKey?: string) {
  return useMutation({
    mutationFn: async (asset: ImagePickerAsset): Promise<ExtractionResult> => {
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 1200));
        return {
          is_ticket: true,
          movie: "Demo Movie",
          theater: "Demo Cinema",
          watched_date: new Date().toISOString().split("T")[0],
          format: "IMAX",
          seats: ["G12"],
          used_provider: "demo",
          used_model: "mock",
          requested_model: "mock",
          fallback_occurred: false,
        };
      }
      const formData = new FormData();
      await appendTicketImage(formData, "ticket_image", asset);
      const { data } = await api.post<ExtractionResult>(
        "/movie-metadata/extract",
        formData,
        llmKey ? withLLMKey(llmKey) : undefined,
      );
      return data;
    },
  });
}

// ─── Ticket from URL ──────────────────────────────────────────────────────

export function useExtractTicketFromLink(llmKey?: string) {
  return useMutation({
    mutationFn: async (url: string): Promise<ExtractionResult> => {
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 800));
        return {
          is_ticket: true,
          movie: "Demo Movie (Link)",
          theater: "Cinema Hall",
          watched_date: new Date().toISOString().split("T")[0],
          format: "Standard",
          seats: [],
          used_provider: "demo",
          used_model: "mock",
          requested_model: "mock",
          fallback_occurred: false,
        };
      }
      const { data } = await api.post<ExtractionResult>(
        "/movie-metadata/extract-from-link",
        { url },
        llmKey ? withLLMKey(llmKey) : undefined,
      );
      return data;
    },
  });
}

// ─── Batch extraction (≤20 images) ────────────────────────────────────────
//
// auto_insert is sent to the backend itself — when true, each successfully
// extracted item is inserted into movie_logs server-side during
// processing (see each item's own auto_insert_status/movie_log_id on the
// polled job below). The client never separately POSTs /movie-logs for a
// batch result the way it does for a manually-reviewed single extraction.

export function useStartBatchExtraction(llmKey?: string) {
  return useMutation({
    mutationFn: async ({
      images,
      autoInsert = false,
    }: {
      images: ImagePickerAsset[];
      autoInsert?: boolean;
    }): Promise<{ id: string }> => {
      if (DEMO_MODE) {
        return { id: `demo-job-${Date.now()}` };
      }
      const formData = new FormData();
      await Promise.all(images.map((asset) => appendTicketImage(formData, "ticket_images", asset)));
      formData.append("auto_insert", autoInsert ? "true" : "false");
      const { data } = await api.post<{ id: string; status: "processing"; total_items: number }>(
        "/movie-metadata/extract-batch",
        formData,
        llmKey ? withLLMKey(llmKey) : undefined,
      );
      return { id: data.id };
    },
  });
}

// ─── Poll batch job status ─────────────────────────────────────────────────

export function useBatchJobStatus(batchId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["batch-extraction", batchId],
    queryFn: async (): Promise<BatchExtractionJob> => {
      if (DEMO_MODE || !batchId) {
        // Simulate a finished demo batch.
        const items = Array.from({ length: 3 }, (_, i) => ({
          id: `demo-item-${i}`,
          position: i,
          status: "completed" as const,
          result: {
            is_ticket: true,
            movie: `Demo Film ${i + 1}`,
            theater: "Mock Cinema",
            watched_date: new Date().toISOString().split("T")[0],
            format: "IMAX",
            seats: [],
            used_provider: "demo",
            used_model: "mock",
            requested_model: "mock",
            fallback_occurred: false,
          },
        }));
        return {
          id: batchId ?? "demo",
          status: "completed",
          provider: "demo",
          model: "mock",
          auto_fallback: false,
          auto_insert: false,
          total_items: items.length,
          completed_items: items.length,
          failed_items: 0,
          created_at: new Date().toISOString(),
          items,
        };
      }
      const { data } = await api.get<BatchExtractionJob>(
        `/movie-metadata/extract-batch/${batchId}`,
      );
      return data;
    },
    enabled: !!batchId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "completed" || status === "failed") return false;
      return 1500; // poll every 1.5 s while processing
    },
  });
}
