import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { dismissToast, type Toast, type ToastVariant } from '../store/uiSlice';
import { useAppDispatch, useAppSelector } from '../store';
import { CM, radii, spacing, typography } from '../theme/tokens';

const ICON: Record<ToastVariant, any> = {
  success:'checkmark-circle', error:'alert-circle', warning:'warning', info:'information-circle',
};
const BG: Record<ToastVariant, string> = {
  success:'#14532D', error:CM.errorContainer, warning:'#451A03', info:CM.tertiaryContainer+'44',
};
const ICON_COLOR: Record<ToastVariant, string> = {
  success:'#22c55e', error:CM.error, warning:CM.secondaryContainer, info:CM.tertiary,
};

function ToastItem({ toast }:{ toast:Toast }) {
  const dispatch = useAppDispatch();
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(-12)).current;
  useEffect(()=>{
    Animated.parallel([
      Animated.spring(opacity,{ toValue:1, useNativeDriver:true, speed:20 }),
      Animated.spring(ty,{ toValue:0, useNativeDriver:true, speed:20 }),
    ]).start();
    const t = setTimeout(()=>{
      Animated.parallel([
        Animated.timing(opacity,{ toValue:0, duration:250, useNativeDriver:true }),
        Animated.timing(ty,{ toValue:-8, duration:250, useNativeDriver:true }),
      ]).start(()=>dispatch(dismissToast(toast.id)));
    }, toast.duration??4000);
    return ()=>clearTimeout(t);
  },[]);
  return (
    <Animated.View style={[
      styles.item,
      { backgroundColor:BG[toast.variant], borderColor:CM.outlineVariant, opacity, transform:[{ translateY:ty }] },
      Platform.select({ web:{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' } as object }),
    ]}>
      <Ionicons name={ICON[toast.variant]} size={18} color={ICON_COLOR[toast.variant]} />
      <Text style={styles.msg} numberOfLines={3}>{toast.message}</Text>
      <Pressable onPress={()=>dispatch(dismissToast(toast.id))} hitSlop={8}>
        <Ionicons name="close" size={16} color={CM.outline} />
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const toasts = useAppSelector(s=>s.ui.toasts);
  if(!toasts.length) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {toasts.map(t=><ToastItem key={t.id} toast={t} />)}
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { position:'absolute', top: Platform.OS==='web' ? 16 : 60, left:16, right:16, zIndex:9999, rowGap:8 },
  item: { flexDirection:'row', alignItems:'center', borderRadius:radii.lg, paddingHorizontal:spacing.md, paddingVertical:spacing.sm+2, borderWidth:1, columnGap:spacing.sm },
  msg: { ...typography.bodyMd, flex:1, color:CM.onSurface, lineHeight:20 },
});
