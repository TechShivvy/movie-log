import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, DEMO_MODE } from "../lib/api";
import { patchLogInEveryCache } from "./useMovieLogs";
import { useAuth } from "./useAuth";
import type { BlockedUser, Comment, FollowerEntry, MovieLog, PublicProfile, PublicProfileResponse, UserSearchResult } from "../types";

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

// GET /public/users/search — public (no sign-in required), unrestricted by
// privacy state (a private account still turns up, same as searching for a
// private Instagram account would — account_visibility on each result is
// what a caller uses to show a lock indicator before tapping in). Backend
// enforces q.length >= 2 itself (422 below that) and excludes anyone the
// caller has blocked/been blocked by when a bearer token is present — this
// hook doesn't need to duplicate either check, just match the same floor
// so it doesn't fire a request that's guaranteed to 422.
export function useSearchUsers(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["search", "users", q],
    queryFn: async () => {
      const { data } = await api.get<UserSearchResult[]>("/public/users/search", { params: { q } });
      return data;
    },
    enabled: !DEMO_MODE && q.length >= 2,
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

// Mirrors useFollowers above — who this username follows, rather than
// who follows them. Used for the "Following" stat card on a profile
// (own or public); list length is the count, same derive-from-list-
// length reasoning as the followers count (no dedicated count field
// exists anywhere on PublicProfile).
export function useFollowing(username: string | undefined) {
  return useQuery({
    queryKey: ["public-profile", username, "following"],
    queryFn: async () => {
      const { data } = await api.get<FollowerEntry[]>(`/public/users/${username}/following`);
      return data;
    },
    enabled: !DEMO_MODE && !!username,
  });
}

// patchLogInEveryCache moved to hooks/useMovieLogs.ts — it's general-purpose
// (any field patch, not just likes), and useUpdateLog/useArchiveLog there
// now use it too for real onMutate-based optimistic updates. Re-exported
// from there rather than duplicated here.

// ─── Comments ────────────────────────────────────────────────────────────────
//
// Comments are a *flat* resource at /api/v1/comments, filtered by
// movie_log_id — NOT nested under /movie-logs/{id}/comments.
// See backend routers/comments.py for the rationale.

const COMMENTS_PAGE_SIZE = 20;
const COMMENTS_MAX_LIMIT = 100; // GET /comments' own le=100 cap

/**
 * "Load more" grows `limit` and refetches from offset=0 each time,
 * rather than a real cursor/offset-paginated useInfiniteQuery — GET
 * /comments only paginates top-level comments (each one's replies come
 * nested inline, one level, regardless of page), so an offset-based
 * page boundary can land mid-thread. Refetching a growing single page
 * is a few more bytes per "Load more" tap in exchange for never
 * splitting a top-level comment from its own replies, and — just as
 * important — keeps the cache under the exact same `["comments", logId]`
 * key every other comment mutation here already patches directly
 * (useAddComment/useLikeComment/useDeleteComment all setQueryData this
 * literal key); a real useInfiniteQuery's paged `{pages, pageParams}`
 * shape would silently break all of that instant-cache-priming code.
 * hasMore is a heuristic (got back a full page => probably more) since
 * the endpoint returns no total count, same convention reviews lists
 * use elsewhere in this app.
 */
export function useComments(logId: string) {
  const [limit, setLimit] = useState(COMMENTS_PAGE_SIZE);
  const query = useQuery({
    queryKey: ["comments", logId],
    queryFn: async () => {
      if (DEMO_MODE) return [] as Comment[];
      const { data } = await api.get<Comment[]>("/comments", {
        params: { movie_log_id: logId, limit },
      });
      return data;
    },
    enabled: !!logId,
  });
  const { refetch } = query;
  useEffect(() => {
    if (limit > COMMENTS_PAGE_SIZE) refetch();
  }, [limit, refetch]);

  return {
    ...query,
    loadMore: () => setLimit((l) => Math.min(l + COMMENTS_PAGE_SIZE, COMMENTS_MAX_LIMIT)),
    hasMore: (query.data?.length ?? 0) >= limit && limit < COMMENTS_MAX_LIMIT,
  };
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

export function useEditComment(logId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, text }: { commentId: string; text: string }) => {
      if (DEMO_MODE) return undefined;
      const { data } = await api.patch<Comment>(`/comments/${commentId}`, { text });
      return data;
    },
    onSuccess: (updated, { commentId }) => {
      if (!updated) return;
      qc.setQueryData<Comment[]>(["comments", logId], (old) =>
        old ? patchComment(old, commentId, () => updated) : old
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

// "Who liked this" — GET .../likes, added alongside the existing
// POST/DELETE .../like pair (backend commit cfbb60a; not yet confirmed
// live as of this writing — see the backend handoff notes). A single
// page (no "load more" here, unlike comments) — a likes list is a
// lighter, more disposable view than a comment thread, and 50 covers
// the overwhelming majority of logs; can grow into the same
// growing-limit pattern useComments uses if that turns out to matter.
export interface LikeEntry {
  user_id: string;
  username?: string;
  display_name?: string;
  avatar_path?: string;
  liked_at: string;
}

export function useLogLikes(logId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["movie-logs", logId, "likes"],
    queryFn: async () => {
      const { data } = await api.get<LikeEntry[]>(`/movie-logs/${logId}/likes`, { params: { limit: 50 } });
      return data;
    },
    enabled: !DEMO_MODE && !!logId && enabled,
  });
}

export function useCommentLikes(commentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["comments", commentId, "likes"],
    queryFn: async () => {
      const { data } = await api.get<LikeEntry[]>(`/comments/${commentId}/likes`, { params: { limit: 50 } });
      return data;
    },
    enabled: !DEMO_MODE && !!commentId && enabled,
  });
}

