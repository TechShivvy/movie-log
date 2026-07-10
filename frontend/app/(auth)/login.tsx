import * as Linking from "expo-linking";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "../../src/components/Button";
import { Field } from "../../src/components/Field";
import { useToast } from "../../src/hooks/useToast";
import { supabase } from "../../src/lib/supabase";
import { useAppSelector } from "../../src/store";
import { colors, radii, spacing, typography } from "../../src/theme";

export default function LoginScreen() {
  const router = useRouter();
  const { toastError, toastSuccess } = useToast();
  const session = useAppSelector((s) => s.auth.session);
  const isLoading = useAppSelector((s) => s.auth.isLoading);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");

  if (!isLoading && session) return <Redirect href="/(app)/movies" />;

  function validateEmail() {
    if (!email.trim()) {
      setEmailError("Email is required");
      return false;
    }
    if (!email.includes("@")) {
      setEmailError("Enter a valid email address");
      return false;
    }
    setEmailError("");
    return true;
  }

  async function signIn() {
    if (!validateEmail()) return;
    setIsBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsBusy(false);
    if (error) {
      toastError(error);
      return;
    }
    router.replace("/(app)/movies");
  }

  async function sendMagicLink() {
    if (!validateEmail()) return;
    setIsBusy(true);
    const redirectTo = Linking.createURL("/");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setIsBusy(false);
    if (error) {
      toastError(error);
      return;
    }
    toastSuccess("Magic link sent — check your inbox.");
  }

  async function signInWithGoogle() {
    setIsBusy(true);
    const redirectTo = Linking.createURL("/");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: false },
    });
    setIsBusy(false);
    if (error) toastError(error);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🎬</Text>
          </View>
          <Text style={styles.title}>Movie Log</Text>
          <Text style={styles.subtitle}>Track every theater memory.</Text>
        </View>

        <View style={styles.card}>
          <Field
            label="Email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setEmailError("");
            }}
            keyboardType="email-address"
            icon="mail-outline"
            error={emailError}
          />

          {mode === "password" && (
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon="lock-closed-outline"
            />
          )}

          {mode === "password" ? (
            <>
              <Button
                label="Sign in"
                fullWidth
                loading={isBusy}
                onPress={signIn}
              />
              <Button
                label="Send magic link instead"
                variant="ghost"
                fullWidth
                onPress={() => setMode("magic")}
              />
            </>
          ) : (
            <>
              <Button
                label="Send magic link"
                fullWidth
                loading={isBusy}
                onPress={sendMagicLink}
              />
              <Button
                label="Use password instead"
                variant="ghost"
                fullWidth
                onPress={() => setMode("password")}
              />
            </>
          )}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            label="Continue with Google"
            variant="secondary"
            fullWidth
            loading={isBusy}
            onPress={signInWithGoogle}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.xl,
    rowGap: spacing.xl,
  },
  hero: { alignItems: "center", rowGap: spacing.sm },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 30 },
  title: { ...typography.h1, textAlign: "center" },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    rowGap: spacing.md,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    ...Platform.select({
      web: { boxShadow: "0 4px 32px rgba(0,0,0,0.4)" } as object,
    }),
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.sm,
    marginVertical: spacing.xs,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.caption },
});
