import { Stack } from "expo-router";
import { useTheme } from "../../../hooks/useTheme";

/**
 * The Library tab's own nested stack — index (the grid), then everything
 * reachable from a log card: log detail, the new-log form, movie/venue/
 * screen detail, and stats. Pushing any of these from Library keeps its
 * own back-stack (see (app)/_layout.tsx's header comment for why this
 * group split exists at all); switching to another tab and back resumes
 * exactly where this stack was left, instead of resetting to the grid.
 */
export default function LibraryStackLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}
    />
  );
}
