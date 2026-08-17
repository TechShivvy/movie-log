import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import type { ExtractionResult, BatchExtractionJob } from "../types";

// ─── Single ticket (base64 photo) ────────────────────────────────────────────

export function useExtractTicket(llmKey?: string) {
  return useMutation({
    mutationFn: async (imageBase64: string): Promise<ExtractionResult> => {
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 1200));
        return {
          movie_title: "Demo Movie",
          venue_name: "Demo Cinema",
          date: new Date().toISOString().split("T")[0],
          format: "IMAX",
          seat: "G12",
          is_ticket: true,
          used_provider: "demo",
          used_model: "mock",
        };
      }
      const headers = llmKey ? { "X-LLM-API-Key": llmKey } : {};
      const { data } = await api.post<ExtractionResult>(
        "/movie-metadata/extract",
        { image_base64: imageBase64 },
        { headers },
      );
      return data;
    },
  });
}

// ─── Ticket from URL ──────────────────────────────────────────────────────────

export function useExtractTicketFromLink(llmKey?: string) {
  return useMutation({
    mutationFn: async (url: string): Promise<ExtractionResult> => {
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 800));
        return {
          movie_title: "Demo Movie (Link)",
          venue_name: "Cinema Hall",
          date: new Date().toISOString().split("T")[0],
          format: "Standard",
          is_ticket: true,
          used_provider: "demo",
          used_model: "mock",
        };
      }
      const headers = llmKey ? { "X-LLM-API-Key": llmKey } : {};
      const { data } = await api.post<ExtractionResult>(
        "/movie-metadata/extract-from-link",
        { url },
        { headers },
      );
      return data;
    },
  });
}

// ─── Batch extraction (≤20 images) ───────────────────────────────────────────

export function useStartBatchExtraction(llmKey?: string) {
  return useMutation({
    mutationFn: async ({
      images,
      autoInsert = false,
    }: {
      images: string[];
      autoInsert?: boolean;
    }): Promise<{ job_id: string }> => {
      if (DEMO_MODE) {
        return { job_id: `demo-job-${Date.now()}` };
      }
      const headers = llmKey ? { "X-LLM-API-Key": llmKey } : {};
      const { data } = await api.post<{ job_id: string }>(
        "/movie-metadata/extract-batch",
        { images, auto_insert: autoInsert },
        { headers },
      );
      return data;
    },
  });
}

// ─── Poll batch job status ────────────────────────────────────────────────────

export function useBatchJobStatus(jobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["batch-extraction", jobId],
    queryFn: async (): Promise<BatchExtractionJob> => {
      if (DEMO_MODE || !jobId) {
        // Simulate incremental completion for demo
        const items = Array.from({ length: 3 }, (_, i) => ({
          image_index: i,
          status: "done" as const,
          result: {
            movie_title: `Demo Film ${i + 1}`,
            venue_name: "Mock Cinema",
            date: new Date().toISOString().split("T")[0],
            format: "IMAX",
            is_ticket: true,
          },
        }));
        return { job_id: jobId ?? "demo", status: "done", total: items.length, done_count: items.length, items };
      }
      const { data } = await api.get<BatchExtractionJob>(
        `/movie-metadata/extract-batch/${jobId}`,
      );
      return data;
    },
    enabled: !!jobId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "done" || status === "stalled") return false;
      return 1500; // poll every 1.5 s while pending / processing
    },
  });
}
