import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  BanInfo,
  Channel,
  InviteInfo,
  MemberAdminInfo,
  PendingUser,
  RoleInfo,
} from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";
import { ImagePicker } from "./ImagePicker";
import { InvitesSection } from "./InvitesSection";
import { MemberRow } from "./MemberRow";
import { RoleCreator } from "./RoleCreator";
import { RoleEditor } from "./RoleEditor";
import { AlliancesSection } from "./AlliancesSection";
import { AllianceInvitesSection } from "./AllianceInvitesSection";
import { HubIconsSection } from "./HubIconsSection";
import { BotAdminSection } from "./BotAdminSection";
import { SurveyAdminSection } from "./SurveyAdminSection";
import { LobbySettingsSection } from "./LobbySettingsSection";
import { ChallengeSettingsSection } from "./ChallengeSettingsSection";
import { ServerTagsSection } from "./ServerTagsSection";
import { CertificationsSection } from "./CertificationsSection";
import { RecoveryContactsSection } from "./RecoveryContactsSection";

export type HubAdminTab =
  | "overview"
  | "discovery"
  | "roles"
  | "members"
  | "bans"
  | "invites"
  | "alliances"
  | "alliance-invites"
  | "icons"
  | "bots"
  | "survey"
  | "lobby"
  | "challenge"
  | "tags"
  | "certifications"
  | "recovery";

export interface HubAdminPageProps {
  tab: HubAdminTab;
  onTab: (t: HubAdminTab) => void;
  onClose: () => void;
  hubName: string;
  onHubNameChange: (v: string) => void;
  hubDescription: string;
  onHubDescriptionChange: (v: string) => void;
  hubIcon: string;
  onHubIconChange: (v: string) => void;
  requireApproval: boolean;
  onRequireApprovalChange: (v: boolean) => void;
  minSecurityLevel: number;
  onMinSecurityLevelChange: (v: number) => void;
  maxChannelDepth: number;
  onMaxChannelDepthChange: (v: number) => void;
  onSave: () => void;
  pendingMembers: PendingUser[];
  onApproveMember: (publicKey: string) => void;
  roles: RoleInfo[];
  onCreateRole: (
    name: string,
    perms: string[],
    priority: number,
    displaySeparately: boolean,
  ) => void;
  onUpdateRole: (
    id: string,
    updates: {
      name?: string;
      permissions?: string[];
      priority?: number;
      display_separately?: boolean;
    },
  ) => void;
  onDeleteRole: (id: string) => void;
  members: MemberAdminInfo[];
  onKickMember: (publicKey: string) => void;
  onBanMember: (publicKey: string) => void;
  onMuteMember: (publicKey: string) => void;
  onTimeoutMember: (publicKey: string) => void;
  onVoiceMuteMember: (publicKey: string) => void;
  onVoiceUnmuteMember: (publicKey: string) => void;
  voiceMutedKeys: Set<string>;
  onToggleRoleAssignment: (
    publicKey: string,
    roleId: string,
    hasRole: boolean,
  ) => void;
  bans: BanInfo[];
  onUnban: (publicKey: string) => void;
  invites: InviteInfo[];
  activeHubUrl: string;
  myPubkey: string;
  onCreateInvite: (maxUses: number | null, expiresInSeconds: number | null) => void;
  onRevokeInvite: (code: string) => void;
  channels: Channel[];
}

function hubToWavvonUrl(hubUrl: string): string {
  try {
    const u = new URL(hubUrl);
    const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    return `wavvon://${hostPort}`;
  } catch {
    return `wavvon://${hubUrl}`;
  }
}

function roleColor(role: RoleInfo): string {
  if (role.id === "builtin-owner") return "#f5a623";
  if (role.id === "builtin-everyone") return "var(--text-faint)";
  let h = 0;
  for (let i = 0; i < role.id.length; i++) h = (h * 31 + role.id.charCodeAt(i)) & 0x7fffffff;
  return `hsl(${h % 360}, 60%, 55%)`;
}