// ─── Follow / Block ───────────────────────────────────────────────────────────
//
// Follows are at /api/v1/public/follows/{username}  (not /users/{username}/follow)
// Blocks  are at /api/v1/public/blocks/{username}   (not /users/{username}/block)

// What POST /public/follows/{username} actually returns — the raw
// `follows` row (services/supabase_rest.py's create_follow does a plain
// insert with prefer=return=representation, not a shaped response). The
// one field this hook actually needs is `status`: 'accepted' if the
// target is public, 'pending' otherwise (decided server-side, not
// guessable from account_visibility alone since the router itself is
// the one branching on it — see routers/follows.py's follow_user).
interface FollowRow {
  status: "pending" | "accepted";
}

export function useFollowUser() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({
      username,
      following,
    }: {
      username: string;
      // Despite the name, this is really "do I have ANY existing
      // relationship (pending or accepted) to tear down" — DELETE
      // .../follows/{username} cancels a pending request exactly the
      // same way it unfollows an accepted one (see the route's own
      // description), so the caller only ever needs a single boolean,
      // not a third branch here.
      following: boolean;
    }): Promise<FollowRow | undefined> => {
      if (DEMO_MODE) return undefined;
      if (following) {
        // currently following (or pending) → DELETE to unfollow/cancel
        await api.delete(`/public/follows/${username}`);
        return undefined;
      }
      // not following → POST to follow (or request, if private/followers_only)
      const { data } = await api.post<FollowRow>(`/public/follows/${username}`);
      return data;
    },
    // Real optimistic update, same onMutate/onError shape useLikeLog
    // above already establishes — the Follow button used to only flip
    // after the full round-trip landed. Two things get patched:
    //   1. caller_follow_status on the cached PublicProfileResponse's
    //      `profile` — this is what the button's label/variant ('Follow'/
    //      'Requested'/'Following') actually reads. The backend's own
    //      profile RPC (get_public_profile_by_username) doesn't return
    //      this field yet (no equivalent of is_blocking for follow state
    //      — see the type comment on PublicProfile.caller_follow_status),
    //      so this optimistic write plus onSuccess's reconciliation
    //      against the real POST response is the only source of truth
    //      this button has *at all* right now, not just an optimistic
    //      head start — it doesn't get corrected by a refetch the way
    //      onSuccess's invalidate below quietly assumes for is_blocking.
    //   2. useFollowers's own accepted-followers list — only touched when
    //      the relationship is (or becomes) 'accepted'; a 'pending'
    //      request deliberately never appears there, matching what that
    //      list actually represents server-side.
    onMutate: async ({ username, following }) => {
      const profileKey = ["public-profile", username];
      const followersKey = ["public-profile", username, "followers"];
      await qc.cancelQueries({ queryKey: profileKey });
      await qc.cancelQueries({ queryKey: followersKey });
      const profileSnapshot = qc.getQueryData<PublicProfileResponse>(profileKey);
      const followersSnapshot = qc.getQueryData<FollowerEntry[]>(followersKey);
      const myId = session?.user?.id;

      // following:true means "tear down whatever exists" → always lands
      // on 'none'. following:false means "start one" — optimistically
      // guess 'accepted' for a public account and 'pending' otherwise
      // (mirrors the server's own branch); onSuccess overwrites this
      // guess with the real status the POST actually returned.
      const optimisticStatus: PublicProfile["caller_follow_status"] = following
        ? "none"
        : profileSnapshot?.profile.account_visibility === "public"
        ? "accepted"
        : "pending";

      if (profileSnapshot) {
        qc.setQueryData<PublicProfileResponse>(profileKey, {
          ...profileSnapshot,
          profile: { ...profileSnapshot.profile, caller_follow_status: optimisticStatus },
        });
      }
      if (myId) {
        qc.setQueryData<FollowerEntry[]>(followersKey, (prev = []) => {
          const withoutMe = prev.filter((f) => f.user_id !== myId);
          return optimisticStatus === "accepted"
            ? [...withoutMe, { user_id: myId, followed_at: new Date().toISOString() }]
            : withoutMe;
        });
      }
      return { profileSnapshot, followersSnapshot, profileKey, followersKey };
    },
    onError: (err, _vars, context) => {
      if (!context) return;
      // ALREADY_FOLLOWING means the caller's own outgoing request already
      // exists server-side (pending or accepted) — reached specifically
      // because there's no backend field yet for a fresh page load to
      // know that upfront (see caller_follow_status's own type comment),
      // so the button optimistically showed 'Follow' and the caller just
      // found out that was wrong. Rolling back to the pre-mutation
      // snapshot here would silently put 'Follow' right back — the same
      // wrong state that caused the 409 in the first place, with no way
      // for the caller to ever discover the real status without an
      // unrelated action elsewhere. Settling on 'pending' instead is the
      // correct inference for this specific error: if the relationship
      // were already 'accepted', useFollowers' own list-membership
      // fallback would already have shown 'Following' and this branch
      // would never have been reached at all. Any other error (a real
      // network failure, etc.) still rolls back to the exact snapshot.
      if (err instanceof ApiError && err.code === "ALREADY_FOLLOWING" && context.profileSnapshot) {
        qc.setQueryData<PublicProfileResponse>(context.profileKey, {
          ...context.profileSnapshot,
          profile: { ...context.profileSnapshot.profile, caller_follow_status: "pending" },
        });
        return;
      }
      if (context.profileSnapshot) qc.setQueryData(context.profileKey, context.profileSnapshot);
      qc.setQueryData(context.followersKey, context.followersSnapshot);
    },
    // Reconciles the optimistic guess with the real `status` the POST
    // returned (a DELETE has no body — undefined here just means "none",
    // already set correctly in onMutate). Falls through to the same
    // invalidate as before either way, so any other derived state
    // (follower counts, etc.) still catches up from the server.
    onSuccess: (data, { username }) => {
      if (data?.status) {
        const profileKey = ["public-profile", username];
        qc.setQueryData<PublicProfileResponse>(profileKey, (prev) =>
          prev ? { ...prev, profile: { ...prev.profile, caller_follow_status: data.status } } : prev
        );
      }
      qc.invalidateQueries({ queryKey: ["public-profile", username] });
    },
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
    // Real optimistic update, same shape as useFollowUser/useLikeLog
    // above — unlike following, is_blocking is a plain boolean field on
    // the cached PublicProfileResponse's nested `profile`, so this just
    // flips it in place rather than patching a separate list.
    onMutate: async ({ username, blocked }) => {
      const key = ["public-profile", username];
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<PublicProfileResponse>(key);
      if (snapshot) {
        qc.setQueryData<PublicProfileResponse>(key, {
          ...snapshot,
          profile: { ...snapshot.profile, is_blocking: !blocked },
        });
      }
      return { snapshot, key };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) qc.setQueryData(context.key, context.snapshot);
    },
    // Also invalidates ["blocks"] — the Blocked-accounts settings list —
    // so blocking/unblocking from a profile keeps that screen in sync
    // without a manual refetch.
    onSuccess: (_data, { username }) => {
      qc.invalidateQueries({ queryKey: ["public-profile", username] });
      qc.invalidateQueries({ queryKey: ["blocks"] });
    },
  });
}

// GET /public/blocks — the caller's own blocked accounts. Only the
// blocker can ever see this (blocks RLS) — nothing to gate client-side,
// the backend already scopes it to the signed-in caller.
export function useMyBlocks() {
  return useQuery({
    queryKey: ["blocks"],
    queryFn: async () => {
      const { data } = await api.get<BlockedUser[]>("/public/blocks");
      return data;
    },
    enabled: !DEMO_MODE,
  });
}
