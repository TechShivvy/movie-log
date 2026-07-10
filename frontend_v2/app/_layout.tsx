import { Sora_700Bold, Sora_600SemiBold, Sora_500Medium } from '@expo-google-fonts/sora';
import { PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import * as Font from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { Provider } from 'react-redux';
import { ToastHost } from '../src/components/ToastHost';
import { SessionProvider } from '../src/providers/SessionProvider';
import { store } from '../src/store';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function Shell() {
  const c = useTheme();
  const [fontsLoaded] = Font.useFonts({
    Sora_700Bold, Sora_600SemiBold, Sora_500Medium,
    PlusJakartaSans_400Regular, PlusJakartaSans_600SemiBold,
    JetBrainsMono_500Medium,
  });
  if (!fontsLoaded) return null;
  return (
    <>
      <StatusBar style="light" />
      <View style={[styles.root, { backgroundColor: c.bg }]}>
        <Stack screenOptions={{
          headerStyle: { backgroundColor: c.surface },
          headerTintColor: c.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }} />
        <ToastHost />
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </ThemeProvider>
    </Provider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
