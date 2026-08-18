import { useWindowDimensions } from "react-native";

/**
 * Width breakpoints, px. Below `mobile` gets the phone shell (TabBar, no
 * sidebar); `mobile`–`tablet` gets a narrowed desktop shell; `tablet`+ is
 * full desktop. Matches the mobile design's 1fr/1fr grid switching over to
 * the web design's repeat(5,1fr) — see lib/designCss.ts's `.libgrid`.
 *
 * `useWindowDimensions` (not `window.innerWidth`) so this works identically
 * on web and native — native ignores it today (native always renders
 * MobileLayout regardless of width) but tablet/landscape can opt in later
 * without a second hook.
 */
export const BP = { mobile: 768, tablet: 1120 } as const;

export interface Breakpoint {
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  return {
    width,
    isMobile: width < BP.mobile,
    isTablet: width >= BP.mobile && width < BP.tablet,
    isDesktop: width >= BP.tablet,
  };
}
