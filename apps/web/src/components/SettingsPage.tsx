import React, { useState } from "react";
import type { Hub, NamedProfile, NotifLevel, BlockEntry, IgnoreEntry } from "@shared/types";
import { hubFetch, getNotifPref, setNotifPref } from "@platform";
import { loadIdentity, seedToPhrase } from "@identity/index";
import { SkinEditor, makeSeed } from "./SkinEditor";
import { SkinsGallery } from "./SkinsGallery";
import type { ThemeId, VoxplySkin } from "../skinValidation";
import { BlockIgnoreSection } from "@voxply/ui";
import { IdentityBackupSection } from "./IdentityBackupSection";

export type SettingsTab = "profile" | "notifications" | "appearance" | "account";

interface SettingsPageProps {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];
  publicKey: string | null;
  copiedKey: boolean;
  onCopyKey: () => void;
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: VoxplySkin | null;
  onSkinChange: (skin: VoxplySkin) => void;
  profiles: NamedProfile[];
  defaultProfileId: string | null;
  mentionPingEnabled?: boolean;
  onMentionPingChange?: (v: boolean) => void;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  blocks: BlockEntry[];
  ignores: IgnoreEntry[];
  onUnblock: (pubkey: string) => void;
  onUnignore: (pubkey: string) => void;
  knownNames: Record<string, string | null>;
  onImportSkin: (skin: VoxplySkin) => void;
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "notifications", label: "Notifications" },
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account" },
];

const THEMES: { value: ThemeId; label: string }[] = [
  { value: "calm", label: "Calm" },
  { value: "classic", label: "Classic" },
  { value: "linear", label: "Linear" },
  { value: "light", label: "Light" },
  { value: "custom", label: "Custom" },
];

const NOTIF_LEVELS: { value: NotifLevel; label: string }[] = [
  { value: "all", label: "All messages" },
  { value: "mentions", label: "Mentions only" },
  { value: "none", label: "None" },
];

