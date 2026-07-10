import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { CM, radii, spacing } from '../theme/tokens';

interface Props { uri:string; height?:number; }

export function ImageViewer({ uri, height=200 }:Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={()=>setOpen(true)} style={[styles.thumb, { height }]}>
        <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />
        <View style={styles.badge}><Ionicons name="expand-outline" size={14} color="#fff" /></View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={()=>setOpen(false)}>
          <View style={styles.pane}>
            <Pressable style={styles.close} onPress={()=>setOpen(false)}>
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Image source={{ uri }} style={styles.full} contentFit="contain" />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  thumb: { borderRadius:radii.lg, overflow:'hidden', borderWidth:1, borderColor:CM.outlineVariant },
  thumbImg: { width:'100%', height:'100%' },
  badge: { position:'absolute', bottom:spacing.sm, right:spacing.sm, backgroundColor:'rgba(0,0,0,0.55)', borderRadius:6, padding:4 },
  backdrop: { flex:1, backgroundColor:'rgba(0,0,0,0.92)', justifyContent:'center', alignItems:'center' },
  pane: { width:'92%', maxWidth:780, maxHeight:'90%', minHeight:320, borderRadius:radii.xl, overflow:'hidden', backgroundColor:CM.surfaceContainerHigh },
  close: { position:'absolute', top:spacing.md, right:spacing.md, zIndex:10, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:radii.full, padding:6 },
  full: { width:'100%', flex:1, minHeight:300 },
});
