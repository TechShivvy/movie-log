---
name: Cinematic Motion
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#e9bcb6'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#af8782'
  outline-variant: '#5e3f3b'
  surface-tint: '#ffb4aa'
  primary: '#ffb4aa'
  on-primary: '#690003'
  primary-container: '#e50914'
  on-primary-container: '#fff7f6'
  inverse-primary: '#c0000c'
  secondary: '#ffdf9e'
  on-secondary: '#3f2e00'
  secondary-container: '#fabd00'
  on-secondary-container: '#6a4e00'
  tertiary: '#c0c1ff'
  on-tertiary: '#1000a9'
  tertiary-container: '#5e61ec'
  on-tertiary-container: '#fcf8ff'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4aa'
  on-primary-fixed: '#410001'
  on-primary-fixed-variant: '#930007'
  secondary-fixed: '#ffdf9e'
  secondary-fixed-dim: '#fabd00'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5b4300'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Sora
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Sora
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Sora
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  grid-margin: 2rem
  gutter: 1.5rem
  card-gap: 2rem
  container-max-width: 1280px
---

## Brand & Style

The design system is built on a "Modern Cinematic" aesthetic, blending the immersive atmosphere of a dark theater with the high-precision utility of a modern SaaS tool. It targets movie enthusiasts and collectors who value a premium, "lively" digital environment.

The style leverages **Glassmorphism** and **Tonal Layers** to create depth without clutter. The interface feels expansive, using heavy whitespace and high-quality typography to ensure the movie posters and metadata remain the focal point. Emotional responses should be excitement, organization, and sophistication.

## Colors

The system uses a deep, ink-blue neutral base (`#0F172A`) rather than pure black to allow for richer shadow depth and better color interaction.

- **Primary (Theater Red):** Used for urgent actions, critical CTAs, and "Live" indicators.
- **Secondary (Cinematic Gold):** Used for ratings, high-tier membership features, and "Featured" highlights.
- **Tertiary (Deep Indigo):** Used for metadata tags, secondary filters, and subtle data visualizations.
- **Surface Palette:** Backgrounds use a tiered approach: Base (`#0F172A`), Surface (`#1E293B`), and Overlay (`#334155`).

Color swatches in the theme selector must display the Primary and Secondary hex codes side-by-side in high-contrast blocks.

## Typography

This design system utilizes a three-font strategy to balance character with readability.

1. **Sora (Headlines):** A geometric sans-serif with a technical yet friendly vibe. Used for all major headings and display text.
2. **Plus Jakarta Sans (Body):** Soft and modern, providing excellent legibility for movie synopses and cast lists.
3. **JetBrains Mono (Metadata/Labels):** A monospaced font used for timestamps, runtimes, and technical specs (e.g., "4K", "HDR", "2h 14m") to evoke a digital "ticket" or "script" feel.

## Layout & Spacing

The layout follows a **Fluid Grid** model with high-density padding to maintain a "lively" and spacious feel.

- **Desktop:** 12-column grid with 32px margins and 24px gutters.
- **Tablet:** 8-column grid with 24px margins and 16px gutters.
- **Mobile:** 4-column grid with 16px margins and 12px gutters.

Responsive cards must never overlap; they utilize a `minmax` CSS grid logic to wrap naturally. Vertical spacing between sections (e.g., "Continue Watching" vs "Recommended") should be a minimum of 48px to clearly distinguish content hierarchies.

## Elevation & Depth

Depth is established through **Ambient Shadows** and **Glassmorphism**.

- **Level 1 (Base):** Deep neutral background.
- **Level 2 (Cards/Containers):** Subtle background blur (8px) with a semi-transparent fill (`#1E293B` at 80% opacity).
- **Level 3 (Modals/Popovers):** Elevated with a wide, soft shadow (`0 20px 25px -5px rgba(0, 0, 0, 0.5)`) and a 1px inner border in a lighter neutral to simulate a glass edge.

Shadows are tinted with the primary color at very low opacity (3-5%) to ensure they feel integrated into the dark theme.

## Shapes

The design system utilizes **Rounded** corners to keep the interface approachable.

- **Standard Elements (Buttons, Inputs):** 0.5rem (8px).
- **Large Elements (Cards, Modals):** 1.5rem (24px).
- **Image Assets (Posters):** 1rem (16px) to contrast with the sharper edges of the container cards.

## Components

### Buttons & Inputs
- **Buttons:** High-contrast fills. The primary button uses a subtle gradient from `#E50914` to a slightly darker shade. Hover states trigger a glow effect using a drop shadow of the primary color.
- **Inputs:** No harsh outlines. Active states use a "Glow" effect: a 2px outer shadow in the primary color with 40% opacity and a 1px border.

### Selection Controls
- **Checkboxes & Radios:** The entire row must be the hit target. When selected, the background of the row should subtly shift to a 10% opacity of the primary color.
- **Theme Swatches:** Displayed as 48x48px squares split diagonally or vertically with the two-tone theme colors.

### Content Cards
- **Movie Cards:** Poster art should be the dominant feature. Hovering over a card should trigger a slight scale-up (1.05x) and increase the shadow depth.
- **Chips/Tags:** Use the Tertiary color (`#6366F1`) with low-opacity backgrounds and high-contrast text for genre labels.

### Playback & Progress
- **Progress Bars:** Use a dual-tone approach. The "filled" portion of the bar should use the Primary color with a slight outer glow to indicate activity.