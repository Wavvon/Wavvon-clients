import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative, type Channel } from "@wavvon/core";
import type { BanInfo, InviteInfo, MemberAdminInfo, NameColorMode, PendingUser, RoleInfo } from "../../types";
import { ImagePicker } from "../ImagePicker";
import { AlliancesSection, type AlliancesSectionActions } from "./AlliancesSection";
import { WebhooksSection, type WebhooksSectionActions } from "./WebhooksSection";
import { HubIconsSection, type HubIconsSectionActions } from "./HubIconsSection";
import { SurveyAdminSection, type SurveyAdminSectionActions } from "./SurveyAdminSection";
import { RolesSection, type RolesSectionActions } from "./RolesSection";
import { MemberRoleManager, type MemberRoleManagerActions } from "./MemberRoleManager";
import { ServerTagsSection, type ServerTagsSectionActions } from "./ServerTagsSection";
import { InviteManager, type InviteManagerActions } from "./InviteManager";
import { AuditLogSection, type AuditLogSectionActions } from "./AuditLogSection";
import { CertificationsSection, type CertificationsSectionActions } from "./CertificationsSection";
import { SoundboardAdminSection, type SoundboardAdminSectionActions } from "./SoundboardAdminSection";
import { OnboardingAdminSection, type OnboardingAdminSectionActions } from "./OnboardingAdminSection";
import { moveChannelOptions } from "../../utils/voiceMove";

export type HubAdminTab =
  | "overview"
  | "discovery"
  | "tags"
  | "roles"
  | "members"
  | "bans"
  | "invites"
  | "integrations"
  | "certifications"
  | "recovery"
  | "moderation"
  | "soundboard"
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
  /** Per-message attachment cap in bytes. The hub owns the bounds; this is
   *  edited in MB because nobody thinks in bytes. */
  maxAttachmentBytes: number;
  onMaxAttachmentBytesChange: (bytes: number) => void;
  onMaxChannelDepthChange: (v: number) => void;
  welcomeLabel: string;
  onWelcomeLabelChange: (v: string) => void;
  welcomeInviteUrl: string;
  onWelcomeInviteUrlChange: (v: string) => void;
  farewellLabel: string;
  onFarewellLabelChange: (v: string) => void;
  /** IANA name, or "" for unset — matches the empty-string-clears convention
   *  used across the rest of this page's PATCH-backed fields. */
  timezone: string;
  onTimezoneChange: (v: string) => void;
  birthdaysEnabled: boolean;
  onBirthdaysEnabledChange: (v: boolean) => void;
  /** How the hub resolves a member's rendered name color when both a role
   *  color and the member's own choice are set. Default "role_over_user". */
  nameColorMode: NameColorMode;
  onNameColorModeChange: (v: NameColorMode) => void;
  /** Channel idle voice participants are auto-moved into, or "" for unset
   *  (sweep disabled) — same empty-string-clears convention as `timezone`. */
  afkChannelId: string;
  onAfkChannelIdChange: (v: string) => void;
  /** Idle threshold in seconds before the hub moves someone to the AFK
   *  channel. Hub minimum is 60. */
  afkTimeoutSecs: number;
  onAfkTimeoutSecsChange: (v: number) => void;
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
   *  one host can route the same domain to different hubs. */
  onCreateInvite: (maxUses: number | null, expiresInSeconds: number | null, grantRoleId: string | null) => void;
  onRevokeInvite: (code: string) => void;

  myPubkey: string;
  isAdmin: boolean;
  /** Base URL of the hub directory, or absent when none is configured — the
   *  Discovery tab is then not offered at all. It used to seed its form with
   *  a hardcoded discovery.wavvon.io, a host that does not resolve. */
  discoveryUrl?: string;
  canManageSoundboard: boolean;
  channels: Channel[];

  rolesActions: RolesSectionActions;
  memberRoleActions: MemberRoleManagerActions;
  serverTagsActions: ServerTagsSectionActions;
  inviteActions: InviteManagerActions;
  webhookActions: WebhooksSectionActions;
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

