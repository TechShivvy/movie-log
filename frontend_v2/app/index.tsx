import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAppSelector } from '../src/store';
import { CM } from '../src/theme/tokens';

export default function Index() {
  const isLoading = useAppSelector(s => s.auth.isLoading);
  const session   = useAppSelector(s => s.auth.session);
  if (isLoading) return <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor:CM.background }}><ActivityIndicator color={CM.primaryContainer} /></View>;
  return <Redirect href={session ? '/(app)/movies' : '/(auth)/login'} />;
}
