import React, { useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../hooks/useTheme";
import { useCreateLog } from "../hooks/useMovieLogs";
import { useMovieSearch, useVenueSearch } from "../hooks/useSearch";
import { StarRating } from "../components/ui/StarRating";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import type { Format, Visibility, ArrivalStatus, MovieSearchResult, Venue } from "../types";
import { styles } from "./LogFormScreen.styles";

const FORMATS: Format[] = ["IMAX", "4DX", "Dolby", "ScreenX", "Laser", "PLF", "Standard"];
const VISIBILITY_OPTS = [
  { label: "Public", value: "public" },
  { label: "Followers", value: "followers_only" },
  { label: "Private", value: "private" },
];
const ARRIVAL_OPTS = [
  { label: "Early", value: "early" },
  { label: "On-time", value: "on_time" },
  { label: "Late", value: "late" },
];

export function LogFormScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const { mutateAsync: createLog, isPending } = useCreateLog();

  // Form fields
  const [movieTitle, setMovieTitle] = useState("");
  const [moviePosterUrl, setMoviePosterUrl] = useState<string | undefined>();
  const [movieId, setMovieId] = useState<string | undefined>();
  const [rating, setRating] = useState(0);
  const [format, setFormat] = useState<Format | undefined>();
  const [venueId, setVenueId] = useState<string | undefined>();
  const [venueName, setVenueName] = useState("");
  const [screenNumber, setScreenNumber] = useState("");
  const [seat, setSeat] = useState("");
  const [isFdfs, setIsFdfs] = useState(false);
  const [arrivalStatus, setArrivalStatus] = useState<ArrivalStatus>("on_time");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [notes, setNotes] = useState("");
  const [ticketUrl, setTicketUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Movie search
  const [movieQuery, setMovieQuery] = useState("");
  const [showMovieSuggestions, setShowMovieSuggestions] = useState(false);
  const { data: movieSuggestions } = useMovieSearch(movieQuery);

  // Venue search
  const [venueQuery, setVenueQuery] = useState("");
  const [showVenueSuggestions, setShowVenueSuggestions] = useState(false);
  const { data: venueSuggestions } = useVenueSearch(venueQuery);

  const pickMovie = useCallback((m: MovieSearchResult) => {
    setMovieTitle(m.title);
    setMovieId(m.id);
    setMoviePosterUrl(m.poster_url);
    setMovieQuery(m.title);
    setShowMovieSuggestions(false);
  }, []);

  const pickVenue = useCallback((v: Venue) => {
    setVenueId(v.id);
    setVenueName(v.name);
    setVenueQuery(v.name);
    setShowVenueSuggestions(false);
  }, []);

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!movieTitle.trim()) newErrors.movieTitle = "Movie title is required";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      await createLog({
        movie_title: movieTitle.trim(),
        movie_poster_url: moviePosterUrl,
        movie_id: movieId,
        venue_id: venueId,
        screen_number: screenNumber || undefined,
        seat: seat || undefined,
        format,
        rating: rating > 0 ? rating : undefined,
        notes: notes || undefined,
        visibility,
        is_fdfs: isFdfs,
        ticket_url: ticketUrl || undefined,
      });
      router.back();
    } catch (e: any) {
      setErrors({ submit: e.message ?? "Failed to save log" });
    }
  }

  const isWeb = Platform.OS === "web";
  const formContent = (
    <>
      {/* Movie title / search */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88` }]}>MOVIE</Text>
      <Input
        label="Title"
        value={movieQuery}
        onChangeText={(v) => { setMovieQuery(v); setMovieTitle(v); setShowMovieSuggestions(v.length > 1); }}
        placeholder="Search or type movie title…"
        error={errors.movieTitle}
      />
      {showMovieSuggestions && (movieSuggestions?.length ?? 0) > 0 && (
        <View style={styles.searchResultsList}>
          {(movieSuggestions ?? []).map((m) => (
            <Pressable
              key={m.id}
              onPress={() => pickMovie(m)}
              style={[styles.searchResult, { backgroundColor: theme.surfaceHigh }]}
            >
              <Text style={[styles.searchResultTitle, { color: theme.text }]}>{m.title}</Text>
              {m.year && <Text style={[styles.searchResultMeta, { color: `${theme.text}66` }]}>{m.year}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {/* Rating */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88`, marginTop: 16 }]}>RATING</Text>
      <StarRating value={rating} onChange={setRating} />

      {/* Format */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88`, marginTop: 16 }]}>FORMAT</Text>
      <View style={styles.formatRow}>
        {FORMATS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFormat(format === f ? undefined : f)}
            style={[
              styles.formatChip,
              {
                backgroundColor: format === f ? theme.accent : theme.surfaceHigh,
                borderColor: format === f ? theme.accent : theme.divider,
              },
            ]}
          >
            <Text style={[styles.formatChipText, { color: format === f ? "#fff" : `${theme.text}88` }]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Venue */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88`, marginTop: 16 }]}>VENUE</Text>
      <Input
        label="Theatre"
        value={venueQuery}
        onChangeText={(v) => { setVenueQuery(v); setVenueName(v); setShowVenueSuggestions(v.length > 1); }}
        placeholder="Search theatre…"
      />
      {showVenueSuggestions && (venueSuggestions?.length ?? 0) > 0 && (
        <View style={styles.searchResultsList}>
          {(venueSuggestions ?? []).map((v) => (
            <Pressable
              key={v.id}
              onPress={() => pickVenue(v)}
              style={[styles.searchResult, { backgroundColor: theme.surfaceHigh }]}
            >
              <Text style={[styles.searchResultTitle, { color: theme.text }]}>{v.name}</Text>
              {v.address && <Text style={[styles.searchResultMeta, { color: `${theme.text}66` }]}>{v.address}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {/* Screen + seat */}
      <View style={[styles.rowTwo, { marginTop: 12 }]}>
        <View style={styles.halfField}>
          <Input label="Screen" value={screenNumber} onChangeText={setScreenNumber} placeholder="e.g. 3" />
        </View>
        <View style={styles.halfField}>
          <Input label="Seat" value={seat} onChangeText={setSeat} placeholder="e.g. H12" />
        </View>
      </View>

      {/* FDFS toggle */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88`, marginTop: 16 }]}>SCREENING</Text>
      <View style={styles.fdfsRow}>
        <View>
          <Text style={[styles.fdfsLabel, { color: theme.text }]}>First Day First Show</Text>
          <Text style={[styles.fdfsHint, { color: `${theme.text}55` }]}>Opening day screening</Text>
        </View>
        <Switch value={isFdfs} onValueChange={setIsFdfs} trackColor={{ true: theme.accent }} />
      </View>

      {/* Arrival */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88` }]}>ARRIVAL</Text>
      <SegmentedControl options={ARRIVAL_OPTS} value={arrivalStatus} onChange={(v) => setArrivalStatus(v as ArrivalStatus)} />

      {/* Visibility */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88`, marginTop: 16 }]}>VISIBILITY</Text>
      <SegmentedControl options={VISIBILITY_OPTS} value={visibility} onChange={(v) => setVisibility(v as Visibility)} />

      {/* Notes */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88`, marginTop: 16 }]}>NOTES</Text>
      <Input
        label=""
        value={notes}
        onChangeText={setNotes}
        placeholder="Write your thoughts…"
        multiline
        numberOfLines={4}
      />

      {/* Ticket URL */}
      <Text style={[styles.sectionTitle, { color: `${theme.text}88`, marginTop: 16 }]}>TICKET</Text>
      <Input label="Ticket URL" value={ticketUrl} onChangeText={setTicketUrl} placeholder="https://…" keyboardType="url" />

      {errors.submit && (
        <Text style={{ color: "#e53935", fontSize: 13, marginTop: 8 }}>{errors.submit}</Text>
      )}

      <Button
        label={isPending ? "Saving…" : "Save Log"}
        variant="primary"
        loading={isPending}
        onPress={handleSubmit}
        style={styles.submitBtn}
      />
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: "transparent" }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: theme.accent, fontSize: 15 }}>← Back</Text>
          </Pressable>
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800" }}>Log a Film</Text>
        </View>

        {isWeb ? (
          <View style={styles.webLayout}>
            {/* Poster preview column */}
            <View style={styles.posterCol}>
              <View style={[styles.posterPreview, { backgroundColor: theme.surfaceHigh }]}>
                {moviePosterUrl ? (
                  <Image source={{ uri: moviePosterUrl }} style={{ width: 220, height: 330 }} resizeMode="cover" />
                ) : (
                  <View style={styles.posterPlaceholder}>
                    <Text style={styles.posterIcon}>🎬</Text>
                    <Text style={[styles.posterHint, { color: `${theme.text}55` }]}>
                      Poster will appear here
                    </Text>
                  </View>
                )}
              </View>
            </View>
            {/* Form column */}
            <View style={styles.formCol}>{formContent}</View>
          </View>
        ) : (
          formContent
        )}
      </ScrollView>
    </View>
  );
}
