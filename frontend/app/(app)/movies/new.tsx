import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Button } from "../../../src/components/Button";
import { Field } from "../../../src/components/Field";
import { ImageViewer } from "../../../src/components/ImageViewer";
import { useToast } from "../../../src/hooks/useToast";
import { getUserOpenRouterKey } from "../../../src/lib/secure-store";
import { supabase } from "../../../src/lib/supabase";
import {
  useCreateMovieLogMutation,
  useExtractTicketMetadataMutation,
} from "../../../src/store/apiSlice";
import { setAutofillStatus } from "../../../src/store/uiSlice";
import { useAppDispatch, useAppSelector } from "../../../src/store";
import { useTheme } from "../../../src/theme/ThemeContext";
import { radii, spacing, typography } from "../../../src/theme";

type Draft = {
  movie: string;
  watched_date: string;
  watched_time: string;
  timezone_abbrv: string;
  theater: string;
  seats: string;
  language: string;
  screen: string;
  booking_ref: string;
  certificate: string;
  notes: string;
  rating: string;
};

const EMPTY: Draft = {
  movie: "",
  watched_date: "",
  watched_time: "",
  timezone_abbrv: "",
  theater: "",
  seats: "",
  language: "",
  screen: "",
  booking_ref: "",
  certificate: "",
  notes: "",
  rating: "",
};

