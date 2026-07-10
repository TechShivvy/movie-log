import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Clipboard, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { Field } from '../../../src/components/Field';
import { GlassCard } from '../../../src/components/GlassCard';
import { useToast } from '../../../src/hooks/useToast';
import { clearUserOpenRouterKey, getUserOpenRouterKey, setUserOpenRouterKey } from '../../../src/lib/secure-store';
import { supabase } from '../../../src/lib/supabase';
import { useAppDispatch, useAppSelector } from '../../../src/store';
import { setTheme, setAutoFill as setAF, setPreferredModel as setPM } from '../../../src/store/settingsSlice';
import { CM, THEME_OPTIONS, radii, spacing, typography } from '../../../src/theme/tokens';
import { useTheme, type ThemeName } from '../../../src/theme/ThemeContext';

const MODELS = ['qwen/qwen2.5-vl-72b-instruct:free','google/gemma-4-31b-it:free'];

export default function SettingsScreen() {
  const c = useTheme();
  const dispatch = useAppDispatch();
  const { toastError, toastSuccess, toast } = useToast();
  const session = useAppSelector(s=>s.auth.session);
  const themeName = useAppSelector(s=>s.settings.themeName);
  const autoFill  = useAppSelector(s=>s.settings.autoFill);
  const model     = useAppSelector(s=>s.settings.preferredModel);

  const [ownKey, setOwnKey] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(()=>{
    (async()=>{
      const { data:{ user } } = await supabase.auth.getUser();
      if(!user) return;
      const { data } = await supabase.from('user_settings').select('auto_fill,preferred_model').eq('user_id',user.id).maybeSingle();
      if(data) { dispatch(setAF(Boolean(data.auto_fill))); dispatch(setPM(data.preferred_model||MODELS[0])); }
      const k = await getUserOpenRouterKey(); setOwnKey(k||'');
    })();
  },[]));

  async function saveSettings() {
    setSaving(true);
    const { data:{ user } } = await supabase.auth.getUser();
    if(!user) { toastError({ status:401 }); setSaving(false); return; }
    const { error } = await supabase.from('user_settings').upsert({ user_id:user.id, auto_fill:autoFill, preferred_model:model });
    if(error) { toastError(error); setSaving(false); return; }
    if(ownKey.trim()) await setUserOpenRouterKey(ownKey.trim()); else await clearUserOpenRouterKey();
    setSaving(false); toastSuccess('Settings saved.');
  }

  async function copyToken() {
    const token = session?.access_token;
    if(!token) { toast('No active session.', 'warning'); return; }
    if(Platform.OS==='web') await navigator.clipboard.writeText(token);
    else Clipboard.setString(token);
    toast('Token copied — paste in Swagger Authorize → Bearer.', 'info', 6000);
  }

  return (
    <ScrollView style={[styles.scroll,{ backgroundColor:c.bg }]} contentContainerStyle={styles.content}>
      <Text style={[styles.heading,{ color:c.textPrimary }]}>Settings</Text>
      <Text style={[styles.sub,{ color:c.textSecondary }]}>Manage your cinema collection and app experience.</Text>

      {/* Theme */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle,{ color:c.textPrimary }]}>Appearance</Text>
        <Text style={[styles.label,{ color:c.textSecondary }]}>APPLICATION THEME</Text>
        <View style={styles.swatchGrid}>
          {THEME_OPTIONS.map(t=>(
            <Pressable key={t.name} onPress={()=>dispatch(setTheme(t.name as ThemeName))}
              style={[styles.swatch, { backgroundColor:c.surfaceElevated, borderColor: themeName===t.name ? CM.primaryContainer : c.border }, themeName===t.name && styles.swatchActive]}>
              <View style={styles.swatchDots}>
                <View style={[styles.dot, { backgroundColor:t.swatch1 }]} />
                <View style={[styles.dot, { backgroundColor:t.swatch2 }]} />
              </View>
              <Text style={[styles.swatchLabel, { color: themeName===t.name ? CM.primaryContainer : c.textSecondary }]}>{t.label}</Text>
              {themeName===t.name ? <View style={styles.check}><Ionicons name="checkmark-circle" size={16} color={CM.primaryContainer} /></View> : null}
            </Pressable>
          ))}
        </View>
      </GlassCard>

      {/* Auto-fill */}
      <GlassCard style={styles.section}>
        <View style={styles.row}>
          <View>
            <Text style={[styles.rowLabel,{ color:c.textPrimary }]}>Auto-fill on upload</Text>
            <Text style={[styles.rowSub,{ color:c.textSecondary }]}>Extract ticket details automatically</Text>
          </View>
          <Switch value={autoFill} onValueChange={(v:boolean)=>{ dispatch(setAF(v)); }}
            thumbColor={CM.primaryContainer} trackColor={{ true:CM.primaryContainer+'55', false:c.border }} />
        </View>
      </GlassCard>

      {/* Model */}
      <GlassCard style={styles.section}>
        <Text style={[styles.sectionTitle,{ color:c.textPrimary }]}>Preferred Free Model</Text>
        {MODELS.map(m=>(
          <Pressable key={m} style={[styles.radioRow, m===model && styles.radioActive]} onPress={()=>dispatch(setPM(m))}>
            <Ionicons name={m===model?'radio-button-on':'radio-button-off'} size={18} color={m===model?CM.primaryContainer:c.textSecondary} />
            <Text style={[styles.radioText,{ color: m===model?c.textPrimary:c.textSecondary }]}>{m}</Text>
          </Pressable>
        ))}
      </GlassCard>

      {/* Own key */}
      <Field label="Your OpenRouter key (optional)" value={ownKey} onChangeText={setOwnKey} secureTextEntry icon="key-outline" hint="Bypasses daily shared limit." />
      <Button label="Save settings" fullWidth loading={saving} onPress={saveSettings} />

      {/* Dev / token */}
      <GlassCard style={{ ...styles.section2, borderColor:CM.tertiaryContainer+'44' }}>
        <View style={styles.devHeader}>
          <Ionicons name="code-slash-outline" size={16} color={CM.tertiaryContainer} />
          <Text style={[styles.sectionTitle,{ color:CM.tertiaryContainer }]}>API / Swagger Access</Text>
        </View>
        <Text style={[styles.devBody,{ color:c.textSecondary }]}>Copy token → Swagger Authorize (Bearer) at {process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/docs</Text>
        <Button label="Copy access token" variant="secondary" onPress={copyToken} />
      </GlassCard>

      {/* Danger */}
      <GlassCard style={{ ...styles.section2, borderColor:CM.error+'44' }}>
        <View style={styles.devHeader}>
          <Ionicons name="warning-outline" size={16} color={CM.error} />
          <Text style={[styles.sectionTitle,{ color:CM.error }]}>Danger Zone</Text>
        </View>
        <Text style={[styles.devBody,{ color:c.textSecondary }]}>Actions here are permanent and cannot be undone.</Text>
        <Button label="Sign out" variant="danger" fullWidth onPress={()=>supabase.auth.signOut()} />
      </GlassCard>
      <View style={{ height:40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:{ flex:1 }, content:{ padding:spacing.xl, rowGap:spacing.xl },
  heading:{ ...typography.displayLg }, sub:{ ...typography.bodyLg, marginTop:-spacing.md },
  section:{ rowGap:spacing.md }, section2:{ rowGap:spacing.md },
  sectionTitle:{ ...typography.headlineSm, fontWeight:'700' },
  label:{ ...typography.label },
  swatchGrid:{ flexDirection:'row', flexWrap:'wrap', columnGap:spacing.md, rowGap:spacing.md },
  swatch:{ borderRadius:radii.lg, borderWidth:2, padding:spacing.md, minWidth:100, rowGap:spacing.xs, position:'relative' },
  swatchActive:{ },
  swatchDots:{ flexDirection:'row', columnGap:6 },
  dot:{ width:24, height:24, borderRadius:6 },
  swatchLabel:{ ...typography.labelMd },
  check:{ position:'absolute', top:6, right:6 },
  row:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  rowLabel:{ ...typography.bodyLg, fontWeight:'600' },
  rowSub:{ ...typography.bodySm, marginTop:2 },
  radioRow:{ flexDirection:'row', alignItems:'center', columnGap:spacing.sm, paddingVertical:spacing.xs, paddingHorizontal:spacing.sm, borderRadius:radii.md },
  radioActive:{ backgroundColor:CM.primaryContainer+'11' },
  radioText:{ ...typography.bodyMd, flex:1 },
  devHeader:{ flexDirection:'row', alignItems:'center', columnGap:spacing.sm },
  devBody:{ ...typography.bodyMd, lineHeight:20 },
});
