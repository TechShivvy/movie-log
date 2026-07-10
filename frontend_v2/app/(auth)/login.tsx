import * as Linking from 'expo-linking';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { GlassCard } from '../../src/components/GlassCard';
import { useToast } from '../../src/hooks/useToast';
import { supabase } from '../../src/lib/supabase';
import { useAppSelector } from '../../src/store';
import { CM, radii, spacing, typography } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeContext';

export default function LoginScreen() {
  const c = useTheme();
  const router = useRouter();
  const { toastError, toastSuccess } = useToast();
  const session = useAppSelector(s=>s.auth.session);
  const isLoading = useAppSelector(s=>s.auth.isLoading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [mode, setMode] = useState<'password'|'magic'>('password');

  if(!isLoading && session) return <Redirect href="/(app)/movies" />;

  function validate() {
    if(!email.trim()) { setEmailErr('Email is required'); return false; }
    if(!email.includes('@')) { setEmailErr('Enter a valid email'); return false; }
    setEmailErr(''); return true;
  }

  async function signIn() {
    if(!validate()) return;
    setIsBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsBusy(false);
    if(error) { toastError(error); return; }
    router.replace('/(app)/movies');
  }

  async function sendMagicLink() {
    if(!validate()) return;
    setIsBusy(true);
    const redirectTo = Linking.createURL('/');
    const { error } = await supabase.auth.signInWithOtp({ email, options:{ emailRedirectTo:redirectTo } });
    setIsBusy(false);
    if(error) { toastError(error); return; }
    toastSuccess('Magic link sent — check your inbox.');
  }

  async function signInWithGoogle() {
    setIsBusy(true);
    const redirectTo = Linking.createURL('/');
    const { error } = await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo, skipBrowserRedirect:false } });
    setIsBusy(false);
    if(error) toastError(error);
  }

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor:c.bg }]} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor:CM.primaryContainer }]}>
            <Ionicons name="film" size={32} color="#fff" />
          </View>
          <Text style={[styles.appName, { color:CM.primaryContainer }]}>CineLog</Text>
          <Text style={[styles.tagline, { color:c.textSecondary }]}>Track every theater memory.</Text>
        </View>

        {/* Card */}
        <GlassCard style={styles.card} innerStyle={styles.cardInner}>
          <Field label="Email Address" value={email} onChangeText={v=>{ setEmail(v); setEmailErr(''); }}
            keyboardType="email-address" icon="mail-outline" error={emailErr} />
          {mode==='password' ? <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry icon="lock-closed-outline" /> : null}

          {mode==='password' ? (
            <>
              <Button label="Sign in" fullWidth loading={isBusy} onPress={signIn} />
              <Button label="Send magic link" variant="secondary" fullWidth onPress={()=>setMode('magic')} />
            </>
          ) : (
            <>
              <Button label="Send magic link" fullWidth loading={isBusy} onPress={sendMagicLink} />
              <Button label="Use password instead" variant="secondary" fullWidth onPress={()=>setMode('password')} />
            </>
          )}

          <View style={styles.divider}>
            <View style={[styles.divLine, { backgroundColor:c.border }]} />
            <Text style={[styles.orText, { color:c.textDisabled }]}>OR</Text>
            <View style={[styles.divLine, { backgroundColor:c.border }]} />
          </View>

          <Button label="Continue with Google" variant="secondary" fullWidth loading={isBusy} onPress={signInWithGoogle} />
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex:1 },
  scroll: { flexGrow:1, justifyContent:'center', padding:spacing.xl, rowGap:spacing.xl },
  hero: { alignItems:'center', rowGap:spacing.sm },
  badge: { width:72, height:72, borderRadius:36, alignItems:'center', justifyContent:'center' },
  appName: { ...typography.displayLg, textAlign:'center' },
  tagline: { ...typography.bodyLg, textAlign:'center' },
  card: { width:'100%', maxWidth:460, alignSelf:'center' },
  cardInner: { rowGap:spacing.md },
  divider: { flexDirection:'row', alignItems:'center', columnGap:spacing.sm },
  divLine: { flex:1, height:1 },
  orText: { ...typography.label },
});
