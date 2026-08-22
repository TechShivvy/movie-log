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
import { useQueryClient } from "@tanstack/react-query";
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
import { useMovieSearch, useVenueSearch, useCreateMovie, useMovie, useSearchPlaces, useCreateTheatreManual } from "../hooks/useSearch";
import { useVenueRating, useUpsertVenueRating } from "../hooks/useVenueRating";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "../context/ToastContext";
import { StarRating } from "../components/ui/StarRating";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { AITicketModal } from "../modals/AITicketModal";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import { venueDisplayName, placesFooterLabel, randomSessionToken } from "../lib/venue";
import type {
  Format,
  LogVisibility,
  ArrivalStatus,
  ScreeningStartStatus,
  MovieLog,
  MovieSearchResult,
  TheatreMatchCandidate,
  TheatrePlaceSuggestion,
  ExtractionResult,
} from "../types";
import { type as fontSizes } from "../constants/fonts";

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
            <p style={{ color: `${theme.text}44`, fontSize: fontSizes.sm, marginTop: 10, lineHeight: 1.4 } as React.CSSProperties}>
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
          <span style={{ fontSize: fontSizes.sm, fontWeight: 600, color: theme.text } as React.CSSProperties}>
            AI ticket extraction
          </span>
        </div>
        <p style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, lineHeight: 1.5, margin: 0 } as React.CSSProperties}>
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
  setShowMovieSuggestions,
  setShowVenueSuggestions,
  setMovieQuery,
  setVenueQuery,
  pickMovie,
  pickVenue,
  placesResults,
  placesSearched,
  venueSearchLoading,
  searchingPlaces,
  handleSearchPlaces,
  pickPlace,
  showManualAdd,
  setShowManualAdd,
  manualName,
  setManualName,
  manualCity,
  setManualCity,
  handleAddManually,
  addingManually,
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

        {/* Movie title — full width. position:relative is what actually
            anchors the suggestions dropdown below (position:absolute;
            top:100%) to this field — without it, the dropdown positions
            against the next ancestor that HAS a positioning context
            instead (the two-column grid, or further up still), landing
            it somewhere else on the page entirely rather than attached
            to this input. The Theatre field below already had this;
            Movie title never did. */}
        <div className="field" style={{ gridColumn: "1/-1", position: "relative" } as React.CSSProperties}>
          <label>Movie title <span style={{ color: "var(--color-error)" } as React.CSSProperties}>*</span></label>
          <input
            className={`input${errors.movieTitle ? " error" : ""}`}
            value={movieQuery}
            placeholder="Search or type movie title…"
            onChange={(e) => {
              setMovieQuery(e.target.value);
              setFs((p: FormState) => ({ ...p, movieTitle: e.target.value }));
              setErrors((p: any) => ({ ...p, movieTitle: undefined }));
            }}
            onBlur={() => setTimeout(() => setShowMovieSuggestions(false), 150)}
            autoComplete="off"
          />
          {errors.movieTitle && (
            <span style={{ color: "var(--color-error)", fontSize: fontSizes.sm } as React.CSSProperties}>{errors.movieTitle}</span>
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
              {movieSuggestions.map((m: MovieSearchResult) => {
                const thumb = tmdbPosterUrl(m.poster_path, "w92");
                return (
                  <div
                    key={m.tmdb_id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickMovie(m)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 14px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--color-divider)",
                      fontSize: fontSizes.base,
                      color: "var(--color-text)",
                    } as React.CSSProperties}
                    className="tapc"
                  >
                    {/* Small poster thumbnail so a suggestion is
                        recognizable at a glance, not just a title string —
                        MovieSearchResult already carries poster_path, this
                        just never rendered it. Falls back to the same
                        hue-gradient tile every other poster placeholder
                        uses when a result has none. */}
                    <div style={{
                      width: 32, height: 46, flexShrink: 0, borderRadius: 4, overflow: "hidden",
                      background: thumb ? `url(${thumb}) center/cover no-repeat` : theme.surfaceHigh,
                    } as React.CSSProperties} />
                    <div style={{ minWidth: 0 } as React.CSSProperties}>
                      {m.title}
                      {releaseYear(m.release_date) && (
                        <span style={{ fontSize: fontSizes.sm, opacity: 0.6, marginLeft: 8 } as React.CSSProperties}>
                          {releaseYear(m.release_date)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
          <label>Venue ratings</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 } as React.CSSProperties}>
            {([
              ["Screen", "screenRating"],
              ["Speaker", "speakerRating"],
              ["AC", "acRating"],
              ["Seat", "seatRating"],
            ] as const).map(([label, key]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties}>
                <span style={{ fontSize: fontSizes.sm, color: `${theme.text}99` } as React.CSSProperties}>{label}</span>
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
                style={{ cursor: "pointer", border: "none", fontSize: fontSizes.sm } as React.CSSProperties}
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
          <label>Time</label>
          <input
            type="time"
            className="input"
            value={fs.watchedTime}
            onChange={(e) => setFs((p: FormState) => ({ ...p, watchedTime: e.target.value }))}
          />
        </div>

        {/* Venue — left col */}
        <div className="field" style={{ position: "relative" } as React.CSSProperties}>
          <label>Theatre <span style={{ color: "var(--color-error)" } as React.CSSProperties}>*</span></label>
          <input
            className={`input${errors.venueName ? " error" : ""}`}
            value={venueQuery}
            placeholder="Search theatre…"
            onChange={(e) => {
              setVenueQuery(e.target.value);
              setFs((p: FormState) => ({ ...p, venueName: e.target.value, venueId: undefined }));
              setErrors((p: any) => ({ ...p, venueName: undefined }));
            }}
            // Delayed rather than immediate — an immediate hide on blur
            // fires before a click on a dropdown row has a chance to
            // register (the row's onClick needs the element still mounted
            // when the browser processes the click), so this gives that
            // click a beat to land before the dropdown actually closes.
            // pickVenue/pickPlace both already close it synchronously too;
            // this is only what makes tapping *outside* the field close it.
            // Doesn't apply while the "Add manually" mini-form is open —
            // that form's own inputs need real focus to be typed into,
            // which this same blur would otherwise close the whole
            // dropdown (and unmount the form) out from under; the
            // dropdown's own visibility condition below stays open via
            // showManualAdd regardless of what this sets.
            onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
            autoComplete="off"
          />
          {errors.venueName && (
            <span style={{ color: "var(--color-error)", fontSize: fontSizes.sm } as React.CSSProperties}>{errors.venueName}</span>
          )}
          {(showManualAdd || (showVenueSuggestions && venueQuery.trim().length > 2)) && (
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
              display: "flex",
              flexDirection: "column",
            } as React.CSSProperties}>
              {showManualAdd ? (
                /* Replaces the whole dropdown body while active — a
                   focused single-task form rather than cluttering it
                   alongside the scroll area and the other footer option. */
                <div style={{ padding: "10px 14px 14px" } as React.CSSProperties}>
                  <div style={{ fontSize: fontSizes.sm, color: "var(--color-text)", opacity: 0.7, marginBottom: 8 } as React.CSSProperties}>
                    Not on Google Places either? Add it directly.
                  </div>
                  <input
                    className="input"
                    placeholder="Theatre name"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    style={{ marginBottom: 8 } as React.CSSProperties}
                  />
                  <input
                    className="input"
                    placeholder="City"
                    value={manualCity}
                    onChange={(e) => setManualCity(e.target.value)}
                    style={{ marginBottom: 10 } as React.CSSProperties}
                  />
                  <div style={{ display: "flex", gap: 8 } as React.CSSProperties}>
                    <button
                      className="btn btn-primary"
                      onClick={handleAddManually}
                      disabled={addingManually || !manualName.trim() || !manualCity.trim()}
                    >
                      {addingManually ? "Adding…" : "Add"}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setShowManualAdd(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Scrolls independently once local matches + Places
                      results together run past ~5 rows — the sticky
                      footer below stays put rather than being one more
                      thing to scroll past. */}
                  <div style={{ maxHeight: 230, overflowY: "auto" } as React.CSSProperties}>
                    {venueSearchLoading && (
                      <div style={{ padding: "10px 14px", fontSize: fontSizes.sm, color: "var(--color-text)", opacity: 0.6 } as React.CSSProperties}>
                        Searching…
                      </div>
                    )}
                    {!venueSearchLoading && (venueSuggestions?.length ?? 0) === 0 && placesResults.length === 0 && (
                      <div style={{ padding: "10px 14px", fontSize: fontSizes.sm, color: "var(--color-text)", opacity: 0.6 } as React.CSSProperties}>
                        No matches found
                      </div>
                    )}
                    {(venueSuggestions?.length ?? 0) > 0 && venueSuggestions.map((v: TheatreMatchCandidate) => (
                      <div
                        key={v.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickVenue(v)}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--color-divider)", fontSize: fontSizes.base, color: "var(--color-text)" } as React.CSSProperties}
                        className="tapc"
                      >
                        <div>{venueDisplayName(v)}</div>
                        {(v.formatted_address || v.city) && (
                          <div style={{ fontSize: fontSizes.sm, opacity: 0.6, marginTop: 1 } as React.CSSProperties}>{v.formatted_address || v.city}</div>
                        )}
                      </div>
                    ))}
                    {placesResults.length > 0 && placesResults.map((p: TheatrePlaceSuggestion) => (
                      <div
                        key={p.place_id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickPlace(p)}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--color-divider)", fontSize: fontSizes.base, color: "var(--color-text)" } as React.CSSProperties}
                        className="tapc"
                      >
                        <div>{p.main_text ?? p.description}</div>
                        {p.secondary_text && <div style={{ fontSize: fontSizes.sm, opacity: 0.6, marginTop: 1 } as React.CSSProperties}>{p.secondary_text}</div>}
                      </div>
                    ))}
                  </div>
                  {/* Sticky footer — always here, not just when the local
                      list comes up empty, so "not the one I meant" always
                      has somewhere to go even when local matches did show
                      up. Two options: search Google, or (if that's empty
                      too) add it directly — theatre is required to save
                      now, so this is the one field that always needs to
                      end somewhere real. */}
                  <div
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={searchingPlaces ? undefined : handleSearchPlaces}
                    style={{
                      padding: "10px 14px",
                      cursor: searchingPlaces ? "default" : "pointer",
                      fontSize: fontSizes.sm,
                      color: "var(--color-accent)",
                      fontWeight: 600,
                      borderTop: "1px solid var(--color-divider)",
                      background: "var(--color-surface)",
                      flexShrink: 0,
                    } as React.CSSProperties}
                    className="tapc"
                  >
                    {placesFooterLabel(searchingPlaces, placesSearched, placesResults.length)}
                  </div>
                  <div
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowManualAdd(true)}
                    style={{
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontSize: fontSizes.sm,
                      color: "var(--color-text)",
                      opacity: 0.7,
                      borderTop: "1px solid var(--color-divider)",
                      background: "var(--color-surface)",
                      flexShrink: 0,
                    } as React.CSSProperties}
                    className="tapc"
                  >
                    Can't find it? Add manually
                  </div>
                </>
              )}
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
            <p style={{ color: "var(--color-divider)", fontSize: fontSizes.sm, margin: 0 } as React.CSSProperties}>The very first screening</p>
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
            <p style={{ color: "var(--color-divider)", fontSize: fontSizes.sm, margin: 0 } as React.CSSProperties}>Any showing, not necessarily the first</p>
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
        <p style={{ color: "var(--color-error)", fontSize: fontSizes.sm, marginTop: 8 } as React.CSSProperties}>{errors.submit}</p>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function LogFormScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  // useBreakpoint was imported at the top of this file and never actually
  // called — dead import. This screen's "web" branch (a fixed 260px poster
  // column beside a fixed two-column form grid, neither ever wrapping or
  // stacking) was consequently the ONLY layout mobile web ever got: no
  // width check anywhere routed it to the already-built, already
  // phone-tuned native branch below. Screenshotted at 390px before this
  // fix: the form column sliced clean off the right edge of the viewport,
  // silently hidden rather than visibly overflowing (overflow-x:hidden on
  // html/body). isMobile is what actually wires the switch below.
  const { isMobile } = useBreakpoint();
  // /(app)/log/new?edit={id} — LogDetailScreen's Edit button already
  // linked here with this param, but nothing on this screen ever read it:
  // the form always started blank and always called useCreateLog, so
  // "editing" a log actually created a brand new duplicate every time,
  // silently, with no error — the original was untouched and still there.
  const { edit: editId, movieId: prefillMovieId, movieTitle: prefillMovieTitle, poster: prefillPoster } =
    useLocalSearchParams<{ edit?: string; movieId?: string; movieTitle?: string; poster?: string }>();
  const isEditing = !!editId;

  const { mutateAsync: createLog, isPending: isCreating } = useCreateLog();
  const { mutateAsync: updateLog, isPending: isUpdating } = useUpdateLog();
  const { mutateAsync: createMovie } = useCreateMovie();
  const qc = useQueryClient();
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

  // Movie search — the input itself stays live/uncontrolled by the
  // debounce (it needs to reflect every keystroke instantly); only the
  // value actually handed to the search hook is debounced, so a fast
  // typist doesn't fire a network request per keystroke.
  const [movieQuery, setMovieQuery]             = useState("");
  const [showMovieSuggestions, setShowMovieSuggestions] = useState(false);
  const debouncedMovieQuery = useDebouncedValue(movieQuery, 300);
  const { data: movieSuggestions } = useMovieSearch(debouncedMovieQuery);

  // Venue search — same debounce treatment.
  const [venueQuery, setVenueQuery]             = useState("");
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const debouncedVenueQuery = useDebouncedValue(venueQuery, 300);
  const { data: venueSuggestions, isFetching: venueSearchLoading } = useVenueSearch(debouncedVenueQuery);

  // Google Places fallback — only reachable by an explicit tap (never
  // auto-fired off the debounce above, unlike venueSuggestions itself),
  // since unlike the free trigram match this one bills. placesToken is a
  // client-generated id Google's Autocomplete billing groups repeated
  // searches under as one "session" — created once per venue field visit
  // and kept stable across query edits/re-searches, only reset once a
  // place is actually picked (or the field is cleared), not on every
  // keystroke, so refining a search still bills as one session.
  // placesSearched distinguishes "haven't tried Places yet" (offer the tap)
  // from "tried it, nothing came back" (say so instead of re-offering the
  // exact same tap with no visible change — that silence was the bad UX:
  // tapping "Search Google Places" against a genuinely empty result looked
  // identical to not having tapped it at all).
  const [placesResults, setPlacesResults] = useState<TheatrePlaceSuggestion[]>([]);
  const [placesSearched, setPlacesSearched] = useState(false);
  const [placesToken, setPlacesToken] = useState<string | null>(null);
  const searchPlaces = useSearchPlaces();
  const createTheatreManual = useCreateTheatreManual();
  // Picking a Places suggestion does NOT create the theatre right away —
  // only stages it here. The actual resolve-or-create happens server-
  // side, atomically, as part of the log-save request itself (see
  // handleSubmit's theatre_place) — nothing lands in the shared theatres
  // table for a place that was only compared and the save then abandoned.
  const [pendingPlace, setPendingPlace] = useState<TheatrePlaceSuggestion | null>(null);
  // "Add manually" — the fallback when neither local search nor Places
  // has the real venue (small/obscure theatre, private screening room).
  // Unlike a Places pick this creates immediately on submit of this small
  // form (see useCreateTheatreManual) rather than deferring to log-save —
  // there's no place_id for the backend to resolve later, so "the user
  // explicitly asked to create this" already happened the moment they
  // filled this in.
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCity, setManualCity] = useState("");

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

  // "+ Log this movie" prefill (MovieDetailScreen) — only when starting a
  // genuinely new entry, never over edit mode (an edit link never carries
  // these params anyway, but the isEditing guard makes that explicit
  // rather than relying on it). poster is the bare TMDB path, same as
  // MovieSearchResult.poster_path — built into a real URL here the same
  // way pickMovie does for a normal search pick.
  useEffect(() => {
    if (isEditing || !prefillMovieId || !prefillMovieTitle) return;
    setFs((p) => ({
      ...p,
      movieId: prefillMovieId,
      movieTitle: prefillMovieTitle,
      moviePosterUrl: prefillPoster ? tmdbPosterUrl(prefillPoster, "w342") : p.moviePosterUrl,
    }));
    setMovieQuery(prefillMovieTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, prefillMovieId, prefillMovieTitle, prefillPoster]);

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
      // useCreateMovie's own onSuccess now primes ["movies", id] itself
      // (useSearch.ts) — used to be done here at this one call site only;
      // consolidated so every future caller gets the same skip-the-
      // redundant-GET benefit, not just this screen.
      const movie = await createMovie(m.tmdb_id);
      if (movie) setFs((p) => ({ ...p, movieId: movie.id }));
    } catch {
      // swallowed deliberately — see comment above
    }
  }, [createMovie, qc]);

  const pickVenue = useCallback((v: { id: string; name: string }) => {
    setFs((p) => ({ ...p, venueId: v.id, venueName: v.name }));
    setVenueQuery(v.name);
    setShowVenueSuggestions(false);
    setPlacesResults([]);
    setPlacesSearched(false);
    setPlacesToken(null);
    setPendingPlace(null);
  }, []);

  // Explicit-tap trigger for the Google Places fallback (see placesToken
  // comment above for why this never fires off the debounce like
  // venueSuggestions does) — bills, so it's the user asking for it, not us
  // guessing they want it mid-keystroke.
  const handleSearchPlaces = useCallback(async () => {
    const q = venueQuery.trim();
    if (q.length < 3) return;
    const token = placesToken ?? randomSessionToken();
    if (!placesToken) setPlacesToken(token);
    try {
      const results = await searchPlaces.mutateAsync({ query: q, sessionToken: token });
      setPlacesResults(results);
    } catch {
      showToast("Couldn't reach Google Places — try again");
      setPlacesResults([]);
    } finally {
      // Set regardless of outcome — an empty [] and a failed request both
      // need to stop looking like "never tried yet" once this resolves,
      // or the fallback row just re-offers the identical tap with nothing
      // visibly different, which is exactly the silent-nothing-happened
      // UX this was meant to fix.
      setPlacesSearched(true);
    }
  }, [venueQuery, placesToken, searchPlaces, showToast]);

  // Stages a Google result as the venue — displays immediately, same as a
  // local match would, but doesn't create anything yet (see pendingPlace
  // above). fs.venueId is deliberately left unset here: it's what
  // handleSubmit checks to know a real create-or-reuse call still needs to
  // happen for this venue before the log itself can carry a theatre_id.
  const pickPlace = useCallback((place: TheatrePlaceSuggestion) => {
    const name = place.main_text ?? place.description ?? "Unknown theatre";
    setFs((p) => ({ ...p, venueId: undefined, venueName: name }));
    setVenueQuery(name);
    setShowVenueSuggestions(false);
    setPlacesResults([]);
    setPlacesSearched(false);
    setPlacesToken(null);
    setPendingPlace(place);
  }, []);

  const handleAddManually = useCallback(async () => {
    const name = manualName.trim();
    const city = manualCity.trim();
    if (!name || !city) return;
    try {
      const theatre = await createTheatreManual.mutateAsync({ name, city });
      if (theatre) {
        pickVenue(theatre);
        setShowManualAdd(false);
        setManualName("");
        setManualCity("");
      }
    } catch {
      showToast("Couldn't add that theatre — try again");
    }
  }, [manualName, manualCity, createTheatreManual, pickVenue, showToast]);

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
    // Theatre is required — the app is screening-focused, a log without a
    // real venue link is incomplete data. "Resolved" means a real
    // reference exists or can be atomically resolved server-side: a
    // picked local match (fs.venueId) or a picked Places result
    // (pendingPlace, resolved into a real theatre_id below via
    // theatre_place). Free-typed text with nothing actually picked
    // doesn't satisfy this — that used to save fine with no real link at
    // all, which is exactly the loophole "required" has to close.
    if (!fs.venueId && !pendingPlace) newErrors.venueName = "Please select a theatre from the list";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const payload = {
      movie:         fs.movieTitle.trim(),
      movie_id:      fs.movieId,
      theater:       fs.venueName || undefined,
      theatre_id:    fs.venueId,
      // Only sent when no local match was picked — the backend resolves
      // this into a real theatre_id (create-or-reuse-by-place_id, same
      // logic POST /venues/theatres itself uses) atomically as part of
      // this same request now, so there's no separate pre-create step
      // here anymore: one request instead of two, and nothing lands in
      // the shared theatres table for a place that was only compared and
      // the save then abandoned.
      theatre_place: !fs.venueId && pendingPlace ? {
        place_id: pendingPlace.place_id,
        name: pendingPlace.main_text ?? pendingPlace.description,
        formatted_address: pendingPlace.description,
      } : undefined,
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

      // Was router.canGoBack() ? router.back() : router.replace("/") —
      // for a new log that meant never actually landing on the log you
      // just created (wherever "back" happened to point, usually
      // Library); for an edit it only reached the right screen by
      // coincidence of navigation history, not real routing. logId is
      // already in hand from both the create and edit paths above, and
      // Phase A's cache-priming means this navigation is now genuinely
      // instant (no refetch — see useCreateLog/useUpdateLog). replace,
      // not push, so Back from the log doesn't return to the just-
      // submitted form.
      router.replace(`/(app)/log/${logId}` as any);
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

  // ── Web layout (tablet & desktop only — see the isMobile comment above) ─────
  if (Platform.OS === "web" && !isMobile) {
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
              fontSize: fontSizes.xs,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: theme.accent,
              marginBottom: 4,
            } as React.CSSProperties}>
              {isEditing ? "Edit entry" : "Add new entry"}
            </div>
            <h1 style={{
              fontSize: fontSizes.h1,
              fontWeight: 700,
              color: theme.text,
              margin: 0,
              letterSpacing: -0.5,
            } as React.CSSProperties}>
              {isEditing ? "Edit screening" : "Log a screening"}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 } as React.CSSProperties}>
            {/* Discard disabled mid-save too — navigating away right as
                the request lands read as a race between "did my save
                actually happen" and "I just left", same reasoning as
                blocking the delete dialog from being dismissed mid-flight. */}
            <button className="btn btn-secondary" onClick={() => router.back()} disabled={isPending}>
              <X size={14} color={theme.text} />
              Discard
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isPending}
            >
              {/* Label itself now changes ("Saving…"), not just a small
                  spin glyph next to an otherwise-unchanged "Save log" —
                  that was easy to miss entirely. */}
              {isPending && <span className="spin">◌</span>}
              {isPending ? "Saving…" : isEditing ? "Save changes" : "Save log"}
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
            setShowMovieSuggestions={setShowMovieSuggestions}
            setShowVenueSuggestions={setShowVenueSuggestions}
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
              setPlacesResults([]);
              setPlacesSearched(false);
            }}
            pickMovie={pickMovie}
            pickVenue={pickVenue}
            placesResults={placesResults}
            placesSearched={placesSearched}
            venueSearchLoading={venueSearchLoading}
            searchingPlaces={searchPlaces.isPending}
            handleSearchPlaces={handleSearchPlaces}
            pickPlace={pickPlace}
            showManualAdd={showManualAdd}
            setShowManualAdd={setShowManualAdd}
            manualName={manualName}
            setManualName={setManualName}
            manualCity={manualCity}
            setManualCity={setManualCity}
            handleAddManually={handleAddManually}
            addingManually={createTheatreManual.isPending}
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

  // ── Native layout (also mobile web — see the isMobile comment above) ────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "transparent" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {/* Mobile header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} disabled={isPending} style={{ padding: 4, opacity: isPending ? 0.4 : 1 }}>
          <ArrowLeft size={20} color={theme.accent} />
        </Pressable>
        <Text style={{ color: theme.text, fontSize: fontSizes.xl, fontWeight: "700", flex: 1 }}>
          {isEditing ? "Edit screening" : "Log a screening"}
        </Text>
        <Pressable
          onPress={handleSubmit}
          disabled={isPending}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: theme.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 }}
        >
          {isPending && <ActivityIndicator color={theme.onAccent} size="small" />}
          <Text style={{ color: theme.onAccent, fontSize: fontSizes.base, fontWeight: "600" }}>
            {isPending ? "Saving…" : "Save"}
          </Text>
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
            <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: theme.text }}>AI ticket extraction</Text>
          </View>
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, lineHeight: 16 }}>
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
            <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: theme.text }}>Scan ticket</Text>
          </View>
        </Pressable>
      </View>

      {/* Movie title search */}
      <Input
        label="Movie title *"
        value={movieQuery}
        onChangeText={(v) => {
          setMovieQuery(v);
          setFs((p) => ({ ...p, movieTitle: v }));
          setShowMovieSuggestions(v.length > 1);
          setErrors((p) => ({ ...p, movieTitle: "" }));
        }}
        onBlur={() => setTimeout(() => setShowMovieSuggestions(false), 150)}
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
          {(movieSuggestions ?? []).map((m: MovieSearchResult) => {
            const thumb = tmdbPosterUrl(m.poster_path, "w92");
            return (
              <Pressable
                key={m.tmdb_id}
                onPress={() => pickMovie(m)}
                style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderBottomWidth: 1, borderBottomColor: theme.divider }}
              >
                {/* Same thumbnail treatment as the web suggestion row —
                    MovieSearchResult already carries poster_path, this
                    just never rendered it. */}
                {thumb ? (
                  <Image source={{ uri: thumb }} style={{ width: 32, height: 46, borderRadius: 4 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: 32, height: 46, borderRadius: 4, backgroundColor: theme.surfaceHigh }} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: theme.text, fontSize: fontSizes.base, fontWeight: "600" }}>{m.title}</Text>
                  {releaseYear(m.release_date) && (
                    <Text style={{ color: `${theme.text}66`, fontSize: fontSizes.sm, marginTop: 2 }}>{releaseYear(m.release_date)}</Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Rating */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>RATING</Text>
        <StarRating value={fs.rating} onChange={(v) => setFs((p) => ({ ...p, rating: v }))} />
      </View>

      {/* Format chips */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>FORMAT</Text>
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
                fontSize: fontSizes.sm,
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
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>
          VENUE RATINGS
        </Text>
        <View style={{ gap: 10 }}>
          {([
            ["Screen", "screenRating"],
            ["Speaker", "speakerRating"],
            ["AC", "acRating"],
            ["Seat", "seatRating"],
          ] as const).map(([label, key]) => (
            <View key={key} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: fontSizes.base, color: theme.text }}>{label}</Text>
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
          <Input label="Time" value={fs.watchedTime} onChangeText={(v) => setFs((p) => ({ ...p, watchedTime: v }))} placeholder="HH:MM" />
        </View>
      </View>

      {/* Venue */}
      <View style={{ marginTop: 14 }}>
        <Input
          label="Theatre *"
          value={venueQuery}
          onChangeText={(v) => {
            setVenueQuery(v);
            setFs((p) => ({ ...p, venueName: v, venueId: undefined }));
            setShowVenueSuggestions(v.length > 1);
            setPlacesResults([]);
            setPlacesSearched(false);
            setErrors((p) => ({ ...p, venueName: "" }));
          }}
          placeholder="Search theatre…"
          error={errors.venueName}
          // Delayed, and overridden by showManualAdd below — see the web
          // branch's identical comment on the same field for why (the
          // "Add manually" mini-form's own inputs need real focus to be
          // typed into, which would otherwise blur this field and close
          // the whole dropdown out from under it).
          onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
        />
        {(showManualAdd || (showVenueSuggestions && venueQuery.trim().length > 2)) && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 8, marginTop: 4, overflow: "hidden", borderWidth: 1, borderColor: theme.divider }}>
            {showManualAdd ? (
              <View style={{ padding: 10 }}>
                <Text style={{ fontSize: fontSizes.sm, color: theme.text, opacity: 0.7, marginBottom: 8 }}>
                  Not on Google Places either? Add it directly.
                </Text>
                <View style={{ gap: 8, marginBottom: 10 }}>
                  <Input value={manualName} onChangeText={setManualName} placeholder="Theatre name" />
                  <Input value={manualCity} onChangeText={setManualCity} placeholder="City" />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    label={createTheatreManual.isPending ? "Adding…" : "Add"}
                    onPress={handleAddManually}
                    disabled={createTheatreManual.isPending || !manualName.trim() || !manualCity.trim()}
                  />
                  <Button label="Cancel" variant="secondary" onPress={() => setShowManualAdd(false)} />
                </View>
              </View>
            ) : (
              <>
                {/* Scrolls independently once local matches + Places results
                    run past ~5 rows — the sticky footer below stays put
                    rather than being one more thing to scroll past. */}
                <ScrollView style={{ maxHeight: 230 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {venueSearchLoading && (
                    <Text style={{ padding: 10, color: theme.text, opacity: 0.6, fontSize: fontSizes.sm }}>
                      Searching…
                    </Text>
                  )}
                  {!venueSearchLoading && (venueSuggestions?.length ?? 0) === 0 && placesResults.length === 0 && (
                    <Text style={{ padding: 10, color: theme.text, opacity: 0.6, fontSize: fontSizes.sm }}>
                      No matches found
                    </Text>
                  )}
                  {(venueSuggestions ?? []).map((v: TheatreMatchCandidate) => (
                    <Pressable key={v.id} onPress={() => pickVenue(v)} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}>
                      <Text style={{ color: theme.text, fontSize: fontSizes.base, fontWeight: "600" }}>{venueDisplayName(v)}</Text>
                      {(v.formatted_address || v.city) && <Text style={{ color: `${theme.text}66`, fontSize: fontSizes.sm, marginTop: 2 }}>{v.formatted_address || v.city}</Text>}
                    </Pressable>
                  ))}
                  {placesResults.map((p: TheatrePlaceSuggestion) => (
                    <Pressable key={p.place_id} onPress={() => pickPlace(p)} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}>
                      <Text style={{ color: theme.text, fontSize: fontSizes.base, fontWeight: "600" }}>{p.main_text ?? p.description}</Text>
                      {p.secondary_text && <Text style={{ color: `${theme.text}66`, fontSize: fontSizes.sm, marginTop: 2 }}>{p.secondary_text}</Text>}
                    </Pressable>
                  ))}
                </ScrollView>
                {/* Sticky footer — always here, not just when the local list
                    comes up empty, so "not the one I meant" always has
                    somewhere to go even when local matches did show up.
                    Two options: search Google, or add it directly —
                    theatre is required to save now, so this field always
                    needs to end somewhere real. */}
                <Pressable
                  onPress={searchPlaces.isPending ? undefined : handleSearchPlaces}
                  style={{ padding: 10, borderTopWidth: 1, borderTopColor: theme.divider }}
                >
                  <Text style={{ color: theme.accent, fontSize: fontSizes.sm, fontWeight: "600" }}>
                    {placesFooterLabel(searchPlaces.isPending, placesSearched, placesResults.length)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setShowManualAdd(true)}
                  style={{ padding: 10, borderTopWidth: 1, borderTopColor: theme.divider }}
                >
                  <Text style={{ color: theme.text, opacity: 0.7, fontSize: fontSizes.sm, fontWeight: "600" }}>
                    Can't find it? Add manually
                  </Text>
                </Pressable>
              </>
            )}
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
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>ARRIVAL</Text>
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
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>SCREENING START</Text>
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
          <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>First Day First Show</Text>
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>The very first screening</Text>
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
          <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>Opening day</Text>
          <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>Any showing, not necessarily the first</Text>
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
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>VISIBILITY</Text>
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
        <Text style={{ color: theme.error, fontSize: fontSizes.sm, marginTop: 8 }}>{errors.submit}</Text>
      )}

      <AITicketModal
        visible={showAIModal}
        onClose={() => setShowAIModal(false)}
        onResult={handleExtractionResult}
      />
    </ScrollView>
  );
}