export function HubAdminPage(props: HubAdminPageProps) {
  const [copiedShare, setCopiedShare] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const [dirTags, setDirTags] = useState("");
  const [dirLanguage, setDirLanguage] = useState("en");
  const [dirBio, setDirBio] = useState("");
  const [dirInviteCode, setDirInviteCode] = useState("");
  const [dirUrl, setDirUrl] = useState("https://discovery.wavvon.io");
  const [dirStatus, setDirStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [dirError, setDirError] = useState("");

  async function handleSubmitToDirectory() {
    setDirStatus("submitting");
    setDirError("");
    try {
      await invoke("submit_to_directory", {
        directoryUrl: dirUrl,
        tags: dirTags.split(",").map((t) => t.trim()).filter(Boolean),
        language: dirLanguage.trim() || "en",
        bio: dirBio,
        inviteCode: dirInviteCode.trim() || null,
      });
      setDirStatus("ok");
    } catch (e) {
      setDirError(String(e));
      setDirStatus("error");
    }
  }

  const tabs: { id: HubAdminTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "discovery", label: "Discovery" },
    { id: "roles", label: "Roles" },
    { id: "members", label: "Members" },
    { id: "bans", label: "Bans" },
    { id: "invites", label: "Invites" },
    { id: "alliances", label: "Alliances" },
    { id: "alliance-invites", label: "Alliance invites" },
    { id: "icons", label: "Icons" },
    { id: "bots", label: "Bots" },
    { id: "survey", label: "Onboarding" },
    { id: "lobby", label: "Lobby" },
    { id: "challenge", label: "Challenge" },
    { id: "tags", label: "Tags & Badges" },
    { id: "certifications", label: "Certifications" },
    { id: "recovery", label: "Recovery" },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>Hub settings</h2>
        <ul>
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                className={`settings-nav-item ${props.tab === t.id ? "active" : ""}`}
                onClick={() => props.onTab(t.id)}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={props.onClose}>
          Close (ESC)
        </button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title="Close">
          ×
        </button>
        {props.tab === "overview" && (
          <section>
            <h1>Overview</h1>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-name">Hub name</label>
              <input
                id="admin-hub-name"
                type="text"
                value={props.hubName}
                onChange={(e) => props.onHubNameChange(e.target.value)}
                placeholder="My Hub"
              />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-desc">Description</label>
              <p className="muted">Shown to visitors before they join.</p>
              <textarea
                id="admin-hub-desc"
                rows={3}
                value={props.hubDescription}
                onChange={(e) => props.onHubDescriptionChange(e.target.value)}
                placeholder="What's this hub for?"
              />
            </div>
            <div className="settings-section">
              <label className="settings-label">Icon</label>
              <p className="muted">
                PNG or JPG, max 256 KB. Stored inline on the hub.
              </p>
              <div className="hub-icon-editor">
                {props.hubIcon ? (
                  <img
                    src={props.hubIcon}
                    alt="Hub icon"
                    className="hub-icon-preview"
                  />
                ) : (
                  <div className="hub-icon-preview placeholder">No icon</div>
                )}
                <ImagePicker
                  onPick={props.onHubIconChange}
                  onClear={() => props.onHubIconChange("")}
                  hasValue={!!props.hubIcon}
                  buttonLabel="Pick image"
                />
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Membership</label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={props.requireApproval}
                  onChange={(e) =>
                    props.onRequireApprovalChange(e.target.checked)
                  }
                />
                Require admin approval before new members can participate
              </label>
              <p className="muted">
                When on, anyone who authenticates is marked pending. They can
                see their own status but nothing else until an admin approves
                them on the Members tab.
              </p>
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-antispam">Anti-spam: minimum proof-of-work</label>
              <p className="muted">
                Connecting clients must prove CPU work tied to their public key.
                Higher levels take longer to compute and slow down bot floods.
                messages per minute (0 = disabled)
              </p>
              <input
                id="admin-antispam"
                type="number"
                min={0}
                max={9999}
                step={1}
                value={props.minSecurityLevel}
                onChange={(e) => props.onMinSecurityLevelChange(Number(e.target.value))}
              />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-max-depth">Max channel nesting depth</label>
              <p className="muted">
                Limits how deep categories and channels can nest. 0 = unlimited.
                If set to 4, categories can nest up to depth 3 and channels up to depth 4.
              </p>
              <input
                id="admin-max-depth"
                type="number"
                min={0}
                max={20}
                value={props.maxChannelDepth}
                onChange={(e) => props.onMaxChannelDepthChange(Number(e.target.value))}
              />
            </div>
            <div className="settings-section">
              <button onClick={props.onSave}>Save changes</button>
            </div>
          </section>
        )}
        {props.tab === "discovery" && (
          <section>
            <h1>Discovery</h1>
            <div className="settings-section">
              <label className="settings-label">Share this hub</label>
              <p className="muted">
                Anyone with Wavvon who opens this link will see a preview
                and can join. For invite-only hubs, also share an invite
                code from the Invites tab.
              </p>
              <div className="settings-row">
                <code className="pubkey-display">
                  {hubToWavvonUrl(props.activeHubUrl)}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(hubToWavvonUrl(props.activeHubUrl));
                    setCopiedShare(true);
                    setTimeout(() => setCopiedShare(false), 2000);
                  }}
                >
                  {copiedShare ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Submit to directory</label>
              <p className="muted">
                List this hub on the Wavvon discovery directory so others can
                find it. Your hub signs the submission — no account needed.
              </p>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-tags">Tags</label>
                <input
                  id="admin-dir-tags"
                  type="text"
                  placeholder="gaming, music, en (comma-separated)"
                  value={dirTags}
                  onChange={(e) => setDirTags(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-lang">Language</label>
                <input
                  id="admin-dir-lang"
                  type="text"
                  placeholder="en"
                  value={dirLanguage}
                  onChange={(e) => setDirLanguage(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-bio">Bio</label>
                <textarea
                  id="admin-dir-bio"
                  rows={3}
                  placeholder="Tell people what your hub is about…"
                  value={dirBio}
                  onChange={(e) => setDirBio(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-invite">Invite code (optional)</label>
                <input
                  id="admin-dir-invite"
                  type="text"
                  placeholder="For invite-only hubs"
                  value={dirInviteCode}
                  onChange={(e) => setDirInviteCode(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-url">Directory URL</label>
                <input
                  id="admin-dir-url"
                  type="text"
                  value={dirUrl}
                  onChange={(e) => setDirUrl(e.target.value)}
                />
              </div>
              {dirStatus === "ok" && (
                <p className="muted" style={{ color: "var(--success)" }}>
                  ✓ Hub listed on the directory.
                </p>
              )}
              {dirStatus === "error" && (
                <p className="error-text">{dirError}</p>
              )}
              <button
                onClick={handleSubmitToDirectory}
                disabled={dirStatus === "submitting"}
              >
                {dirStatus === "submitting" ? "Submitting…" : "Submit to directory"}
              </button>
            </div>
          </section>
        )}
        {props.tab === "roles" && (() => {
          const sortedRoles = props.roles.slice().sort((a, b) => b.priority - a.priority);
          const effectiveSelected = selectedRoleId && sortedRoles.find((r) => r.id === selectedRoleId)
            ? selectedRoleId
            : sortedRoles[0]?.id ?? null;
          const selectedRole = sortedRoles.find((r) => r.id === effectiveSelected) ?? null;
          return (
            <section>
              <h1>Roles</h1>
              <p className="muted">
                Built-in roles (@everyone, Owner) can't be renamed or deleted
                but @everyone permissions can be tuned.
              </p>
              <div className="roles-layout">
                <div className="roles-list">
                  {sortedRoles.map((role) => (
                    <button
                      key={role.id}
                      className={`role-list-item${!isCreatingRole && effectiveSelected === role.id ? " active" : ""}`}
                      onClick={() => { setSelectedRoleId(role.id); setIsCreatingRole(false); }}
                    >
                      <span
                        className="role-list-dot"
                        style={{ background: roleColor(role) }}
                      />
                      <span className="role-list-name">{role.name}</span>
                    </button>
                  ))}
                  <button
                    className={`role-list-item role-list-add${isCreatingRole ? " active" : ""}`}
                    onClick={() => setIsCreatingRole(true)}
                    title="Create role"
                  >
                    <span className="role-list-dot" style={{ background: "var(--border)", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>+</span>
                    <span className="role-list-name">New role</span>
                  </button>
                </div>
                <div className="roles-panel">
                  {isCreatingRole ? (
                    <RoleCreator
                      onCreate={(name, perms, priority, ds) => {
                        props.onCreateRole(name, perms, priority, ds);
                        setIsCreatingRole(false);
                      }}
                    />
                  ) : selectedRole ? (
                    <RoleEditor
                      key={selectedRole.id}
                      role={selectedRole}
                      onUpdate={(updates) => props.onUpdateRole(selectedRole.id, updates)}
                      onDelete={() => {
                        props.onDeleteRole(selectedRole.id);
                        setSelectedRoleId(null);
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </section>
          );
        })()}
        {props.tab === "members" && (
          <section>
            {props.pendingMembers.length > 0 && (
              <div className="pending-section">
                <h2>Pending approval — {props.pendingMembers.length}</h2>
                <table className="members-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Signed up</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.pendingMembers.map((p) => (
                      <tr key={p.public_key}>
                        <td>
                          <div className="member-name">
                            {p.display_name || "(no name)"}
                          </div>
                          <div className="member-pk" title={p.public_key}>
                            {formatPubkey(p.public_key)}
                          </div>
                        </td>
                        <td>{formatRelative(p.first_seen_at)}</td>
                        <td>
                          <button
                            className="btn-small"
                            onClick={() => props.onApproveMember(p.public_key)}
                          >
                            Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h1>Members — {props.members.length}</h1>
            <table className="members-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {props.members.map((m) => (
                  <MemberRow
                    key={m.public_key}
                    member={m}
                    allRoles={props.roles}
                    voiceMuted={props.voiceMutedKeys.has(m.public_key)}
                    onKick={() => props.onKickMember(m.public_key)}
                    onBan={() => props.onBanMember(m.public_key)}
                    onMute={() => props.onMuteMember(m.public_key)}
                    onTimeout={() => props.onTimeoutMember(m.public_key)}
                    onVoiceMute={() => props.onVoiceMuteMember(m.public_key)}
                    onVoiceUnmute={() => props.onVoiceUnmuteMember(m.public_key)}
                    onToggleRole={(roleId, has) =>
                      props.onToggleRoleAssignment(m.public_key, roleId, has)
                    }
                  />
                ))}
              </tbody>
            </table>
            {props.members.length === 0 && (
              <p className="muted">No members yet.</p>
            )}
          </section>
        )}
        {props.tab === "bans" && (
          <section>
            <h1>Bans — {props.bans.length}</h1>
            {props.bans.length === 0 ? (
              <p className="muted">No active bans.</p>
            ) : (
              <table className="members-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Reason</th>
                    <th>Banned by</th>
                    <th>When</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {props.bans.map((b) => (
                    <tr key={b.target_public_key}>
                      <td>
                        <div className="member-pk" title={b.target_public_key}>
                          {formatPubkey(b.target_public_key)}
                        </div>
                      </td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
                      <td>
                        <span className="member-pk" title={b.banned_by}>
                          {formatPubkey(b.banned_by)}
                        </span>
                      </td>
                      <td>{formatRelative(b.created_at)}</td>
                      <td>
                        <button
                          className="btn-small"
                          onClick={() => props.onUnban(b.target_public_key)}
                        >
                          Unban
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
        {props.tab === "invites" && (
          <InvitesSection
            invites={props.invites}
            hubUrl={props.activeHubUrl}
            onCreate={props.onCreateInvite}
            onRevoke={props.onRevokeInvite}
          />
        )}
        {props.tab === "alliances" && (
          <AlliancesSection
            channels={props.channels}
            ownHubUrl={props.activeHubUrl}
          />
        )}
        {props.tab === "alliance-invites" && (
          <AllianceInvitesSection ownHubUrl={props.activeHubUrl} />
        )}
        {props.tab === "icons" && (
          <section>
            <h1>Icon Library</h1>
            <p className="muted">
              Upload custom SVG icons that any member can apply to channels and
              categories from the appearance editor.
            </p>
            <HubIconsSection />
          </section>
        )}
        {props.tab === "bots" && (
          <BotAdminSection
            hubUrl={props.activeHubUrl}
            myPubkey={props.myPubkey}
          />
        )}
        {props.tab === "survey" && (
          <SurveyAdminSection hubUrl={props.activeHubUrl} />
        )}
        {props.tab === "lobby" && (
          <LobbySettingsSection hubUrl={props.activeHubUrl} />
        )}
        {props.tab === "challenge" && (
          <ChallengeSettingsSection hubUrl={props.activeHubUrl} />
        )}
        {props.tab === "tags" && (
          <ServerTagsSection hubUrl={props.activeHubUrl} isAdmin={true} />
        )}
        {props.tab === "certifications" && (
          <CertificationsSection
            hubUrl={props.activeHubUrl}
            isAdmin={true}
            publicKey={props.myPubkey}
          />
        )}
        {props.tab === "recovery" && (
          <RecoveryContactsSection
            hubUrl={props.activeHubUrl}
            publicKey={props.myPubkey}
            isAdmin={true}
          />
        )}
      </main>
    </div>
  );
}
