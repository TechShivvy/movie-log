import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { api, DEMO_MODE } from "../lib/api";
import type { Comment, FollowerEntry, MovieLog, PublicProfileResponse } from "../types";

// ─── Public profile ─────────────────────────────────────────────────────────

export function usePublicProfile(username: string | undefined) {
  return useQuery({
    queryKey: ["public-profile", username],
    queryFn: async () => {
      const { data } = await api.get<PublicProfileResponse>(`/public/users/${username}`);
      return data;
    },
    enabled: !DEMO_MODE && !!username,
  });
}

/**
 * No endpoint answers "am I already following this person" directly —
 * the accepted-follow relationship has to be derived from their
 * followers list (an accepted follow means the caller's own user_id
 * shows up in it; a pending request wouldn't yet, which is an accepted
 * simplification for this pass, not a bug to chase down further right
 * now). Used to decide the Follow/Following button's initial state on
 * PublicProfileScreen.
 */
export function useFollowers(username: string | undefined) {
  return useQuery({
    queryKey: ["public-profile", username, "followers"],
    queryFn: async () => {
      const { data } = await api.get<FollowerEntry[]>(`/public/users/${username}/followers`);
      return data;
    },
    enabled: !DEMO_MODE && !!username,
  });
}

/**
 * A liked/logged-in-cache MovieLog can be sitting in any number of
 * differently-shaped query caches at once — its own detail query, the
 * caller's own filtered lists, the follow feed, a movie's/theatre's/
 * screen's public reviews — and none of those know about each other.
 * Rather than hand-enumerate every prefix (the exact bug this replaces:
 * the old code only ever invalidated ["movie-logs"], which doesn't even
 * prefix-match ["feed",...], so liking from the feed never updated
 * anything), this walks every currently-cached query and patches this
 * log wherever it's actually sitting — single-object caches (the detail
 * query) and array caches (every list/feed/reviews shape) alike. The
 * `"like_count" in` shape check is what keeps this from touching an
 * unrelated cache entry that happens to share an `id` field (a Theatre,
 * a Comment, ...). Returns a snapshot for onError to roll back to.
 */
function patchLogInEveryCache(
  qc: QueryClient,
  logId: string,
  patch: (log: MovieLog) => MovieLog
): Array<{ queryKey: QueryKey; data: unknown }> {
  const snapshot: Array<{ queryKey: QueryKey; data: unknown }> = [];
  for (const query of qc.getQueryCache().getAll()) {
    const data = query.state.data as unknown;
    if (Array.isArray(data)) {
      const idx = data.findIndex((item) => item && typeof item === "object" && (item as any).id === logId && "like_count" in item);
      if (idx === -1) continue;
      snapshot.push({ queryKey: query.queryKey, data });
      const next = data.slice();
      next[idx] = patch(next[idx] as MovieLog);
      qc.setQueryData(query.queryKey, next);
    } else if (data && typeof data === "object" && (data as any).id === logId && "like_count" in data) {
      snapshot.push({ queryKey: query.queryKey, data });
      qc.setQueryData(query.queryKey, patch(data as MovieLog));
    }
  }
  return snapshot;
}

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
    }): Promise<Comment | undefined> => {
      if (DEMO_MODE) return undefined;
      // Body field is `text` — CommentInput (backend/app/schemas/
      // comments.py) has no `content` field at all. Was discarding the
      // POST response entirely (bare `await`) even though it's the full
      // created comment, so a typed comment vanished from the input and
      // only reappeared after the full list refetch landed.
      const { data } = await api.post<Comment>("/comments", {
        movie_log_id: logId,
        text,
        parent_comment_id,
      });
      return data;
    },
    // Appends the new comment directly instead of invalidate-and-wait —
    // a reply nests into its parent's `.replies`, a top-level comment
    // appends to the end (newest-last, matching how the list already
    // renders). Still invalidates in the background since like_count/
    // liked_by_caller on the *parent* thread or any server-side
    // ordering nuance isn't something this local append can know about.
    onSuccess: (comment, { parent_comment_id }) => {
      if (!comment) return;
      qc.setQueryData<Comment[]>(["comments", logId], (old) => {
        if (!old) return old;
        if (!parent_comment_id) return [...old, comment];
        return old.map((c) =>
          c.id === parent_comment_id ? { ...c, replies: [...(c.replies ?? []), comment] } : c
        );
      });
      qc.invalidateQueries({ queryKey: ["comments", logId] });
    },
  });
}

