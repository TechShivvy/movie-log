import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { supabase } from "../lib/supabase";

const BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL ?? "";

/**
 * Custom base query that:
 *  1. Injects the current Supabase access token as Authorization header.
 *  2. On 401 attempts a silent session refresh then retries once.
 *  3. Maps backend {code, message} error bodies into RTK Query's error shape.
 */
const rawBase = fetchBaseQuery({ baseUrl: `${BACKEND_BASE_URL}/api/v1` });

const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";

  const argsWithAuth: FetchArgs =
    typeof args === "string"
      ? { url: args, headers: { Authorization: `Bearer ${token}` } }
      : {
          ...args,
          headers: {
            ...(args.headers ?? {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        };

  let result = await rawBase(argsWithAuth, api, extraOptions);

  // 401 → try session refresh once then retry
  if (result.error?.status === 401) {
    const { data: refreshData } = await supabase.auth.refreshSession();
    const newToken = refreshData?.session?.access_token;
    if (newToken) {
      const retryArgs: FetchArgs =
        typeof args === "string"
          ? { url: args, headers: { Authorization: `Bearer ${newToken}` } }
          : {
              ...args,
              headers: {
                ...(args.headers ?? {}),
                Authorization: `Bearer ${newToken}`,
              },
            };
      result = await rawBase(retryArgs, api, extraOptions);
    }
  }

  return result;
};

export interface MovieLog {
  id: string;
  user_id: string;
  movie: string | null;
  watched_date: string | null;
  watched_time: string | null;
  timezone_abbrv: string | null;
  theater: string | null;
  seats: string[];
  language: string | null;
  screen: string | null;
  booking_ref: string | null;
  certificate: string | null;
  notes: string | null;
  rating: number | null;
  ticket_image_path: string | null;
  created_at: string;
  updated_at: string;
}

export type MovieLogInput = Omit<
  MovieLog,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type MovieLogUpdate = Partial<MovieLogInput>;

interface ListParams {
  limit?: number;
  offset?: number;
  sort?: "created_at" | "watched_date" | "movie";
  order?: "asc" | "desc";
}

interface ExtractResult {
  movie: string | null;
  date: string | null;
  time: string | null;
  timezone_abbrv: string | null;
  theater: string | null;
  seats: string[];
  language: string | null;
  screen: string | null;
  booking_ref: string | null;
  certificate: string | null;
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: ["MovieLog"],
  endpoints: (builder) => ({
    listMovieLogs: builder.query<MovieLog[], ListParams>({
      query: ({
        limit = 50,
        offset = 0,
        sort = "created_at",
        order = "desc",
      } = {}) => ({
        url: "/movie-logs",
        params: { limit, offset, sort, order },
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "MovieLog" as const, id })),
              { type: "MovieLog", id: "LIST" },
            ]
          : [{ type: "MovieLog", id: "LIST" }],
    }),

    getMovieLog: builder.query<MovieLog, string>({
      query: (id) => `/movie-logs/${id}`,
      providesTags: (_r, _e, id) => [{ type: "MovieLog", id }],
    }),

    createMovieLog: builder.mutation<MovieLog, MovieLogInput>({
      query: (body) => ({ url: "/movie-logs", method: "POST", body }),
      invalidatesTags: [{ type: "MovieLog", id: "LIST" }],
    }),

    updateMovieLog: builder.mutation<
      MovieLog,
      { id: string; patch: MovieLogUpdate }
    >({
      query: ({ id, patch }) => ({
        url: `/movie-logs/${id}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "MovieLog", id }],
    }),

    deleteMovieLog: builder.mutation<void, string>({
      query: (id) => ({ url: `/movie-logs/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "MovieLog", id },
        { type: "MovieLog", id: "LIST" },
      ],
    }),

    exportMovieLogs: builder.query<{ count: number; items: MovieLog[] }, void>({
      query: () => "/movie-logs/export",
    }),

    extractTicketMetadata: builder.mutation<
      ExtractResult,
      {
        imageUri: string;
        mimeType: string;
        ownKey?: string | null;
        model?: string;
      }
    >({
      queryFn: async (
        { imageUri, mimeType, ownKey, model },
        _api,
        _extraOptions,
        baseQuery,
      ) => {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token ?? "";

        const formData = new FormData();

        if (typeof window !== "undefined" && typeof File !== "undefined") {
          // Web: fetch blob and wrap in File
          const resp = await fetch(imageUri);
          const blob = await resp.blob();
          formData.append(
            "ticket_image",
            new File([blob], "ticket.jpg", { type: mimeType }),
          );
        } else {
          // Native
          formData.append("ticket_image", {
            uri: imageUri,
            name: "ticket.jpg",
            type: mimeType,
          } as unknown as Blob);
        }

        if (model) formData.append("model", model);

        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (ownKey?.trim()) headers["X-OpenRouter-API-Key"] = ownKey.trim();

        const result = await baseQuery({
          url: "/movie-metadata/extract",
          method: "POST",
          body: formData,
          headers,
        });

        return result as
          | { data: ExtractResult }
          | { error: FetchBaseQueryError };
      },
    }),

    verifyToken: builder.query<{ user_id: string; email: string | null }, void>(
      {
        query: () => "/auth/me",
      },
    ),
  }),
});

export const {
  useListMovieLogsQuery,
  useGetMovieLogQuery,
  useCreateMovieLogMutation,
  useUpdateMovieLogMutation,
  useDeleteMovieLogMutation,
  useLazyExportMovieLogsQuery,
  useExtractTicketMetadataMutation,
  useVerifyTokenQuery,
} = apiSlice;