export default function NewMovieScreen() {
  const router = useRouter();
  const colors = useTheme();
  const dispatch = useAppDispatch();
  const { toastError, toastSuccess, toast } = useToast();
  const autofillStatus = useAppSelector((s) => s.ui.autofillStatus);
  const autoFillEnabled = useAppSelector((s) => s.settings.autoFill);
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  const [ticketUri, setTicketUri] = useState<string | null>(null);
  const [ticketMime, setTicketMime] = useState("image/jpeg");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [movieError, setMovieError] = useState("");

  const [extractTicket] = useExtractTicketMetadataMutation();
  const [createLog] = useCreateMovieLogMutation();

  function set(field: keyof Draft) {
    return (v: string) => setDraft((d) => ({ ...d, [field]: v }));
  }

  async function runAutoFill(uri: string, mime: string) {
    dispatch(setAutofillStatus("loading"));
    try {
      const ownKey = await getUserOpenRouterKey();
      const result = await extractTicket({
        imageUri: uri,
        mimeType: mime,
        ownKey,
      }).unwrap();
      setDraft((d) => ({
        ...d,
        movie: result.movie ?? d.movie,
        watched_date: result.date ?? d.watched_date,
        watched_time: result.time ?? d.watched_time,
        timezone_abbrv: result.timezone_abbrv ?? d.timezone_abbrv,
        theater: result.theater ?? d.theater,
        seats: result.seats?.join(", ") ?? d.seats,
        language: result.language ?? d.language,
        screen: result.screen ?? d.screen,
        booking_ref: result.booking_ref ?? d.booking_ref,
        certificate: result.certificate ?? d.certificate,
      }));
      toast("Auto-fill complete!", "success");
    } catch (e) {
      toastError(e);
    } finally {
      dispatch(setAutofillStatus(null));
    }
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast("Photo library access is required.", "warning");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const uri = asset?.uri ?? null;
    const mime = asset?.mimeType ?? "image/jpeg";
    setTicketUri(uri);
    setTicketMime(mime);
    if (uri && autoFillEnabled) runAutoFill(uri, mime);
  }

  async function save() {
    if (!draft.movie.trim()) {
      setMovieError("Movie title is required.");
      toast("Please enter a movie title.", "warning");
      return;
    }
    setMovieError("");
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toastError({ status: 401 });
        return;
      }

      let ticket_image_path: string | null = null;
      if (ticketUri) {
        // Derive extension from MIME type — never from the URI because on web
        // the URI is a blob URL (no file extension) and would break storage paths.
        const mimeToExt: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/jpg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };
        const ext = mimeToExt[ticketMime] ?? "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const resp = await fetch(ticketUri);
        const blob = await resp.blob();
        const { error: uploadErr } = await supabase.storage
          .from("ticket-images")
          .upload(path, blob, { upsert: false, contentType: ticketMime });
        if (uploadErr) throw uploadErr;
        ticket_image_path = path;
      }

      await createLog({
        movie: draft.movie || null,
        watched_date: draft.watched_date || null,
        watched_time: draft.watched_time || null,
        timezone_abbrv: draft.timezone_abbrv || null,
        theater: draft.theater || null,
        seats: draft.seats
          ? draft.seats
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        language: draft.language || null,
        screen: draft.screen || null,
        booking_ref: draft.booking_ref || null,
        certificate: draft.certificate || null,
        notes: draft.notes || null,
        rating: draft.rating ? parseInt(draft.rating, 10) : null,
        ticket_image_path,
      }).unwrap();

      toastSuccess("Movie log saved!");
      router.replace("/(app)/movies");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.outerContent}
    >
      <View style={[styles.content, wide && styles.contentWide]}>
        {/* Left panel: image + autofill */}
        <View style={wide ? styles.leftPanel : styles.fullWidth}>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>
            New Movie Log
          </Text>

          <Button
            label="Upload ticket image"
            variant="secondary"
            fullWidth
            onPress={pickImage}
          />

          {ticketUri ? (
            <ImageViewer uri={ticketUri} height={wide ? 320 : 200} />
          ) : null}

          {ticketUri ? (
            <View
              style={[
                styles.autofillBtn,
                {
                  borderColor: colors.indigo,
                  backgroundColor: colors.indigoMuted,
                },
                autofillStatus === "loading" ? styles.autofillBusy : null,
              ]}
            >
              {autofillStatus === "loading" ? (
                <View style={styles.autofillLoading}>
                  <ActivityIndicator size="small" color={colors.indigo} />
                  <Text style={[styles.autofillText, { color: colors.indigo }]}>
                    Extracting details…
                  </Text>
                </View>
              ) : (
                <Button
                  label={
                    autoFillEnabled
                      ? "Auto-fill (on by default)"
                      : "Auto-fill details"
                  }
                  variant="ghost"
                  fullWidth
                  disabled={autofillStatus === "loading"}
                  onPress={() =>
                    ticketUri && runAutoFill(ticketUri, ticketMime)
                  }
                />
              )}
            </View>
          ) : null}

          {!wide ? <View style={{ height: spacing.sm }} /> : null}
        </View>

        {/* Right panel: fields */}
        <View style={wide ? styles.rightPanel : styles.fullWidth}>
          <View style={styles.fields}>
            <Field
              label="Movie title"
              value={draft.movie}
              onChangeText={(v) => {
                set("movie")(v);
                if (v.trim()) setMovieError("");
              }}
              icon="film-outline"
              error={movieError}
            />
            <View style={styles.row2}>
              <View style={styles.flex1}>
                <Field
                  label="Date (YYYY-MM-DD)"
                  value={draft.watched_date}
                  onChangeText={set("watched_date")}
                  icon="calendar-outline"
                />
              </View>
              <View style={styles.flex1}>
                <Field
                  label="Time (HH:MM)"
                  value={draft.watched_time}
                  onChangeText={set("watched_time")}
                  icon="time-outline"
                />
              </View>
            </View>
            <View style={styles.row2}>
              <View style={styles.flex1}>
                <Field
                  label="Timezone"
                  value={draft.timezone_abbrv}
                  onChangeText={set("timezone_abbrv")}
                  hint="e.g. IST, EST"
                />
              </View>
              <View style={styles.flex1}>
                <Field
                  label="Language"
                  value={draft.language}
                  onChangeText={set("language")}
                  icon="language-outline"
                />
              </View>
            </View>
            <Field
              label="Theater"
              value={draft.theater}
              onChangeText={set("theater")}
              icon="location-outline"
            />
            <View style={styles.row2}>
              <View style={styles.flex1}>
                <Field
                  label="Screen / Audi"
                  value={draft.screen}
                  onChangeText={set("screen")}
                />
              </View>
              <View style={styles.flex1}>
                <Field
                  label="Certificate"
                  value={draft.certificate}
                  onChangeText={set("certificate")}
                  hint="e.g. U/A, PG"
                />
              </View>
            </View>
            <Field
              label="Seats (comma separated)"
              value={draft.seats}
              onChangeText={set("seats")}
              icon="person-outline"
            />
            <Field
              label="Booking ref"
              value={draft.booking_ref}
              onChangeText={set("booking_ref")}
              icon="receipt-outline"
            />
            <View style={styles.row2}>
              <View style={styles.flex1}>
                <Field
                  label="Rating (1–10)"
                  value={draft.rating}
                  onChangeText={set("rating")}
                  keyboardType="numeric"
                  icon="star-outline"
                />
              </View>
              <View style={styles.flex1} />
            </View>
            <Field
              label="Notes"
              value={draft.notes}
              onChangeText={set("notes")}
              multiline
              icon="document-text-outline"
            />
          </View>

          <Button
            label="Save movie log"
            fullWidth
            loading={saving}
            onPress={save}
          />
          <View style={{ height: spacing.sm }} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  outerContent: { alignItems: "center", paddingBottom: spacing.xxl },
  content: {
    width: "100%",
    maxWidth: 720,
    padding: spacing.lg,
    rowGap: spacing.md,
  },
  contentWide: {
    flexDirection: "row",
    alignItems: "flex-start",
    maxWidth: 1100,
    columnGap: spacing.xl,
  },
  leftPanel: { flex: 1, rowGap: spacing.md },
  rightPanel: { flex: 1.4, rowGap: spacing.md },
  fullWidth: { width: "100%", rowGap: spacing.md },
  heading: { ...typography.h2, marginBottom: spacing.sm },
  autofillBtn: { borderRadius: radii.md, borderWidth: 1 },
  autofillBusy: { opacity: 0.7 },
  autofillLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: spacing.sm,
    padding: spacing.md,
  },
  autofillText: { ...typography.body, fontWeight: "600" },
  fields: { rowGap: spacing.md },
  row2: { flexDirection: "row", columnGap: spacing.md },
  flex1: { flex: 1 },
});
