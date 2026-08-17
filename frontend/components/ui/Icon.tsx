/**
 * Icon — one call site, correct rendering on both platforms.
 *
 * The design files use the Phosphor **web font** (`<i class="ph-fill ph-star">`),
 * so on web we emit exactly that: it inherits font-size/color like the design
 * expects, and costs no JS. On native there is no icon font, so we render the
 * equivalent `phosphor-react-native` SVG component.
 *
 * Names are the design's own kebab-case Phosphor names minus the `ph-` prefix
 * ("film-slate", "sign-in", …) so markup can be copied straight across from
 * the design HTML without translation.
 *
 * Adding an icon: add the kebab name to IconName, import the PascalCase
 * component from phosphor-react-native, and add one NATIVE registry entry.
 */
import React from "react";
import { Platform } from "react-native";
import {
  Armchair, BatteryHigh, Bell, BookmarkSimple, Brain, CalendarBlank,
  CameraPlus, CaretLeft, CaretRight, CellSignalFull, ChartBar, ChatCircle,
  CheckCircle, CircleNotch, Clock, Database, DeviceMobileCamera, DotsThree,
  DownloadSimple, FilmSlate, FilmStrip, Flag, FloppyDisk, GearSix, Globe,
  GoogleLogo, Heart, Lock, LockKeyOpen, LockSimple, MagicWand, MagnifyingGlass,
  MapPin, MapTrifold, Monitor, Note, Palette, PaperPlaneTilt, PencilSimple,
  Plus, PlusCircle, Popcorn, ProjectorScreen, Robot, Rows, Rss, ShareNetwork,
  SidebarSimple, SignIn, Sparkle, SquaresFour, StackPlus, Star, StarHalf,
  Ticket, Timer, Trash, Upload, UploadSimple, User, UserPlus, Users, Warning,
  WifiHigh, WifiSlash, X,
} from "phosphor-react-native";

export type IconWeight = "regular" | "fill" | "bold";

const NATIVE = {
  "armchair": Armchair,
  "battery-high": BatteryHigh,
  "bell": Bell,
  "bookmark-simple": BookmarkSimple,
  "brain": Brain,
  "calendar-blank": CalendarBlank,
  "camera-plus": CameraPlus,
  "caret-left": CaretLeft,
  "caret-right": CaretRight,
  "cell-signal-full": CellSignalFull,
  "chart-bar": ChartBar,
  "chat-circle": ChatCircle,
  "check-circle": CheckCircle,
  "circle-notch": CircleNotch,
  "clock": Clock,
  "database": Database,
  "device-mobile-camera": DeviceMobileCamera,
  "dots-three": DotsThree,
  "download-simple": DownloadSimple,
  "film-slate": FilmSlate,
  "film-strip": FilmStrip,
  "flag": Flag,
  "floppy-disk": FloppyDisk,
  "gear-six": GearSix,
  "globe": Globe,
  "google-logo": GoogleLogo,
  "heart": Heart,
  "lock": Lock,
  "lock-key-open": LockKeyOpen,
  "lock-simple": LockSimple,
  "magic-wand": MagicWand,
  "magnifying-glass": MagnifyingGlass,
  "map-pin": MapPin,
  "map-trifold": MapTrifold,
  "monitor": Monitor,
  "note": Note,
  "palette": Palette,
  "paper-plane-tilt": PaperPlaneTilt,
  "pencil-simple": PencilSimple,
  "plus": Plus,
  "plus-circle": PlusCircle,
  "popcorn": Popcorn,
  "projector-screen": ProjectorScreen,
  "robot": Robot,
  "rows": Rows,
  "rss": Rss,
  "share-network": ShareNetwork,
  "sidebar-simple": SidebarSimple,
  "sign-in": SignIn,
  "sparkle": Sparkle,
  "squares-four": SquaresFour,
  "stack-plus": StackPlus,
  "star": Star,
  "star-half": StarHalf,
  "ticket": Ticket,
  "timer": Timer,
  "trash": Trash,
  "upload": Upload,
  "upload-simple": UploadSimple,
  "user": User,
  "user-plus": UserPlus,
  "users": Users,
  "warning": Warning,
  "wifi-high": WifiHigh,
  "wifi-slash": WifiSlash,
  "x": X,
} as const;

export type IconName = keyof typeof NATIVE;

export interface IconProps {
  name: IconName;
  /** Matches the design's `font-size` on web and `size` on native. */
  size?: number;
  color?: string;
  weight?: IconWeight;
  /** Extra CSS classes on web (e.g. "tapc text-muted"), ignored on native. */
  className?: string;
  style?: any;
  /** Web-only click handler; on native wrap the Icon in a Pressable instead. */
  onClick?: () => void;
}

export function Icon({
  name,
  size = 16,
  color,
  weight = "regular",
  className,
  style,
  onClick,
}: IconProps) {
  if (Platform.OS === "web") {
    // ph = regular, ph-fill, ph-bold — the three weight stylesheets imported
    // in lib/designCss.ts. font-size drives the glyph size, color inherits.
    const weightCls = weight === "regular" ? "ph" : `ph-${weight}`;
    return (
      <i
        className={[weightCls, `ph-${name}`, className].filter(Boolean).join(" ")}
        onClick={onClick}
        style={{
          fontSize: size,
          color,
          lineHeight: 1,
          flex: "none",
          ...(style as object),
        }}
      />
    );
  }

  const Cmp = NATIVE[name];
  if (!Cmp) return null;
  return <Cmp size={size} color={color} weight={weight} style={style} />;
}