// Comments (unlike logs) only ever live in one cache shape — ["comments",
// logId], a flat array with each top-level comment's own replies nested
// one level inside it (Comment.replies) — so this doesn't need the
// generic multi-cache scan useLikeLog's patchLogInEveryCache does; it
// just needs to check both levels of that one query's data.
function patchComment(comments: Comment[], commentId: string, patch: (c: Comment) => Comment): Comment[] {
  return comments.map((c) => {
    if (c.id === commentId) return patch(c);
    if (c.replies?.some((r) => r.id === commentId)) {
      return { ...c, replies: c.replies.map((r) => (r.id === commentId ? patch(r) : r)) };
    }
    return c;
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
    onMutate: async ({ commentId, liked }) => {
      const nextLiked = !liked;
      const queryKey = ["comments", logId];
      const previous = qc.getQueryData<Comment[]>(queryKey);
      if (previous) {
        qc.setQueryData<Comment[]>(queryKey, patchComment(previous, commentId, (c) => ({
          ...c,
          liked_by_caller: nextLiked,
          like_count: Math.max(0, (c.like_count ?? 0) + (nextLiked ? 1 : -1)),
        })));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(["comments", logId], context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["comments", logId] }),
  });
}

/**
 * DELETE /comments/{id} is a soft delete server-side — the row stays
 * (deleted_at set, text nulled) so replies don't orphan, per Comment's
 * own type comment. Patches that same shape into the cache directly
 * (not a remove-from-list, unlike useDeleteLog — the row is still there,
 * it just now needs to render as "[deleted]") so the placeholder shows
 * immediately instead of after a refetch.
 */
export function useDeleteComment(logId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (commentId: string) => {
      if (DEMO_MODE) return;
      await api.delete(`/comments/${commentId}`);
    },
    onSuccess: (_data, commentId) => {
      qc.setQueryData<Comment[]>(["comments", logId], (old) =>
        old ? patchComment(old, commentId, (c) => ({ ...c, text: undefined, deleted_at: new Date().toISOString() })) : old
      );
      qc.invalidateQueries({ queryKey: ["comments", logId] });
    },
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
    // Real optimistic update — the heart/count used to only move after a
    // full round-trip + refetch, and (separate bug) the old
    // invalidateQueries(["movie-logs"]) key doesn't prefix-match
    // ["feed",...] or the reviews-endpoint keys at all, so liking from
    // the feed or a reviews list never updated the UI until something
    // unrelated happened to remount that query. onMutate flips the like
    // everywhere this log is currently cached; onError rolls back to the
    // exact snapshot if the request fails; onSettled reconciles with the
    // server regardless of outcome.
    // No cancelQueries here deliberately — the set of queries this log
    // could be sitting in isn't known up front (that's the whole reason
    // patchLogInEveryCache scans dynamically instead of listing prefixes),
    // so there's no single key to target a cancel at without cancelling
    // every in-flight request in the app. The narrow race this normally
    // guards against (an in-flight refetch of the same query resolving
    // right after this optimistic write and overwriting it with
    // pre-like data) just means a brief flicker back until onSettled's
    // invalidate corrects it again — worth it to avoid the alternative.
    onMutate: async ({ logId, liked }) => {
      const nextLiked = !liked;
      const snapshot = patchLogInEveryCache(qc, logId, (log) => ({
        ...log,
        liked_by_caller: nextLiked,
        like_count: Math.max(0, log.like_count + (nextLiked ? 1 : -1)),
      }));
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      context?.snapshot.forEach(({ queryKey, data }) => qc.setQueryData(queryKey, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["movie-logs"] });
      qc.invalidateQueries({ queryKey: ["feed"] });
      // Catches every movie/theatre/screen reviews query regardless of
      // which entity id it's scoped to — a targeted prefix per entity
      // type would need to know that id here, which this mutation's
      // variables (just logId/liked) don't carry.
      qc.invalidateQueries({ predicate: (q) => q.queryKey.includes("reviews") });
    },
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
    // Was invalidating ["profile"] — a key nothing in this codebase
    // actually queries under (usePublicProfile uses ["public-profile",
    // username]), so this never invalidated anything real. The prefix
    // here also covers useFollowers's ["public-profile", username,
    // "followers"] key, which is what the Follow/Following button's
    // state is actually derived from.
    onSuccess: (_data, { username }) => qc.invalidateQueries({ queryKey: ["public-profile", username] }),
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
    onSuccess: (_data, { username }) => qc.invalidateQueries({ queryKey: ["public-profile", username] }),
  });
}
