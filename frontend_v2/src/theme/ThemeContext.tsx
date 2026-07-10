import { createContext, PropsWithChildren, useContext, useMemo } from 'react';
import { useAppSelector } from '../store';
import { AppColors, ThemeName, THEMES } from './tokens';

const ThemeContext = createContext<AppColors>(THEMES.cineRed);

export function ThemeProvider({ children }: PropsWithChildren) {
  const name = useAppSelector((s) => (s.settings?.themeName ?? 'cineRed') as ThemeName);
  const colors = useMemo(() => THEMES[name] ?? THEMES.cineRed, [name]);
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppColors { return useContext(ThemeContext); }
export type { AppColors, ThemeName };
