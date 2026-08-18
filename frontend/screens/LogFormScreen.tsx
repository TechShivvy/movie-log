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
import React, { useState, useCallback } from "react";
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
import { useRouter } from "expo-router";
import { CameraPlus, Robot, Sparkle, ArrowLeft, X } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useCreateLog } from "../hooks/useMovieLogs";
import { useMovieSearch, useVenueSearch } from "../hooks/useSearch";
import { StarRating } from "../components/ui/StarRating";
import { Input } from "../components/ui/Input";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { AITicketModal } from "../modals/AITicketModal";
import { tmdbPosterUrl, releaseYear } from "../lib/tmdb";
import type {
  Format,
  LogVisibility,
  ArrivalStatus,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  movieTitle:     string;
  // UI preview only — resolved from a TMDB search hit's poster_path. There's
  // no movie_id here: MovieSearchResult only carries a tmdb_id, and turning
  // that into the catalog UUID MovieLogInput.movie_id expects would need a
  // POST /movies (MovieCreate) round-trip that no hook wires up yet. Picking
  // a title from search just fills the title + preview, same as typing it.
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
  arrivalStatus:  ArrivalStatus;
  visibility:     LogVisibility;
  notes:          string;
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
          <WebStarRating value={fs.rating} onChange={(v: number) => setFs((p: FormState) => ({ ...p, rating: v }))} theme={theme} />
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

        {/* Arrival — right col */}
        <div className="field">
          <label>Arrival</label>
          <SegmentedControl
            options={ARRIVAL_OPTS}
            value={fs.arrivalStatus}
            onChange={(v) => setFs((p: FormState) => ({ ...p, arrivalStatus: v as ArrivalStatus }))}
          />
        </div>

        {/* FDFS toggle — left col */}
        <div className="field" style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between" } as React.CSSProperties}>
          <div>
            <label style={{ marginBottom: 2 } as React.CSSProperties}>First Day First Show</label>
            <p style={{ color: "var(--color-divider)", fontSize: 12, margin: 0 } as React.CSSProperties}>Opening day screening</p>
          </div>
          <input
            type="checkbox"
            checked={fs.isFdfs}
            onChange={(e) => setFs((p: FormState) => ({ ...p, isFdfs: e.target.checked }))}
            style={{ width: 18, height: 18, accentColor: theme.accent, flexShrink: 0 } as React.CSSProperties}
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

// ─── Web star rating ──────────────────────────────────────────────────────────

function WebStarRating({ value, onChange, theme }: { value: number; onChange: (v: number) => void; theme: any }) {
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4 } as React.CSSProperties}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          onClick={() => onChange(n === value ? 0 : n)}
          style={{
            fontSize: 26,
            cursor: "pointer",
            color: n <= value ? theme.accent : theme.divider,
            lineHeight: 1,
          } as React.CSSProperties}
        >
          ★
        </span>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function LogFormScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { mutateAsync: createLog, isPending } = useCreateLog();

  // Form state
  const [fs, setFs] = useState<FormState>({
    movieTitle:     "",
    moviePosterUrl: undefined,
    rating:         0,
    format:         undefined,
    venueId:        undefined,
    venueName:      "",
    screenNumber:   "",
    seat:           "",
    isFdfs:         false,
    arrivalStatus:  "on_time",
    visibility:     "public",
    notes:          "",
  });
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

  const pickMovie = useCallback((m: MovieSearchResult) => {
    // No movie_id here — see FormState's note above.
    setFs((p) => ({ ...p, movieTitle: m.title, moviePosterUrl: tmdbPosterUrl(m.poster_path, "w342") }));
    setMovieQuery(m.title);
    setShowMovieSuggestions(false);
  }, []);

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

    try {
      await createLog({
        movie:         fs.movieTitle.trim(),
        theater:       fs.venueName || undefined,
        theatre_id:    fs.venueId,
        screen:        fs.screenNumber || undefined,
        seats:         fs.seat ? fs.seat.split(",").map((s) => s.trim()).filter(Boolean) : [],
        format:        fs.format,
        rating:        fs.rating > 0 ? fs.rating : undefined,
        notes:         fs.notes || undefined,
        visibility:    fs.visibility,
        is_fdfs:       fs.isFdfs,
        arrival_status: fs.arrivalStatus,
      });
      router.back();
    } catch (e: any) {
      setErrors({ submit: e.message ?? "Failed to save log" });
    }
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
              Add new entry
            </div>
            <h1 style={{
              fontSize: 32,
              fontWeight: 700,
              color: theme.text,
              margin: 0,
              letterSpacing: -0.5,
            } as React.CSSProperties}>
              Log a screening
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
              Save log
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
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700", flex: 1 }}>Log a screening</Text>
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

      {/* Arrival */}
      <View style={{ marginTop: 14 }}>
        <Text style={{ fontSize: 12, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>ARRIVAL</Text>
        <SegmentedControl options={ARRIVAL_OPTS} value={fs.arrivalStatus} onChange={(v) => setFs((p) => ({ ...p, arrivalStatus: v as ArrivalStatus }))} />
      </View>

      {/* FDFS toggle */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingVertical: 4 }}>
        <View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text }}>First Day First Show</Text>
          <Text style={{ fontSize: 12, color: `${theme.text}55`, marginTop: 2 }}>Opening day screening</Text>
        </View>
        <Switch value={fs.isFdfs} onValueChange={(v) => setFs((p) => ({ ...p, isFdfs: v }))} trackColor={{ true: theme.accent }} />
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
