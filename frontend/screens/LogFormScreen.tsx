/**
 * LogFormScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:1000px):
 *   Header row: "Add new entry" kicker + "Log a screening" h1 | Discard + Save btns
 *   Two-column: 260px poster col + flex:1 form
 *     Poster col: aspect-ratio:2/3 dashed border + camera-plus icon
 *                 + "AI ticket extraction" card below
 *     Form: grid-template-columns:1fr 1fr; gap:16px
 *       Full-width: movie title search, format chips, rating, notes textarea,
 *                   FDFS toggle, visibility seg
 *       Half-width pairs: venue+screen, seat+arrival status
 *
 * Mobile layout (stacked, gap:14px):
 *   96px poster thumbnail + AI scan btn on same row
 *   All fields vertical
 */
import React, { useState, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraPlus, Robot, Sparkle, ArrowLeft, X } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useCreateLog, useUpdateLog, useMovieLog } from "../hooks/useMovieLogs";
import { useMovieSearch, useVenueSearch, useCreateMovie, useMovie } from "../hooks/useSearch";
import { useVenueRating, useUpsertVenueRating } from "../hooks/useVenueRating";
import { useToast } from "../context/ToastContext";
import { StarRating } from "../components/ui/StarRating";
import { Input } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { AITicketModal } from "../modals/AITicketModal";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import type {
  Format,
  LogVisibility,
  ArrivalStatus,
  ScreeningStartStatus,
  MovieLog,
  MovieSearchResult,
  TheatreMatchCandidate,
  ExtractionResult,
} from "../types";

const FORMATS: Format[] = ["IMAX", "4DX", "Dolby", "ScreenX", "Laser", "PLF", "Standard"];
// LogVisibility is "private" | "anonymous" | "public" — there is no
// "followers_only" at the log level (that's the distinct account-level
// AccountVisibility).
const VISIBILITY_OPTS = [
  { label: "Public",    value: "public" },
  { label: "Anonymous", value: "anonymous" },
  { label: "Private",   value: "private" },
];
const ARRIVAL_OPTS = [
  { label: "Early",   value: "early" },
  { label: "On-time", value: "on_time" },
  { label: "Late",    value: "late" },
];
const SCREENING_START_OPTS = [
  { label: "Early",     value: "early" },
  { label: "On-time",   value: "on_time" },
  { label: "Delayed",   value: "delayed" },
  { label: "Cancelled", value: "cancelled" },
];

function todayIso(): string {
  // watched_date is a plain YYYY-MM-DD, not an instant — building it from
  // getFullYear/Month/Date (local calendar fields) rather than
  // toISOString() (which is UTC and can land on the wrong side of
  // midnight local time) keeps "today" meaning the day the device says it
  // is right now, not UTC's version of it.
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  movieTitle:     string;
  // Resolved from a TMDB search hit via POST /movies (useCreateMovie) —
  // dedupes into the catalog and comes back with a real id, which is what
  // actually gets sent as MovieLogInput.movie_id. Previously nothing set
  // movie_id at all (MovieSearchResult only carries a tmdb_id, not a
  // catalog UUID), so the poster preview shown while picking a title never
  // survived past this form — nothing about it was ever saved.
  movieId:        string | undefined;
  moviePosterUrl: string | undefined;
  rating:         number;
  format:         Format | undefined;
  venueId:        string | undefined;
  venueName:      string;
  screenNumber:   string;
  // Free-typed, comma-separated — split into MovieLogInput.seats (string[])
  // on submit. The real backend has no single "seat" field.
  seat:           string;
  isFdfs:         boolean;
  // is_fdfs implies is_first_day server-side (schemas/movie_logs.py's
  // _fdfs_implies_first_day) — kept as a separate toggle here too, for the
  // "opening day, but I wasn't at the very first show" case FDFS alone
  // can't express.
  isFirstDay:     boolean;
  arrivalStatus:  ArrivalStatus;
  // Free text, parsed to a number on submit — only meaningful (and only
  // sent) alongside early/late, same rule the backend itself enforces.
  arrivalDeltaMinutes: string;
  screeningStartStatus: ScreeningStartStatus | undefined;
  screeningStartDeltaMinutes: string;
  visibility:     LogVisibility;
  notes:          string;
  watchedDate:    string; // YYYY-MM-DD
  watchedTime:    string; // HH:MM, 24h
  language:       string;
  certificate:    string;
  price:          string; // free text, parsed to a number on submit
  currency:       string; // ISO 4217, e.g. "INR"
  bookingRef:     string;
  // Venue sub-ratings — a separate visit_venue_ratings row, keyed by this
  // log's id, not a MovieLogInput field. 0 means "not rated" the same way
  // rating does; only sent (via a follow-up PUT after the log itself
  // saves) when at least one of the four is non-zero.
  screenRating:   number;
  speakerRating:  number;
  acRating:       number;
  seatRating:     number;
}

const BLANK_FORM: FormState = {
  movieTitle: "", movieId: undefined, moviePosterUrl: undefined, rating: 0, format: undefined,
  venueId: undefined, venueName: "", screenNumber: "", seat: "",
  isFdfs: false, isFirstDay: false,
  arrivalStatus: "on_time", arrivalDeltaMinutes: "",
  screeningStartStatus: undefined, screeningStartDeltaMinutes: "",
  visibility: "public", notes: "",
  watchedDate: todayIso(), watchedTime: "", language: "", certificate: "",
  price: "", currency: "", bookingRef: "",
  screenRating: 0, speakerRating: 0, acRating: 0, seatRating: 0,
};

