/**
 * UsernameStatus — inline, debounced feedback under a Username field.
 * Previously duplicated (nearly identically) in EditProfileModal and
 * OnboardingScreen; one of the two referenced a `theme.success` field
 * that never existed on Theme, so both silently fell back to the same
 * hardcoded green either way — now a real token (see constants/themes.ts).
 */
import React from "react";
import { Text } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { type useUsernameAvailability } from "../../hooks/useProfile";

type AvailabilityStatus = ReturnType<typeof useUsernameAvailability>["status"];

export function UsernameStatus({ status }: { status: AvailabilityStatus }) {
  const { theme } = useTheme();
  if (status === "checking") {
    return <Text style={{ fontSize: 12, color: `${theme.text}66`, marginTop: 4 }}>Checking…</Text>;
  }
  if (status === "available") {
    return <Text style={{ fontSize: 12, color: theme.success, marginTop: 4 }}>Username available</Text>;
  }
  if (status === "taken") {
    return <Text style={{ fontSize: 12, color: theme.error, marginTop: 4 }}>Username not available</Text>;
  }
  if (status === "invalid") {
    return <Text style={{ fontSize: 12, color: theme.error, marginTop: 4 }}>3-30 lowercase letters, digits, or underscores</Text>;
  }
  return null;
}
