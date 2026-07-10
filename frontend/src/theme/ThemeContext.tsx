import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import { useAppSelector } from "../store";

export type ThemeName =
  | "cinema"
  | "light"
  | "dark"
  | "sakura"
  | "forest"
  | "champagne"
  | "nord"
  | "sunset"
  | "ocean"
  | "crimson"
  | "slate";

export interface AppColors {
  bg: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  accent: string;
  accentFg: string;
  indigo: string;
  indigoMuted: string;
  success: string;
  warning: string;
  error: string;
  errorMuted: string;
  border: string;
  borderStrong: string;
}

const palette: Record<ThemeName, AppColors> = {
  cinema: {
    bg: "#0D0F14",
    surface: "#15181F",
    surfaceElevated: "#1C2029",
    surfaceMuted: "#20242E",
    textPrimary: "#ECEEF3",
    textSecondary: "#8C93A8",
    textDisabled: "#494F62",
    accent: "#E8930A",
    accentFg: "#0D0F14",
    indigo: "#6366F1",
    indigoMuted: "#312E81",
    success: "#22C55E",
    warning: "#F59E0B",
    error: "#EF4444",
    errorMuted: "#2D1215",
    border: "#252A37",
    borderStrong: "#353C50",
  },
  dark: {
    bg: "#000000",
    surface: "#1C1C1E",
    surfaceElevated: "#2C2C2E",
    surfaceMuted: "#1C1C1E",
    textPrimary: "#F5F5F7",
    textSecondary: "#86868B",
    textDisabled: "#6E6E73",
    accent: "#0A84FF",
    accentFg: "#FFFFFF",
    indigo: "#5E5CE6",
    indigoMuted: "#1D1D2E",
    success: "#30D158",
    warning: "#FFD60A",
    error: "#FF453A",
    errorMuted: "#2D0A0A",
    border: "#3A3A3C",
    borderStrong: "#48484A",
  },
  light: {
    bg: "#FFFFFF",
    surface: "#F5F5F7",
    surfaceElevated: "#FFFFFF",
    surfaceMuted: "#FFFFFF",
    textPrimary: "#1D1D1F",
    textSecondary: "#6E6E73",
    textDisabled: "#86868B",
    accent: "#007AFF",
    accentFg: "#FFFFFF",
    indigo: "#5856D6",
    indigoMuted: "#E5E4F6",
    success: "#34C759",
    warning: "#FF9500",
    error: "#FF3B30",
    errorMuted: "#FFF0EF",
    border: "#D2D2D7",
    borderStrong: "#AEAEB2",
  },
  sakura: {
    bg: "#120B1A",
    surface: "#1F1429",
    surfaceElevated: "#2D1D3A",
    surfaceMuted: "#1F1429",
    textPrimary: "#F8F1FF",
    textSecondary: "#DDBDEB",
    textDisabled: "#A27BAF",
    accent: "#E91E63",
    accentFg: "#FFFFFF",
    indigo: "#CE93D8",
    indigoMuted: "#3D1260",
    success: "#8BC34A",
    warning: "#FF9800",
    error: "#FF5252",
    errorMuted: "#2D0515",
    border: "#3D284F",
    borderStrong: "#5A3F70",
  },
  forest: {
    bg: "#1A2F2B",
    surface: "#243F3A",
    surfaceElevated: "#2E4F49",
    surfaceMuted: "#243F3A",
    textPrimary: "#E8F3F1",
    textSecondary: "#A9C7C1",
    textDisabled: "#7D9E98",
    accent: "#4CAF50",
    accentFg: "#0A1F0A",
    indigo: "#80CBC4",
    indigoMuted: "#1A3F3A",
    success: "#AED581",
    warning: "#FFB74D",
    error: "#FF7043",
    errorMuted: "#2D1510",
    border: "#3C6760",
    borderStrong: "#4D8079",
  },
  champagne: {
    bg: "#FCF8F2",
    surface: "#F5EFE6",
    surfaceElevated: "#FCF8F2",
    surfaceMuted: "#FFFFFF",
    textPrimary: "#4A4031",
    textSecondary: "#7A6E5D",
    textDisabled: "#A69B8D",
    accent: "#C5A059",
    accentFg: "#FFFFFF",
    indigo: "#8D7B68",
    indigoMuted: "#EDE3D8",
    success: "#689F38",
    warning: "#F4B942",
    error: "#D32F2F",
    errorMuted: "#FBE9E7",
    border: "#E3D7C5",
    borderStrong: "#C9B99A",
  },
  nord: {
    bg: "#2E3440",
    surface: "#3B4252",
    surfaceElevated: "#434C5E",
    surfaceMuted: "#3B4252",
    textPrimary: "#ECEFF4",
    textSecondary: "#D8DEE9",
    textDisabled: "#81848C",
    accent: "#88C0D0",
    accentFg: "#2E3440",
    indigo: "#81A1C1",
    indigoMuted: "#3B4A5C",
    success: "#A3BE8C",
    warning: "#EBCB8B",
    error: "#BF616A",
    errorMuted: "#3B2C2E",
    border: "#4C566A",
    borderStrong: "#616E88",
  },
  sunset: {
    bg: "#1A1423",
    surface: "#2D1E3E",
    surfaceElevated: "#3D2B56",
    surfaceMuted: "#2D1E3E",
    textPrimary: "#FFF0F0",
    textSecondary: "#FFCCBC",
    textDisabled: "#9E8B8B",
    accent: "#FF7043",
    accentFg: "#1A0505",
    indigo: "#CE93D8",
    indigoMuted: "#3D1E50",
    success: "#FFB74D",
    warning: "#FFA726",
    error: "#FF5252",
    errorMuted: "#2D1010",
    border: "#4A3B5F",
    borderStrong: "#6A5A80",
  },
  ocean: {
    bg: "#F0F8FF",
    surface: "#E1F5FE",
    surfaceElevated: "#F0F8FF",
    surfaceMuted: "#FFFFFF",
    textPrimary: "#01579B",
    textSecondary: "#0288D1",
    textDisabled: "#4FC3F7",
    accent: "#03A9F4",
    accentFg: "#FFFFFF",
    indigo: "#0277BD",
    indigoMuted: "#E1F5FE",
    success: "#4DB6AC",
    warning: "#FFB300",
    error: "#E57373",
    errorMuted: "#FFEBEE",
    border: "#B3E5FC",
    borderStrong: "#81D4FA",
  },
  crimson: {
    bg: "#1A0505",
    surface: "#2D0D0D",
    surfaceElevated: "#3D1414",
    surfaceMuted: "#2D0D0D",
    textPrimary: "#FFF5F5",
    textSecondary: "#E8B0B0",
    textDisabled: "#A67373",
    accent: "#FF4D4D",
    accentFg: "#1A0000",
    indigo: "#EF9A9A",
    indigoMuted: "#3D1010",
    success: "#4CAF50",
    warning: "#FF9800",
    error: "#FF1A1A",
    errorMuted: "#2D0505",
    border: "#4D1A1A",
    borderStrong: "#6D2A2A",
  },
  slate: {
    bg: "#F1F5F9",
    surface: "#E2E8F0",
    surfaceElevated: "#F8FAFC",
    surfaceMuted: "#FFFFFF",
    textPrimary: "#0F172A",
    textSecondary: "#475569",
    textDisabled: "#94A3B8",
    accent: "#334155",
    accentFg: "#FFFFFF",
    indigo: "#6366F1",
    indigoMuted: "#EEF2FF",
    success: "#166534",
    warning: "#854D0E",
    error: "#991B1B",
    errorMuted: "#FEF2F2",
    border: "#CBD5E1",
    borderStrong: "#94A3B8",
  },
};

export const THEME_NAMES: { name: ThemeName; label: string }[] = [
  { name: "cinema", label: "🎬 Cinema (default)" },
  { name: "dark", label: "🌑 Dark" },
  { name: "light", label: "☀️ Light" },
  { name: "nord", label: "❄️ Nord" },
  { name: "sakura", label: "🌸 Sakura" },
  { name: "forest", label: "🌿 Forest" },
  { name: "champagne", label: "🥂 Champagne" },
  { name: "sunset", label: "🌅 Sunset" },
  { name: "ocean", label: "🌊 Ocean" },
  { name: "crimson", label: "🩸 Crimson" },
  { name: "slate", label: "🪨 Slate" },
];

const ThemeContext = createContext<AppColors>(palette.cinema);

export function ThemeProvider({ children }: PropsWithChildren) {
  const themeName = useAppSelector(
    (s) => s.settings?.themeName ?? "cinema",
  ) as ThemeName;
  const colors = useMemo(
    () => palette[themeName] ?? palette.cinema,
    [themeName],
  );
  return (
    <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): AppColors {
  return useContext(ThemeContext);
}

export function getThemeColors(name: ThemeName): AppColors {
  return palette[name] ?? palette.cinema;
}
