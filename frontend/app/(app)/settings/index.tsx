import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Clipboard,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Button } from "../../../src/components/Button";
import { Field } from "../../../src/components/Field";
import { useToast } from "../../../src/hooks/useToast";
import {
  clearUserOpenRouterKey,
  getUserOpenRouterKey,
  setUserOpenRouterKey,
} from "../../../src/lib/secure-store";
import { supabase } from "../../../src/lib/supabase";
import { useAppDispatch, useAppSelector } from "../../../src/store";
import {
  setTheme,
  setAutoFill as setAutoFillAction,
  setPreferredModel as setPreferredModelAction,
} from "../../../src/store/settingsSlice";
import {
  useTheme,
  THEME_NAMES,
  type ThemeName,
} from "../../../src/theme/ThemeContext";
import { radii, spacing, typography } from "../../../src/theme";

const MODELS = [
  "qwen/qwen2.5-vl-72b-instruct:free",
  "google/gemma-4-31b-it:free",
];

export default function SettingsScreen() {
  const colors = useTheme();
  const dispatch = useAppDispatch();
  const { toastError, toastSuccess, toast } = useToast();
  const session = useAppSelector((s) => s.auth.session);
  const savedTheme = useAppSelector((s) => s.settings.themeName);
  const savedAutoFill = useAppSelector((s) => s.settings.autoFill);
  const savedModel = useAppSelector((s) => s.settings.preferredModel);

  const [ownKey, setOwnKey] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("user_settings")
      .select("auto_fill,preferred_model")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      dispatch(setAutoFillAction(Boolean(data.auto_fill)));
      dispatch(setPreferredModelAction(data.preferred_model || MODELS[0]));
    }
    const key = await getUserOpenRouterKey();
    setOwnKey(key || "");
  }, [dispatch]);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
    }, [loadSettings]),
  );

  async function saveSettings() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toastError({ status: 401 });
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("user_settings").upsert({
      user_id: user.id,
      auto_fill: savedAutoFill,
      preferred_model: savedModel,
    });
    if (error) {
      toastError(error);
      setSaving(false);
      return;
    }
    if (ownKey.trim()) await setUserOpenRouterKey(ownKey.trim());
    else await clearUserOpenRouterKey();
    setSaving(false);
    toastSuccess("Settings saved.");
  }

  async function copyAccessToken() {
    const token = session?.access_token;
    if (!token) {
      toast("No active session.", "warning");
      return;
    }
    if (Platform.OS === "web") await navigator.clipboard.writeText(token);
    else Clipboard.setString(token);
    toast(
      "Access token copied! Paste in Swagger → Authorize (Bearer).",
      "info",
      6000,
    );
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.heading, { color: colors.textPrimary }]}>
        Settings
      </Text>

      {/* Auto-fill */}
      <View
        style={[
          styles.row,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View>
          <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
            Auto-fill on upload
          </Text>
          <Text style={[styles.rowCaption, { color: colors.textSecondary }]}>
            Extract ticket details automatically
          </Text>
        </View>
        <Switch
          value={savedAutoFill}
          onValueChange={(v: boolean) => {
            dispatch(setAutoFillAction(v));
          }}
          thumbColor={colors.accent}
          trackColor={{ true: colors.accent + "55", false: colors.border }}
        />
      </View>

      {/* Theme */}
      <View
        style={[
          styles.section,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          Theme
        </Text>
        {THEME_NAMES.map(({ name, label }) => (
          <View key={name} style={styles.radioRow}>
            <Ionicons
              name={
                savedTheme === name ? "radio-button-on" : "radio-button-off"
              }
              size={18}
              color={savedTheme === name ? colors.accent : colors.textSecondary}
            />
            <Text
              style={[
                styles.radioLabel,
                {
                  color:
                    savedTheme === name
                      ? colors.textPrimary
                      : colors.textSecondary,
                },
              ]}
              onPress={() => dispatch(setTheme(name as ThemeName))}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Model */}
      <View
        style={[
          styles.section,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          Preferred free model
        </Text>
        {MODELS.map((m) => (
          <View key={m} style={styles.radioRow}>
            <Ionicons
              name={savedModel === m ? "radio-button-on" : "radio-button-off"}
              size={18}
              color={savedModel === m ? colors.accent : colors.textSecondary}
            />
            <Text
              style={[
                styles.radioLabel,
                {
                  color:
                    savedModel === m
                      ? colors.textPrimary
                      : colors.textSecondary,
                },
              ]}
              onPress={() => dispatch(setPreferredModelAction(m))}
            >
              {m}
            </Text>
          </View>
        ))}
      </View>

      <Field
        label="Your OpenRouter key (optional)"
        value={ownKey}
        onChangeText={setOwnKey}
        secureTextEntry
        icon="key-outline"
        hint="Your key bypasses the daily shared limit."
      />

      <Button
        label="Save settings"
        fullWidth
        loading={saving}
        onPress={saveSettings}
      />

      <View
        style={[
          styles.devCard,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.indigo + "44",
          },
        ]}
      >
        <View style={styles.devHeader}>
          <Ionicons name="code-slash-outline" size={16} color={colors.indigo} />
          <Text style={[styles.devTitle, { color: colors.indigo }]}>
            API / Swagger access
          </Text>
        </View>
        <Text style={[styles.devBody, { color: colors.textSecondary }]}>
          {"Copy your access token → Swagger Authorize (Bearer) at "}
          <Text style={{ color: colors.indigo }}>
            {process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/docs
          </Text>
        </Text>
        <Button
          label="Copy access token"
          variant="secondary"
          onPress={copyAccessToken}
        />
      </View>

      <Button
        label="Sign out"
        variant="danger"
        fullWidth
        onPress={() => supabase.auth.signOut()}
      />
      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: spacing.lg, rowGap: spacing.md },
  heading: { ...typography.h2, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowLabel: { ...typography.body, fontWeight: "600" },
  rowCaption: { ...typography.caption, marginTop: 2 },
  section: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    rowGap: spacing.sm,
  },
  sectionLabel: { ...typography.label, marginBottom: spacing.xs },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.sm,
  },
  radioLabel: { ...typography.body, flex: 1 },
  devCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.lg,
    rowGap: spacing.md,
  },
  devHeader: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.sm,
  },
  devTitle: { ...typography.body, fontWeight: "700" },
  devBody: { ...typography.caption, lineHeight: 18 },
});
