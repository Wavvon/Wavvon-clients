import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type {
  BanInfo,
  Channel,
  InviteInfo,
  MemberAdminInfo,
  PendingUser,
  RoleInfo,
} from "../types";
import { formatPubkey, formatRelative } from "@voxply/core";
import { ImagePicker } from "./ImagePicker";
import { InvitesSection } from "./InvitesSection";
import { MemberRow } from "./MemberRow";
import { RoleCreator } from "./RoleCreator";
import { RoleEditor } from "./RoleEditor";
import { AlliancesSection } from "./AlliancesSection";
import { AllianceInvitesSection } from "./AllianceInvitesSection";
import { HubIconsSection } from "./HubIconsSection";
import { BotAdminSection } from "./BotAdminSection";
import { ExternalBotSection } from "./ExternalBotSection";
import { WebhooksSection } from "./WebhooksSection";
import { SurveyAdminSection } from "./SurveyAdminSection";
import { LobbySettingsSection } from "./LobbySettingsSection";
import { ChallengeSettingsSection } from "./ChallengeSettingsSection";
import { HubTagsSection } from "./HubTagsSection";
import { HubBadgesSection } from "./HubBadgesSection";
import { HubCertificationsAdminSection } from "./HubCertificationsAdminSection";
import { HubAuditLogSection } from "./HubAuditLogSection";

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
  | "integrations"
  | "tags"
  | "badges"
  | "certifications"
  | "audit-log";

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