export function SettingsPage(props: SettingsPageProps) {
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [hubNotifPrefs, setHubNotifPrefs] = useState<Record<string, NotifLevel>>(() => {
    const prefs: Record<string, NotifLevel> = {};
    for (const hub of props.hubs) {
      prefs[hub.hub_url] = getNotifPref(hub.hub_url);
    }
    return prefs;
  });

  async function handleSaveProfile() {
    setSaveStatus("saving");
    try {
      await hubFetch("/me", {
        method: "PATCH",
        body: JSON.stringify({
          display_name: displayName.trim() || null,
          avatar: avatarUrl.trim() || null,
        }),
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  return (
    <div className="settings-page" style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <aside className="settings-nav" style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "16px 8px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ padding: "0 8px", marginBottom: 12, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>Settings</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1 }}>
          {TABS.map((tab) => (
            <li key={tab.id}>
              <button
                className={`settings-nav-item${props.tab === tab.id ? " active" : ""}`}
                onClick={() => props.onTab(tab.id)}
                style={{ width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: "var(--r-sm)" }}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close btn-ghost" onClick={props.onClose} style={{ marginTop: 8 }}>
          Close
        </button>
      </aside>

      <main className="settings-content" style={{ flex: 1, overflow: "auto", padding: 24, position: "relative" }}>
        <button
          className="settings-close-x"
          onClick={props.onClose}
          title="Close"
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)" }}
        >
          ×
        </button>

        {props.tab === "profile" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>Profile</h1>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label" htmlFor="settings-display-name">Display name</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                This name is shown to other members of hubs you join.
              </p>
              <input
                id="settings-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
                style={{ width: "100%", maxWidth: 320 }}
              />
            </div>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label" htmlFor="settings-avatar-url">Avatar URL</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                Link to an image to use as your avatar.
              </p>
              <input
                id="settings-avatar-url"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.png"
                style={{ width: "100%", maxWidth: 320 }}
              />
              {avatarUrl && (
                <img
                  src={avatarUrl}
                  alt="Avatar preview"
                  style={{ display: "block", marginTop: 8, width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border)" }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>
            <div className="settings-row" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="btn-primary" onClick={handleSaveProfile} disabled={saveStatus === "saving"}>
                {saveStatus === "saving" ? "Saving…" : "Save profile"}
              </button>
              {saveStatus === "saved" && <span className="muted" style={{ fontSize: "var(--text-sm)" }}>Saved</span>}
              {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
                <span style={{ color: "var(--danger)", fontSize: "var(--text-sm)" }}>{saveStatus}</span>
              )}
            </div>
          </section>
        )}

        {props.tab === "notifications" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>Notifications</h1>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label">Mention sound</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                Play a sound when your name is mentioned in a message.
              </p>
              <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={props.mentionPingEnabled ?? true}
                  onChange={(e) => props.onMentionPingChange?.(e.target.checked)}
                />
                Enable mention ping sound
              </label>
            </div>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label">Desktop notifications</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                Allow the browser to show notifications for new messages.
              </p>
              <button
                className="btn-secondary"
                onClick={() => {
                  if (typeof Notification !== "undefined") {
                    Notification.requestPermission().catch(() => {});
                  }
                }}
              >
                Request notification permission
              </button>
              {typeof Notification !== "undefined" && (
                <p className="muted" style={{ marginTop: 8, fontSize: "var(--text-sm)" }}>
                  Current permission: {Notification.permission}
                </p>
              )}
            </div>
            {props.hubs.length > 0 && (
              <div className="settings-section">
                <label className="settings-label">Per-hub notification level</label>
                <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
                  Control which messages trigger browser notifications for each hub.
                </p>
                {props.hubs.map((hub) => (
                  <div
                    key={hub.hub_id}
                    className="settings-row"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
                  >
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{hub.hub_name}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {NOTIF_LEVELS.map((level) => (
                        <button
                          key={level.value}
                          className={hubNotifPrefs[hub.hub_url] === level.value ? "btn-primary" : "btn-secondary"}
                          style={{ fontSize: "var(--text-xs)", padding: "3px 8px" }}
                          onClick={() => {
                            setNotifPref(hub.hub_url, level.value);
                            setHubNotifPrefs((prev) => ({ ...prev, [hub.hub_url]: level.value }));
                          }}
                        >
                          {level.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {props.tab === "appearance" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>Appearance</h1>
            <div className="settings-section">
              <label className="settings-label">Theme</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 12 }}>
                Choose how Voxply looks in your browser.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => props.onThemeChange(t.value)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "var(--r-sm)",
                      border: props.theme === t.value ? "2px solid var(--accent)" : "1px solid var(--border)",
                      background: props.theme === t.value ? "var(--accent-subtle, var(--surface))" : "var(--surface)",
                      cursor: "pointer",
                      fontWeight: props.theme === t.value ? 600 : 400,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {props.theme === "custom" && (
                <SkinEditor skin={props.skin ?? makeSeed("calm")} onChange={props.onSkinChange} />
              )}
            </div>
            <SkinsGallery onImport={props.onImportSkin} />
          </section>
        )}

        {props.tab === "account" && (
          <section>
            <h1 style={{ marginBottom: 20 }}>Account</h1>
            <div className="settings-section" style={{ marginBottom: 20 }}>
              <label className="settings-label">Public key</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                This is your unique identity. Share it so others can find you.
              </p>
              <div className="settings-row" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code
                  className="pubkey-display"
                  title={props.publicKey ?? ""}
                  style={{ fontFamily: "monospace", fontSize: "var(--text-sm)", background: "var(--bg-elevated)", padding: "4px 8px", borderRadius: "var(--r-sm)", flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {props.publicKey ? props.publicKey.slice(0, 16) + "…" + props.publicKey.slice(-8) : "—"}
                </code>
                <button className="btn-secondary" onClick={props.onCopyKey}>
                  {props.copiedKey ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Recovery phrase</label>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
                Write this down and store it somewhere safe. It is the only way to recover your identity.
              </p>
              {props.recoveryPhrase ? (
                <div
                  className="recovery-phrase"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 14px", fontFamily: "monospace", lineHeight: 1.8, fontSize: "var(--text-sm)" }}
                >
                  {props.recoveryPhrase}
                </div>
              ) : (
                <button className="btn-secondary" onClick={props.onShowRecovery}>
                  Reveal recovery phrase
                </button>
              )}
            </div>
            <div className="settings-section" style={{ marginTop: 20 }}>
              <label className="settings-label">Identity backup</label>
              <IdentityBackupSection publicKey={props.publicKey} />
            </div>
            <BlockIgnoreSection
              blocks={props.blocks}
              ignores={props.ignores}
              onUnblock={props.onUnblock}
              onUnignore={props.onUnignore}
              knownNames={props.knownNames}
            />
          </section>
        )}
      </main>
    </div>
  );
}
