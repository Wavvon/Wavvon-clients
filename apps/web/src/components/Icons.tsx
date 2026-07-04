import React from "react";

// Inline SVG icons. Kept as components rather than icon-library deps
// because we use a small handful and bundling a full set would dominate
// the icon footprint.

export function PhoneIcon() {
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
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

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
  label: string;
  paths: React.ReactNode;
}

export const CHANNEL_ICONS: ChannelIconDef[] = [
  { id: "chat",      label: "Chat",       paths: <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></> },
  { id: "mic",       label: "Mic",        paths: <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></> },
  { id: "headphones",label: "Headphones", paths: <><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></> },
  { id: "speaker",   label: "Speaker",    paths: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></> },
  { id: "video",     label: "Video",      paths: <><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></> },
  { id: "music",     label: "Music",      paths: <><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></> },
  { id: "game",      label: "Game",       paths: <><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></> },
  { id: "film",      label: "Film",       paths: <><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></> },
  { id: "book",      label: "Book",       paths: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></> },
  { id: "star",      label: "Star",       paths: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></> },
  { id: "heart",     label: "Heart",      paths: <><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></> },
  { id: "shield",    label: "Shield",     paths: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></> },
  { id: "crown",     label: "Crown",      paths: <><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></> },
  { id: "lock",      label: "Lock",       paths: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></> },
  { id: "key",       label: "Key",        paths: <><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></> },
  { id: "bolt",      label: "Bolt",       paths: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></> },
  { id: "home",      label: "Home",       paths: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></> },
  { id: "globe",     label: "Globe",      paths: <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></> },
  { id: "info",      label: "Info",       paths: <><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></> },
  { id: "warning",   label: "Warning",    paths: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></> },
  { id: "person",    label: "Person",     paths: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
  { id: "group",     label: "Group",      paths: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></> },
  { id: "trophy",    label: "Trophy",     paths: <><path d="M6 2h12v9a6 6 0 0 1-12 0V2z"/><path d="M6 7H4a2 2 0 0 1-2-2V4h4"/><path d="M18 7h2a2 2 0 0 0 2-2V4h-4"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="9" y1="21" x2="15" y2="21"/></> },
  { id: "rocket",    label: "Rocket",     paths: <><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></> },
  { id: "tools",     label: "Tools",      paths: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></> },
  { id: "megaphone", label: "Megaphone",  paths: <><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></> },
  { id: "news",      label: "News",       paths: <><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/></> },
];

export function GamepadIcon({ size = 18 }: { size?: number }) {
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
      aria-hidden="true"
    >
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="18" y1="11" x2="18.01" y2="11" />
      <rect x="2" y="6" width="20" height="12" rx="2" />
    </svg>
  );
}

export function ChannelIconGlyph({ icon, size = 14 }: { icon: string | null; size?: number }) {
  if (!icon) return null;
  const def = CHANNEL_ICONS.find((d) => d.id === icon);
  if (!def) return null;
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
  return null;
}