// `Intl.supportedValuesOf` isn't in every configured lib target here yet
// (TS lib.esnext.intl); cast locally rather than widen the whole app's lib
// set for one feature-detected call.
const supportedTimeZones = (Intl as unknown as { supportedValuesOf?: (key: "timeZone") => string[] })
  .supportedValuesOf;

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
  const { t } = useTranslation();
  const [copiedShare, setCopiedShare] = useState(false);
  const [dirTags, setDirTags] = useState("");
  const [dirLanguage, setDirLanguage] = useState("en");
  const [dirBio, setDirBio] = useState("");
  const [dirInviteCode, setDirInviteCode] = useState("");
  const [dirUrl, setDirUrl] = useState(props.discoveryUrl ?? "");
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
  const G_GENERAL = t("hub.admin.group.general");
  const G_MEMBERS = t("hub.admin.group.members");
  const G_FEDERATION = t("hub.admin.group.federation");
  const G_INTEGRATIONS = t("hub.admin.group.integrations");
  const G_CUSTOM = t("hub.admin.group.customization");
  const G_ADVANCED = t("hub.admin.group.advanced");
  const admin = props.isAdmin;
  const TABS: { id: HubAdminTab; label: string; group: string }[] = [
    { id: "overview", label: t("hub.admin.tabs.overview"), group: G_GENERAL },
    ...(props.discoveryUrl ? [{ id: "discovery" as HubAdminTab, label: t("hub.admin.tabs.discovery"), group: G_GENERAL }] : []),
    { id: "tags", label: t("hub.admin.tabs.tags"), group: G_GENERAL },
    { id: "roles", label: t("hub.admin.tabs.roles"), group: G_MEMBERS },
    { id: "members", label: t("hub.admin.tabs.members"), group: G_MEMBERS },
    { id: "bans", label: t("hub.admin.tabs.bans"), group: G_MEMBERS },
    { id: "invites", label: t("hub.admin.tabs.invites"), group: G_MEMBERS },
    ...(admin && props.renderModerationTab ? [{ id: "moderation" as HubAdminTab, label: t("hub.admin.tabs.moderation"), group: G_MEMBERS }] : []),
    ...(admin ? [
      { id: "onboarding" as HubAdminTab, label: t("hub.admin.tabs.onboarding"), group: G_MEMBERS },
      { id: "survey" as HubAdminTab, label: t("hub.admin.tabs.survey"), group: G_MEMBERS },
    ] : []),
    { id: "certifications", label: t("hub.admin.tabs.certifications"), group: G_MEMBERS },
    ...(admin && props.renderRecoveryContacts ? [{ id: "recovery" as HubAdminTab, label: t("hub.admin.tabs.recovery"), group: G_MEMBERS }] : []),
    // Alliances is cross-hub channel sharing, not an app/webhook integration —
    // grouped with other cross-hub features instead. The federated ban list
    // lives inside the Moderation tab, not its own nav entry, so it doesn't
    // move here.
    ...(admin ? [{ id: "alliances" as HubAdminTab, label: t("hub.admin.tabs.alliances"), group: G_FEDERATION }] : []),
    { id: "integrations", label: t("hub.admin.tabs.webhooks"), group: G_INTEGRATIONS },
    ...(admin ? [{ id: "hub-icons" as HubAdminTab, label: t("hub.admin.tabs.icons"), group: G_CUSTOM }] : []),
    ...(props.canManageSoundboard && props.soundboardActions ? [{ id: "soundboard" as HubAdminTab, label: t("hub.admin.tabs.soundboard"), group: G_CUSTOM }] : []),
    ...(admin ? [{ id: "audit-log" as HubAdminTab, label: t("hub.admin.tabs.audit_log"), group: G_ADVANCED }] : []),
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>{t("hub.admin.nav.title")}</h2>
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
        <button className="settings-nav-close" onClick={props.onClose}>{t("modal.close")}</button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title={t("modal.close")}>×</button>

        {props.tab === "overview" && (
          <section>
            <h1>{t("hub.admin.overview.title")}</h1>
            <div className="settings-cards">
              <div className="settings-card">
                <h3>{t("hub.admin.overview.identity")}</h3>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-hub-name">{t("hub.admin.overview.name")}</label>
                  <input id="admin-hub-name" type="text" value={props.hubName} onChange={(e) => props.onHubNameChange(e.target.value)} />
                </div>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-hub-desc">{t("hub.admin.overview.description")}</label>
                  <textarea id="admin-hub-desc" rows={2} value={props.hubDescription} onChange={(e) => props.onHubDescriptionChange(e.target.value)} />
                </div>
                <div className="settings-section">
                  <label className="settings-label">{t("hub.admin.overview.icon")}</label>
                  <div className="hub-icon-editor">
                    {props.hubIcon ? (
                      <img src={props.hubIcon} alt={t("hub.admin.overview.icon")} className="hub-icon-preview" />
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
              </div>

              <div className="settings-card">
                <h3>{t("hub.admin.overview.access")}</h3>
                <div className="settings-section">
                  <label className="settings-label">{t("hub.admin.overview.membership")}</label>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={props.requireApproval} onChange={(e) => props.onRequireApprovalChange(e.target.checked)} />
                    {t("hub.admin.overview.require_approval")}
                  </label>
                </div>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-antispam">{t("hub.admin.overview.antispam")}</label>
                  <input id="admin-antispam" type="number" min={0} max={9999} value={props.minSecurityLevel} onChange={(e) => props.onMinSecurityLevelChange(Number(e.target.value))} />
                </div>
              </div>

              <div className="settings-card">
                <h3>{t("hub.admin.overview.locale")}</h3>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-hub-timezone">{t("hub.admin.overview.timezone")}</label>
                  <p className="muted">{t("hub.admin.overview.timezone_hint")}</p>
                  {typeof supportedTimeZones === "function" ? (
                    <select
                      id="admin-hub-timezone"
                      value={props.timezone}
                      onChange={(e) => props.onTimezoneChange(e.target.value)}
                    >
                      <option value="">{t("hub.admin.overview.timezone_unset")}</option>
                      {supportedTimeZones("timeZone").map((tz) => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="muted">{t("hub.admin.overview.timezone_unsupported")}</p>
                  )}
                  <label className="checkbox-label" style={{ marginTop: "var(--space-2)" }}>
                    <input
                      type="checkbox"
                      checked={props.birthdaysEnabled}
                      onChange={(e) => props.onBirthdaysEnabledChange(e.target.checked)}
                    />
                    {t("hub.admin.overview.birthdays")}
                  </label>
                </div>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-name-color-mode">{t("hub.admin.overview.name_colors")}</label>
                  <p className="muted">{t("hub.admin.overview.name_colors_hint")}</p>
                  <select
                    id="admin-name-color-mode"
                    value={props.nameColorMode}
                    onChange={(e) => props.onNameColorModeChange(e.target.value as typeof props.nameColorMode)}
                  >
                    {/* Short labels: the sentence-length ones overflowed the
                        select in a narrow card, and the paragraph above
                        already carries the explanation. */}
                    <option value="role_over_user">{t("hub.admin.overview.name_colors.role_over_user")}</option>
                    <option value="user_over_role">{t("hub.admin.overview.name_colors.user_over_role")}</option>
                    <option value="role_only">{t("hub.admin.overview.name_colors.role_only")}</option>
                    <option value="user_only">{t("hub.admin.overview.name_colors.user_only")}</option>
                    <option value="none">{t("hub.admin.overview.name_colors.none")}</option>
                  </select>
                </div>
              </div>

              <div className="settings-card">
                <h3>{t("hub.admin.overview.channels_voice")}</h3>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-afk-channel">{t("hub.admin.overview.afk_channel")}</label>
                  <p className="muted">{t("hub.admin.overview.afk_channel_hint")}</p>
                  {/* Channel and timeout are one decision, so they share a row —
                      the timeout only appears once a channel is picked. */}
                  <div className="settings-card-row">
                    <div>
                      <select
                        id="admin-afk-channel"
                        value={props.afkChannelId}
                        onChange={(e) => props.onAfkChannelIdChange(e.target.value)}
                      >
                        <option value="">{t("hub.admin.overview.afk_channel_none")}</option>
                        {moveChannelOptions(props.channels).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                    {props.afkChannelId && (
                      <div>
                        <label className="settings-label" htmlFor="admin-afk-timeout">{t("hub.admin.overview.afk_timeout")}</label>
                        <select
                          id="admin-afk-timeout"
                          value={props.afkTimeoutSecs}
                          onChange={(e) => props.onAfkTimeoutSecsChange(Number(e.target.value))}
                        >
                          <option value={60}>{t("hub.admin.overview.afk_timeout.1m")}</option>
                          <option value={300}>{t("hub.admin.overview.afk_timeout.5m")}</option>
                          <option value={900}>{t("hub.admin.overview.afk_timeout.15m")}</option>
                          <option value={1800}>{t("hub.admin.overview.afk_timeout.30m")}</option>
                          <option value={3600}>{t("hub.admin.overview.afk_timeout.1h")}</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-max-depth">{t("hub.admin.overview.max_depth")}</label>
                  <p className="muted">{t("hub.admin.overview.max_depth_hint")}</p>
                  <input id="admin-max-depth" type="number" min={0} max={20} value={props.maxChannelDepth} onChange={(e) => props.onMaxChannelDepthChange(Number(e.target.value))} />
                </div>
              </div>

              <div className="settings-card">
                <h3>{t("hub.admin.overview.limits")}</h3>
                <div className="settings-section">
                  <label className="settings-label" htmlFor="admin-attachment-cap">
                    {t("hub.admin.overview.attachment_cap")}
                  </label>
                  <p className="muted">{t("hub.admin.overview.attachment_cap_hint")}</p>
                  <div className="settings-row">
                    <input
                      id="admin-attachment-cap"
                      type="number"
                      min={1}
                      max={8}
                      step={1}
                      value={Math.max(1, Math.round(props.maxAttachmentBytes / 1024 / 1024))}
                      onChange={(e) =>
                        props.onMaxAttachmentBytesChange(Number(e.target.value) * 1024 * 1024)
                      }
                    />
                    <span className="muted">{t("hub.admin.overview.attachment_cap_unit")}</span>
                  </div>
                </div>
                {/* Deliberately not editable here: these come from the
                    environment and need a restart, so an input would imply
                    something this page cannot deliver. Named so an operator
                    knows what to go and change. */}
                <div className="settings-section">
                  <label className="settings-label">{t("hub.admin.overview.startup_only")}</label>
                  {/* The env var names stay outside the catalog: a translator
                      must not be able to rename an operator's variable. */}
                  <p className="muted">
                    {t("hub.admin.overview.startup_only.db")} — <code>WAVVON_DB_MAX_CONNECTIONS</code>.{" "}
                    {t("hub.admin.overview.startup_only.udp")} — <code>WAVVON_VOICE_UDP_PORT</code>.{" "}
                    {t("hub.admin.overview.startup_only.rest")}
                  </p>
                </div>
              </div>

              <div className="settings-card">
                <h3>{t("hub.admin.overview.welcome")}</h3>
                <div className="settings-section">
                  <p className="muted">{t("hub.admin.overview.welcome_intro")}</p>
                  <div className="settings-card-row">
                    <div>
                      <label className="settings-label" htmlFor="admin-welcome-label">{t("hub.admin.overview.welcome_label")}</label>
                      <input
                        id="admin-welcome-label"
                        type="text"
                        maxLength={100}
                        value={props.welcomeLabel}
                        placeholder={t("hub.admin.overview.welcome_label_placeholder")}
                        onChange={(e) => props.onWelcomeLabelChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="settings-label" htmlFor="admin-welcome-invite">{t("hub.admin.overview.welcome_invite_url")}</label>
                      <input
                        id="admin-welcome-invite"
                        type="text"
                        value={props.welcomeInviteUrl}
                        placeholder={t("hub.admin.overview.welcome_invite_url_placeholder")}
                        onChange={(e) => props.onWelcomeInviteUrlChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="settings-label" htmlFor="admin-farewell-label">{t("hub.admin.overview.farewell_label")}</label>
                    <textarea
                      id="admin-farewell-label"
                      rows={2}
                      maxLength={280}
                      value={props.farewellLabel}
                      placeholder={t("hub.admin.overview.farewell_label_placeholder")}
                      onChange={(e) => props.onFarewellLabelChange(e.target.value)}
                    />
                    <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      {t("hub.admin.overview.farewell_label_hint")}
                    </p>
                  </div>
                  {(props.welcomeLabel.trim() || props.welcomeInviteUrl.trim()) && (
                    <p className="muted">{t("hub.admin.overview.welcome_preview", {
                      label: props.welcomeLabel.trim() || t("hub.admin.overview.welcome_preview_no_label"),
                      invite: props.welcomeInviteUrl.trim() || t("hub.admin.overview.welcome_preview_no_invite"),
                    })}</p>
                  )}
                </div>
              </div>
            </div>
            {props.saveError && <p className="error-text">{props.saveError}</p>}
            <div className="settings-save-bar">
              <button onClick={props.onSave}>{t("hub.admin.overview.save")}</button>
            </div>
          </section>
        )}

        {props.tab === "discovery" && (
          <section>
            <h1>{t("hub.admin.discovery.title")}</h1>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.discovery.public_listing")}</label>
              <div className="settings-row">
                <label>{t("hub.admin.discovery.list_publicly")}</label>
                <input
                  type="checkbox"
                  checked={props.hubListed}
                  disabled={listingBusy}
                  onChange={(e) => handleListingToggle(e.target.checked)}
                />
              </div>
              <p className="muted">{t("hub.admin.discovery.list_publicly_hint")}</p>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.discovery.share.label")}</label>
              <div className="settings-row">
                <code className="pubkey-display">{hubToWavvonUrl(props.activeHubUrl)}</code>
                <button onClick={() => { navigator.clipboard.writeText(hubToWavvonUrl(props.activeHubUrl)).catch(() => {}); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000); }}>
                  {copiedShare ? t("hub.admin.discovery.share.copied") : t("modal.copy")}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.discovery.directory.title")}</label>
              <p className="muted">{t("hub.admin.discovery.directory.submit_to", { url: dirUrl })}</p>
              <div className="settings-section">
                <label className="settings-label">{t("hub.admin.discovery.directory.tags")}</label>
                <input type="text" placeholder={t("hub.admin.discovery.directory.tags_placeholder")} value={dirTags} onChange={(e) => setDirTags(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">{t("hub.admin.discovery.directory.language")}</label>
                <input type="text" placeholder={t("hub.admin.discovery.directory.language_placeholder")} value={dirLanguage} onChange={(e) => setDirLanguage(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">{t("hub.admin.discovery.directory.bio")}</label>
                <textarea rows={3} placeholder={t("hub.admin.discovery.directory.bio_placeholder")} value={dirBio} onChange={(e) => setDirBio(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">{t("hub.admin.discovery.directory.invite_code")}</label>
                <input type="text" placeholder={t("hub.admin.discovery.directory.invite_code_placeholder")} value={dirInviteCode} onChange={(e) => setDirInviteCode(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">{t("hub.admin.discovery.directory.url")}</label>
                <input type="text" value={dirUrl} onChange={(e) => setDirUrl(e.target.value)} />
              </div>
              {dirStatus === "ok" && <p className="muted" style={{ color: "var(--success)" }}>{t("hub.admin.discovery.directory.submitted")}</p>}
              {dirStatus === "error" && <p className="error-text">{dirError}</p>}
              <button onClick={handleSubmitToDirectory} disabled={dirStatus === "submitting"}>
                {dirStatus === "submitting" ? t("hub.admin.discovery.directory.submitting") : t("hub.admin.discovery.directory.submit")}
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
                <h2>{t("hub.admin.members.pending.title", { count: props.pendingMembers.length })}</h2>
                <table className="members-table">
                  <thead><tr>
                    <th>{t("hub.admin.members.pending.col.user")}</th>
                    <th>{t("hub.admin.members.pending.col.signed_up")}</th>
                    <th>{t("hub.admin.members.pending.col.actions")}</th>
                  </tr></thead>
                  <tbody>
                    {props.pendingMembers.map((p) => (
                      <tr key={p.public_key}>
                        <td>
                          <div>{p.display_name || t("hub.admin.members.pending.no_name")}</div>
                          <div className="member-pk" title={p.public_key}>{formatPubkey(p.public_key)}</div>
                        </td>
                        <td>{formatRelative(p.first_seen_at)}</td>
                        <td>
                          <button className="btn-small" onClick={() => props.onApproveMember(p.public_key)}>{t("hub.admin.members.pending.approve")}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <h1>{t("hub.admin.members.title", { count: props.members.length })}</h1>
            <table className="members-table">
              <thead><tr>
                <th>{t("hub.admin.members.col.name")}</th>
                <th>{t("hub.admin.members.col.roles")}</th>
                <th>{t("hub.admin.members.col.joined")}</th>
                <th>{t("hub.admin.members.col.actions")}</th>
              </tr></thead>
              <tbody>
                {props.members.map((m) => (
                  <tr key={m.public_key}>
                    <td>
                      <div>{m.display_name || t("hub.admin.members.pending.no_name")}</div>
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
                      <button className="btn-small" onClick={() => props.onKickMember(m.public_key)}>{t("hub.admin.members.kick")}</button>
                      <button className="btn-small danger" onClick={() => props.onBanMember(m.public_key)}>{t("hub.admin.members.ban")}</button>
                      <button className="btn-small btn-secondary" onClick={() => props.onMuteMember(m.public_key)}>{t("hub.admin.members.mute")}</button>
                      <button className="btn-small btn-secondary" onClick={() => props.onTimeoutMember(m.public_key)}>{t("hub.admin.members.timeout")}</button>
                      {props.voiceMutedKeys.has(m.public_key) ? (
                        <button className="btn-small btn-secondary" onClick={() => props.onVoiceUnmuteMember(m.public_key)}>{t("hub.admin.members.voice_unmute")}</button>
                      ) : (
                        <button className="btn-small btn-secondary" onClick={() => props.onVoiceMuteMember(m.public_key)}>{t("hub.admin.members.voice_mute")}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {props.members.length === 0 && <p className="muted">{t("hub.admin.members.empty")}</p>}
          </section>
        )}

        {props.tab === "bans" && (
          <section>
            <h1>{t("hub.admin.bans.title", { count: props.bans.length })}</h1>
            {props.bans.length === 0 && <p className="muted">{t("hub.admin.bans.empty")}</p>}
            {props.bans.length > 0 && (
              <table className="members-table">
                <thead><tr>
                  <th>{t("hub.admin.bans.col.user")}</th>
                  <th>{t("hub.admin.bans.col.reason")}</th>
                  <th>{t("hub.admin.bans.col.banned_by")}</th>
                  <th>{t("hub.admin.bans.col.when")}</th>
                  <th>{t("hub.admin.bans.col.actions")}</th>
                </tr></thead>
                <tbody>
                  {props.bans.map((b) => (
                    <tr key={b.target_public_key}>
                      <td><span className="member-pk">{formatPubkey(b.target_public_key)}</span></td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
                      <td><span className="member-pk" title={b.banned_by}>{formatPubkey(b.banned_by)}</span></td>
                      <td>{formatRelative(b.created_at)}</td>
                      <td><button className="btn-small" onClick={() => props.onUnban(b.target_public_key)}>{t("hub.admin.bans.unban")}</button></td>
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

        {props.tab === "certifications" && (
          <CertificationsSection actions={props.certActions} />
        )}

        {props.tab === "recovery" && props.renderRecoveryContacts?.()}

        {props.tab === "soundboard" && props.canManageSoundboard && props.soundboardActions && (
          <SoundboardAdminSection actions={props.soundboardActions} />
        )}

        {props.tab === "moderation" && props.isAdmin && props.renderModerationTab?.()}

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
