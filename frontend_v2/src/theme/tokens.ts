/**
 * CineLog — Cinematic Motion design tokens (Stitch spec, 1-to-1 mapping).
 */
export const CM = {
  background:'#0b1326', surface:'#0b1326',
  surfaceContainerLowest:'#060e20', surfaceContainerLow:'#131b2e',
  surfaceContainer:'#171f33', surfaceContainerHigh:'#222a3d',
  surfaceContainerHighest:'#2d3449', surfaceBright:'#31394d', surfaceVariant:'#2d3449',
  onBackground:'#dae2fd', onSurface:'#dae2fd', onSurfaceVariant:'#e9bcb6',
  primary:'#ffb4aa', primaryContainer:'#e50914', onPrimary:'#690003', onPrimaryContainer:'#fff7f6',
  secondary:'#ffdf9e', secondaryContainer:'#fabd00', onSecondary:'#3f2e00', onSecondaryContainer:'#6a4e00',
  tertiary:'#c0c1ff', tertiaryContainer:'#5e61ec', onTertiary:'#1000a9', onTertiaryContainer:'#fcf8ff',
  error:'#ffb4ab', errorContainer:'#93000a', onError:'#690005', onErrorContainer:'#ffdad6',
  outline:'#af8782', outlineVariant:'#5e3f3b',
} as const;

export interface AppColors {
  bg:string; surface:string; surfaceElevated:string; surfaceMuted:string; surfaceHigh:string;
  textPrimary:string; textSecondary:string; textDisabled:string;
  accent:string; accentFg:string;
  gold:string; goldContainer:string;
  indigo:string; indigoContainer:string; onIndigo:string;
  error:string; errorContainer:string; success:string; warning:string;
  border:string; borderVariant:string;
}

const base: AppColors = {
  bg:CM.background, surface:CM.surfaceContainer, surfaceElevated:CM.surfaceContainerHigh,
  surfaceMuted:CM.surfaceContainerLowest, surfaceHigh:CM.surfaceContainerHighest,
  textPrimary:CM.onSurface, textSecondary:CM.onSurfaceVariant, textDisabled:CM.outline,
  accent:CM.primaryContainer, accentFg:CM.onPrimaryContainer,
  gold:CM.secondary, goldContainer:CM.secondaryContainer,
  indigo:CM.tertiary, indigoContainer:CM.tertiaryContainer, onIndigo:CM.onTertiaryContainer,
  error:CM.error, errorContainer:CM.errorContainer, success:'#22c55e', warning:CM.secondaryContainer,
  border:CM.outlineVariant, borderVariant:CM.outline,
};

export const THEMES = {
  cineRed: base,
  indigoDusk: { ...base, accent:CM.tertiaryContainer, accentFg:CM.onTertiaryContainer },
  amberGlow: { ...base, accent:CM.secondaryContainer, accentFg:CM.onSecondaryContainer },
  monochrome: { ...base, accent:CM.surfaceBright, accentFg:CM.onSurface },
} as const;
export type ThemeName = keyof typeof THEMES;

export const THEME_OPTIONS: { name:ThemeName; label:string; swatch1:string; swatch2:string }[] = [
  { name:'cineRed',    label:'CineRed',     swatch1:CM.primaryContainer,  swatch2:CM.background },
  { name:'indigoDusk', label:'Indigo Dusk', swatch1:CM.tertiaryContainer, swatch2:CM.onTertiary },
  { name:'amberGlow',  label:'Amber Glow',  swatch1:CM.secondaryContainer,swatch2:CM.onSecondary },
  { name:'monochrome', label:'Monochrome',  swatch1:'#ffffff',            swatch2:CM.surfaceBright },
];

export const radii = { sm:4, md:8, lg:16, xl:24, full:9999 } as const;
export const spacing = { xs:4, sm:8, md:12, lg:16, xl:24, xxl:32, section:48 } as const;

export const fonts = {
  displayBold:'Sora_700Bold', headlineSemibold:'Sora_600SemiBold', headlineMedium:'Sora_500Medium',
  bodyRegular:'PlusJakartaSans_400Regular', bodySemibold:'PlusJakartaSans_600SemiBold',
  label:'JetBrainsMono_500Medium',
} as const;

export const typography = {
  displayLg: { fontFamily:fonts.displayBold, fontSize:32, fontWeight:'700' as const, letterSpacing:-0.8 as number, lineHeight:38 },
  headlineMd:{ fontFamily:fonts.headlineSemibold, fontSize:24, fontWeight:'600' as const, lineHeight:31 },
  headlineSm:{ fontFamily:fonts.headlineMedium, fontSize:18, fontWeight:'600' as const, lineHeight:24 },
  bodyLg:    { fontFamily:fonts.bodyRegular, fontSize:16, fontWeight:'400' as const, lineHeight:26 },
  bodyMd:    { fontFamily:fonts.bodyRegular, fontSize:14, fontWeight:'400' as const, lineHeight:22 },
  bodySm:    { fontFamily:fonts.bodyRegular, fontSize:12, fontWeight:'400' as const, lineHeight:18 },
  label:     { fontFamily:fonts.label, fontSize:11, fontWeight:'500' as const, letterSpacing:0.6 as number, lineHeight:14, textTransform:'uppercase' as const },
  labelMd:   { fontFamily:fonts.label, fontSize:13, fontWeight:'500' as const, letterSpacing:0.4 as number, lineHeight:16 },
} as const;
