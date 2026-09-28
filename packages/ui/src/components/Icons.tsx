import React from "react";

// Inline SVG icons. Kept as components rather than icon-library deps
// because we use a small handful and bundling a full set would dominate
// the icon footprint.

export function PhoneOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

export function MicOnIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4zm-1 16.93A8 8 0 0 1 4.07 11H6a6 6 0 0 0 12 0h1.93A8 8 0 0 1 13 18.93V22h-2v-3.07z" />
    </svg>
  );
}

export function MicOffIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M2 2l20 20-1.4 1.4-3.07-3.07A8 8 0 0 1 4.07 11H6a6 6 0 0 0 8.93 5.52l-1.56-1.56A4 4 0 0 1 8 12V9.41L3.4 4.82 2 3.41 3.41 2zM13 5.17V6a4 4 0 0 1 .83 7.9L12 12.07V6a1.98 1.98 0 0 0-2.92-1.75L7.64 2.82A4 4 0 0 1 13 5.17zm-1 13.76V22h-2v-3.07A8 8 0 0 1 5.08 13h1.95A6 6 0 0 0 12 18.93z" />
    </svg>
  );
}

export function DeafenIcon({ size = 16, muted = false }: { size?: number; muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={muted ? { opacity: 0.4 } : undefined} aria-hidden="true">
      <path d="M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-2a7 7 0 0 1 14 0v2h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9z" />
    </svg>
  );
}

