import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { Field } from '../../../src/components/Field';
import { GlassCard } from '../../../src/components/GlassCard';
import { ImageViewer } from '../../../src/components/ImageViewer';
import { StarRating } from '../../../src/components/StarRating';
import { useToast } from '../../../src/hooks/useToast';
import { getUserOpenRouterKey } from '../../../src/lib/secure-store';
import { supabase } from '../../../src/lib/supabase';
import { useCreateMovieLogMutation, useExtractTicketMetadataMutation } from '../../../src/store/apiSlice';
import { setAutofillStatus } from '../../../src/store/uiSlice';
import { useAppDispatch, useAppSelector } from '../../../src/store';
import { CM, radii, spacing, typography } from '../../../src/theme/tokens';
import { useTheme } from '../../../src/theme/ThemeContext';

type D = { movie:string; watched_date:string; watched_time:string; timezone_abbrv:string; theater:string; seats:string; language:string; screen:string; booking_ref:string; certificate:string; notes:string; rating:string; };
const EMPTY: D = { movie:'', watched_date:'', watched_time:'', timezone_abbrv:'', theater:'', seats:'', language:'', screen:'', booking_ref:'', certificate:'', notes:'', rating:'' };

export default function NewMovieScreen() {
  const c = useTheme();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toastError, toastSuccess, toast } = useToast();
  const autofillStatus = useAppSelector(s=>s.ui.autofillStatus);
  const autoFill = useAppSelector(s=>s.settings.autoFill);
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  const [uri, setUri] = useState<string|null>(null);
  const [mime, setMime] = useState('image/jpeg');
  const [draft, setDraft] = useState<D>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [movieErr, setMovieErr] = useState('');
  const [extractTicket] = useExtractTicketMetadataMutation();
  const [createLog] = useCreateMovieLogMutation();

  function set(f:keyof D){ return (v:string)=>setDraft(d=>({...d,[f]:v})); }

  async function runAutoFill(u:string, m:string) {
    dispatch(setAutofillStatus('loading'));
    try {
      const ownKey = await getUserOpenRouterKey();
      const r = await extractTicket({ imageUri:u, mimeType:m, ownKey }).unwrap();
      setDraft(d=>({ ...d, movie:r.movie??d.movie, watched_date:r.date??d.watched_date, watched_time:r.time??d.watched_time, timezone_abbrv:r.timezone_abbrv??d.timezone_abbrv, theater:r.theater??d.theater, seats:r.seats?.join(', ')??d.seats, language:r.language??d.language, screen:r.screen??d.screen, booking_ref:r.booking_ref??d.booking_ref, certificate:r.certificate??d.certificate }));
      toast('Auto-fill complete!', 'success');
    } catch(e) { toastError(e); }
    finally { dispatch(setAutofillStatus(null)); }
  }

  async function pick() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!perm.granted) { toast('Photo access required.', 'warning'); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], quality:0.9 });
    if(res.canceled) return;
    const a = res.assets[0];
    setUri(a.uri); setMime(a.mimeType??'image/jpeg');
    if(autoFill) runAutoFill(a.uri, a.mimeType??'image/jpeg');
  }

  async function save() {
    if(!draft.movie.trim()) { setMovieErr('Movie title is required.'); toast('Enter a movie title.', 'warning'); return; }
    setMovieErr('');
    setSaving(true);
    try {
      const { data:{ user } } = await supabase.auth.getUser();
      if(!user) { toastError({ status:401 }); return; }
      const mimeToExt: Record<string,string> = { 'image/jpeg':'jpg','image/jpg':'jpg','image/png':'png','image/webp':'webp' };
      let ticket_image_path: string|null = null;
      if(uri) {
        const ext = mimeToExt[mime]??'jpg';
        const path = `${user.id}/${Date.now()}.${ext}`;
        const resp = await fetch(uri); const blob = await resp.blob();
        const { error:ue } = await supabase.storage.from('ticket-images').upload(path, blob, { upsert:false, contentType:mime });
        if(ue) throw ue;
        ticket_image_path = path;
      }
      await createLog({ movie:draft.movie||null, watched_date:draft.watched_date||null, watched_time:draft.watched_time||null, timezone_abbrv:draft.timezone_abbrv||null, theater:draft.theater||null, seats:draft.seats?draft.seats.split(',').map(s=>s.trim()).filter(Boolean):[], language:draft.language||null, screen:draft.screen||null, booking_ref:draft.booking_ref||null, certificate:draft.certificate||null, notes:draft.notes||null, rating:draft.rating?parseInt(draft.rating,10):null, ticket_image_path }).unwrap();
      toastSuccess('Movie log saved!');
      router.replace('/(app)/movies');
    } catch(e) { toastError(e); }
    finally { setSaving(false); }
  }

  return (
    <ScrollView style={[styles.scroll, { backgroundColor:c.bg }]} contentContainerStyle={styles.outer}>
      {/* Breadcrumb header */}
      <View style={[styles.header, { borderBottomColor:c.border }]}>
        <View>
          <Text style={[styles.crumb, { color:CM.primaryContainer }]}>LIBRARY {'>'} ADD NEW ENTRY</Text>
          <Text style={[styles.pageTitle, { color:c.textPrimary }]}>Log a <Text style={{ color:CM.primaryContainer, fontStyle:'italic' }}>Masterpiece</Text></Text>
        </View>
        <View style={styles.headerBtns}>
          <Button label="DISCARD" variant="secondary" onPress={()=>router.back()} />
          <Button label="SAVE MOVIE" onPress={save} loading={saving} />
        </View>
      </View>

      <View style={[styles.content, wide && styles.contentWide]}>
        {/* Left: poster upload + AI */}
        <View style={wide ? styles.left : styles.full}>
          <Pressable onPress={pick} style={[styles.posterDrop, { backgroundColor:c.surfaceMuted, borderColor: uri ? CM.primaryContainer : c.border }]}>
            {uri
              ? <ImageViewer uri={uri} height={wide ? 380 : 220} />
              : <View style={styles.dropInner}>
                  <Ionicons name="camera-outline" size={44} color={CM.primaryContainer} />
                  <Text style={[styles.dropTitle, { color:c.textPrimary }]}>Upload Ticket</Text>
                  <Text style={[styles.dropSub, { color:c.textSecondary }]}>JPG, PNG or WebP · max 25MB</Text>
                </View>
            }
          </Pressable>
          {/* AI AUTO-FILL */}
          <Pressable
            disabled={!uri || autofillStatus==='loading'}
            onPress={()=>uri&&runAutoFill(uri,mime)}
            style={[styles.aiBtn, { backgroundColor:CM.tertiaryContainer+'22', borderColor:CM.tertiary+'44' }, (!uri||autofillStatus==='loading')&&styles.disabled]}
          >
            {autofillStatus==='loading' ? (
              <View style={styles.aiBtnRow}><ActivityIndicator size="small" color={CM.tertiary} /><Text style={[styles.aiBtnText, { color:CM.tertiary }]}>Extracting…</Text></View>
            ) : (
              <View style={styles.aiBtnRow}><Ionicons name="sparkles-outline" size={15} color={CM.tertiary} /><Text style={[styles.aiBtnText, { color:CM.tertiary }]}>AI AUTO-FILL</Text></View>
            )}
          </Pressable>
        </View>

        {/* Right: form */}
        <GlassCard style={wide ? styles.right : styles.full} innerStyle={styles.formInner}>
          <Field label="Movie Title" value={draft.movie} onChangeText={v=>{set('movie')(v);if(v.trim())setMovieErr('');}} icon="film-outline" error={movieErr} />
          <View style={styles.row2}>
            <View style={styles.flex1}><Field label="Date (YYYY-MM-DD)" value={draft.watched_date} onChangeText={set('watched_date')} icon="calendar-outline" /></View>
            <View style={styles.flex1}><Field label="Time (HH:MM)" value={draft.watched_time} onChangeText={set('watched_time')} icon="time-outline" /></View>
          </View>
          <View style={styles.row2}>
            <View style={styles.flex1}><Field label="Timezone" value={draft.timezone_abbrv} onChangeText={set('timezone_abbrv')} hint="e.g. IST" /></View>
            <View style={styles.flex1}><Field label="Language" value={draft.language} onChangeText={set('language')} icon="language-outline" /></View>
          </View>
          <Field label="Theater" value={draft.theater} onChangeText={set('theater')} icon="location-outline" />
          <View style={styles.row2}>
            <View style={styles.flex1}><Field label="Screen / Audi" value={draft.screen} onChangeText={set('screen')} /></View>
            <View style={styles.flex1}><Field label="Certificate" value={draft.certificate} onChangeText={set('certificate')} hint="e.g. U/A, PG" /></View>
          </View>
          <Field label="Seats (comma sep)" value={draft.seats} onChangeText={set('seats')} icon="person-outline" />
          <Field label="Booking Ref" value={draft.booking_ref} onChangeText={set('booking_ref')} icon="receipt-outline" />

          {/* Star rating */}
          <View>
            <Text style={[styles.ratingLabel, { color:c.textSecondary }]}>YOUR RATING</Text>
            <StarRating value={draft.rating?parseInt(draft.rating,10):null} onChange={v=>setDraft(d=>({...d,rating:String(v)}))} size={28} />
          </View>

          <Field label="Notes" value={draft.notes} onChangeText={set('notes')} multiline icon="document-text-outline" />
          {!wide ? <Button label="SAVE MOVIE" fullWidth onPress={save} loading={saving} /> : null}
        </GlassCard>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll:{ flex:1 }, outer:{ paddingBottom:40 },
  header:{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end', padding:spacing.xl, paddingTop: Platform.OS==='ios'?52:spacing.xl, borderBottomWidth:1 },
  crumb:{ ...typography.label, marginBottom:4 },
  pageTitle:{ ...typography.displayLg },
  headerBtns:{ flexDirection:'row', columnGap:spacing.md },
  content:{ padding:spacing.xl, rowGap:spacing.xl },
  contentWide:{ flexDirection:'row', alignItems:'flex-start', columnGap:spacing.xl },
  left:{ rowGap:spacing.md }, right:{ flex:1.4 }, full:{ rowGap:spacing.md },
  posterDrop:{ borderRadius:radii.xl, borderWidth:2, borderStyle:'dashed', overflow:'hidden', minHeight:220, justifyContent:'center' },
  dropInner:{ alignItems:'center', padding:spacing.xxl, rowGap:spacing.md },
  dropTitle:{ ...typography.headlineSm },
  dropSub:{ ...typography.bodyMd, textAlign:'center' },
  aiBtn:{ borderRadius:radii.md, borderWidth:1, paddingVertical:spacing.sm+2 },
  aiBtnRow:{ flexDirection:'row', alignItems:'center', justifyContent:'center', columnGap:spacing.sm, padding:spacing.sm },
  aiBtnText:{ ...typography.label },
  disabled:{ opacity:0.5 },
  formInner:{ rowGap:spacing.md },
  row2:{ flexDirection:'row', columnGap:spacing.md },
  flex1:{ flex:1 },
  ratingLabel:{ ...typography.label, marginBottom:spacing.sm },
});
