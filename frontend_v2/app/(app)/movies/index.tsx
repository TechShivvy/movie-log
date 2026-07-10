import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { EmptyState } from '../../../src/components/EmptyState';
import { MovieCard } from '../../../src/components/MovieCard';
import { useListMovieLogsQuery } from '../../../src/store/apiSlice';
import { CM, radii, spacing, typography } from '../../../src/theme/tokens';
import { useTheme } from '../../../src/theme/ThemeContext';

const CARD_MIN = 180;

export default function MoviesScreen() {
  const c = useTheme();
  const { data:logs, isLoading, isFetching, isError, refetch } = useListMovieLogsQuery({});
  const { width } = useWindowDimensions();
  const cols = Math.max(2, Math.floor(width / CARD_MIN));

  return (
    <View style={[styles.root, { backgroundColor:c.bg }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { backgroundColor:c.surface+CC }]}>
        <View style={styles.logoRow}>
          <Ionicons name="film" size={22} color={CM.primaryContainer} />
          <Text style={[styles.appName, { color:CM.primaryContainer }]}>CineLog</Text>
        </View>
        <Link href="/(app)/movies/new" asChild>
          <Pressable style={({ pressed })=>[styles.fab, { backgroundColor:CM.primaryContainer, opacity:pressed?0.85:1 }, Platform.select({ web:{ boxShadow:'0 0 18px rgba(229,9,20,0.5)' } as object })]}>
            <Ionicons name="add" size={26} color="#fff" />
          </Pressable>
        </Link>
      </View>

      {isLoading
        ? <ActivityIndicator color={CM.primaryContainer} style={styles.center} />
        : isError
        ? <EmptyState icon="alert-circle-outline" title="Could not load" message="Pull to retry." />
        : (
          <FlatList
            key={cols}
            data={logs??[]}
            numColumns={cols}
            keyExtractor={i=>i.id}
            columnWrapperStyle={cols>1?styles.colWrap:undefined}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={CM.primaryContainer} />}
            renderItem={({ item })=>(
              <Link href={`/(app)/movies/${item.id}`} asChild style={cols>1?{ flex:1 }:undefined}>
                <Pressable style={({ pressed })=>[{ opacity:pressed?0.88:1 }, cols>1?{ flex:1 }:undefined]}>
                  <MovieCard item={item} />
                </Pressable>
              </Link>
            )}
            ListEmptyComponent={<EmptyState title="No movies yet" message="Tap + to log your first movie." />}
          />
        )
      }
    </View>
  );
}

const CC = 'CC';  // extra alpha on surface
const styles = StyleSheet.create({
  root: { flex:1 },
  topBar: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:spacing.xl, paddingTop:Platform.OS==='ios'?52:spacing.xl, paddingBottom:spacing.lg },
  logoRow: { flexDirection:'row', alignItems:'center', columnGap:8 },
  appName: { ...typography.headlineMd, fontWeight:'700' },
  fab: { width:44, height:44, borderRadius:22, alignItems:'center', justifyContent:'center' },
  list: { padding:spacing.lg, rowGap:spacing.lg, flexGrow:1 },
  colWrap: { columnGap:spacing.lg },
  center: { flex:1 },
});
