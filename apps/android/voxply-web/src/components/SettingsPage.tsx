import React, { useState } from "react";
import type { Hub } from "@shared/types";
import { PairingSection } from "./PairingSection";
import { IdentityBackupSection } from "./IdentityBackupSection";
import { RecoveryContactsSection } from "./RecoveryContactsSection";
import { BlockIgnoreSection, type BlockEntry, type IgnoreEntry } from "./BlockIgnoreSection";
import { SkinEditor, makeSeed } from "./SkinEditor";
import { SkinsGallery } from "./SkinsGallery";
import type { ThemeId, VoxplySkin } from "../skinValidation";

export type SettingsTab = "profile" | "account" | "appearance" | "devices";

interface Props {
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  hubs: Hub[];
  publicKey: string | null;
  copiedKey: boolean;
  onCopyKey: () => void;
  recoveryPhrase: string | null;
  onShowRecovery: () => void;
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  skin: VoxplySkin | null;
  onSkinChange: (skin: VoxplySkin) => void;
  onIdentityImported?: () => void;
  isAdmin?: boolean;
  blocks?: BlockEntry[];
  ignores?: IgnoreEntry[];
  onUnblock?: (pubkey: string) => void;
  onUnignore?: (pubkey: string) => void;
  knownNames?: Record<string, string | null>;
  onImportSkin: (skin: VoxplySkin) => void;
}

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "devices", label: "Devices" },
];

const THEMES: { value: ThemeId; label: string }[] = [
  { value: "calm", label: "Calm" },
  { value: "classic", label: "Classic" },
  { value: "linear", label: "Linear" },
  { value: "light", label: "Light" },
  { value: "custom", label: "Custom" },
];

export function SettingsPage(props: Props) {
  const { onIdentityImported, isAdmin = false } = props;
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "var(--background)", display: "flex", flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 600, flex: 1 }}>Settings</h2>
        <button className="btn-icon" onClick={props.onClose} aria-label="Close settings" title="Close">✕</button>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`settings-nav-item${props.tab === tab.id ? " active" : ""}`}
            onClick={() => props.onTab(tab.id)}
            style={{ flex: "0 0 auto", padding: "10px 16px" }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {props.tab === "profile" && (
          <section>
            <h3>Profile</h3>
            <div className="settings-section">
              <label className="settings-label" htmlFor="settings-display-name">Display name</label>
              <input id="settings-display-name" type="text" placeholder="Your display name"
                value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="settings-avatar-url">Avatar URL</label>
              <input id="settings-avatar-url" type="url" placeholder="https://…"
                value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
            </div>
          </section>
        )}

        {props.tab === "account" && (
          <section>
            <h3>Account</h3>
            <div className="settings-section">
              <label className="settings-label">Public key</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <code style={{ fontSize: "var(--text-xs)", wordBreak: "break-all", flex: 1 }}>
                  {props.publicKey ?? "—"}
                </code>
                <button className="btn-secondary" onClick={props.onCopyKey}>
                  {props.copiedKey ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Recovery phrase</label>
              {props.recoveryPhrase ? (
                <code style={{ fontSize: "var(--text-xs)", wordBreak: "break-all", display: "block", padding: 8, background: "var(--surface)", borderRadius: "var(--r-sm)" }}>
                  {props.recoveryPhrase}
                </code>
              ) : (
                <button className="btn-secondary" onClick={props.onShowRecovery}>Show recovery phrase</button>
              )}
            </div>
            <IdentityBackupSection publicKey={props.publicKey} onImported={onIdentityImported} />
            <div className="settings-section">
              <label className="settings-label">Recovery contacts</label>
              <RecoveryContactsSection isAdmin={isAdmin} />
            </div>
            {props.blocks !== undefined && (
              <BlockIgnoreSection
                blocks={props.blocks}
                ignores={props.ignores ?? []}
                onUnblock={props.onUnblock ?? (() => {})}
                onUnignore={props.onUnignore ?? (() => {})}
                knownNames={props.knownNames ?? {}}
              />
            )}
          </section>
        )}

        {props.tab === "appearance" && (
          <section>
            <h3>Appearance</h3>
            <div className="settings-section">
              <label className="settings-label">Theme</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    className={props.theme === t.value ? "btn-primary" : "btn-secondary"}
                    onClick={() => props.onThemeChange(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {props.theme === "custom" && (
                <SkinEditor
                  skin={props.skin ?? makeSeed("calm")}
                  onChange={props.onSkinChange}
                />
              )}
            </div>
            <SkinsGallery onImport={props.onImportSkin} />
          </section>
        )}

        {props.tab === "devices" && (
          <section>
            <h3>Devices</h3>
            <p className="muted" style={{ marginBottom: 16 }}>
              Link this device to an existing Voxply identity, or pair a new device from here.
            </p>
            <PairingSection hubs={props.hubs} />
          </section>
        )}
      </div>
    </div>
  );
}
