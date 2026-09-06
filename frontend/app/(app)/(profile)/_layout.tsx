import { Stack } from "expo-router";
import { useTheme } from "../../../hooks/useTheme";

// The Profile tab's own nested stack — own profile, someone else's public
// profile, Settings, and Notifications all live under here (matching
// TabBar's old hand-rolled `owns` list, now expressed as real route-group
// membership instead of a hand-maintained path-prefix array).
//
// Two DIFFERENT "initial route" settings are needed here, not one —
// confirmed live, not assumed:
//   - <Stack initialRouteName> (React Navigation's own prop) controls
//     which screen actually RENDERS when this group mounts with no
//     specific target. Without it, switching to this tab rendered
//     "notifications" (alphabetically first among 4 sibling screens with
//     no index.tsx — unlike (library)/(feed)/(search), this group can't
//     use index.tsx for its default: an index.tsx here would resolve to
//     the same group-stripped root URL "/" that (library)'s own
//     index.tsx already owns).
//   - unstable_settings.initialRouteName (expo-router's own export,
//     read by its route-resolution code, not just React Navigation's
//     component tree) controls what URL the router reports/generates
//     for that same default state. Setting only the Stack prop above
//     left a real bug: the screen rendered correctly ("profile") while
//     window.location still read "/notifications" — confirmed via
//     window.location.href, not just Playwright's page.url(). Both are
//     required together.
export const unstable_settings = {
  initialRouteName: "profile",
};

export default function ProfileStackLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      initialRouteName="profile"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}
    />
  );
}
