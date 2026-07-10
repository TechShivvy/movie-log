import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { supabase } from '../lib/supabase';
import type { MovieLog } from '../store/apiSlice';
import { useTheme } from '../theme/ThemeContext';
import { CM, radii, spacing, typography } from '../theme/tokens';

interface Props { item:MovieLog; style?:ViewStyle; }

const CERT: Record<string,string> = { 'U':'#22c55e','U/A':'#fabd00','UA':'#fabd00','A':'#ef4444' };

export function MovieCard({ item, style }:Props) {
  const c = useTheme();
  const cert = CERT[item.certificate?.toUpperCase()??''] ?? c.textSecondary;
  const timeStr = [item.watched_date, item.watched_time && `${item.watched_time}${item.timezone_abbrv?' '+item.timezone_abbrv:''}`].filter(Boolean).join(' · ');
  const stars = item.rating != null ? (item.rating / 2).toFixed(1) : null;
  const [thumb, setThumb] = useState<string|null>(null);

  useEffect(()=>{
    if(!item.ticket_image_path) return;
    supabase.storage.from('ticket-images').createSignedUrl(item.ticket_image_path,3600)
      .then(({data})=>{ if(data?.signedUrl) setThumb(data.signedUrl); });
  },[item.ticket_image_path]);

  return (
    <View style={[
      styles.card,
      { backgroundColor:c.surface, borderColor:c.border },
      Platform.select({ web:{ boxShadow:'0 4px 20px rgba(0,0,0,0.4)' } as object }),
      style,
    ]}>
      {/* Poster area */}
      <View style={styles.posterWrap}>
        {thumb
          ? <Image source={{ uri:thumb }} style={styles.poster} contentFit="cover" />
          : <View style={[styles.posterPlaceholder, { backgroundColor:c.surfaceMuted }]}>
              <Ionicons name="film-outline" size={32} color={c.textDisabled} />
            </View>
        }
        {/* Rating badge */}
        {stars ? (
          <View style={styles.rateBadge}>
            <Ionicons name="star" size={10} color={CM.secondaryContainer} />
            <Text style={[styles.rateText, { color:'#fff' }]}>{stars}</Text>
          </View>
        ) : null}
        {/* Cert badge */}
        {item.certificate ? (
          <View style={[styles.certBadge, { borderColor:cert }]}>
            <Text style={[styles.certText, { color:cert }]}>{item.certificate}</Text>
          </View>
        ) : null}
      </View>

      {/* Metadata */}
      <View style={styles.meta}>
        <Text style={[styles.title, { color:c.textPrimary }]} numberOfLines={2}>{item.movie??'Untitled'}</Text>
        {timeStr ? <Row icon="calendar-outline" text={timeStr} color={c.textSecondary} /> : null}
        {item.theater ? <Row icon="location-outline" text={item.theater} color={c.textSecondary} /> : null}
        {item.language ? <Row icon="language-outline" text={item.language} color={c.textSecondary} /> : null}
        {item.seats?.length ? (
          <View style={styles.seats}>
            {item.seats.slice(0,4).map(s=>(
              <View key={s} style={[styles.seatChip, { backgroundColor:c.surfaceMuted, borderColor:c.border }]}>
                <Text style={[styles.seatTxt, { color:c.textSecondary }]}>{s}</Text>
              </View>
            ))}
            {item.seats.length>4 ? <Text style={{ color:c.textDisabled, fontSize:11 }}>+{item.seats.length-4}</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Row({ icon, text, color }: { icon:string; text:string; color:string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[styles.metaText, { color }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius:radii.xl, borderWidth:1, overflow:'hidden' },
  posterWrap: { position:'relative' },
  poster: { width:'100%', aspectRatio:2/3 },
  posterPlaceholder: { width:'100%', aspectRatio:2/3, alignItems:'center', justifyContent:'center' },
  rateBadge: { position:'absolute', top:8, right:8, flexDirection:'row', alignItems:'center', columnGap:3, backgroundColor:'rgba(0,0,0,0.65)', paddingHorizontal:7, paddingVertical:4, borderRadius:8, borderWidth:1, borderColor:'rgba(255,255,255,0.1)' },
  rateText: { ...typography.labelMd, color:'#fff' },
  certBadge: { position:'absolute', top:8, left:8, borderWidth:1, borderRadius:6, paddingHorizontal:5, paddingVertical:2 },
  certText: { fontSize:10, fontWeight:'700' },
  meta: { padding:spacing.md, rowGap:spacing.xs },
  title: { ...typography.headlineSm, marginBottom:spacing.xs },
  row: { flexDirection:'row', alignItems:'center', columnGap:spacing.xs },
  metaText: { ...typography.bodySm, flex:1 },
  seats: { flexDirection:'row', flexWrap:'wrap', columnGap:spacing.xs, rowGap:spacing.xs, marginTop:spacing.xs },
  seatChip: { borderRadius:6, borderWidth:1, paddingHorizontal:6, paddingVertical:2 },
  seatTxt: { ...typography.labelMd, fontSize:10 },
});