/** Existing log -> form state, for edit mode. Inverse of buildPayload below. */
function logToFormState(log: MovieLog): FormState {
  return {
    movieTitle: log.movie ?? "",
    movieId: log.movie_id,
    moviePosterUrl: undefined, // resolved separately if movie_id is set — see the edit-mode effect
    rating: log.rating ?? 0,
    format: log.format,
    venueId: log.theatre_id,
    venueName: log.theater ?? "",
    screenNumber: log.screen ?? "",
    seat: log.seats?.join(", ") ?? "",
    isFdfs: log.is_fdfs,
    isFirstDay: log.is_first_day,
    arrivalStatus: log.arrival_status ?? "on_time",
    arrivalDeltaMinutes: log.arrival_delta_minutes != null ? String(log.arrival_delta_minutes) : "",
    screeningStartStatus: log.screening_start_status,
    screeningStartDeltaMinutes: log.screening_start_delta_minutes != null ? String(log.screening_start_delta_minutes) : "",
    visibility: log.visibility,
    notes: log.notes ?? "",
    watchedDate: log.watched_date ?? todayIso(),
    watchedTime: log.watched_time ?? "",
    language: log.language ?? "",
    certificate: log.certificate ?? "",
    price: log.price != null ? String(log.price) : "",
    currency: log.currency ?? "",
    bookingRef: log.booking_ref ?? "",
    // Venue ratings live in a separate table, keyed by log id — not
    // available on the MovieLog object itself. Merged in separately by
    // the edit-mode venue-rating effect once useVenueRating(editId) loads.
    screenRating: 0, speakerRating: 0, acRating: 0, seatRating: 0,
  };
}

// ─── Web poster column ────────────────────────────────────────────────────────

function WebPosterCol({
  posterUrl, movieTitle, onAIScan, theme,
}: {
  posterUrl: string | undefined;
  movieTitle: string;
  onAIScan: () => void;
  theme: any;
}) {
  return (
    <div style={{ width: 260, flexShrink: 0 } as React.CSSProperties}>
      {/* Poster frame: aspect-ratio:2/3, dashed border */}
      <div style={{
        aspectRatio: "2/3",
        borderRadius: 12,
        borderWidth: 2,
        border: `2px dashed ${theme.divider}`,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: posterUrl
          ? `url(${posterUrl}) center/cover no-repeat`
          : theme.surfaceHigh,
        position: "relative",
      } as React.CSSProperties}>
        {!posterUrl && (
          <div style={{ textAlign: "center", padding: 20 } as React.CSSProperties}>
            <CameraPlus size={40} color={theme.text + "44"} />
            <p style={{ color: `${theme.text}44`, fontSize: 12, marginTop: 10, lineHeight: 1.4 } as React.CSSProperties}>
              Poster will appear here
            </p>
          </div>
        )}
      </div>

      {/* AI ticket extraction card */}
      <div
        className="card"
        style={{ marginTop: 14, gap: 10 } as React.CSSProperties}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties}>
          <Sparkle size={15} color={theme.accent} />
          <span style={{ fontSize: 13, fontWeight: 600, color: theme.text } as React.CSSProperties}>
            AI ticket extraction
          </span>
        </div>
        <p style={{ fontSize: 12, color: `${theme.text}66`, lineHeight: 1.5, margin: 0 } as React.CSSProperties}>
          Scan your movie ticket to auto-fill this form.
        </p>
        <button className="btn btn-secondary btn-block" onClick={onAIScan} style={{ marginTop: 4 } as React.CSSProperties}>
          <Robot size={14} color={theme.text} />
          Scan ticket
        </button>
      </div>
    </div>
  );
}

// ─── Web form grid ────────────────────────────────────────────────────────────

