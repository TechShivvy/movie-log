import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { EmptyState } from "../../../src/components/EmptyState";
import { MovieCard } from "../../../src/components/MovieCard";
import { useListMovieLogsQuery } from "../../../src/store/apiSlice";
import { colors, spacing, typography } from "../../../src/theme";

const CARD_MIN_WIDTH = 300;

export default function MoviesScreen() {
  const {
    data: logs,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useListMovieLogsQuery({});
  const { width } = useWindowDimensions();
  const numColumns = Math.max(1, Math.floor(width / CARD_MIN_WIDTH));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Your Movies</Text>
        <Link href="/(app)/movies/new" asChild>
          <Pressable
            style={({ pressed }) => [
              styles.addBtn,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Ionicons name="add" size={20} color={colors.accentFg} />
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </Link>
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.accent} style={styles.centered} />
      ) : isError ? (
        <View style={styles.centered}>
          <EmptyState
            icon="alert-circle-outline"
            title="Could not load movies"
            message="Pull down to retry."
          />
        </View>
      ) : (
        <FlatList
          key={numColumns}
          data={logs ?? []}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={colors.accent}
            />
          }
          renderItem={({ item }) => (
            <Link
              href={`/(app)/movies/${item.id}`}
              asChild
              style={numColumns > 1 ? { flex: 1 } : undefined}
            >
              <Pressable
                style={({ pressed }) => [
                  { opacity: pressed ? 0.85 : 1 },
                  numColumns > 1 ? { flex: 1 } : undefined,
                ]}
              >
                <MovieCard item={item} />
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={
            <EmptyState
              title="No movies logged yet"
              message="Tap Add to log your first movie visit."
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  heading: { ...typography.h2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    rowGap: 4,
  },
  addBtnText: { ...typography.body, color: colors.accentFg, fontWeight: "700" },
  columnWrapper: { rowGap: spacing.md },
  listContent: { padding: spacing.lg, rowGap: spacing.md, flexGrow: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
});
