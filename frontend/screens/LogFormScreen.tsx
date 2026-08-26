/**
 * LogFormScreen — pixel-accurate match to design spec.
 *
 * Web layout (padding:28px 32px 40px; max-width:1000px):
 *   Header row: "Add new entry" kicker + "Log a screening" h1 | Discard + Save btns
 *   Two-column: 260px poster col + flex:1 form
 * Mobile layout (stacked, gap:14px):
 *   96px poster thumbnail + AI scan btn on same row, back-arrow header
 *
 * One JSX tree, breakpoint-driven (see Part C of the architecture-
 * unification plan) — this was the biggest and riskiest screen in the
 * plan, and for good reason: a 30-prop WebForm component duplicating
 * every field a second time (CSS Grid + raw `<input>`s + an absolute-
 * positioned, z-indexed suggestions overlay) beside the native branch's
 * already-correct version (flex row-pairs + the shared Input component +
 * an in-flow suggestions list that pushes content down instead of
 * overlaying it). WebForm is gone; every field is now built once, using
 * native's already-correct row-pairing and in-flow dropdown technique
 * on both platforms — including dropping the web-only `onMouseDown`
 * blur-suppression idiom, which native never needed (the delayed-blur
 * `setTimeout` both branches already shared is what actually makes a
 * dropdown-row click land before the field's blur closes it).
 *
 * Two deliberate, narrow exceptions:
 *   - Watched date/time: web keeps real `<input type="date"/"time">`
 *     (a genuine browser-native picker, free) — native has no
 *     equivalent RN picker installed. The plan's own recommendation was
 *     to add @react-native-community/datetimepicker so native gets a
 *     real picker too, but that's a native module requiring a rebuild
 *     this pass has no way to produce or verify (this session's testing
 *     is Playwright-driven, against the web build, the whole way
 *     through) — installing a dependency Expo Go doesn't already bundle
 *     and never actually exercising it once would be a real regression
 *     risk dressed up as a feature. Native keeps its existing, already-
 *     honest plain-text fallback (with a format hint) rather than
 *     shipping an unverified native module; this is flagged, not
 *     silently done, and is the one item from the plan's Phase 7 this
 *     pass didn't complete.
 *   - The AI-extraction poster frame/card: genuinely different sizes
 *     and positions (a 260px column on wide screens, an inline 80×120
 *     thumbnail beside the card on narrow ones) — kept as two small
 *     arrangements, computed from isMobile, sharing the same dashed-
 *     border/CameraPlus/Sparkle visual language either way.
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraPlus, Robot, Sparkle } from "phosphor-react-native";
import { useTheme } from "../hooks/useTheme";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useCreateLog, useUpdateLog, useMovieLog } from "../hooks/useMovieLogs";
import { useMovieSearch, useVenueSearch, useCreateMovie, useMovie, useSearchPlaces, useCreateTheatreManual, useTheatreScreens } from "../hooks/useSearch";
import { useVenueRating, useUpsertVenueRating } from "../hooks/useVenueRating";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useToast } from "../context/ToastContext";
import { StarRating } from "../components/ui/StarRating";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Tag } from "../components/ui/Tag";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { ScreenLoader } from "../components/ui/Spinner";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
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
// No certificate enum exists anywhere (frontend, backend, or DB) — same
// situation Format was already in. India-centric since that's this app's
// existing seed data (matches FORMATS' own precedent); tappable chips,
// never a hard picker — the Input above stays freely editable.
const CERTIFICATES = ["U", "U/A", "A", "S"] as const;
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
  // survived past this form. Nothing about it was ever saved.
  movieId:        string | undefined;
  moviePosterUrl: string | undefined;
  rating:         number;
  format:         Format | undefined;
  venueId:        string | undefined;
  venueName:      string;
  screenNumber:   string;
  // Resolved from useTheatreScreens(fs.venueId) via the Screen field's own
  // dropdown, same shape as movieId above — a real screen row's id, not
  // just its free-typed name. Was never set/submitted anywhere in this
  // file despite MovieLog/MovieLogInput both supporting it and
  // ScreenDetailScreen already reading it — the same "free-typed value
  // with nothing real behind it" loophole this file's own comments
  // already describe closing for movie_id/theatre_id, just not yet done
  // for this one. Cleared whenever screenNumber is hand-typed instead of
  // picked, same rule venueId already follows for venueName.
  screenId:       string | undefined;
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
  venueId: undefined, venueName: "", screenNumber: "", screenId: undefined, seat: "",
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
    screenId: log.screen_id,
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

// ─── Small shared pieces ────────────────────────────────────────────────────

function FieldSection({ label, theme, children }: { label: string; theme: any; children: React.ReactNode }) {
  return (
    <View>
      <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}70`, fontWeight: "600", marginBottom: 8, letterSpacing: 0.5 }}>{label}</Text>
      {children}
    </View>
  );
}

function FieldRow({ children, alignTop }: { children: React.ReactNode; alignTop?: boolean }) {
  // Default (stretch) is right for two plain same-height Inputs, but a
  // column that grows taller than its neighbor — the Screen field's
  // dropdown, the Certificate field's suggestion chips — would stretch
  // the shorter neighbor's own box to match under the default, leaving
  // visible dead space in it. alignTop lets those two rows size each
  // column independently instead.
  return <View style={{ flexDirection: "row", gap: 12, alignItems: alignTop ? "flex-start" : undefined }}>{children}</View>;
}

function ToggleRow({ label, description, value, onValueChange, disabled, theme }: {
  label: string; description: string; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; theme: any;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={{ fontSize: fontSizes.base, fontWeight: "600", color: theme.text }}>{label}</Text>
        <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}55`, marginTop: 2 }}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: theme.accent }} />
    </View>
  );
}

// ─── Autocomplete rows/dropdowns — one shared, in-flow implementation for
// both movie and venue search. In-flow (a normal sibling, pushes the rest
// of the form down while open), not position:absolute — matches what the
// native branch already did correctly; web used to overlay it instead,
// which needed its own z-index/positioning-context bookkeeping and an
// onMouseDown blur-suppression trick neither native nor this version
// needs (the shared 150ms delayed-blur below is what actually lets a row
// click land before the field's blur handler closes the dropdown out
// from under it). ─────────────────────────────────────────────────────────

function MovieSuggestionRow({ m, onPress, theme }: { m: MovieSearchResult; onPress: () => void; theme: any }) {
  const thumb = tmdbPosterUrl(m.poster_path, "w92");
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderBottomWidth: 1, borderBottomColor: theme.divider }}>
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
}

function DropdownRow({ title, subtitle, onPress, theme }: { title: string; subtitle?: string; onPress: () => void; theme: any }) {
  return (
    <Pressable onPress={onPress} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: theme.divider }}>
      <Text style={{ color: theme.text, fontSize: fontSizes.base, fontWeight: "600" }}>{title}</Text>
      {subtitle && <Text style={{ color: `${theme.text}66`, fontSize: fontSizes.sm, marginTop: 2 }}>{subtitle}</Text>}
    </Pressable>
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
  // Discard-confirm dirty check — the form-as-loaded (blank for a new
  // entry, the existing log's own values for edit mode, updated by the
  // edit-mode effect below once it resolves), never touched again after
  // that. A ref, not state: nothing should ever re-render off this value
  // changing, and it deliberately doesn't participate in the isDirty
  // useMemo's own dependency array.
  const initialFormRef = useRef<FormState>(BLANK_FORM);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

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
  // Screen dropdown — only reachable once a real venue is picked (a
  // theatre_id to query screens under); a Places-picked or hand-typed
  // venue with no local row falls back to plain free text, same as
  // before. Reuses the same in-flow DropdownRow idiom the movie/venue
  // fields above already establish.
  const { data: theatreScreens } = useTheatreScreens(fs.venueId);
  const [showScreenSuggestions, setShowScreenSuggestions] = useState(false);
  const screenDropdownOpen = showScreenSuggestions && !!fs.venueId && (theatreScreens?.length ?? 0) > 0;

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
    const loaded = logToFormState(existingLog);
    setFs(loaded);
    // Discard's dirty check compares against THIS (the log as it was
    // loaded), not BLANK_FORM — an edit form is never "blank" to begin
    // with, and comparing edits against an empty form would show the
    // confirm dialog for every discard, changed or not.
    initialFormRef.current = loaded;
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

  const setMovieQueryAndForm = useCallback((v: string) => {
    setMovieQuery(v);
    setFs((p) => ({ ...p, movieTitle: v }));
    setShowMovieSuggestions(v.length > 1);
    setErrors((p) => ({ ...p, movieTitle: "" }));
  }, []);

  const setVenueQueryAndForm = useCallback((v: string) => {
    setVenueQuery(v);
    // A picked screen belongs to whatever theatre it was fetched under —
    // changing the venue away from that theatre leaves screenId pointing
    // at a screen that's no longer under the (new, or not-yet-real)
    // venueId this log would actually submit. Clearing it here matches
    // venueId's own clear-on-typing rule just above.
    setFs((p) => ({ ...p, venueName: v, venueId: undefined, screenNumber: "", screenId: undefined }));
    setShowVenueSuggestions(v.length > 1);
    setPlacesResults([]);
    setPlacesSearched(false);
    setErrors((p) => ({ ...p, venueName: "" }));
  }, []);

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
    // Same reasoning as setVenueQueryAndForm above — a new venue means
    // any previously-picked screen no longer applies.
    setFs((p) => ({ ...p, venueId: v.id, venueName: v.name, screenNumber: "", screenId: undefined }));
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
    // Same reasoning as pickVenue above — and a Places pick has no local
    // theatre_id yet anyway (screens can't be looked up for it at all
    // until the server resolves it on submit), so there's nothing valid
    // a screenId could point at here regardless.
    setFs((p) => ({ ...p, venueId: undefined, venueName: name, screenNumber: "", screenId: undefined }));
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

  // Whether the form has anything in it worth confirming before throwing
  // away — every FormState field is a primitive, so a plain per-key
  // comparison against the loaded baseline is enough (no nested
  // objects/arrays in this shape to worry about missing).
  const isDirty = useMemo(
    () => (Object.keys(BLANK_FORM) as (keyof FormState)[]).some((k) => fs[k] !== initialFormRef.current[k]),
    [fs],
  );

  function handleDiscard() {
    // An untouched form has nothing to lose — don't make the user
    // confirm leaving a form they never filled in.
    if (isDirty) setShowDiscardConfirm(true);
    else router.back();
  }

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
      screen_id:     fs.screenId,
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
  if (isEditing && isLoadingExisting) return <ScreenLoader />;

  const venueDropdownOpen = showManualAdd || (showVenueSuggestions && venueQuery.trim().length > 2);
  const movieDropdownOpen = showMovieSuggestions && (movieSuggestions?.length ?? 0) > 0;

  // ── Poster + AI-extraction card — the one deliberately-kept two-
  // arrangement piece (inline thumbnail beside the card on narrow
  // screens, a tall column with the card below on wide ones); the
  // dashed-border/CameraPlus/Sparkle visual language is shared either
  // way. ───────────────────────────────────────────────────────────────
  const posterFrame = isMobile ? (
    <View style={{ width: 80, height: 120, borderRadius: 8, borderWidth: 2, borderStyle: "dashed", borderColor: theme.divider, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: theme.surfaceHigh }}>
      {fs.moviePosterUrl ? (
        <Image source={{ uri: fs.moviePosterUrl }} style={{ width: 80, height: 120 }} resizeMode="cover" />
      ) : (
        <CameraPlus size={24} color={`${theme.text}44`} />
      )}
    </View>
  ) : (
    <View style={{ width: 260, aspectRatio: 2 / 3, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: theme.divider, overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: theme.surfaceHigh }}>
      {fs.moviePosterUrl ? (
        <Image source={{ uri: fs.moviePosterUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <View style={{ alignItems: "center", padding: 20 }}>
          <CameraPlus size={40} color={`${theme.text}44`} />
          <Text style={{ color: `${theme.text}44`, fontSize: fontSizes.sm, marginTop: 10, textAlign: "center", lineHeight: 18 }}>
            Poster will appear here
          </Text>
        </View>
      )}
    </View>
  );

  const aiCard = (
    <Pressable
      onPress={() => setShowAIModal(true)}
      style={isMobile
        ? { flex: 1, backgroundColor: theme.surface, borderRadius: 10, padding: 14, justifyContent: "center", gap: 6 }
        : { backgroundColor: theme.surface, borderRadius: 10, padding: 14, gap: 10, marginTop: 14 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Sparkle size={15} color={theme.accent} />
        <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: theme.text }}>AI ticket extraction</Text>
      </View>
      <Text style={{ fontSize: fontSizes.sm, color: `${theme.text}66`, lineHeight: 18 }}>
        Scan your ticket to auto-fill this form.
      </Text>
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
        borderWidth: 1, borderColor: theme.divider, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
      }}>
        <Robot size={13} color={theme.text} />
        <Text style={{ fontSize: fontSizes.sm, fontWeight: "600", color: theme.text }}>Scan ticket</Text>
      </View>
    </Pressable>
  );

  const posterSection = isMobile ? (
    <View style={{ flexDirection: "row", gap: 14, marginBottom: 14 }}>
      {posterFrame}
      {aiCard}
    </View>
  ) : (
    <View style={{ width: 260, flexShrink: 0 }}>
      {posterFrame}
      {aiCard}
    </View>
  );

  // ── Venue dropdown body (manual-add mini-form, or search results + the
  // sticky "search Places"/"add manually" footer) — shared by both
  // layouts since the field itself now lives in one place. ──────────────
  const venueDropdownBody = showManualAdd ? (
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
      {/* Scrolls independently once local matches + Places results run
          past ~5 rows — the sticky footer below stays put rather than
          being one more thing to scroll past. */}
      <ScrollView style={{ maxHeight: 230 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {venueSearchLoading && (
          <Text style={{ padding: 10, color: theme.text, opacity: 0.6, fontSize: fontSizes.sm }}>Searching…</Text>
        )}
        {!venueSearchLoading && (venueSuggestions?.length ?? 0) === 0 && placesResults.length === 0 && (
          <Text style={{ padding: 10, color: theme.text, opacity: 0.6, fontSize: fontSizes.sm }}>No matches found</Text>
        )}
        {(venueSuggestions ?? []).map((v: TheatreMatchCandidate) => (
          <DropdownRow key={v.id} title={venueDisplayName(v)} subtitle={v.formatted_address || v.city} onPress={() => pickVenue(v)} theme={theme} />
        ))}
        {placesResults.map((p: TheatrePlaceSuggestion) => (
          <DropdownRow key={p.place_id} title={p.main_text ?? p.description ?? "Unknown"} subtitle={p.secondary_text} onPress={() => pickPlace(p)} theme={theme} />
        ))}
      </ScrollView>
      {/* Sticky footer — always here, not just when the local list comes
          up empty, so "not the one I meant" always has somewhere to go
          even when local matches did show up. Two options: search
          Google, or add it directly — theatre is required to save now,
          so this field always needs to end somewhere real. */}
      <Pressable onPress={searchPlaces.isPending ? undefined : handleSearchPlaces} style={{ padding: 10, borderTopWidth: 1, borderTopColor: theme.divider }}>
        <Text style={{ color: theme.accent, fontSize: fontSizes.sm, fontWeight: "600" }}>
          {placesFooterLabel(searchPlaces.isPending, placesSearched, placesResults.length)}
        </Text>
      </Pressable>
      <Pressable onPress={() => setShowManualAdd(true)} style={{ padding: 10, borderTopWidth: 1, borderTopColor: theme.divider }}>
        <Text style={{ color: theme.text, opacity: 0.7, fontSize: fontSizes.sm, fontWeight: "600" }}>Can't find it? Add manually</Text>
      </Pressable>
    </>
  );

  const fields = (
    <View style={{ gap: 14 }}>
      {/* Movie title — in-flow suggestions dropdown, see this file's own
          header comment for why it's not position:absolute any more. */}
      <View>
        <Input
          label="Movie title *"
          value={movieQuery}
          onChangeText={setMovieQueryAndForm}
          onBlur={() => setTimeout(() => setShowMovieSuggestions(false), 150)}
          placeholder="Search or type movie title…"
          error={errors.movieTitle}
        />
        {movieDropdownOpen && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 8, marginTop: 4, overflow: "hidden", borderWidth: 1, borderColor: theme.divider }}>
            {(movieSuggestions ?? []).map((m) => (
              <MovieSuggestionRow key={m.tmdb_id} m={m} onPress={() => pickMovie(m)} theme={theme} />
            ))}
          </View>
        )}
      </View>

      <FieldSection label="RATING" theme={theme}>
        <StarRating value={fs.rating} onChange={(v) => setFs((p) => ({ ...p, rating: v }))} />
      </FieldSection>

      {/* Venue ratings — screen/speaker/AC/seat, a separate
          visit_venue_ratings row saved via a follow-up PUT after the log
          itself saves (see handleSubmit). Never collected in this form
          before, despite LogDetailScreen already having a whole section
          to display them. */}
      <FieldSection label="VENUE RATINGS" theme={theme}>
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
      </FieldSection>

      <FieldSection label="FORMAT" theme={theme}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {FORMATS.map((f) => (
            <Pressable key={f} onPress={() => setFs((p) => ({ ...p, format: p.format === f ? undefined : f as Format }))}>
              <Tag variant={fs.format === f ? "accent" : "neutral"} label={f} />
            </Pressable>
          ))}
        </View>
      </FieldSection>

      {/* Watched date/time — the one deliberate Platform.OS split left in
          this file; see its own header comment. */}
      <FieldRow>
        <View style={{ flex: 1 }}>
          {Platform.OS === "web" ? (
            <div className="field">
              <label>Watched on</label>
              <input type="date" className="input" value={fs.watchedDate} onChange={(e) => setFs((p) => ({ ...p, watchedDate: e.target.value }))} />
            </div>
          ) : (
            <Input label="Watched on" value={fs.watchedDate} onChangeText={(v) => setFs((p) => ({ ...p, watchedDate: v }))} placeholder="YYYY-MM-DD" />
          )}
        </View>
        <View style={{ flex: 1 }}>
          {Platform.OS === "web" ? (
            <div className="field">
              <label>Time</label>
              <input type="time" className="input" value={fs.watchedTime} onChange={(e) => setFs((p) => ({ ...p, watchedTime: e.target.value }))} />
            </div>
          ) : (
            <Input label="Time" value={fs.watchedTime} onChangeText={(v) => setFs((p) => ({ ...p, watchedTime: v }))} placeholder="HH:MM" />
          )}
        </View>
      </FieldRow>

      {/* Venue — in-flow suggestions dropdown, same reason as Movie title
          above. */}
      <View>
        <Input
          label="Theatre *"
          value={venueQuery}
          onChangeText={setVenueQueryAndForm}
          placeholder="Search theatre…"
          error={errors.venueName}
          // Delayed, and overridden by showManualAdd — the "Add manually"
          // mini-form's own inputs need real focus to be typed into,
          // which would otherwise blur this field and close the whole
          // dropdown out from under it.
          onBlur={() => setTimeout(() => setShowVenueSuggestions(false), 150)}
        />
        {venueDropdownOpen && (
          <View style={{ backgroundColor: theme.surface, borderRadius: 8, marginTop: 4, overflow: "hidden", borderWidth: 1, borderColor: theme.divider }}>
            {venueDropdownBody}
          </View>
        )}
      </View>

      <FieldRow alignTop>
        {/* In-flow suggestions dropdown, same idiom as Movie title/Theatre
            above — only populated once a real venueId exists (a
            Places-picked or hand-typed venue with no local row has no
            theatre_id to look screens up under, so this quietly has
            nothing to show and the field stays plain free text). */}
        <View style={{ flex: 1 }}>
          <Input
            label="Screen"
            value={fs.screenNumber}
            onChangeText={(v) => { setFs((p) => ({ ...p, screenNumber: v, screenId: undefined })); setShowScreenSuggestions(v.length > 0); }}
            onFocus={() => setShowScreenSuggestions(true)}
            onBlur={() => setTimeout(() => setShowScreenSuggestions(false), 150)}
            placeholder="e.g. 3"
          />
          {screenDropdownOpen && (
            <View style={{ backgroundColor: theme.surface, borderRadius: 8, marginTop: 4, overflow: "hidden", borderWidth: 1, borderColor: theme.divider }}>
              {theatreScreens!.map((s) => (
                <DropdownRow
                  key={s.id}
                  title={s.name}
                  subtitle={s.screen_type}
                  onPress={() => { setFs((p) => ({ ...p, screenNumber: s.name, screenId: s.id })); setShowScreenSuggestions(false); }}
                  theme={theme}
                />
              ))}
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}><Input label="Seat" value={fs.seat} onChangeText={(v) => setFs((p) => ({ ...p, seat: v }))} placeholder="e.g. H12" /></View>
      </FieldRow>

      <Input label="Language" value={fs.language} onChangeText={(v) => setFs((p) => ({ ...p, language: v }))} placeholder="e.g. English" />

      <FieldRow>
        <View style={{ flex: 1 }}><Input label="Price" value={fs.price} onChangeText={(v) => setFs((p) => ({ ...p, price: v }))} placeholder="e.g. 250" keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Input label="Currency" value={fs.currency} onChangeText={(v) => setFs((p) => ({ ...p, currency: v.toUpperCase() }))} placeholder="e.g. INR" maxLength={3} /></View>
      </FieldRow>

      <FieldRow alignTop>
        {/* No certificate enum exists (frontend, backend, or DB) — same
            shape of gap Format was already in, solved the same way: a
            small suggestion row beneath the still-freely-editable Input,
            not a hard picker. */}
        <View style={{ flex: 1 }}>
          <Input label="Certificate" value={fs.certificate} onChangeText={(v) => setFs((p) => ({ ...p, certificate: v }))} placeholder="e.g. U/A" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
            {CERTIFICATES.map((c) => (
              <Pressable key={c} onPress={() => setFs((p) => ({ ...p, certificate: c }))}>
                <Tag variant={fs.certificate === c ? "accent" : "neutral"} size="sm" label={c} />
              </Pressable>
            ))}
          </View>
        </View>
        <View style={{ flex: 1 }}><Input label="Booking ref" value={fs.bookingRef} onChangeText={(v) => setFs((p) => ({ ...p, bookingRef: v }))} placeholder="e.g. BMS12345678" /></View>
      </FieldRow>

      <FieldSection label="ARRIVAL" theme={theme}>
        <SegmentedControl options={ARRIVAL_OPTS} value={fs.arrivalStatus} onChange={(v) => setFs((p) => ({ ...p, arrivalStatus: v as ArrivalStatus }))} />
      </FieldSection>
      {fs.arrivalStatus !== "on_time" && (
        <Input
          label={`Minutes ${fs.arrivalStatus}`}
          value={fs.arrivalDeltaMinutes}
          onChangeText={(v) => setFs((p) => ({ ...p, arrivalDeltaMinutes: v }))}
          placeholder="e.g. 10"
          keyboardType="number-pad"
        />
      )}

      {/* Screening start + delta — whether the movie itself started on
          time is distinct from the caller's own arrival, and was never
          collected here at all. */}
      <FieldSection label="SCREENING START" theme={theme}>
        <SegmentedControl
          options={SCREENING_START_OPTS}
          value={fs.screeningStartStatus ?? ""}
          onChange={(v) => setFs((p) => ({ ...p, screeningStartStatus: (v || undefined) as ScreeningStartStatus | undefined }))}
        />
      </FieldSection>
      {(fs.screeningStartStatus === "early" || fs.screeningStartStatus === "delayed") && (
        <Input
          label={`Minutes ${fs.screeningStartStatus}`}
          value={fs.screeningStartDeltaMinutes}
          onChangeText={(v) => setFs((p) => ({ ...p, screeningStartDeltaMinutes: v }))}
          placeholder="e.g. 5"
          keyboardType="number-pad"
        />
      )}

      <ToggleRow
        label="First Day First Show"
        description="The very first screening"
        value={fs.isFdfs}
        onValueChange={(v) => setFs((p) => ({ ...p, isFdfs: v, isFirstDay: v ? true : p.isFirstDay }))}
        theme={theme}
      />
      {/* is_fdfs implies is_first_day server-side, mirrored above. */}
      <ToggleRow
        label="Opening day"
        description="Any showing, not necessarily the first"
        value={fs.isFirstDay}
        onValueChange={(v) => setFs((p) => ({ ...p, isFirstDay: v }))}
        disabled={fs.isFdfs}
        theme={theme}
      />

      <FieldSection label="VISIBILITY" theme={theme}>
        <SegmentedControl options={VISIBILITY_OPTS} value={fs.visibility} onChange={(v) => setFs((p) => ({ ...p, visibility: v as LogVisibility }))} />
      </FieldSection>

      <Input
        label="Review / Notes"
        value={fs.notes}
        onChangeText={(v) => setFs((p) => ({ ...p, notes: v }))}
        placeholder="Write your thoughts…"
        multiline
        numberOfLines={4}
      />
      {/* No "Ticket URL" field — the backend has no such column.
          ticket_image_path is a Supabase Storage path set only via the AI
          extraction flow, never a manually-typed URL. */}

      {errors.submit && <Text style={{ color: theme.error, fontSize: fontSizes.sm }}>{errors.submit}</Text>}
    </View>
  );

  const header = isMobile ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
      {/* Same discard action as the desktop header's own Discard button
          below, just wearing an icon-only shape — same red tint and the
          same dirty-check confirm, not a plain unconfirmed back button. */}
      <Button variant="icon" icon="caret-left" color={theme.error} accessibilityLabel="Discard" onPress={handleDiscard} disabled={isPending} />
      <Text style={{ color: theme.text, fontSize: fontSizes.xl, fontWeight: "700", flex: 1 }}>
        {isEditing ? "Edit screening" : "Log a screening"}
      </Text>
      <Button label={isPending ? "Saving…" : "Save"} loading={isPending} onPress={handleSubmit} disabled={isPending} />
    </View>
  ) : (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
      <View>
        <Text style={{ fontSize: fontSizes.xs, letterSpacing: 2.2, textTransform: "uppercase", color: theme.accent, marginBottom: 4 }}>
          {isEditing ? "Edit entry" : "Add new entry"}
        </Text>
        <Text style={{ fontSize: fontSizes.h1, fontWeight: "700", color: theme.text, letterSpacing: -0.5 }}>
          {isEditing ? "Edit screening" : "Log a screening"}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {/* Discard disabled mid-save too — navigating away right as the
            request lands read as a race between "did my save actually
            happen" and "I just left", same reasoning as blocking the
            delete dialog from being dismissed mid-flight. Red like
            ConfirmDialog's own destructive confirm / Settings' "Delete
            account" — this is the same class of action (throws away
            work), and now actually confirms when the form has anything
            in it worth losing (see isDirty/handleDiscard above), instead
            of silently discarding a form full of typed fields. */}
        <Button variant="secondary" icon="x" label="Discard" color={theme.error} onPress={handleDiscard} disabled={isPending} />
        <Button
          label={isPending ? "Saving…" : isEditing ? "Save changes" : "Save log"}
          loading={isPending}
          onPress={handleSubmit}
          disabled={isPending}
        />
      </View>
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg, scrollbarGutter: "stable" } as any}
      contentContainerStyle={{
        paddingTop: isMobile ? 16 : 28,
        paddingHorizontal: isMobile ? 16 : 32,
        paddingBottom: isMobile ? 80 : 40,
      }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ maxWidth: isMobile ? undefined : 1000, width: "100%", alignSelf: isMobile ? "stretch" : "center" }}>
        {header}
        {isMobile ? (
          <>
            {posterSection}
            {fields}
          </>
        ) : (
          <View style={{ flexDirection: "row", gap: 28, alignItems: "flex-start" }}>
            {posterSection}
            <View style={{ flex: 1, minWidth: 0 }}>{fields}</View>
          </View>
        )}
      </View>

      <AITicketModal
        visible={showAIModal}
        onClose={() => setShowAIModal(false)}
        onResult={handleExtractionResult}
      />

      <ConfirmDialog
        visible={showDiscardConfirm}
        title="Discard changes?"
        message="You'll lose what you've entered on this form."
        confirmLabel="Discard"
        destructive
        onConfirm={() => router.back()}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </ScrollView>
  );
}
