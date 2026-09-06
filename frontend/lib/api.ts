import axios from "axios";
import { Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * EXPO_PUBLIC_API_URL — the backend server origin, e.g. http://localhost:8000
 * Do NOT include /api/v1 in this env var; it is appended below.
 * Leave blank (or unset) to run in demo/mock mode with no real API calls.
 */
const _rawBase = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

// Tolerate users who accidentally included /api/v1 in the env var.
const BASE_URL = _rawBase
  ? _rawBase.endsWith("/api/v1")
    ? _rawBase
    : `${_rawBase}/api/v1`
  : "http://localhost:8000/api/v1";

/** True when no API URL is configured — components return mock/demo data. */
export const DEMO_MODE = !process.env.EXPO_PUBLIC_API_URL;

export const api = axios.create({ baseURL: BASE_URL });

// Attach Supabase JWT on every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

/**
 * Every backend error response (backend/app/utils/errors.py's `_body`
 * helper — APIError, HTTPException, validation, rate-limit, and the
 * unhandled-exception fallback all funnel through it) is shaped
 * `{ code, message, detail? }`. Call sites used to catch a raw AxiosError
 * and either show `.message` (axios's own generic "Request failed with
 * status code 4xx", not the backend's real message) or reach into
 * `err.response.data.message` by hand, inconsistently, call site by call
 * site. ApiError surfaces the real fields directly and lets error-handling
 * branch on `code` (a stable machine-readable string, e.g.
 * "MISSING_MOVIE_TITLE") instead of parsing `message` text.
 */
export class ApiError extends Error {
  readonly status: number | undefined;
  readonly code: string;
  readonly detail: unknown;

  constructor(message: string, code: string, status?: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

// Normalizes every rejected response onto ApiError. A network failure (no
// response at all — offline, DNS, CORS) has no backend body to read, so it
// falls back to a generic code rather than pretending one exists.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const body = error.response?.data as { code?: string; message?: string; detail?: unknown } | undefined;
      return Promise.reject(
        new ApiError(
          body?.message ?? error.message,
          body?.code ?? "NETWORK_ERROR",
          error.response?.status,
          body?.detail
        )
      );
    }
    return Promise.reject(error);
  }
);

/** Temporarily inject a BYO LLM key header for extraction calls */
export function withLLMKey(key: string) {
  return { headers: { "X-LLM-API-Key": key } };
}

/**
 * POST /movie-metadata/extract and /extract-batch are BOTH real multipart
 * file uploads (ticket_image / ticket_images) — never a JSON body with a
 * base64 string, despite ImagePicker being able to hand back base64
 * directly. Appends one picked image to a FormData under `fieldName`,
 * cross-platform: web's ImagePicker asset.uri is a blob:/data: URL that
 * needs re-fetching into a real Blob before FormData will send it as a
 * file part; native's own FormData accepts the {uri, name, type} shape
 * directly, no fetch needed.
 */
export async function appendTicketImage(
  formData: FormData,
  fieldName: string,
  asset: { uri: string; mimeType?: string; fileName?: string | null },
): Promise<void> {
  const name = asset.fileName || "ticket.jpg";
  const type = asset.mimeType || "image/jpeg";
  if (Platform.OS === "web") {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    formData.append(fieldName, blob, name);
  } else {
    // React Native's FormData accepts this file-descriptor shape directly.
    formData.append(fieldName, { uri: asset.uri, name, type } as unknown as Blob);
  }
}
