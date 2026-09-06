import { Stack } from "expo-router";

/**
 * Layout for the /auth/* routes (e.g. /auth/callback).
 * This is distinct from the (auth) group (which holds the login screen).
 * No header, no session guard — we need to render freely during OAuth redirects.
 */
export default function AuthSegmentLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
