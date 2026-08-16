# Plan: comments/replies, likes, archive tier, and confirming pagination coverage

## Context

Four things off one message:

1. **Comments, reply threads, reactions, sharing** on movie logs — a real gap, nothing like this exists today. Modeled loosely on Reddit's *behavior* (threaded discussion under a post) without copying its *specifics*: no upvote/downvote (a single "like," matching this app's existing Letterboxd-inspired tone, not a two-way voting mechanic prone to pile-on behavior in a small app), no deep infinite nesting (one level of replies, matching Instagram/Letterboxd's shallower model), no literal "[deleted]" sentinel (reuses this codebase's own already-established `edited_at`-style nullable-timestamp pattern instead of inventing new vocabulary).
2. **Terminology audit**: found and fixed 5 places where I'd described existing behavior (account deletion, `edited_at`) using "Reddit-style" language even though the actual product never uses that word or a literal `deleted_user` value — already fixed in a standalone commit before this plan. The same principle governs every name chosen below.
3. **Archive, as a real third tier**: confirmed *not* the same as `private` — `private` content still counts toward theatre/screen/movie aggregates today (deliberate, "venue signal not review content"), which is exactly the behavior archive should *not* have. Archive means genuinely retired: hidden from everyone including the owner's own public presence, and excluded from every aggregate it currently feeds.
4. **Pagination audit**: confirmed already consistent everywhere it matters — every unbounded/growing list endpoint (logs, search, reviews, feed, followers/following, notifications) already takes `limit`/`offset`. The few without it (a theatre's own screen list) are bounded by nature, not an oversight. New comment/reply endpoints follow the same convention below. "Lazy loading" itself is a frontend consumption pattern over this same pagination, not something the backend does differently. No caching layer exists (or is being added here) — premature for an app with no production read traffic yet; flagged as a real "revisit later, not now" rather than silently skipped.

## Phase 1 — Archive: a real third tier, not `private` again

**Commit:** `feat(movie-logs): archive tier — excluded from every aggregate it currently feeds`

- `movie_logs.is_archived boolean not null default false`, independent of `visibility` (a `private` archived log and a `public` archived log are both meaningful states — visibility still governs *who could see it if it weren't archived*, archive is a separate "don't count this anymore" switch).
- Excluded from `public_movie_log_entries`/`feed_entries` (an archived log never appears to anyone but its owner, regardless of visibility) and from `movie_rating_stats`/`theatre_punctuality_stats`/`screen_punctuality_stats` (all three already plain views, a `not is_archived` clause is a one-line addition each).
- `theatre_rating_stats`/`screen_rating_stats` need more care: they're trigger-maintained off `visit_venue_ratings`, not a plain view, and the existing trigger only fires on writes to `visit_venue_ratings` itself — archiving a log doesn't touch that table, so a naive fix would leave stats stale until some unrelated rating write happened to recompute them. Refactoring the core aggregation into a shared `recompute_theatre_and_screen_stats(theatre_id, screen_id)` function, called both by the existing `visit_venue_ratings` trigger *and* a new trigger on `movie_logs` (fires when `is_archived` — or `theatre_id`/`screen_id`, on the rare edit that moves a log to a different venue — actually changes), with `and not ml.is_archived` added to both aggregation queries.
- The owner can still see and un-archive their own archived logs via `GET /movie-logs` (unaffected — this is the owner's own data, not touched) and a new `is_archived` filter/toggle alongside the existing writable fields.

## Phase 2 — Comments and replies

**Commit:** `feat(movie-logs): comments, one level of replies`

- `movie_log_comments`: `id`, `movie_log_id` (`on delete cascade` — same as `visit_venue_ratings`, comments go with their log if the owner deletes it entirely), `user_id` (`on delete set null` — same anonymized-but-kept treatment as the log itself; every comment was necessarily made on an already-public/anonymous-visible log, so there's no "private comment" tier needing pre-deletion the way `movie_logs` itself has), `parent_comment_id` (self-referencing, nullable — null is a top-level comment), `text`, `edited_at` (reusing the exact same nullable-timestamp pattern `movie_logs.edited_at` already established, not a new mechanism), `deleted_at` (same shape — non-null means the text has been cleared; the row stays so replies underneath it don't orphan).
- One level of replies, enforced by a trigger: a comment may only be a reply to a top-level comment, not to another reply. Keeps threading shallow on purpose.
- Deleting a comment always clears `text` and sets `deleted_at` rather than a real `DELETE` — consistent regardless of whether it has replies, so there's one code path instead of a conditional hard/soft split. The frontend decides how to render a `deleted_at`-set comment (its own call, not a backend-dictated string).
- Who can comment: only on a log that's currently `public`/`anonymous`-visible — the same existence check `is_movie_log_reportable` already uses for reports, reused directly rather than re-derived. Blocked pairs (either direction) can't comment on each other's logs, checked the same way blocking already gates follows.
- `GET /movie-logs/{id}/comments` (paginated, top-level comments with their replies nested one level in the same response — no separate "load replies" call needed at this shallow depth), `POST .../comments`, `PATCH .../comments/{id}`, `DELETE .../comments/{id}` (soft, as above).

## Phase 3 — Likes: one reaction, not a vote

**Commit:** `feat(movie-logs): likes on logs and comments`

- `movie_log_likes` / `comment_likes`: `(target_id, user_id)` primary key each, `on delete cascade` on `user_id` — unlike authored content, a like carries no content worth anonymizing-and-keeping once the liker's account is gone; it's simple engagement signal, removed cleanly.
- `movie_logs.like_count` / `movie_log_comments.like_count`, trigger-maintained (`+1`/`-1` on insert/delete of the corresponding likes row) — avoids an `N+1` `COUNT(*)` per row when listing logs/comments, same reasoning that already justified trigger-maintained venue stats over computing them on read.
- `POST/DELETE /movie-logs/{id}/like`, `.../comments/{id}/like` — same visibility/block gating as commenting (can't like what you can't legitimately see).
- No dislike/downvote. A single positive reaction matches Letterboxd's own model (the app's already-cited reference point) and avoids the pile-on dynamics two-way voting invites on a small app.

## Phase 4 — Account deletion, updated

**Commit:** `feat(auth): anonymize comments on account deletion, matching logs`

- No new deletion logic needed for comments specifically — the `on delete set null` on `movie_log_comments.user_id` (Phase 2) already produces the correct outcome automatically, same mechanism already relied on for `movie_logs.user_id`. This phase is verification, not new code: confirm live that a deleted user's comments survive with `user_id: null`, their likes are gone (cascaded), and comments *on* their own (now-anonymized) logs are undisturbed.

## Sharing — no new endpoint

Every log and comment already has a stable, resolvable id — that already *is* the shareable unit, no separate "share" action, count, or tracking table adds anything beyond what a plain link already provides. Flagging this as a deliberate decision, not an oversight.

## Not in scope for this plan

- Editing a comment's own reply-depth (moving a reply to become top-level, or vice versa) — not requested, adds complexity for no clear use case.
- A caching layer (Redis, CDN, HTTP cache headers) — no production read traffic yet to justify it; revisit if that changes, not speculatively now.
- Keyset/cursor-based pagination replacing the existing offset-based convention — a real theoretical consistency edge case at high write-concurrency, but not worth a project-wide pagination rearchitecture at this app's current scale.

## Verification

- **Phase 1**: a theatre with one archived-log rating and one normal one shows only the normal one in `overall`/`punctuality`; archiving a log with an *existing* rating (no new rating write) still correctly drops it from theatre/screen stats on the next read, proving the new `movie_logs` trigger actually fires, not just the pre-existing `visit_venue_ratings` one; an archived log never appears in `GET /movies/{id}/reviews` or a follower's feed regardless of visibility; the owner still sees it in their own `GET /movie-logs`.
- **Phase 2**: a comment and a reply to it round-trip correctly; a reply-to-a-reply is rejected; deleting a commented-on-by-others comment leaves the reply intact with the parent showing cleared text; commenting on a `private` log 404s; a blocked pair can't comment on each other.
- **Phase 3**: liking/unliking moves `like_count` correctly with no `N+1` query per list; liking twice doesn't double-count (primary key conflict, handled cleanly); liking a `private` log 404s.
- **Phase 4**: delete an account that authored comments (some top-level, some replies) on someone else's log — confirm the comments survive with `user_id: null`, their `like_count` unaffected, but their own likes-given are gone.

## Phase 5 — Notifications for comments/likes/report outcomes (follow-up)

Prompted by a direct question after Phase 1-4 shipped: comment/reply visibility was confirmed already correct (gated purely by the log's own `visibility`, independent of either party's `account_visibility` — no change needed, see the "Comment visibility" note below), but nothing notified anyone about a comment, a reply, or a like — the `notifications` table's `type` check only ever had the three follow-related values, and no triggers existed for any of the new Phase 1-4 tables. This phase closes that gap the same way follows already do it: DB triggers only, existing `notifications_select_own`/`_update_own` RLS unchanged (no new grants needed, table-level not column-level), Realtime **not** extended beyond the existing `notifications` publication — comment threads refresh on re-fetch, not live-push; likes are high-volume/low-value to push live and are deliberately excluded from Realtime entirely.

**Commit:** `feat(notifications): comments, likes, and report-outcome notifications`

- `notifications` gains three new nullable target columns — `movie_log_id`, `comment_id`, `report_id` (real FKs, `on delete cascade` each, so a notification never outlives the thing it points at) — rather than one generic polymorphic `(entity_type, entity_id)` pair, so the frontend gets real deep-link ids without a lookup, and Postgres enforces they're not dangling.
- `type` check extended with four values: `new_comment` (someone commented on your log), `comment_reply` (someone replied to your comment), `log_like`, `comment_like`. A fifth, `report_resolved`, is unrelated to comments/likes but was flagged as the one other real "nothing pings the user today" gap while auditing this — a report's own `status` transitioning `open` → `reviewed`/`dismissed` never notified the reporter.
- Four new triggers, same `security definer` shape as `notify_on_follow_change`: `notify_on_comment_insert` (top-level → log owner via `new_comment`; reply → parent comment's author via `comment_reply`), `notify_on_log_like`, `notify_on_comment_like`, `notify_on_report_resolved` (fires on the existing admin-triage `UPDATE`, `WHEN (OLD.status = 'open' AND NEW.status IN ('reviewed','dismissed'))`, `actor_id` left null — an admin action isn't attributed to a specific admin identity in the notification). Every trigger skips self-notification (acting on your own log/comment doesn't notify yourself) and skips a null recipient (content whose author already anonymized-deleted).
- Comment reportability (comments currently have no report path at all — `reports.target_type` doesn't include `comment`) is a related but separate gap, explicitly deferred to its own follow-up rather than bundled in here.

### Comment visibility — confirmed correct, no change

Re-verified directly against the RLS migrations rather than from memory: `is_log_commentable`/the comments views gate purely on the **log's own** `visibility in ('public', 'anonymous')` state — never on the commenter's `account_visibility`, and never on the log author's `account_visibility` either (matching the existing, pre-this-epic precedent theatre/screen/movie reviews already set for `public` logs). If the post is visible, its comments are visible, full stop — already the Reddit-like behavior asked for, nothing to fix.

### Verification

- A comment on someone else's log produces exactly one `new_comment` notification to the log's owner, none to the commenter; commenting on your own log produces none.
- A reply produces exactly one `comment_reply` notification to the parent comment's author (not the log owner, unless they're the same person), none to the replier.
- Liking a log/comment produces exactly one `log_like`/`comment_like` notification to its owner, none to the liker; liking your own log/comment produces none.
- An admin resolving a report produces exactly one `report_resolved` notification to the original reporter, with `actor_id: null`.
- Deleting the log/comment/report a notification points at removes that notification too (FK cascade), rather than leaving a dead deep-link.

## Phase 6 — Notification center readiness: actor identity + content preview (follow-up)

Prompted by a direct question after Phase 5 shipped: "do we have the API to build a real notification center — and is mark-read vs. dismiss decided?" Mark-read (grey out) vs. dismiss (delete) was answered as a recommendation, not a build: grey-out matches how Instagram/Twitter/GitHub/Reddit all treat engagement notifications (likes/comments/follows) — low-stakes, scan-and-move-on, an accidental swipe-delete is a worse failure mode than a slightly longer list — so no `DELETE /notifications/{id}` was added; `read`/`read-all` (already built) covers the real need.

The API gap that *did* need fixing: `GET /notifications` returned a bare `actor_id` uuid with no way to resolve it — no `GET /users/by-id/{id}` endpoint exists (only by username) — and no content preview at all, so a client could not actually render "Alex commented on your log" from the response it had, only from extra per-item round-trips.

**Commit:** `feat(notifications): enrich notifications with actor identity and content preview`

- New `notifications_view`, same pattern as `movie_log_comments_view` (repeats the base table's own RLS filter explicitly, since views run under the view owner's rights) — joins in `actor_username`/`actor_avatar_path` (from `user_settings`, both null once the actor's account is deleted), `movie` (the log's title), `comment_preview` (the comment's current text verbatim — null once soft-deleted, matching `GET /comments`'s own `text: null` shape, not an empty string), and `report_status`.
- `GET /notifications` now reads through the view; `POST /{id}/read` and `POST /read-all` stay on the base table (a multi-join view isn't cleanly updatable) — their response omits the enriched fields, documented explicitly so a client doesn't expect them there.
- Reading the joined `movie_logs`/`movie_log_comments`/`reports` rows under view-owner rights is safe here specifically because every row a caller's own `notifications_view` query can return is already scoped to *their own* notification — previewing "my own log", "my own comment", or "my own filed report" back to its owner is never a cross-user leak the way an arbitrary join would be.

### Verification

- `actor_username`/`actor_avatar_path` resolve once the actor has a username set, null before; `movie`/`comment_preview` populate correctly per notification type.
- Soft-deleting the comment behind an already-existing `new_comment` notification updates its `comment_preview` to `null` on the next read (live join, not a stored snapshot).
- `POST /{id}/read` returns the base row with all five enriched fields `null`, confirmed against the documented behavior.
