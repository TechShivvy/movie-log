import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import type { Comment } from "../types";

// ─── Comments ────────────────────────────────────────────────────────────────
//
// Comments are a *flat* resource at /api/v1/comments, filtered by
// movie_log_id — NOT nested under /movie-logs/{id}/comments.
// See backend routers/comments.py for the rationale.

export function useComments(logId: string) {
  return useQuery({
    queryKey: ["comments", logId],
    queryFn: async () => {
      if (DEMO_MODE) return [] as Comment[];
      const { data } = await api.get<Comment[]>("/comments", {
        params: { movie_log_id: logId },
      });
      return data;
    },
    enabled: !!logId,
  });
}

export function useAddComment(logId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      text,
      parent_comment_id,
    }: {
      text: string;
      parent_comment_id?: string;
    }) => {
      if (DEMO_MODE) return;
      // Body field is `text` — CommentInput (backend/app/schemas/
      // comments.py) has no `content` field at all.
      await api.post("/comments", {
        movie_log_id: logId,
        text,
        parent_comment_id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", logId] }),
  });
}

export function useLikeComment(logId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      commentId,
      liked,
    }: {
      commentId: string;
      liked: boolean;
    }) => {
      if (DEMO_MODE) return;
      if (liked) {
        // currently liked → DELETE to remove the like
        await api.delete(`/comments/${commentId}/like`);
      } else {
        // not liked yet → POST to add the like
        await api.post(`/comments/${commentId}/like`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comments", logId] }),
  });
}

// ─── Log Likes ───────────────────────────────────────────────────────────────
//
// Likes on a log ARE nested: /api/v1/movie-logs/{log_id}/like
// (movie_logs router registers /{log_id}/like routes).

export function useLikeLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      logId,
      liked,
    }: {
      logId: string;
      liked: boolean;
    }) => {
      if (DEMO_MODE) return;
      if (liked) {
        // currently liked → DELETE
        await api.delete(`/movie-logs/${logId}/like`);
      } else {
        // not liked → POST
        await api.post(`/movie-logs/${logId}/like`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["movie-logs"] }),
  });
}

// ─── Follow / Block ───────────────────────────────────────────────────────────
//
// Follows are at /api/v1/public/follows/{username}  (not /users/{username}/follow)
// Blocks  are at /api/v1/public/blocks/{username}   (not /users/{username}/block)

export function useFollowUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      username,
      following,
    }: {
      username: string;
      following: boolean;
    }) => {
      if (DEMO_MODE) return;
      if (following) {
        // currently following → DELETE to unfollow
        await api.delete(`/public/follows/${username}`);
      } else {
        // not following → POST to follow
        await api.post(`/public/follows/${username}`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      username,
      blocked,
    }: {
      username: string;
      blocked: boolean;
    }) => {
      if (DEMO_MODE) return;
      if (blocked) {
        // currently blocked → DELETE to unblock
        await api.delete(`/public/blocks/${username}`);
      } else {
        // not blocked → POST to block
        await api.post(`/public/blocks/${username}`);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