function WebForm({
  fs,
  errors,
  isPending,
  movieQuery,
  movieSuggestions,
  venueQuery,
  venueSuggestions,
  showMovieSuggestions,
  showVenueSuggestions,
  setMovieQuery,
  setVenueQuery,
  pickMovie,
  pickVenue,
  setFs,
  setErrors,
  handleSubmit,
  router,
  theme,
}: any) {
  return (
    <div style={{ flex: 1, minWidth: 0 } as React.CSSProperties}>
      {/* 2-col form grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
      } as React.CSSProperties}>

        {/* Movie title — full width */}
        <div className="field" style={{ gridColumn: "1/-1" } as React.CSSProperties}>
          <label>Movie title</label>
          <input
            className={`input${errors.movieTitle ? " error" : ""}`}
            value={movieQuery}
            placeholder="Search or type movie title…"
            onChange={(e) => {
              setMovieQuery(e.target.value);
              setFs((p: FormState) => ({ ...p, movieTitle: e.target.value }));
              setErrors((p: any) => ({ ...p, movieTitle: undefined }));
            }}
            autoComplete="off"
          />
          {errors.movieTitle && (
            <span style={{ color: "var(--color-error)", fontSize: 12 } as React.CSSProperties}>{errors.movieTitle}</span>
          )}
          {/* Movie suggestions */}
          {showMovieSuggestions && (movieSuggestions?.length ?? 0) > 0 && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "var(--color-surface)",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              zIndex: 100,
              overflow: "hidden",
              marginTop: 4,
            } as React.CSSProperties}>
              {movieSuggestions.map((m: MovieSearchResult) => (
                <div
                  key={m.tmdb_id}
                  onClick={() => pickMovie(m)}
                  style={{
                    padding: "10px 14px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--color-divider)",
                    fontSize: 14,
                    color: "var(--color-text)",
                  } as React.CSSProperties}
                  className="tapc"
                >
                  {m.title}
                  {releaseYear(m.release_date) && (
                    <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 } as React.CSSProperties}>
                      {releaseYear(m.release_date)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rating — full width */}
        <div className="field" style={{ gridColumn: "1/-1" } as React.CSSProperties}>
          <label>Rating</label>
          <div style={{ marginTop: 4 } as React.CSSProperties}>
            <StarRating value={fs.rating} onChange={(v) => setFs((p: FormState) => ({ ...p, rating: v }))} />
          </div>
        </div>

        {/* Venue ratings — new: screen/speaker/AC/seat, a separate
            visit_venue_ratings row saved via a follow-up PUT after the log
            itself saves (see handleSubmit). Never collected in this form
            before, despite LogDetailScreen already having a whole section
            to display them. */}
        <div className="field" style={{ gridColumn: "1/-1" } as React.CSSProperties}>
          <label>Venue ratings <span style={{ color: "var(--color-divider)", fontWeight: 400 } as React.CSSProperties}>(optional)</span></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 } as React.CSSProperties}>
            {([
              ["Screen", "screenRating"],
              ["Speaker", "speakerRating"],
              ["AC", "acRating"],
              ["Seat", "seatRating"],
            ] as const).map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties}>
                <span style={{ fontSize: 13, color: `${theme.text}99` } as React.CSSProperties}>{label}</span>
                <StarRating
                  size="small"
                  value={fs[key]}
                  onChange={(v) => setFs((p: FormState) => ({ ...p, [key]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Format chips — full width */}
        <div className="field" style={{ gridColumn: "1/-1" } as React.CSSProperties}>
          <label>Format</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 } as React.CSSProperties}>
            {FORMATS.map((f) => (
              <button
                key={f}
                className={fs.format === f ? "tag tag-accent" : "tag tag-neutral"}
                onClick={() => setFs((p: FormState) => ({ ...p, format: p.format === f ? undefined : f as Format }))}
                style={{ cursor: "pointer", border: "none", fontSize: 12 } as React.CSSProperties}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Watched date/time — new: watched_date/watched_time were never
            collected anywhere in this form at all, despite LogDetailScreen
            now prominently showing "when you watched it" as the primary
            date on the whole screen. Defaults to today. */}
        <div className="field">
          <label>Watched on</label>
          <input
            type="date"
            className="input"
            value={fs.watchedDate}
            onChange={(e) => setFs((p: FormState) => ({ ...p, watchedDate: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Time (optional)</label>
          <input
            type="time"
            className="input"
            value={fs.watchedTime}
            onChange={(e) => setFs((p: FormState) => ({ ...p, watchedTime: e.target.value }))}
          />
        </div>

        {/* Venue — left col */}
        <div className="field" style={{ position: "relative" } as React.CSSProperties}>
          <label>Theatre</label>
          <input
            className="input"
            value={venueQuery}
            placeholder="Search theatre…"
            onChange={(e) => {
              setVenueQuery(e.target.value);
              setFs((p: FormState) => ({ ...p, venueName: e.target.value }));
            }}
            autoComplete="off"
          />
          {showVenueSuggestions && (venueSuggestions?.length ?? 0) > 0 && (
            <div style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              background: "var(--color-surface)",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
              zIndex: 100,
              overflow: "hidden",
              marginTop: 4,
            } as React.CSSProperties}>
              {venueSuggestions.map((v: TheatreMatchCandidate) => (
                <div
                  key={v.id}
                  onClick={() => pickVenue(v)}
                  style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--color-divider)", fontSize: 14, color: "var(--color-text)" } as React.CSSProperties}
                  className="tapc"
                >
                  {v.name}
                  {v.city && <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 6 } as React.CSSProperties}>{v.city}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Screen — right col */}
        <div className="field">
          <label>Screen</label>
          <input
            className="input"
            value={fs.screenNumber}
            placeholder="e.g. 3"
            onChange={(e) => setFs((p: FormState) => ({ ...p, screenNumber: e.target.value }))}
          />
        </div>

        {/* Seat — left col */}
        <div className="field">
          <label>Seat</label>
          <input
            className="input"
            value={fs.seat}
            placeholder="e.g. H12"
            onChange={(e) => setFs((p: FormState) => ({ ...p, seat: e.target.value }))}
          />
        </div>

        {/* Language — new: on the backend, never in this form */}
        <div className="field">
          <label>Language</label>
          <input
            className="input"
            value={fs.language}
            placeholder="e.g. English"
            onChange={(e) => setFs((p: FormState) => ({ ...p, language: e.target.value }))}
          />
        </div>

        {/* Price/currency — new */}
        <div className="field">
          <label>Price</label>
          <input
            className="input"
            inputMode="decimal"
            value={fs.price}
            placeholder="e.g. 250"
            onChange={(e) => setFs((p: FormState) => ({ ...p, price: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Currency</label>
          <input
            className="input"
            value={fs.currency}
            placeholder="e.g. INR"
            maxLength={3}
            onChange={(e) => setFs((p: FormState) => ({ ...p, currency: e.target.value.toUpperCase() }))}
          />
        </div>

        {/* Certificate/booking ref — new */}
        <div className="field">
          <label>Certificate</label>
          <input
            className="input"
            value={fs.certificate}
            placeholder="e.g. U/A"
            onChange={(e) => setFs((p: FormState) => ({ ...p, certificate: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Booking ref</label>
          <input
            className="input"
            value={fs.bookingRef}
            placeholder="e.g. BMS12345678"
            onChange={(e) => setFs((p: FormState) => ({ ...p, bookingRef: e.target.value }))}
          />
        </div>

        {/* Arrival + delta — right col of the delta pair is only
            meaningful (and only sent) alongside early/late, same rule the
            backend enforces server-side. */}
        <div className="field">
          <label>Arrival</label>
          <SegmentedControl
            options={ARRIVAL_OPTS}
            value={fs.arrivalStatus}
            onChange={(v) => setFs((p: FormState) => ({ ...p, arrivalStatus: v as ArrivalStatus }))}
          />
        </div>
        {fs.arrivalStatus !== "on_time" && (
          <div className="field">
            <label>Minutes {fs.arrivalStatus}</label>
            <input
              className="input"
              inputMode="numeric"
              value={fs.arrivalDeltaMinutes}
              placeholder="e.g. 10"
              onChange={(e) => setFs((p: FormState) => ({ ...p, arrivalDeltaMinutes: e.target.value }))}
            />
          </div>
        )}

        {/* Screening start + delta — new: whether the movie itself started
            on time is distinct from the caller's own arrival, and was
            never collected here at all. */}
        <div className="field">
          <label>Screening start</label>
          <SegmentedControl
            options={SCREENING_START_OPTS}
            value={fs.screeningStartStatus ?? ""}
            onChange={(v) => setFs((p: FormState) => ({ ...p, screeningStartStatus: (v || undefined) as ScreeningStartStatus | undefined }))}
          />
        </div>
        {(fs.screeningStartStatus === "early" || fs.screeningStartStatus === "delayed") && (
          <div className="field">
            <label>Minutes {fs.screeningStartStatus}</label>
            <input
              className="input"
              inputMode="numeric"
              value={fs.screeningStartDeltaMinutes}
              placeholder="e.g. 5"
              onChange={(e) => setFs((p: FormState) => ({ ...p, screeningStartDeltaMinutes: e.target.value }))}
            />
          </div>
        )}

        {/* FDFS / Opening day toggles */}
        <div className="field" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties}>
          <div>
            <label style={{ marginBottom: 2 } as React.CSSProperties}>First Day First Show</label>
            <p style={{ color: "var(--color-divider)", fontSize: 12, margin: 0 } as React.CSSProperties}>The very first screening</p>
          </div>
          <input
            type="checkbox"
            checked={fs.isFdfs}
            onChange={(e) => {
              const checked = e.target.checked;
              // is_fdfs implies is_first_day server-side — mirrored here so
              // toggling this on doesn't leave the other checkbox looking
              // (incorrectly) unset.
              setFs((p: FormState) => ({ ...p, isFdfs: checked, isFirstDay: checked ? true : p.isFirstDay }));
            }}
            style={{ width: 18, height: 18, accentColor: theme.accent, flexShrink: 0 } as React.CSSProperties}
          />
        </div>
        <div className="field" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties}>
          <div>
            <label style={{ marginBottom: 2 } as React.CSSProperties}>Opening day</label>
            <p style={{ color: "var(--color-divider)", fontSize: 12, margin: 0 } as React.CSSProperties}>Any showing, not necessarily the first</p>
          </div>
          <input
            type="checkbox"
            checked={fs.isFirstDay}
            disabled={fs.isFdfs}
            onChange={(e) => setFs((p: FormState) => ({ ...p, isFirstDay: e.target.checked }))}
            style={{ width: 18, height: 18, accentColor: theme.accent, flexShrink: 0, opacity: fs.isFdfs ? 0.5 : 1 } as React.CSSProperties}
          />
        </div>

        {/* Visibility — right col */}
        <div className="field">
          <label>Visibility</label>
          <SegmentedControl
            options={VISIBILITY_OPTS}
            value={fs.visibility}
            onChange={(v) => setFs((p: FormState) => ({ ...p, visibility: v as LogVisibility }))}
          />
        </div>

        {/* Notes — full width */}
        <div className="field" style={{ gridColumn: "1/-1" } as React.CSSProperties}>
          <label>Review / Notes</label>
          <textarea
            className="input"
            value={fs.notes}
            placeholder="Write your thoughts…"
            rows={4}
            onChange={(e) => setFs((p: FormState) => ({ ...p, notes: e.target.value }))}
            style={{ resize: "vertical", minHeight: 96 } as React.CSSProperties}
          />
        </div>

        {/* No "Ticket URL" field — the backend has no such column.
            ticket_image_path is a Supabase Storage path set only via the
            AI extraction flow, never a manually-typed URL. */}
      </div>

      {errors.submit && (
        <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 } as React.CSSProperties}>{errors.submit}</p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function LogFormScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  // /(app)/log/new?edit={id} — LogDetailScreen's Edit button already
  // linked here with this param, but nothing on this screen ever read it:
  // the form always started blank and always called useCreateLog, so
  // "editing" a log actually created a brand new duplicate every time,
  // silently, with no error — the original was untouched and still there.
  const { edit: editId } = useLocalSearchParams<{ edit?: string }>();
  const isEditing = !!editId;

  const { mutateAsync: createLog, isPending: isCreating } = useCreateLog();
  const { mutateAsync: updateLog, isPending: isUpdating } = useUpdateLog();
  const { mutateAsync: createMovie } = useCreateMovie();
  const { mutateAsync: upsertVenueRating } = useUpsertVenueRating();
  const { data: existingLog, isLoading: isLoadingExisting } = useMovieLog(editId ?? "");
  const existingVenueRating = useVenueRating(editId ?? "");
  const { showToast } = useToast();
  const isPending = isCreating || isUpdating;

  // Form state — blank for a new entry; replaced wholesale once the
  // existing log loads, for edit mode (see the effect below).
  const [fs, setFs] = useState<FormState>(BLANK_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showAIModal, setShowAIModal] = useState(false);

  // Movie search
  const [movieQuery, setMovieQuery]             = useState("");
  const [showMovieSuggestions, setShowMovieSuggestions] = useState(false);
  const { data: movieSuggestions } = useMovieSearch(movieQuery);

  // Venue search
  const [venueQuery, setVenueQuery]             = useState("");
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const { data: venueSuggestions } = useVenueSearch(venueQuery);

  // Edit mode: populate the form once the existing log arrives. Runs once
  // per loaded log (guarded by id so a background refetch — e.g. from
  // another tab's edit — doesn't clobber what the user is actively typing).
  useEffect(() => {
    if (!existingLog) return;
    setFs(logToFormState(existingLog));
    setMovieQuery(existingLog.movie ?? "");
    setVenueQuery(existingLog.theater ?? "");
    // The existing log only carries movie_id, not a poster — resolved
    // separately below rather than blocking form population on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingLog?.id]);

  // Poster preview for edit mode: the log only carries movie_id, not a
  // poster_path, so that has to be looked up from the catalog entry it
  // points at. No-ops (via useMovie's own enabled check) once fs.movieId
  // stops matching the log we just loaded — e.g. the user then picks a
  // different title, which sets its own moviePosterUrl directly via
  // pickMovie and shouldn't have this effect stomp back over it.
  const { data: editMovie } = useMovie(isEditing ? fs.movieId : undefined);
  useEffect(() => {
    if (editMovie) setFs((p) => ({ ...p, moviePosterUrl: tmdbPosterUrl(editMovie.poster_path, "w342") }));
  }, [editMovie]);

  // Venue ratings for edit mode: a separate visit_venue_ratings row, not
  // part of the MovieLog object logToFormState converts above — merged in
  // once useVenueRating(editId) resolves (undefined for a log that was
  // never rated, which is the common case and simply leaves the 0 defaults).
  useEffect(() => {
    if (!existingVenueRating) return;
    setFs((p) => ({
      ...p,
      screenRating: existingVenueRating.screen_rating ?? 0,
      speakerRating: existingVenueRating.speaker_rating ?? 0,
      acRating: existingVenueRating.ac_rating ?? 0,
      seatRating: existingVenueRating.seat_rating ?? 0,
    }));
  }, [existingVenueRating]);

  const pickMovie = useCallback(async (m: MovieSearchResult) => {
    setFs((p) => ({ ...p, movieTitle: m.title, moviePosterUrl: tmdbPosterUrl(m.poster_path, "w342") }));
    setMovieQuery(m.title);
    setShowMovieSuggestions(false);
    // Dedupe-into-catalog so this log can carry a real movie_id — without
    // this, movie_id was never set at all (MovieSearchResult only has a
    // tmdb_id, not a catalog UUID), so the poster preview shown here never
    // survived past this form. Best-effort: a failure here (offline, TMDB
    // hiccup) shouldn't block picking a title — the log still saves fine
    // with just the free-typed title and no catalog link, same as before.
    try {
      const movie = await createMovie(m.tmdb_id);
      if (movie) setFs((p) => ({ ...p, movieId: movie.id }));
    } catch {
      // swallowed deliberately — see comment above
    }
  }, [createMovie]);

  const pickVenue = useCallback((v: TheatreMatchCandidate) => {
    setFs((p) => ({ ...p, venueId: v.id, venueName: v.name }));
    setVenueQuery(v.name);
    setShowVenueSuggestions(false);
  }, []);

  const handleExtractionResult = useCallback((result: ExtractionResult) => {
    setFs((p) => ({
      ...p,
      movieTitle: result.movie ?? p.movieTitle,
      venueName:  result.theater ?? p.venueName,
      format:     (result.format as Format | undefined) ?? p.format,
      seat:       result.seats?.length ? result.seats.join(", ") : p.seat,
    }));
    if (result.movie)   setMovieQuery(result.movie);
    if (result.theater) setVenueQuery(result.theater);
  }, []);

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!fs.movieTitle.trim()) newErrors.movieTitle = "Movie title is required";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const payload = {
      movie:         fs.movieTitle.trim(),
      movie_id:      fs.movieId,
      theater:       fs.venueName || undefined,
      theatre_id:    fs.venueId,
      screen:        fs.screenNumber || undefined,
      seats:         fs.seat ? fs.seat.split(",").map((s) => s.trim()).filter(Boolean) : [],
      format:        fs.format,
      rating:        fs.rating > 0 ? fs.rating : undefined,
      notes:         fs.notes || undefined,
      visibility:    fs.visibility,
      is_fdfs:       fs.isFdfs,
      is_first_day:  fs.isFirstDay,
      arrival_status: fs.arrivalStatus,
      arrival_delta_minutes: fs.arrivalDeltaMinutes.trim() ? Number(fs.arrivalDeltaMinutes) : undefined,
      screening_start_status: fs.screeningStartStatus,
      screening_start_delta_minutes: fs.screeningStartDeltaMinutes.trim() ? Number(fs.screeningStartDeltaMinutes) : undefined,
      watched_date:  fs.watchedDate || undefined,
      watched_time:  fs.watchedTime || undefined,
      language:      fs.language || undefined,
      certificate:   fs.certificate || undefined,
      price:         fs.price.trim() ? Number(fs.price) : undefined,
      currency:      fs.currency ? fs.currency.trim().toUpperCase() : undefined,
      booking_ref:   fs.bookingRef || undefined,
    };

    try {
      let logId: string;
      if (isEditing && editId) {
        const saved = await updateLog({ id: editId, payload });
        logId = saved.id;
      } else {
        const saved = await createLog(payload as typeof payload & { movie: string });
        logId = saved.id;
      }

      // Venue sub-ratings live in their own visit_venue_ratings row, scoped
      // to the log's id — only reachable once the log itself has been
      // created/updated above, so this is necessarily a second request,
      // not part of the same payload. Only sent when at least one of the
      // four is actually set, so a screening nobody bothered to rate the
      // venue on doesn't create an all-zero row.
      const hasVenueRating = fs.screenRating > 0 || fs.speakerRating > 0 || fs.acRating > 0 || fs.seatRating > 0;
      if (hasVenueRating) {
        await upsertVenueRating({
          logId,
          rating: {
            screen_rating: fs.screenRating || undefined,
            speaker_rating: fs.speakerRating || undefined,
            ac_rating: fs.acRating || undefined,
            seat_rating: fs.seatRating || undefined,
          },
        });
      }

      // The Save button already blocks itself with a spinner while
      // isPending — the gap was that nothing ever confirmed the save
      // actually landed once it did. A toast fired right as navigation
      // happens closes that without adding a second wait on top of the
      // one that already existed.
      showToast(isEditing ? "Changes saved" : "Log saved");

      // router.back() alone strands the user on this form whenever there's
      // no actual navigation history to go back to — a direct link, a
      // refreshed tab, or (on native) a deep link straight into edit mode
      // all have nothing to pop back to, so back() silently no-ops and the
      // just-saved form just sits there looking unsaved. Same fallback
      // LogDetailScreen's delete flow already uses.
      router.canGoBack() ? router.back() : router.replace("/");
    } catch (e: any) {
      setErrors({ submit: e.message ?? "Failed to save log" });
    }
  }

  // Edit mode, still fetching the log to populate the form — show a
  // spinner instead of a blank "new entry" form that's about to change
  // out from under whoever's looking at it.
  if (isEditing && isLoadingExisting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 60 }}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  // ── Web layout ──────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      /* width:"100%" alongside maxWidth — see LibraryScreen.tsx's root div;
         same shrink-wrap-instead-of-filling bug as every other screen
         below this maxWidth+margin:auto shape. Less visible here since the
         two-column form content is wide enough to mask it, but still
         narrower than the intended 1000px cap without this. */
      <div style={{ padding: "28px 32px 40px", maxWidth: 1000, width: "100%", margin: "0 auto" } as React.CSSProperties}>
        {/* Header row */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 28,
        } as React.CSSProperties}>
          <div>
            <div style={{
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: theme.accent,
              marginBottom: 4,
            } as React.CSSProperties}>
              {isEditing ? "Edit entry" : "Add new entry"}
            </div>
            <h1 style={{
              fontSize: 32,
              fontWeight: 700,
              color: theme.text,
              margin: 0,
              letterSpacing: -0.5,
            } as React.CSSProperties}>
              {isEditing ? "Edit screening" : "Log a screening"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties}>
            <button className="btn btn-secondary" onClick={() => router.back()}>
              <X size={14} color={theme.text} />
              Discard
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {isPending ? <span className="spin">◌</span> : null}
              {isEditing ? "Save changes" : "Save log"}
            </button>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start" } as React.CSSProperties}>
          {/* Poster column */}
          <WebPosterCol
            posterUrl={fs.moviePosterUrl}
            movieTitle={fs.movieTitle}
            onAIScan={() => setShowAIModal(true)}
            theme={theme}
          />

          {/* Form column */}
          <WebForm
            fs={fs}
            errors={errors}
            isPending={isPending}
            movieQuery={movieQuery}
            movieSuggestions={movieSuggestions}
            venueQuery={venueQuery}
            venueSuggestions={venueSuggestions}
            showMovieSuggestions={showMovieSuggestions}
            showVenueSuggestions={showVenueSuggestions}
            setMovieQuery={(v: string) => {
              setMovieQuery(v);
              setFs((p) => ({ ...p, movieTitle: v }));
              setShowMovieSuggestions(v.length > 1);
              setErrors((p) => ({ ...p, movieTitle: "" }));
            }}
            setVenueQuery={(v: string) => {
              setVenueQuery(v);
              setFs((p) => ({ ...p, venueName: v }));
              setShowVenueSuggestions(v.length > 1);
            }}
            pickMovie={pickMovie}
            pickVenue={pickVenue}
            setFs={setFs}
            setErrors={setErrors}
            handleSubmit={handleSubmit}
            router={router}
            theme={theme}
          />
        </div>

        <AITicketModal
          visible={showAIModal}
          onClose={() => setShowAIModal(false)}
          onResult={handleExtractionResult}
        />
      </div>
    );
  }

  // ── Native layout ────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "transparent" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Mobile header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ padding: 4 }}>
          <ArrowLeft size={20} color={theme.accent} />
        </Pressable>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700", flex: 1 }}>
          {isEditing ? "Edit screening" : "Log a screening"}
        </Text>
        <Pressable
          onPress={handleSubmit}
          disabled={isPending}
          style={{ backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Save</Text>
          )}
        </Pressable>
      </View>

      {/* Poster thumbnail + AI scan row */}
      <View style={{ flexDirection: "row", gap: 14, marginBottom: 14 }}>
        <View style={{
          width: 80,
          height: 120,
          borderRadius: 8,
          borderWidth: 2,
          borderStyle: "dashed",
          borderColor: theme.divider,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.surfaceHigh,
        }}>
          {fs.moviePosterUrl ? (
            <Image source={{ uri: fs.moviePosterUrl }} style={{ width: 80, height: 120 }} resizeMode="cover" />
          ) : (
            <CameraPlus size={24} color={theme.text + "44"} />
          )}
        </View>

        <Pressable
          onPress={() => setShowAIModal(true)}
          style={{
            flex: 1,
            backgroundColor: theme.surface,
            borderRadius: 10,
            padding: 14,
            justifyContent: "center",
            gap: 6,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Sparkle size={16} color={theme.accent} />
            <Text style={{ fontSize: 13, fontWeight: "600", color: theme.text }}>AI ticket extraction</Text>
          </View>
          <Text style={{ fontSize: 12, color: `${theme.text}66`, lineHeight: 16 }}>
            Scan your ticket to auto-fill this form.
          </Text>
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderWidth: 1,
            borderColor: theme.divider,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignSelf: "flex-start",
            marginTop: 4,
          }}>
            <Robot size={13} color={theme.text} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: theme.text }}>Scan ticket</Text>
          </View>
        </Pressable>
      </View>

      {/* Movie title search */}
      <Input
        label="Movie title"
        value={movieQuery}
        onChangeText={(v) => {
          setMovieQuery(v);
          setFs((p) => ({ ...p, movieTitle: v }));
          setShowMovieSuggestions(v.length > 1);
          setErrors((p) => ({ ...p, movieTitle: "" }));
        }}
        placeholder="Search or type movie title…"
        error={errors.movieTitle}
      />
      {showMovieSuggestions && (movieSuggestions?.length ?? 0) > 0 && (
        <View style={{
          backgroundColor: theme.surface,
          borderRadius: 8,
          marginTop: 4,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: theme.divider,
        }}>
          {(movieSuggestions ?? []).map((m: MovieSearchResult) => (
            <Pressable
              key={m.tmdb_id}
              onPress={() => pickMovie(m)}
              style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}
            >
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{m.title}</Text>
              {releaseYear(m.release_date) && (
                <Text style={{ color: `${theme.text}66`, fontSize: 12, marginTop: 2 }}>{releaseYear(m.release_date)}</Text>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* Rating */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>RATING</Text>
        <StarRating value={fs.rating} onChange={(v) => setFs((p) => ({ ...p, rating: v }))} />
      </View>

      {/* Format chips */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>FORMAT</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {FORMATS.map((f) => (
            <Pressable
              key={f}
              onPress={() => setFs((p) => ({ ...p, format: p.format === f ? undefined : f as Format }))}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: fs.format === f ? theme.accent800 : theme.neutral800,
                borderColor: fs.format === f ? theme.accent : "transparent",
              }}
            >
              <Text style={{
                fontSize: 12,
                fontWeight: "600",
                color: fs.format === f ? theme.accent100 : theme.neutral100,
              }}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Venue ratings — new: screen/speaker/AC/seat, a separate
          visit_venue_ratings row saved via a follow-up PUT after the log
          itself saves (see handleSubmit). See the matching web section. */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>
          VENUE RATINGS <Text style={{ fontWeight: "400", textTransform: "none" }}>(optional)</Text>
        </Text>
        <View style={{ gap: 10 }}>
          {([
            ["Screen", "screenRating"],
            ["Speaker", "speakerRating"],
            ["AC", "acRating"],
            ["Seat", "seatRating"],
          ] as const).map(([label, key]) => (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 14, color: theme.text }}>{label}</Text>
              <StarRating size="small" value={fs[key]} onChange={(v) => setFs((p) => ({ ...p, [key]: v }))} />
            </View>
          ))}
        </View>
      </View>

      {/* Watched date/time — new: never collected anywhere in this form
          before, despite LogDetailScreen now showing it as the primary
          date on the whole screen. No native date-picker dependency is
          installed (@react-native-community/datetimepicker isn't in
          package.json, and adding a native module needs a rebuild this
          pass can't verify) — plain text with a format hint, same
          free-typed pattern as Screen/Seat below. */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Input label="Watched on" value={fs.watchedDate} onChangeText={(v) => setFs((p) => ({ ...p, watchedDate: v }))} placeholder="YYYY-MM-DD" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Time (optional)" value={fs.watchedTime} onChangeText={(v) => setFs((p) => ({ ...p, watchedTime: v }))} placeholder="HH:MM" />
        </View>
      </View>

      {/* Venue */}
      <View style={{ marginTop: 14 }}>
        <Input
          label="Theatre"
          value={venueQuery}
          onChangeText={(v) => {
            setVenueQuery(v);
            setFs((p) => ({ ...p, venueName: v }));
            setShowVenueSuggestions(v.length > 1);
          }}
          placeholder="Search theatre…"
        />
        {showVenueSuggestions && (venueSuggestions?.length ?? 0) > 0 && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 8, marginTop: 4, overflow: "hidden", borderWidth: 1, borderColor: theme.divider }}>
            {(venueSuggestions ?? []).map((v: TheatreMatchCandidate) => (
              <Pressable key={v.id} onPress={() => pickVenue(v)} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{v.name}</Text>
                {v.city && <Text style={{ color: `${theme.text}66`, fontSize: 12, marginTop: 2 }}>{v.city}</Text>}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Screen + seat row */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Input label="Screen" value={fs.screenNumber} onChangeText={(v) => setFs((p) => ({ ...p, screenNumber: v }))} placeholder="e.g. 3" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Seat" value={fs.seat} onChangeText={(v) => setFs((p) => ({ ...p, seat: v }))} placeholder="e.g. H12" />
        </View>
      </View>

      {/* Language — new */}
      <View style={{ marginTop: 14 }}>
        <Input label="Language" value={fs.language} onChangeText={(v) => setFs((p) => ({ ...p, language: v }))} placeholder="e.g. English" />
      </View>

      {/* Price/currency — new */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Input label="Price" value={fs.price} onChangeText={(v) => setFs((p) => ({ ...p, price: v }))} placeholder="e.g. 250" keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Currency" value={fs.currency} onChangeText={(v) => setFs((p) => ({ ...p, currency: v.toUpperCase() }))} placeholder="e.g. INR" maxLength={3} />
        </View>
      </View>

      {/* Certificate/booking ref — new */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <Input label="Certificate" value={fs.certificate} onChangeText={(v) => setFs((p) => ({ ...p, certificate: v }))} placeholder="e.g. U/A" />
        </View>
        <View style={{ flex: 1 }}>
          <Input label="Booking ref" value={fs.bookingRef} onChangeText={(v) => setFs((p) => ({ ...p, bookingRef: v }))} placeholder="e.g. BMS12345678" />
        </View>
      </View>

      {/* Arrival + delta */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>ARRIVAL</Text>
        <SegmentedControl options={ARRIVAL_OPTS} value={fs.arrivalStatus} onChange={(v) => setFs((p) => ({ ...p, arrivalStatus: v as ArrivalStatus }))} />
      </View>
      {fs.arrivalStatus !== "on_time" && (
        <View style={{ marginTop: 10 }}>
          <Input
            label={`Minutes ${fs.arrivalStatus}`}
            value={fs.arrivalDeltaMinutes}
            onChangeText={(v) => setFs((p) => ({ ...p, arrivalDeltaMinutes: v }))}
            placeholder="e.g. 10"
            keyboardType="number-pad"
          />
        </View>
      )}

      {/* Screening start + delta — new: whether the movie itself started
          on time, distinct from the caller's own arrival, was never
          collected here at all. */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>SCREENING START</Text>
        <SegmentedControl
          options={SCREENING_START_OPTS}
          value={fs.screeningStartStatus ?? ""}
          onChange={(v) => setFs((p) => ({ ...p, screeningStartStatus: (v || undefined) as ScreeningStartStatus | undefined }))}
        />
      </View>
      {(fs.screeningStartStatus === "early" || fs.screeningStartStatus === "delayed") && (
        <View style={{ marginTop: 10 }}>
          <Input
            label={`Minutes ${fs.screeningStartStatus}`}
            value={fs.screeningStartDeltaMinutes}
            onChangeText={(v) => setFs((p) => ({ ...p, screeningStartDeltaMinutes: v }))}
            placeholder="e.g. 5"
            keyboardType="number-pad"
          />
        </View>
      )}

      {/* FDFS toggle */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 4 }}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>First Day First Show</Text>
          <Text style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 }}>The very first screening</Text>
        </View>
        <Switch
          value={fs.isFdfs}
          onValueChange={(v) => setFs((p) => ({ ...p, isFdfs: v, isFirstDay: v ? true : p.isFirstDay }))}
          trackColor={{ true: theme.accent }}
        />
      </View>

      {/* Opening day toggle — new: separate from FDFS, for "opening day
          but not the very first show." is_fdfs implies is_first_day
          server-side, mirrored above. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 4, opacity: fs.isFdfs ? 0.5 : 1 }}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>Opening day</Text>
          <Text style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 }}>Any showing, not necessarily the first</Text>
        </View>
        <Switch
          value={fs.isFirstDay}
          disabled={fs.isFdfs}
          onValueChange={(v) => setFs((p) => ({ ...p, isFirstDay: v }))}
          trackColor={{ true: theme.accent }}
        />
      </View>

      {/* Visibility */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>VISIBILITY</Text>
        <SegmentedControl options={VISIBILITY_OPTS} value={fs.visibility} onChange={(v) => setFs((p) => ({ ...p, visibility: v as LogVisibility }))} />
      </View>

      {/* Notes */}
      <View style={{ marginTop: 14 }}>
        <Input
          label="Review / Notes"
          value={fs.notes}
          onChangeText={(v) => setFs((p) => ({ ...p, notes: v }))}
          placeholder="Write your thoughts…"
          multiline
          numberOfLines={4}
        />
      </View>

      {/* No "Ticket URL" field — see the matching note in WebForm above. */}

      {errors.submit && (
        <Text style={{ color: theme.error, fontSize: 13, marginTop: 8 }}>{errors.submit}</Text>
      )}

      <AITicketModal
        visible={showAIModal}
        onClose={() => setShowAIModal(false)}
        onResult={handleExtractionResult}
      />
    </ScrollView>
  );
}
