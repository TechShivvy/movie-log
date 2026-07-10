import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useAppSelector } from '../../src/store';
import { CM } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';

export default function AppLayout() {
  const c = useTheme();
  const isLoading = useAppSelector(s=>s.auth.isLoading);
  const session   = useAppSelector(s=>s.auth.session);
  if(!isLoading && !session) return <Redirect href="/(auth)/login" />;
  return (
    <Tabs screenOptions={{
      headerStyle:{ backgroundColor:c.surface },
      headerTintColor:c.textPrimary,
      headerShadowVisible:false,
      tabBarStyle:{ backgroundColor:c.surface, borderTopColor:c.border, borderTopWidth:1, height:60, paddingBottom:8 },
      tabBarActiveTintColor:CM.primaryContainer,
      tabBarInactiveTintColor:c.textDisabled,
    }}>
      <Tabs.Screen name="movies" options={{ title:'Library', tabBarIcon:({ color,size })=><Ionicons name="film-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title:'Settings', tabBarIcon:({ color,size })=><Ionicons name="settings-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
