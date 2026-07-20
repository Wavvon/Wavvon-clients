import { useState, type ReactNode } from "react";
import { formatPubkey, formatRelative, type Channel } from "@wavvon/core";
import type { BanInfo, InviteInfo, MemberAdminInfo, PendingUser, RoleInfo } from "../../types";
import { ImagePicker } from "../ImagePicker";
import { AlliancesSection, type AlliancesSectionActions } from "./AlliancesSection";
import { ExternalBotSection, type ExternalBotSectionActions } from "./ExternalBotSection";
import { WebhooksSection, type WebhooksSectionActions } from "./WebhooksSection";
import { HubIconsSection, type HubIconsSectionActions } from "./HubIconsSection";
import { SurveyAdminSection, type SurveyAdminSectionActions } from "./SurveyAdminSection";
import { RolesSection, type RolesSectionActions } from "./RolesSection";
import { MemberRoleManager, type MemberRoleManagerActions } from "./MemberRoleManager";
import { ServerTagsSection, type ServerTagsSectionActions } from "./ServerTagsSection";
import { InviteManager, type InviteManagerActions } from "./InviteManager";
import { NativeBotsSection, type NativeBotsSectionActions } from "./NativeBotsSection";
import { AuditLogSection, type AuditLogSectionActions } from "./AuditLogSection";
import { CertificationsSection, type CertificationsSectionActions } from "./CertificationsSection";
import { SoundboardAdminSection, type SoundboardAdminSectionActions } from "./SoundboardAdminSection";
import { OnboardingAdminSection, type OnboardingAdminSectionActions } from "./OnboardingAdminSection";

export type HubAdminTab =
  | "overview"
  | "discovery"
  | "tags"
  | "roles"
  | "members"
  | "bans"
  | "invites"
  | "integrations"
  | "external-bots"
  | "certifications"
  | "recovery"
  | "moderation"
  | "soundboard"
  | "native-bots"
  | "alliances"
  | "hub-icons"
  | "onboarding"
  | "survey"
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
  welcomeLabel: string;
  onWelcomeLabelChange: (v: string) => void;
  welcomeInviteUrl: string;
  onWelcomeInviteUrlChange: (v: string) => void;
  saveError: string | null;
  onSave: () => void;

  /** Whether this hub is currently listed in `/federation/listing`. */
  hubListed: boolean;
  onHubListedChange: (listed: boolean) => void;
  submitToDirectory: (
    directoryUrl: string,
    tags: string[],
    language: string,
    bio: string,
    inviteCode: string | null,
  ) => Promise<void>;

  pendingMembers: PendingUser[];
  onApproveMember: (publicKey: string) => void;
  members: MemberAdminInfo[];
  onKickMember: (publicKey: string) => void;
  onBanMember: (publicKey: string) => void;
  onMuteMember: (publicKey: string) => void;
  onTimeoutMember: (publicKey: string) => void;
  onVoiceMuteMember: (publicKey: string) => void;
  onVoiceUnmuteMember: (publicKey: string) => void;
  voiceMutedKeys: Set<string>;
  /** Whether the viewer can assign/remove roles (admin or manage_roles). Gates the inline role manager. */
  canManageRoles: boolean;
  /** Highest priority among the viewer's own roles; only lower-priority roles are assignable (matches the hub guard). */
  myMaxPriority: number;
  onMemberRolesChanged: (publicKey: string, roles: RoleInfo[]) => void;

  bans: BanInfo[];
  onUnban: (publicKey: string) => void;

  invites: InviteInfo[];
  activeHubUrl: string;
  /** This hub's stable serial (its public key) — embedded in invite links so a
   *  farm can route the same domain to different hubs. */
  hubSerial: string;
  onCreateInvite: (maxUses: number | null, expiresInSeconds: number | null, grantRoleId: string | null) => void;
  onRevokeInvite: (code: string) => void;

  myPubkey: string;
  isAdmin: boolean;
  canManageSoundboard: boolean;
  channels: Channel[];

  rolesActions: RolesSectionActions;
  memberRoleActions: MemberRoleManagerActions;
  serverTagsActions: ServerTagsSectionActions;
  inviteActions: InviteManagerActions;
  webhookActions: WebhooksSectionActions;
  externalBotActions: ExternalBotSectionActions;
  renderBotCapabilities?: (pubkey: string) => ReactNode;
  nativeBotActions: NativeBotsSectionActions;
  auditLogActions: AuditLogSectionActions;
  certActions: CertificationsSectionActions;
  /** Soundboard hub routes (upload/list/delete/fetch-audio) — omitted where
   *  the platform has no Tauri commands for them yet; the tab disappears. */
  soundboardActions?: SoundboardAdminSectionActions;
  onboardingActions: OnboardingAdminSectionActions;
  allianceActions: AlliancesSectionActions;
  hubIconActions: HubIconsSectionActions;
  surveyActions: SurveyAdminSectionActions;

  /** These three subtrees stay platform-local render props rather than
   *  hoisted components: they have no counterpart to converge with on the
   *  other platform (moderation suite / outgoing webhooks / recovery
   *  contacts are web-only today — see docs/docs/client-parity.md). */
  renderModerationTab?: () => ReactNode;
  renderOutgoingWebhooks?: () => ReactNode;
  renderRecoveryContacts?: () => ReactNode;
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

