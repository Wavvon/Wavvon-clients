import { Avatar } from "./Avatar";
import { ChannelIcon } from "./Icons";
import {
  DEMO_CHANNELS,
  DEMO_HUB,
  DEMO_MEMBERS,
  DEMO_MESSAGES,
  PREVIEW_HEIGHT,
  PREVIEW_WIDTH,
} from "../themes/demoContent";

// A fixed hub with made-up content, built from the app's own classes so the
// active theme (and the layout options on <html>) style it exactly as they
// style the real thing. Rendered offscreen for the preview capture.
export function ThemePreviewDemo() {
  return (
    <div className="main-layout theme-preview-demo" style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, background: "var(--bg)", color: "var(--text)", overflow: "hidden" }}>
      <div className="mobile-shell-desktop">
        <header className="top-bar">
          <span className="top-bar-hubs">{DEMO_HUB.name}</span>
          <div className="top-bar-spacer" />
        </header>
        <nav className="sidebar" style={{ width: 200 }}>
          <div className="hub-header" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "var(--space-2) 0" }}>
            <span className="hub-header-name">{DEMO_HUB.name}</span>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{DEMO_HUB.host}</span>
          </div>
          <ul className="channel-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {DEMO_CHANNELS.map((c) => (
              <li key={c.name} className={`channel-item${c.selected ? " selected" : ""}`}>
                <ChannelIcon icon={null} customIconSvg={null} channelType={c.type} />
                <span style={{ marginLeft: 8 }}>{c.name}</span>
              </li>
            ))}
          </ul>
        </nav>
        <main className="content">
          <div className="chat-column">
            <div className="channel-header">
              <span className="channel-breadcrumb-item current">
                <ChannelIcon icon={null} customIconSvg={null} channelType="text" /> {DEMO_CHANNELS[0].name}
              </span>
            </div>
            <ol className="messages" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {DEMO_MESSAGES.map((m) => (
                <li key={m.key} className="message message-row">
                  <span className="message-avatar">
                    <Avatar name={m.author} pubkey={m.key} size={36} />
                  </span>
                  <span className="message-meta">
                    <span className="message-sender">{m.author}</span>
                    <span className="message-time">{m.time}</span>
                  </span>
                  <span className="message-main">
                    <span className="message-content">{m.text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </main>
        <aside className="user-list-sidebar" style={{ width: 180 }}>
          <ul className="user-list">
            {DEMO_MEMBERS.map((m) => (
              <li key={m.key} className="user-list-item">
                <Avatar name={m.name} pubkey={m.key} size={28} />
                <span className="user-text">
                  <span className="user-name">{m.name}</span>
                  <span className="user-status-line">{m.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
