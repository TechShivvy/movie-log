export type FontOption = "cinematic" | "inter" | "system";

export interface FontConfig {
  key: FontOption;
  label: string;
  heading: string;
  body: string;
  mono: string;
}

export const FONT_OPTIONS: FontConfig[] = [
  {
    key: "cinematic",
    label: "Cinematic",
    heading: "Sora",
    body: "PlusJakartaSans",
    mono: "JetBrainsMono",
  },
  {
    key: "inter",
    label: "Inter",
    heading: "Inter",
    body: "Inter",
    mono: "Courier New",
  },
  {
    key: "system",
    label: "System",
    heading: "System",
    body: "System",
    mono: "Courier New",
  },
];

export const DEFAULT_FONT: FontOption = "cinematic";