export function ScreenShareIcon({ size = 16 }: { size?: number }) {
  // Feather "monitor": stroke-based like the camera icons next to it. The
  // previous filled path was corrupted — its outer frame and inner cutout
  // shared the same right edge, so the monitor had no right bezel and
  // looked cut off.
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function CameraOnIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

export function CameraOffIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// --- Ping / signal-strength icon ---
// Three vertical bars of increasing height. Color driven by the `ping-*` CSS class.
// null ping = disconnected (all bars gray).
export function PingIcon({ ping }: { ping: number | null }) {
  const quality =
    ping === null ? "offline" : ping < 150 ? "good" : ping < 400 ? "okay" : "bad";
  const label =
    ping === null ? "offline" : `${ping}ms`;
  return (
    <svg
      viewBox="0 0 12 10"
      width="14"
      height="12"
      aria-label={`Ping: ${label}`}
      className={`ping-icon ping-${quality}`}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <title>{label}</title>
      {/* bar 1 — shortest */}
      <rect x="0" y="7" width="3" height="3" rx="0.5"
        opacity={quality !== "offline" ? 1 : 0.25} />
      {/* bar 2 — medium */}
      <rect x="4.5" y="4" width="3" height="6" rx="0.5"
        opacity={quality === "good" || quality === "okay" ? 1 : 0.25} />
      {/* bar 3 — tallest */}
      <rect x="9" y="0" width="3" height="10" rx="0.5"
        opacity={quality === "good" ? 1 : 0.25} />
    </svg>
  );
}

// --- Channel icon set (predefined named icons) ---

interface ChannelIconDef {
  id: string;
  paths: React.ReactNode;
}

export const CHANNEL_ICONS: ChannelIconDef[] = [
  { id: "chat", paths: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></> },
  { id: "mic", paths: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></> },
  { id: "headphones", paths: <><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></> },
  { id: "speaker", paths: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></> },
  { id: "video", paths: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></> },
  { id: "music", paths: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></> },
  { id: "game", paths: <><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></> },
  { id: "film", paths: <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></> },
  { id: "book", paths: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></> },
  { id: "star", paths: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></> },
  { id: "heart", paths: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></> },
  { id: "shield", paths: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></> },
  { id: "crown", paths: <><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></> },
  { id: "lock", paths: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></> },
  { id: "key", paths: <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></> },
  { id: "bolt", paths: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></> },
  { id: "home", paths: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></> },
  { id: "globe", paths: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></> },
  { id: "info", paths: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></> },
  { id: "warning", paths: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> },
  { id: "person", paths: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
  { id: "group", paths: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></> },
  { id: "trophy", paths: <><path d="M6 2h12v9a6 6 0 0 1-12 0V2z"/><path d="M6 7H4a2 2 0 0 1-2-2V4h4"/><path d="M18 7h2a2 2 0 0 0 2-2V4h-4"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></> },
  { id: "rocket", paths: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></> },
  { id: "tools", paths: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></> },
  { id: "megaphone", paths: <><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></> },
  { id: "news", paths: <><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></> },
];

export function ChannelIconGlyph({ icon, size = 14 }: { icon: string | null; size?: number }) {
  if (!icon) return null;
  const def = CHANNEL_ICONS.find((d) => d.id === icon);
  if (!def) {
    // Not a registry id — channel settings stores emoji picked via the
    // EmojiPicker as the icon value. Render it literally instead of
    // silently dropping it (which also swallowed the '#' fallback,
    // leaving the channel with no glyph at all).
    return (
      <span
        className="channel-icon-emoji"
        style={{ fontSize: size, lineHeight: 1 }}
        aria-hidden="true"
      >
        {icon}
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="channel-icon-svg"
      aria-hidden="true"
    >
      {def.paths}
    </svg>
  );
}

export function ChannelIcon({
  icon,
  customIconSvg,
  channelType,
  size = 14,
}: {
  icon: string | null;
  customIconSvg: string | null;
  channelType?: string | null;
  size?: number;
}) {
  if (customIconSvg) {
    const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(customIconSvg)}`;
    return (
      <img
        src={dataUri}
        width={size}
        height={size}
        className="channel-icon-custom"
        aria-hidden="true"
        style={{ objectFit: "contain", display: "inline-block", verticalAlign: "middle" }}
      />
    );
  }
  if (icon) return <ChannelIconGlyph icon={icon} size={size} />;
  if (!channelType || channelType === "text") {
    return <span className="channel-type-hash" aria-hidden="true">#</span>;
  }
  if (channelType === "spawner") {
    return <span className="channel-type-spawner" aria-hidden="true">+</span>;
  }
  if (channelType === "forum") {
    // Forum fell through to null like voice once did, and the sidebar row
    // compensated with a badge after the name — a badge standing in for the
    // icon that belonged in the gutter.
    return <ForumIcon size={size} />;
  }
  if (channelType === "voice") {
    // Voice channels used to fall through to null and sit in an empty gutter,
    // so a row you talk in looked like a row with a missing icon.
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" className="channel-type-voice" aria-hidden="true">
        <rect x="5.5" y="2" width="5" height="8" rx="2.5" />
        <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2" />
      </svg>
    );
  }
  return null;
}

// Interface icons. These replace emoji that were standing in for controls:
// an emoji renders in the platform's own colour and style, so a toolbar built
// from them has as many visual languages as it has buttons.

export function PinIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 2h6l-.9 6L18 11.3V14H6v-2.7L9.9 8z" />
      <line x1="12" y1="14" x2="12" y2="22" />
    </svg>
  );
}

export function SearchIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="15.5" y1="15.5" x2="21" y2="21" />
    </svg>
  );
}

export function MembersIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5a3.5 3.5 0 0 1 0 6.5" />
      <path d="M17.5 13.6A6.5 6.5 0 0 1 21.5 20" />
    </svg>
  );
}

export function LinkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7" />
    </svg>
  );
}

export function FlagIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h12l-2.5 4L17 12H5z" />
    </svg>
  );
}

export function ReplyIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 6 4 11 9 16" />
      <path d="M4 11h9a6 6 0 0 1 6 6v2" />
    </svg>
  );
}

export function EditIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20h4L19.5 8.5a2.8 2.8 0 0 0-4-4L4 16z" />
    </svg>
  );
}

export function TrashIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h16M9 6V4h6v2M7 6l1 14h8l1-14" />
    </svg>
  );
}

/** Playback gain relative to 100%: quiet, normal-but-adjusted, boosted. */
export function VolumeIcon({ size = 14, level }: { size?: number; level: "muted" | "reduced" | "boosted" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      {level === "muted" && <path d="M16 9.5l5 5M21 9.5l-5 5" />}
      {level === "reduced" && <path d="M15.5 10a3 3 0 0 1 0 4" />}
      {level === "boosted" && <><path d="M15.5 10a3 3 0 0 1 0 4" /><path d="M18 7.5a7 7 0 0 1 0 9" /></>}
    </svg>
  );
}

export function GearIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h16M4 16h16" />
      <circle cx="9" cy="8" r="2.2" />
      <circle cx="15" cy="16" r="2.2" />
    </svg>
  );
}

export function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** One shape, four rotations — a caret that points where it is going. */
export function ChevronIcon({ size = 16, dir = "down" }: { size?: number; dir?: "up" | "down" | "left" | "right" }) {
  const deg = { up: 180, down: 0, left: 90, right: -90 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ transform: `rotate(${deg}deg)` }}>
      <polyline points="6 9.5 12 15.5 18 9.5" />
    </svg>
  );
}

export function ExpandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
    </svg>
  );
}

export function ResetIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12a8 8 0 1 1 2.6 5.9" />
      <polyline points="4 6.5 4 12 9.5 12" />
    </svg>
  );
}

/** A channel where the topic is the thread, not the day — the forum type. */
export function ForumIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 5.5h13v9h-8l-5 4z" />
      <path d="M8 5.5V4h12.5v9H19v3.5L16.5 14" />
    </svg>
  );
}

export function BellOffIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 9a5.5 5.5 0 0 1 8.2-4.8M17.5 11v3l2 3H8" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </svg>
  );
}

export function PaperclipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 11.5l-7.6 7.6a4.7 4.7 0 0 1-6.6-6.6l8.2-8.2a3.1 3.1 0 0 1 4.4 4.4l-8.2 8.2a1.6 1.6 0 0 1-2.2-2.2l7.3-7.3" />
    </svg>
  );
}

export function SpeakerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
      <path d="M15.5 10a3 3 0 0 1 0 4" />
      <path d="M18 7.5a7 7 0 0 1 0 9" />
    </svg>
  );
}

export function ClockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

/** Whispering: a voice aimed at one person, so the cone is narrowed. */
export function WhisperIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21" />
      <path d="M19.5 4.5a3 3 0 0 1 0 4" />
    </svg>
  );
}

export function CakeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20.5h16v-6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3z" />
      <path d="M12 8V5M8.5 8V6M15.5 8V6" />
    </svg>
  );
}