export function HubAdminPage(props: HubAdminPageProps) {
  const [copiedShare, setCopiedShare] = useState(false);
  const [dirTags, setDirTags] = useState("");
  const [dirLanguage, setDirLanguage] = useState("en");
  const [dirBio, setDirBio] = useState("");
  const [dirInviteCode, setDirInviteCode] = useState("");
  const [dirUrl, setDirUrl] = useState("https://discovery.wavvon.io");
  const [dirStatus, setDirStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [dirError, setDirError] = useState("");
  const [listingBusy, setListingBusy] = useState(false);

  async function handleSubmitToDirectory() {
    setDirStatus("submitting");
    setDirError("");
    try {
      await props.submitToDirectory(
        dirUrl,
        dirTags.split(",").map((s) => s.trim()).filter(Boolean),
        dirLanguage.trim() || "en",
        dirBio,
        dirInviteCode.trim() || null,
      );
      setDirStatus("ok");
    } catch (e) {
      setDirError(String(e));
      setDirStatus("error");
    }
  }

  async function handleListingToggle(next: boolean) {
    setListingBusy(true);
    try {
      await props.onHubListedChange(next);
    } finally {
      setListingBusy(false);
    }
  }

  // Grouped into contiguous sections so the long admin nav reads clearly.
  const G_GENERAL = "General";
  const G_MEMBERS = "Members & safety";
  const G_FEDERATION = "Federation";
  const G_INTEGRATIONS = "Integrations & bots";
  const G_CUSTOM = "Customization";
  const G_ADVANCED = "Advanced";
  const admin = props.isAdmin;
  const TABS: { id: HubAdminTab; label: string; group: string }[] = [
    { id: "overview", label: "Overview", group: G_GENERAL },
    { id: "discovery", label: "Discovery", group: G_GENERAL },
    { id: "tags", label: "Tags", group: G_GENERAL },
    { id: "roles", label: "Roles", group: G_MEMBERS },
    { id: "members", label: "Members", group: G_MEMBERS },
    { id: "bans", label: "Bans", group: G_MEMBERS },
    { id: "invites", label: "Invites", group: G_MEMBERS },
    ...(admin && props.renderModerationTab ? [{ id: "moderation" as HubAdminTab, label: "Moderation", group: G_MEMBERS }] : []),
    ...(admin ? [
      { id: "onboarding" as HubAdminTab, label: "Onboarding", group: G_MEMBERS },
      { id: "survey" as HubAdminTab, label: "Survey", group: G_MEMBERS },
    ] : []),
    { id: "certifications", label: "Certifications", group: G_MEMBERS },
    ...(props.renderRecoveryContacts ? [{ id: "recovery" as HubAdminTab, label: "Recovery contacts", group: G_MEMBERS }] : []),
    // Alliances is cross-hub channel sharing, not a bot/webhook integration —
    // grouped with other cross-hub features instead. The federated ban list
    // lives inside the Moderation tab, not its own nav entry, so it doesn't
    // move here.
    ...(admin ? [{ id: "alliances" as HubAdminTab, label: "Alliances", group: G_FEDERATION }] : []),
    { id: "integrations", label: "Webhooks", group: G_INTEGRATIONS },
    { id: "external-bots", label: "External bots", group: G_INTEGRATIONS },
    ...(admin ? [{ id: "native-bots" as HubAdminTab, label: "Native bots", group: G_INTEGRATIONS }] : []),
    ...(admin ? [{ id: "hub-icons" as HubAdminTab, label: "Icons", group: G_CUSTOM }] : []),
    ...(props.canManageSoundboard && props.soundboardActions ? [{ id: "soundboard" as HubAdminTab, label: "Soundboard", group: G_CUSTOM }] : []),
    ...(admin ? [{ id: "audit-log" as HubAdminTab, label: "Audit log", group: G_ADVANCED }] : []),
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>Hub admin</h2>
        <ul>
          {TABS.map((tab, i) => (
            <li key={tab.id}>
              {(i === 0 || TABS[i - 1].group !== tab.group) && (
                <div className="settings-nav-group">{tab.group}</div>
              )}
              <button
                className={`settings-nav-item ${props.tab === tab.id ? "active" : ""}`}
                onClick={() => props.onTab(tab.id)}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close" onClick={props.onClose}>Close</button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title="Close">×</button>

        {props.tab === "overview" && (
          <section>
            <h1>Overview</h1>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-name">Hub name</label>
              <input id="admin-hub-name" type="text" value={props.hubName} onChange={(e) => props.onHubNameChange(e.target.value)} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-desc">Description</label>
              <textarea id="admin-hub-desc" rows={3} value={props.hubDescription} onChange={(e) => props.onHubDescriptionChange(e.target.value)} />
            </div>
            <div className="settings-section">
              <label className="settings-label">Hub icon</label>
              <div className="hub-icon-editor">
                {props.hubIcon ? (
                  <img src={props.hubIcon} alt="Hub icon" className="hub-icon-preview" />
                ) : (
                  <div className="hub-icon-preview placeholder">No icon</div>
                )}
                <ImagePicker
                  onPick={props.onHubIconChange}
                  onClear={() => props.onHubIconChange("")}
                  hasValue={!!props.hubIcon}
                  buttonLabel="Choose icon"
                />
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Membership</label>
              <label className="checkbox-label">
                <input type="checkbox" checked={props.requireApproval} onChange={(e) => props.onRequireApprovalChange(e.target.checked)} />
                Require admin approval for new members
              </label>
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-antispam">Minimum proof-of-work level</label>
              <input id="admin-antispam" type="number" min={0} max={9999} value={props.minSecurityLevel} onChange={(e) => props.onMinSecurityLevelChange(Number(e.target.value))} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-max-depth">Max channel nesting depth</label>
              <p className="muted">How many levels deep channel categories can nest.</p>
              <input id="admin-max-depth" type="number" min={0} max={20} value={props.maxChannelDepth} onChange={(e) => props.onMaxChannelDepthChange(Number(e.target.value))} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-welcome-label">Welcome message label (optional)</label>
              <input
                id="admin-welcome-label"
                type="text"
                maxLength={100}
                value={props.welcomeLabel}
                placeholder="e.g. Join our Discord too!"
                onChange={(e) => props.onWelcomeLabelChange(e.target.value)}
              />
              <label className="settings-label" htmlFor="admin-welcome-invite" style={{ marginTop: "var(--space-2)" }}>Welcome invite URL</label>
              <input
                id="admin-welcome-invite"
                type="text"
                value={props.welcomeInviteUrl}
                placeholder="https:// or wavvon://"
                onChange={(e) => props.onWelcomeInviteUrlChange(e.target.value)}
              />
              {(props.welcomeLabel.trim() || props.welcomeInviteUrl.trim()) && (
                <p className="muted">Shown to new members as: "{props.welcomeLabel.trim() || "(label)"}" → {props.welcomeInviteUrl.trim() || "(invite)"}</p>
              )}
            </div>
            {props.saveError && <p className="error-text">{props.saveError}</p>}
            <div className="settings-section">
              <button onClick={props.onSave}>Save</button>
            </div>
          </section>
        )}

        {props.tab === "discovery" && (
          <section>
            <h1>Discovery</h1>
            <div className="settings-section">
              <label className="settings-label">Public listing</label>
              <div className="settings-row">
                <label>List this hub publicly</label>
                <input
                  type="checkbox"
                  checked={props.hubListed}
                  disabled={listingBusy}
                  onChange={(e) => handleListingToggle(e.target.checked)}
                />
              </div>
              <p className="muted">When enabled, anyone can discover this hub via its /federation/listing endpoint.</p>
            </div>
            <div className="settings-section">
              <label className="settings-label">Share link</label>
              <div className="settings-row">
                <code className="pubkey-display">{hubToWavvonUrl(props.activeHubUrl)}</code>
                <button onClick={() => { navigator.clipboard.writeText(hubToWavvonUrl(props.activeHubUrl)).catch(() => {}); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000); }}>
                  {copiedShare ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Hub directory</label>
              <p className="muted">Submit to {dirUrl}</p>
              <div className="settings-section">
                <label className="settings-label">Tags</label>
                <input type="text" placeholder="gaming, english, casual" value={dirTags} onChange={(e) => setDirTags(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Language</label>
                <input type="text" placeholder="en" value={dirLanguage} onChange={(e) => setDirLanguage(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Bio</label>
                <textarea rows={3} placeholder="Describe this hub" value={dirBio} onChange={(e) => setDirBio(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Invite code (optional)</label>
                <input type="text" placeholder="abc123" value={dirInviteCode} onChange={(e) => setDirInviteCode(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Directory URL</label>
                <input type="text" value={dirUrl} onChange={(e) => setDirUrl(e.target.value)} />
              </div>
              {dirStatus === "ok" && <p className="muted" style={{ color: "var(--success)" }}>Submitted.</p>}
              {dirStatus === "error" && <p className="error-text">{dirError}</p>}
              <button onClick={handleSubmitToDirectory} disabled={dirStatus === "submitting"}>
                {dirStatus === "submitting" ? "Submitting…" : "Submit"}
              </button>
            </div>
          </section>
        )}

        {props.tab === "tags" && (
          <ServerTagsSection actions={props.serverTagsActions} />
        )}

        {props.tab === "members" && (
          <section>
            {props.pendingMembers.length > 0 && (
              <div className="pending-section">
                <h2>Pending approval ({props.pendingMembers.length})</h2>
                <table className="members-table">
                  <thead><tr>
                    <th>User</th>
                    <th>Signed up</th>
                    <th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {props.pendingMembers.map((p) => (
                      <tr key={p.public_key}>
                        <td>
                          <div>{p.display_name || "(no name)"}</div>
                          <div className="member-pk" title={p.public_key}>{formatPubkey(p.public_key)}</div>
                        </td>
                        <td>{formatRelative(p.first_seen_at)}</td>
                        <td>
                          <button className="btn-small" onClick={() => props.onApproveMember(p.public_key)}>Approve</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h1>Members ({props.members.length})</h1>
            <table className="members-table">
              <thead><tr>
                <th>Name</th>
                <th>Roles</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>
                {props.members.map((m) => (
                  <tr key={m.public_key}>
                    <td>
                      <div>{m.display_name || "(no name)"}</div>
                      <div className="member-pk" title={m.public_key}>{formatPubkey(m.public_key)}</div>
                    </td>
                    <td>
                      {props.canManageRoles ? (
                        <MemberRoleManager
                          pubkey={m.public_key}
                          currentRoles={m.roles}
                          myMaxPriority={props.myMaxPriority}
                          onChanged={(roles) => props.onMemberRolesChanged(m.public_key, roles)}
                          actions={props.memberRoleActions}
                        />
                      ) : (
                        m.roles.map((r) => r.name).join(", ") || "—"
                      )}
                    </td>
                    <td>{formatRelative(m.first_seen_at)}</td>
                    <td style={{ display: "flex", gap: "var(--space-1)", flexWrap: "wrap" }}>
                      <button className="btn-small" onClick={() => props.onKickMember(m.public_key)}>Kick</button>
                      <button className="btn-small danger" onClick={() => props.onBanMember(m.public_key)}>Ban</button>
                      <button className="btn-small btn-secondary" onClick={() => props.onMuteMember(m.public_key)}>Mute</button>
                      <button className="btn-small btn-secondary" onClick={() => props.onTimeoutMember(m.public_key)}>Timeout</button>
                      {props.voiceMutedKeys.has(m.public_key) ? (
                        <button className="btn-small btn-secondary" onClick={() => props.onVoiceUnmuteMember(m.public_key)}>Unmute voice</button>
                      ) : (
                        <button className="btn-small btn-secondary" onClick={() => props.onVoiceMuteMember(m.public_key)}>Mute voice</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {props.members.length === 0 && <p className="muted">No members yet.</p>}
          </section>
        )}

        {props.tab === "bans" && (
          <section>
            <h1>Bans ({props.bans.length})</h1>
            {props.bans.length === 0 && <p className="muted">No bans yet.</p>}
            {props.bans.length > 0 && (
              <table className="members-table">
                <thead><tr>
                  <th>User</th>
                  <th>Reason</th>
                  <th>Banned by</th>
                  <th>When</th>
                  <th>Actions</th>
                </tr></thead>
                <tbody>
                  {props.bans.map((b) => (
                    <tr key={b.target_public_key}>
                      <td><span className="member-pk">{formatPubkey(b.target_public_key)}</span></td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
                      <td><span className="member-pk" title={b.banned_by}>{formatPubkey(b.banned_by)}</span></td>
                      <td>{formatRelative(b.created_at)}</td>
                      <td><button className="btn-small" onClick={() => props.onUnban(b.target_public_key)}>Unban</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {props.tab === "invites" && (
          <InviteManager
            invites={props.invites}
            activeHubUrl={props.activeHubUrl}
            hubSerial={props.hubSerial}
            myMaxPriority={props.myMaxPriority}
            isAdmin={props.isAdmin}
            onCreateInvite={props.onCreateInvite}
            onRevokeInvite={props.onRevokeInvite}
            actions={props.inviteActions}
          />
        )}

        {props.tab === "roles" && <RolesSection actions={props.rolesActions} />}

        {props.tab === "integrations" && (
          <>
            <WebhooksSection channels={props.channels} actions={props.webhookActions} />
            {props.renderOutgoingWebhooks?.()}
          </>
        )}

        {props.tab === "external-bots" && (
          <ExternalBotSection
            channels={props.channels}
            actions={props.externalBotActions}
            renderCapabilities={props.renderBotCapabilities}
          />
        )}

        {props.tab === "certifications" && (
          <CertificationsSection actions={props.certActions} />
        )}

        {props.tab === "recovery" && props.renderRecoveryContacts?.()}

        {props.tab === "soundboard" && props.canManageSoundboard && props.soundboardActions && (
          <SoundboardAdminSection actions={props.soundboardActions} />
        )}

        {props.tab === "moderation" && props.isAdmin && props.renderModerationTab?.()}

        {props.tab === "native-bots" && props.isAdmin && (
          <NativeBotsSection actions={props.nativeBotActions} />
        )}
        {props.tab === "alliances" && props.isAdmin && (
          <AlliancesSection
            activeHubUrl={props.activeHubUrl}
            channels={props.channels}
            actions={props.allianceActions}
          />
        )}
        {props.tab === "hub-icons" && props.isAdmin && (
          <HubIconsSection actions={props.hubIconActions} />
        )}
        {props.tab === "onboarding" && props.isAdmin && (
          <OnboardingAdminSection actions={props.onboardingActions} />
        )}
        {props.tab === "survey" && props.isAdmin && (
          <SurveyAdminSection actions={props.surveyActions} />
        )}
        {props.tab === "audit-log" && props.isAdmin && (
          <AuditLogSection actions={props.auditLogActions} />
        )}
      </main>
    </div>
  );
}