function hubToVoxplyUrl(hubUrl: string): string {
  try {
    const u = new URL(hubUrl);
    const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    return `voxply://${hostPort}`;
  } catch {
    return `voxply://${hubUrl}`;
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
  const { t } = useTranslation();
  const [copiedShare, setCopiedShare] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreatingRole, setIsCreatingRole] = useState(false);

  const [dirTags, setDirTags] = useState("");
  const [dirLanguage, setDirLanguage] = useState("en");
  const [dirBio, setDirBio] = useState("");
  const [dirInviteCode, setDirInviteCode] = useState("");
  const [dirUrl, setDirUrl] = useState("https://discovery.voxply.io");
  const [dirStatus, setDirStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [dirError, setDirError] = useState("");
  const [listed, setListed] = useState(false);
  const [listingLoading, setListingLoading] = useState(false);

  useEffect(() => {
    if (props.tab !== "discovery") return;
    fetch(props.activeHubUrl + "/federation/listing")
      .then((r) => r.json())
      .then((data: { listed?: boolean }) => {
        if (typeof data.listed === "boolean") setListed(data.listed);
      })
      .catch(() => {});
  }, [props.tab, props.activeHubUrl]);

  async function handleListingToggle(next: boolean) {
    setListingLoading(true);
    try {
      await invoke("set_hub_listed", { hubUrl: props.activeHubUrl, listed: next });
      setListed(next);
    } catch {
      // leave state unchanged on error
    } finally {
      setListingLoading(false);
    }
  }

  async function handleSubmitToDirectory() {
    setDirStatus("submitting");
    setDirError("");
    try {
      await invoke("submit_to_directory", {
        directoryUrl: dirUrl,
        tags: dirTags.split(",").map((tag) => tag.trim()).filter(Boolean),
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
    { id: "overview", label: t("hub.admin.tabs.overview") },
    { id: "discovery", label: t("hub.admin.tabs.discovery") },
    { id: "roles", label: t("hub.admin.tabs.roles") },
    { id: "members", label: t("hub.admin.tabs.members") },
    { id: "bans", label: t("hub.admin.tabs.bans") },
    { id: "invites", label: t("hub.admin.tabs.invites") },
    { id: "alliances", label: t("hub.admin.tabs.alliances") },
    { id: "alliance-invites", label: t("hub.admin.tabs.alliance_invites") },
    { id: "icons", label: t("hub.admin.tabs.icons") },
    { id: "bots", label: t("hub.admin.tabs.bots") },
    { id: "integrations", label: t("hub.admin.tabs.integrations") },
    { id: "survey", label: t("hub.admin.tabs.survey") },
    { id: "lobby", label: t("hub.admin.tabs.lobby") },
    { id: "challenge", label: t("hub.admin.tabs.challenge") },
    { id: "tags", label: "Tags" },
    { id: "badges", label: "Badges" },
    { id: "certifications", label: "Certifications" },
    { id: "audit-log", label: "Audit Log" },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>{t("hub.admin.title")}</h2>
        <ul>
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                className={`settings-nav-item ${props.tab === tab.id ? "active" : ""}`}
                onClick={() => props.onTab(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={props.onClose}>
          {t("settings.close")}
        </button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title={t("modal.close")}>
          ×
        </button>
        {props.tab === "overview" && (
          <section>
            <h1>{t("hub.admin.overview.title")}</h1>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-name">{t("hub.admin.overview.name")}</label>
              <input
                id="admin-hub-name"
                type="text"
                value={props.hubName}
                onChange={(e) => props.onHubNameChange(e.target.value)}
                placeholder={t("hub.admin.overview.name_placeholder")}
              />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-desc">{t("hub.admin.overview.description")}</label>
              <p className="muted">{t("hub.admin.overview.description_hint")}</p>
              <textarea
                id="admin-hub-desc"
                rows={3}
                value={props.hubDescription}
                onChange={(e) => props.onHubDescriptionChange(e.target.value)}
                placeholder={t("hub.admin.overview.description_placeholder")}
              />
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.overview.icon")}</label>
              <p className="muted">
                {t("hub.admin.overview.icon_hint")}
              </p>
              <div className="hub-icon-editor">
                {props.hubIcon ? (
                  <img
                    src={props.hubIcon}
                    alt={t("hub.admin.overview.icon")}
                    className="hub-icon-preview"
                  />
                ) : (
                  <div className="hub-icon-preview placeholder">{t("hub.admin.overview.icon_none")}</div>
                )}
                <ImagePicker
                  onPick={props.onHubIconChange}
                  onClear={() => props.onHubIconChange("")}
                  hasValue={!!props.hubIcon}
                  buttonLabel={t("hub.admin.overview.icon_pick")}
                />
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.overview.membership")}</label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={props.requireApproval}
                  onChange={(e) =>
                    props.onRequireApprovalChange(e.target.checked)
                  }
                />
                {t("hub.admin.overview.require_approval")}
              </label>
              <p className="muted">
                {t("hub.admin.overview.require_approval_hint")}
              </p>
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-antispam">{t("hub.admin.overview.antispam")}</label>
              <p className="muted">
                {t("hub.admin.overview.antispam_hint")}
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
              <label className="settings-label" htmlFor="admin-max-depth">{t("hub.admin.overview.max_depth")}</label>
              <p className="muted">
                {t("hub.admin.overview.max_depth_hint")}
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
              <button onClick={props.onSave}>{t("hub.admin.overview.save")}</button>
            </div>
          </section>
        )}
        {props.tab === "discovery" && (
          <section>
            <h1>{t("hub.admin.discovery.title")}</h1>
            <div className="settings-section">
              <label className="settings-label">Public listing</label>
              <div className="settings-row">
                <label>List this hub publicly</label>
                <input
                  type="checkbox"
                  checked={listed}
                  disabled={listingLoading}
                  onChange={(e) => handleListingToggle(e.target.checked)}
                />
              </div>
              <p className="muted">
                When enabled, anyone can discover this hub via its /federation/listing endpoint.
              </p>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.discovery.share.label")}</label>
              <p className="muted">
                {t("hub.admin.discovery.directory.hint")}
              </p>
              <div className="settings-row">
                <code className="pubkey-display">
                  {hubToVoxplyUrl(props.activeHubUrl)}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(hubToVoxplyUrl(props.activeHubUrl));
                    setCopiedShare(true);
                    setTimeout(() => setCopiedShare(false), 2000);
                  }}
                >
                  {copiedShare ? t("hub.admin.discovery.share.copied") : t("hub.admin.discovery.share.copy")}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.discovery.directory.label")}</label>
              <p className="muted">
                {t("hub.admin.discovery.directory.hint")}
              </p>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-tags">{t("hub.admin.discovery.directory.tags")}</label>
                <input
                  id="admin-dir-tags"
                  type="text"
                  placeholder={t("hub.admin.discovery.directory.tags_placeholder")}
                  value={dirTags}
                  onChange={(e) => setDirTags(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-lang">{t("hub.admin.discovery.directory.language")}</label>
                <input
                  id="admin-dir-lang"
                  type="text"
                  placeholder="en"
                  value={dirLanguage}
                  onChange={(e) => setDirLanguage(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-bio">{t("hub.admin.discovery.directory.bio")}</label>
                <textarea
                  id="admin-dir-bio"
                  rows={3}
                  placeholder={t("hub.admin.discovery.directory.bio_placeholder")}
                  value={dirBio}
                  onChange={(e) => setDirBio(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-invite">{t("hub.admin.discovery.directory.invite_code")}</label>
                <input
                  id="admin-dir-invite"
                  type="text"
                  placeholder={t("hub.admin.discovery.directory.invite_code_placeholder")}
                  value={dirInviteCode}
                  onChange={(e) => setDirInviteCode(e.target.value)}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label" htmlFor="admin-dir-url">{t("hub.admin.discovery.directory.url")}</label>
                <input
                  id="admin-dir-url"
                  type="text"
                  value={dirUrl}
                  onChange={(e) => setDirUrl(e.target.value)}
                />
              </div>
              {dirStatus === "ok" && (
                <p className="muted" style={{ color: "var(--success)" }}>
                  {t("hub.admin.discovery.directory.ok")}
                </p>
              )}
              {dirStatus === "error" && (
                <p className="error-text">{dirError}</p>
              )}
              <button
                onClick={handleSubmitToDirectory}
                disabled={dirStatus === "submitting"}
              >
                {dirStatus === "submitting" ? t("hub.admin.discovery.directory.submitting") : t("hub.admin.discovery.directory.submit")}
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
              <h1>{t("hub.admin.roles.title")}</h1>
              <p className="muted">
                {t("hub.admin.roles.hint")}
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
                    title={t("hub.admin.roles.create")}
                  >
                    <span className="role-list-dot" style={{ background: "var(--border)", fontSize: 14, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>+</span>
                    <span className="role-list-name">{t("hub.admin.roles.new")}</span>
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
                <h2>{t("hub.admin.members.pending.title", { count: props.pendingMembers.length })}</h2>
                <table className="members-table">
                  <thead>
                    <tr>
                      <th>{t("hub.admin.members.pending.col.user")}</th>
                      <th>{t("hub.admin.members.pending.col.signed_up")}</th>
                      <th>{t("hub.admin.members.pending.col.actions")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.pendingMembers.map((p) => (
                      <tr key={p.public_key}>
                        <td>
                          <div className="member-name">
                            {p.display_name || t("hub.admin.members.pending.no_name")}
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
                            {t("hub.admin.members.pending.approve")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h1>{t("hub.admin.members.title", { count: props.members.length })}</h1>
            <table className="members-table">
              <thead>
                <tr>
                  <th>{t("hub.admin.members.col.name")}</th>
                  <th>{t("hub.admin.members.col.roles")}</th>
                  <th>{t("hub.admin.members.col.joined")}</th>
                  <th>{t("hub.admin.members.col.actions")}</th>
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
              <p className="muted">{t("hub.admin.members.empty")}</p>
            )}
          </section>
        )}
        {props.tab === "bans" && (
          <section>
            <h1>{t("hub.admin.bans.title", { count: props.bans.length })}</h1>
            {props.bans.length === 0 ? (
              <p className="muted">{t("hub.admin.bans.empty")}</p>
            ) : (
              <table className="members-table">
                <thead>
                  <tr>
                    <th>{t("hub.admin.bans.col.user")}</th>
                    <th>{t("hub.admin.bans.col.reason")}</th>
                    <th>{t("hub.admin.bans.col.banned_by")}</th>
                    <th>{t("hub.admin.bans.col.when")}</th>
                    <th>{t("hub.admin.bans.col.actions")}</th>
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
                          {t("hub.admin.bans.unban")}
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
            <h1>{t("hub.admin.icons.title")}</h1>
            <p className="muted">
              {t("hub.admin.icons.hint")}
            </p>
            <HubIconsSection />
          </section>
        )}
        {props.tab === "bots" && (
          <>
            <BotAdminSection
              hubUrl={props.activeHubUrl}
              myPubkey={props.myPubkey}
            />
            <ExternalBotSection
              hubUrl={props.activeHubUrl}
              channels={props.channels}
            />
          </>
        )}
        {props.tab === "integrations" && (
          <WebhooksSection
            hubUrl={props.activeHubUrl}
            channels={props.channels}
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
          <section>
            <h1>Tags</h1>
            <HubTagsSection />
          </section>
        )}
        {props.tab === "badges" && (
          <section>
            <h1>Badges</h1>
            <HubBadgesSection />
          </section>
        )}
        {props.tab === "certifications" && (
          <section>
            <h1>Certifications</h1>
            <HubCertificationsAdminSection hubUrl={props.activeHubUrl} />
          </section>
        )}
        {props.tab === "audit-log" && (
          <section>
            <h1>Audit Log</h1>
            <HubAuditLogSection hubUrl={props.activeHubUrl} />
          </section>
        )}
      </main>
    </div>
  );
}
