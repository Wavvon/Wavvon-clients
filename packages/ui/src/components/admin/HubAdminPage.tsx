import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatPubkey, formatRelative, type Channel } from "@wavvon/core";
import { PendingApplicationDetails } from "./PendingApplicationDetails";
import type { BanInfo, InviteInfo, MemberAdminInfo, MuteInfo, NameColorMode, PendingUser, RoleInfo, SurveyResponseAdmin } from "../../types";
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
import { StickerPacksSection, type StickerPacksActions } from "./StickerPacksSection";
import { StickerStorageSection, type StickerStorageActions } from "./StickerStorageSection";
import { StickerSettingsSection, type StickerSettingsActions } from "./StickerSettingsSection";
import { AttachmentSettingsSection, type AttachmentSettingsActions } from "./AttachmentSettingsSection";
import { OnboardingAdminSection, type OnboardingAdminSectionActions } from "./OnboardingAdminSection";
import { moveChannelOptions } from "../../utils/voiceMove";
import { SettingRow } from "../SettingRow";
import { WidgetSection, type WidgetActions } from "./WidgetSection";
import { HubThemeSection, type HubThemeActions } from "./HubThemeSection";
import { HubLanguagesSection, type HubLanguagesActions } from "./HubLanguagesSection";
import { InviteLandingSection, type InviteLandingActions } from "./InviteLandingSection";
import { SettingsShell, type SettingsAreaDef, type SettingsSectionDef } from "../settings/SettingsShell";

export type MemberAction = Promise<boolean | void>;

export type HubAdminTab =
  | "overview"
  | "behaviour"
  | "voice-channels"
  | "admission"
  | "welcome"
  | "message-limits"
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
  | "stickers"
  | "sticker-storage"
  | "sticker-settings"
  | "attachments"
  | "widget"
  | "alliances"
  | "hub-icons"
  | "hub-theme"
  | "hub-languages"
  | "onboarding"
  | "survey"
  | "application"
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
  /** Present when the hub serves `hub.landing` and the viewer may change its
   *  settings: identity is then edited on a preview of the invite landing. */
  inviteLandingActions?: InviteLandingActions;
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
  /** Called after each overview edit settles; there is no Save button. */
  onSave: () => void | Promise<void>;

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
  /** A joiner's application answers (join-forms.md); absent hides them. */
  loadApplication?: (publicKey: string) => Promise<SurveyResponseAdmin | null>;
  /** Reject a joiner's application with a reason they will read. */
  onRejectMember?: (publicKey: string, reason: string) => Promise<void>;
  members: MemberAdminInfo[];
  // Member actions reject with the hub's message on failure and resolve
  // `false` when the user backed out of a prompt; the page reports either.
  onKickMember: (publicKey: string) => MemberAction;
  onBanMember: (publicKey: string) => MemberAction;
  onMuteMember: (publicKey: string) => MemberAction;
  onUnmuteMember: (publicKey: string) => MemberAction;
  onTimeoutMember: (publicKey: string) => MemberAction;
  onVoiceMuteMember: (publicKey: string) => MemberAction;
  onVoiceUnmuteMember: (publicKey: string) => MemberAction;
  voiceMutedKeys: Set<string>;
  /** Mutes and timeouts, as `GET /moderation/mutes` lists them. */
  mutes: MuteInfo[];
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
  onCreateInvite: (
    maxUses: number | null,
    expiresInSeconds: number | null,
    grantRoleId: string | null,
    boundPubkey: string | null,
  ) => void;
  /** `invites.bound` — see `InviteManager`. Omitted by a platform that does
   *  not read hub capabilities yet, which reads as "do not offer it". */
  supportsBoundInvites?: boolean;
  onRevokeInvite: (code: string) => void;

  myPubkey: string;
  isAdmin: boolean;
  /** Base URL of the hub directory, or absent when none is configured — the
   *  Discovery tab is then not offered at all. It used to seed its form with
   *  a hardcoded discovery.wavvon.io, a host that does not resolve. */
  discoveryUrl?: string;
  canManageSoundboard: boolean;
  /** `alliances.manage`. */
  canManageHubAlliances: boolean;
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
  /** Present only on a hub advertising `stickers`. Each part is present only
   *  when the viewer holds the permission it needs (packs:
   *  `stickers.packs.manage`, storage: `stickers.moderate`, settings:
   *  `hub.settings`), and a tab appears for each part that is. */
  stickersAdmin?: {
    hubUrl: string;
    packs?: StickerPacksActions;
    storage?: StickerStorageActions;
    settings?: StickerSettingsActions;
  };
  /** Present only on a hub advertising `attachments.stored`, for a viewer holding `hub.settings`. */
  attachmentSettingsActions?: AttachmentSettingsActions;
  /** Present only on a hub advertising `hub.widget`, for a viewer holding `hub.settings`. */
  widgetActions?: WidgetActions;
  /** Present only on a hub advertising `hub.theme`, for a viewer holding `hub.appearance`. */
  hubThemeActions?: HubThemeActions;
  /** Present only on a hub advertising `hub.languages`, for its owner. */
  hubLanguagesActions?: HubLanguagesActions;
  onboardingActions: OnboardingAdminSectionActions;
  allianceActions: AlliancesSectionActions;
  hubIconActions: HubIconsSectionActions;
  surveyActions: SurveyAdminSectionActions;
  /** The join application's editor (join-forms.md). The tab shows only with
   *  these and a hub advertising `admission.application`. */
  applicationActions?: SurveyAdminSectionActions;
  /** The hub has `admission.application`: the application tab, and the
   *  multi and consent kinds on both forms. */
  joinFormsCapable?: boolean;

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
  const [adminOpen, setAdminOpen] = useState<string | null>(null);
  const [openApplication, setOpenApplication] = useState<string | null>(null);
  const adminRow = (id: string) => ({
    open: adminOpen === id,
    onToggle: () => setAdminOpen((cur) => (cur === id ? null : id)),
  });
  const [copiedShare, setCopiedShare] = useState(false);
  // Overview saves itself. `edit` wraps a change handler: the value lands in
  // the app's state as before, and a save follows `delay` ms after the last
  // edit, 0 for a toggle or a select and a pause for typing.
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pendingSave, setPendingSave] = useState<{ delay: number } | null>(null);
  const saveRef = useRef(props.onSave);
  saveRef.current = props.onSave;
  function edit<T>(fn: (value: T) => void, delay = 700) {
    return (value: T) => {
      fn(value);
      setPendingSave({ delay });
    };
  }
  useEffect(() => {
    if (!pendingSave) return;
    const id = setTimeout(async () => {
      setSaveStatus("saving");
      await saveRef.current();
      setSaveStatus("saved");
    }, pendingSave.delay);
    return () => clearTimeout(id);
  }, [pendingSave]);
  // One member action at a time: the row's buttons stay disabled until the
  // hub answers, so a click that seems to do nothing cannot be sent eleven
  // times, and the outcome is said out loud above the list.
  const [memberBusy, setMemberBusy] = useState<string | null>(null);
  const [memberNotice, setMemberNotice] = useState<{ text: string; error: boolean } | null>(null);
  async function memberAction(m: MemberAdminInfo, run: (publicKey: string) => MemberAction, doneKey: string) {
    setMemberBusy(m.public_key);
    setMemberNotice(null);
    try {
      if ((await run(m.public_key)) === false) return;
      setMemberNotice({ text: t(doneKey, { name: m.display_name || formatPubkey(m.public_key) }), error: false });
    } catch (e) {
      setMemberNotice({ text: t("hub.admin.members.action_failed", { error: e instanceof Error ? e.message : String(e) }), error: true });
    } finally {
      setMemberBusy(null);
    }
  }
  const nowSecs = Date.now() / 1000;
  const activeMutes = new Map(
    props.mutes.filter((x) => x.expires_at === null || x.expires_at > nowSecs).map((x) => [x.target_public_key, x]),
  );
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

  // Six areas, in the order an admin reaches for them (Wavvon-clients#464).
  // A section appears only when this viewer and this hub can use it; an area
  // with nothing in it is not shown.
  type Area = "general" | "joining" | "people" | "moderation" | "content" | "connections";
  const admin = props.isAdmin;
  // The tab holds the hub-scoped acts (alliances.manage) and the per-alliance
  // grant lists (roles.manage edits them); either is reason to reach it.
  const showAlliances = props.canManageHubAlliances || props.canManageRoles;
  const S = (id: HubAdminTab, label: string, area: Area): SettingsSectionDef<HubAdminTab, Area> => ({ id, label, area });
  const SECTIONS: SettingsSectionDef<HubAdminTab, Area>[] = [
    S("overview", t("hub.admin.overview.identity"), "general"),
    S("behaviour", t("hub.admin.section.behaviour"), "general"),
    S("voice-channels", t("hub.admin.section.voice_channels"), "general"),
    ...(props.discoveryUrl ? [S("discovery", t("hub.admin.tabs.discovery"), "general")] : []),
    S("tags", t("hub.admin.tabs.tags"), "general"),
    ...(props.hubThemeActions ? [S("hub-theme", t("hub.admin.tabs.theme"), "general")] : []),
    ...(props.hubLanguagesActions ? [S("hub-languages", t("hub.admin.tabs.languages"), "general")] : []),
    S("invites", t("hub.admin.tabs.invites"), "joining"),
    {
      ...S("admission", t("hub.admin.section.admission"), "joining"),
      // Newcomers waiting on approval: the Joining tab carries the marker.
      attention: props.pendingMembers.length > 0
        ? t("hub.admin.members.pending.title", { count: props.pendingMembers.length })
        : undefined,
    },
    ...(admin ? [
      S("onboarding", t("hub.admin.tabs.onboarding"), "joining"),
      S("survey", t("hub.admin.tabs.survey"), "joining"),
      ...(props.joinFormsCapable && props.applicationActions ? [S("application", t("hub.admin.tabs.application"), "joining")] : []),
    ] : []),
    S("welcome", t("hub.admin.overview.welcome"), "joining"),
    S("members", t("hub.admin.tabs.members"), "people"),
    S("roles", t("hub.admin.tabs.roles"), "people"),
    S("certifications", t("hub.admin.tabs.certifications"), "people"),
    ...(admin && props.renderModerationTab ? [S("moderation", t("hub.admin.tabs.moderation"), "moderation")] : []),
    ...(admin && props.renderRecoveryContacts ? [S("recovery", t("hub.admin.tabs.recovery"), "moderation")] : []),
    S("bans", t("hub.admin.tabs.bans"), "moderation"),
    ...(admin ? [S("audit-log", t("hub.admin.tabs.audit_log"), "moderation")] : []),
    ...(admin ? [S("hub-icons", t("hub.admin.tabs.icons"), "content")] : []),
    ...(props.stickersAdmin?.packs ? [S("stickers", t("hub.admin.tabs.stickers"), "content")] : []),
    ...(props.stickersAdmin?.settings ? [S("sticker-settings", t("hub.admin.tabs.sticker_settings"), "content")] : []),
    ...(props.canManageSoundboard && props.soundboardActions ? [S("soundboard", t("hub.admin.tabs.soundboard"), "content")] : []),
    ...(props.attachmentSettingsActions ? [S("attachments", t("hub.admin.tabs.attachments"), "content")] : []),
    S("message-limits", t("hub.admin.section.message_limits"), "content"),
    ...(props.stickersAdmin?.storage ? [S("sticker-storage", t("hub.admin.tabs.sticker_storage"), "content")] : []),
    ...(showAlliances ? [S("alliances", t("hub.admin.tabs.alliances"), "connections")] : []),
    S("integrations", t("hub.admin.tabs.webhooks"), "connections"),
    ...(props.widgetActions ? [S("widget", t("hub.admin.tabs.widget"), "connections")] : []),
  ];
  const AREAS: SettingsAreaDef<Area>[] = ([
    { id: "general", label: t("hub.admin.group.general") },
    { id: "joining", label: t("hub.admin.group.joining") },
    { id: "people", label: t("hub.admin.area.people") },
    { id: "moderation", label: t("hub.admin.group.moderation") },
    { id: "content", label: t("hub.admin.area.content") },
    { id: "connections", label: t("hub.admin.group.connections") },
  ] satisfies SettingsAreaDef<Area>[]).filter((a) => SECTIONS.some((sec) => sec.area === a.id));

  function renderSection(section: HubAdminTab) {
    return (
      <>
        {section === "overview" && (
          <section>
            <h1>{t("hub.admin.overview.identity")}</h1>
            <SettingRow
              title={t("hub.admin.overview.identity")}
              state={props.hubName.trim() || t("hub.admin.overview.state.unnamed")}
              {...adminRow("identity")}
            >
                {props.inviteLandingActions ? (
                  <InviteLandingSection
                    name={props.hubName}
                    description={props.hubDescription}
                    onNameChange={edit(props.onHubNameChange)}
                    onDescriptionChange={edit(props.onHubDescriptionChange)}
                    memberCount={props.members.length}
                    actions={props.inviteLandingActions}
                  />
                ) : (
                  <>
                    <div className="settings-section">
                      <label className="settings-label" htmlFor="admin-hub-name">{t("hub.admin.overview.name")}</label>
                      <input id="admin-hub-name" type="text" value={props.hubName} onChange={(e) => edit(props.onHubNameChange)(e.target.value)} />
                    </div>
                    <div className="settings-section">
                      <label className="settings-label" htmlFor="admin-hub-desc">{t("hub.admin.overview.description")}</label>
                      <textarea id="admin-hub-desc" rows={2} value={props.hubDescription} onChange={(e) => edit(props.onHubDescriptionChange)(e.target.value)} />
                    </div>
                  </>
                )}
                <div className="settings-section">
                  <label className="settings-label">{t("hub.admin.overview.icon")}</label>
                  {props.inviteLandingActions && (
                    <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "0 0 var(--space-2)" }}>{t("hub.admin.landing.icon_hint")}</p>
                  )}
                  <div className="hub-icon-editor">
                    {props.hubIcon ? (
                      <img src={props.hubIcon} alt={t("hub.admin.overview.icon")} className="hub-icon-preview" />
                    ) : (
                      <div className="hub-icon-preview placeholder">{t("hub.admin.overview.icon_none")}</div>
                    )}
                    <ImagePicker
                      onPick={edit(props.onHubIconChange, 0)}
                      onClear={() => edit(props.onHubIconChange, 0)("")}
                      hasValue={!!props.hubIcon}
                      buttonLabel={t("hub.admin.overview.icon_pick")}
                    />
                  </div>
                </div>
            </SettingRow>
          </section>
        )}
        {section === "behaviour" && (
          <section>
            <h1>{t("hub.admin.section.behaviour")}</h1>
            <SettingRow
              title={t("hub.admin.overview.timezone")}
              state={t("hub.admin.overview.timezone_hint")}
              control={typeof supportedTimeZones === "function" ? (
                <select
                  aria-label={t("hub.admin.overview.timezone")}
                  value={props.timezone}
                  onChange={(e) => edit(props.onTimezoneChange, 0)(e.target.value)}
                  style={{ maxWidth: 220 }}
                >
                  <option value="">{t("hub.admin.overview.timezone_unset")}</option>
                  {supportedTimeZones("timeZone").map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              ) : (
                <span className="muted">{t("hub.admin.overview.timezone_unsupported")}</span>
              )}
            />
            <SettingRow
              title={t("hub.admin.overview.birthdays")}
              control={<input type="checkbox" aria-label={t("hub.admin.overview.birthdays")} checked={props.birthdaysEnabled} onChange={(e) => edit(props.onBirthdaysEnabledChange, 0)(e.target.checked)} />}
            />
            <SettingRow
              title={t("hub.admin.overview.name_colors")}
              state={t("hub.admin.overview.name_colors_hint")}
              control={
                <select
                  aria-label={t("hub.admin.overview.name_colors")}
                  value={props.nameColorMode}
                  onChange={(e) => edit(props.onNameColorModeChange, 0)(e.target.value as typeof props.nameColorMode)}
                >
                  {/* Short labels: the sentence-length ones overflowed the
                      select in a narrow card, and the line above already
                      carries the explanation. */}
                  <option value="role_over_user">{t("hub.admin.overview.name_colors.role_over_user")}</option>
                  <option value="user_over_role">{t("hub.admin.overview.name_colors.user_over_role")}</option>
                  <option value="role_only">{t("hub.admin.overview.name_colors.role_only")}</option>
                  <option value="user_only">{t("hub.admin.overview.name_colors.user_only")}</option>
                  <option value="none">{t("hub.admin.overview.name_colors.none")}</option>
                </select>
              }
            />

          </section>
        )}
        {section === "voice-channels" && (
          <section>
            <h1>{t("hub.admin.section.voice_channels")}</h1>
            {/* Channel and timeout are one decision, so they share a row; the
                timeout only appears once a channel is picked. */}
            <SettingRow
              title={t("hub.admin.overview.afk_channel")}
              state={t("hub.admin.overview.afk_channel_hint")}
              control={
                <span className="settings-row" style={{ gap: "var(--space-2)" }}>
                  <select
                    aria-label={t("hub.admin.overview.afk_channel")}
                    value={props.afkChannelId}
                    onChange={(e) => edit(props.onAfkChannelIdChange, 0)(e.target.value)}
                  >
                    <option value="">{t("hub.admin.overview.afk_channel_none")}</option>
                    {moveChannelOptions(props.channels).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {props.afkChannelId && (
                    <select
                      aria-label={t("hub.admin.overview.afk_timeout")}
                      value={props.afkTimeoutSecs}
                      onChange={(e) => edit(props.onAfkTimeoutSecsChange, 0)(Number(e.target.value))}
                    >
                      <option value={60}>{t("hub.admin.overview.afk_timeout.1m")}</option>
                      <option value={300}>{t("hub.admin.overview.afk_timeout.5m")}</option>
                      <option value={900}>{t("hub.admin.overview.afk_timeout.15m")}</option>
                      <option value={1800}>{t("hub.admin.overview.afk_timeout.30m")}</option>
                      <option value={3600}>{t("hub.admin.overview.afk_timeout.1h")}</option>
                    </select>
                  )}
                </span>
              }
            />
            <SettingRow
              title={t("hub.admin.overview.max_depth")}
              state={t("hub.admin.overview.max_depth_hint")}
              control={<input type="number" aria-label={t("hub.admin.overview.max_depth")} min={0} max={20} style={{ width: 70 }} value={props.maxChannelDepth} onChange={(e) => edit(props.onMaxChannelDepthChange)(Number(e.target.value))} />}
            />
          </section>
        )}
        {section === "admission" && (
          <section>
            <h1>{t("hub.admin.section.admission")}</h1>
            <SettingRow
              title={t("hub.admin.overview.require_approval")}
              control={<input type="checkbox" aria-label={t("hub.admin.overview.require_approval")} checked={props.requireApproval} onChange={(e) => edit(props.onRequireApprovalChange, 0)(e.target.checked)} />}
            />
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
                          {p.ban_evasion_match && (
                            <div className="muted" style={{ fontSize: "var(--text-xs)" }} title={p.ban_evasion_match}>
                              {t("hub.admin.members.pending.ban_evasion", { banned: formatPubkey(p.ban_evasion_match) })}
                            </div>
                          )}
                        </td>
                        <td>{formatRelative(p.first_seen_at)}</td>
                        <td>
                          <button className="btn-small" onClick={() => props.onApproveMember(p.public_key)}>{t("hub.admin.members.pending.approve")}</button>
                          {p.has_application && props.loadApplication && (
                            <button
                              className="btn-small btn-secondary"
                              aria-expanded={openApplication === p.public_key}
                              onClick={() => setOpenApplication((cur) => (cur === p.public_key ? null : p.public_key))}
                            >
                              {t("hub.admin.members.pending.application")}
                            </button>
                          )}
                        </td>
                      </tr>
                    )).flatMap((row, i) => {
                      const p = props.pendingMembers[i];
                      return openApplication === p.public_key && props.loadApplication
                        ? [row, (
                          <tr key={`${p.public_key}-application`}>
                            <td colSpan={3}>
                              <PendingApplicationDetails
                                pubkey={p.public_key}
                                loadApplication={props.loadApplication}
                                onReject={props.onRejectMember}
                              />
                            </td>
                          </tr>
                        )]
                        : [row];
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <SettingRow
              title={t("hub.admin.overview.antispam")}
              control={<input type="number" aria-label={t("hub.admin.overview.antispam")} min={0} max={9999} style={{ width: 90 }} value={props.minSecurityLevel} onChange={(e) => edit(props.onMinSecurityLevelChange)(Number(e.target.value))} />}
            />
          </section>
        )}
        {section === "welcome" && (
          <section>
            <h1>{t("hub.admin.overview.welcome")}</h1>
            <SettingRow
              title={t("hub.admin.overview.welcome")}
              state={props.welcomeLabel.trim() || t("hub.admin.overview.state.no_welcome")}
              {...adminRow("welcome")}
            >
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
                        onChange={(e) => edit(props.onWelcomeLabelChange)(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="settings-label" htmlFor="admin-welcome-invite">{t("hub.admin.overview.welcome_invite_url")}</label>
                      <input
                        id="admin-welcome-invite"
                        type="text"
                        value={props.welcomeInviteUrl}
                        placeholder={t("hub.admin.overview.welcome_invite_url_placeholder")}
                        onChange={(e) => edit(props.onWelcomeInviteUrlChange)(e.target.value)}
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
                      onChange={(e) => edit(props.onFarewellLabelChange)(e.target.value)}
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
            </SettingRow>
          </section>
        )}
        {section === "message-limits" && (
          <section>
            <h1>{t("hub.admin.section.message_limits")}</h1>
            <SettingRow
              title={t("hub.admin.overview.attachment_cap")}
              state={t("hub.admin.overview.attachment_cap_hint")}
              control={
                <span className="settings-row" style={{ gap: "var(--space-1)" }}>
                  <input
                    type="number"
                    aria-label={t("hub.admin.overview.attachment_cap")}
                    min={1}
                    max={8}
                    step={1}
                    style={{ width: 60 }}
                    value={Math.max(1, Math.round(props.maxAttachmentBytes / 1024 / 1024))}
                    onChange={(e) => edit(props.onMaxAttachmentBytesChange)(Number(e.target.value) * 1024 * 1024)}
                  />
                  <span className="muted">{t("hub.admin.overview.attachment_cap_unit")}</span>
                </span>
              }
            />
          </section>
        )}

        {section === "discovery" && (
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

        {section === "tags" && (
          <ServerTagsSection actions={props.serverTagsActions} />
        )}

        {section === "members" && (
          <section>
            <h1>{t("hub.admin.members.title", { count: props.members.length })}</h1>
            {memberNotice && (
              <p role="status" className={memberNotice.error ? "error-text" : "muted"} style={{ marginBottom: "var(--space-3)" }}>
                {memberNotice.text}
              </p>
            )}
            {props.members.map((m) => {
              const mute = activeMutes.get(m.public_key);
              const busy = memberBusy === m.public_key;
              const state = [
                t("hub.admin.members.state", {
                  roles: m.roles.map((r) => r.name).join(", ") || t("hub.admin.members.state.no_roles"),
                  joined: formatRelative(m.first_seen_at),
                }),
                mute &&
                  (mute.expires_at === null
                    ? t("hub.admin.members.muted")
                    : t("hub.admin.members.timed_out_until", { time: formatDateTime(mute.expires_at) })),
                props.voiceMutedKeys.has(m.public_key) && t("hub.admin.members.voice_muted"),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
              <SettingRow
                key={m.public_key}
                title={m.display_name || t("hub.admin.members.pending.no_name")}
                state={state}
                {...adminRow(m.public_key)}
              >
                <p className="member-pk" title={m.public_key} style={{ marginBottom: "var(--space-3)" }}>
                  {formatPubkey(m.public_key)}
                </p>

                {props.canManageRoles && (
                  <div style={{ marginBottom: "var(--space-4)" }}>
                    <MemberRoleManager
                      pubkey={m.public_key}
                      currentRoles={m.roles}
                      myMaxPriority={props.myMaxPriority}
                      onChanged={(roles) => props.onMemberRolesChanged(m.public_key, roles)}
                      actions={props.memberRoleActions}
                    />
                  </div>
                )}

                <span className="settings-label">{t("hub.admin.members.group.limit")}</span>
                <div className="settings-row" style={{ marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
                  {mute ? (
                    <button className="btn-small" disabled={busy} onClick={() => void memberAction(m, props.onUnmuteMember, "hub.admin.members.done.unmuted")}>
                      {t(mute.expires_at === null ? "hub.admin.members.unmute" : "hub.admin.members.end_timeout")}
                    </button>
                  ) : (
                    <>
                      <button className="btn-small" disabled={busy} onClick={() => void memberAction(m, props.onMuteMember, "hub.admin.members.done.muted")}>{t("hub.admin.members.mute")}</button>
                      <button className="btn-small" disabled={busy} onClick={() => void memberAction(m, props.onTimeoutMember, "hub.admin.members.done.timed_out")}>{t("hub.admin.members.timeout")}</button>
                    </>
                  )}
                  {props.voiceMutedKeys.has(m.public_key) ? (
                    <button className="btn-small" disabled={busy} onClick={() => void memberAction(m, props.onVoiceUnmuteMember, "hub.admin.members.done.voice_unmuted")}>{t("hub.admin.members.voice_unmute")}</button>
                  ) : (
                    <button className="btn-small" disabled={busy} onClick={() => void memberAction(m, props.onVoiceMuteMember, "hub.admin.members.done.voice_muted")}>{t("hub.admin.members.voice_mute")}</button>
                  )}
                </div>

                <span className="settings-label">{t("hub.admin.members.group.remove")}</span>
                <div className="settings-row" style={{ flexWrap: "wrap" }}>
                  <button className="btn-small danger" disabled={busy} onClick={() => void memberAction(m, props.onKickMember, "hub.admin.members.done.kicked")}>{t("hub.admin.members.kick")}</button>
                  <button className="btn-small danger" disabled={busy} onClick={() => void memberAction(m, props.onBanMember, "hub.admin.members.done.banned")}>{t("hub.admin.members.ban")}</button>
                </div>
              </SettingRow>
              );
            })}
            {props.members.length === 0 && <p className="muted">{t("hub.admin.members.empty")}</p>}
          </section>
        )}

        {section === "bans" && (
          <section>
            <h1>{t("hub.admin.bans.title", { count: props.bans.length })}</h1>
            {props.bans.length === 0 && <p className="muted">{t("hub.admin.bans.empty")}</p>}
            {props.bans.map((b) => (
              <SettingRow
                key={b.target_public_key}
                title={formatPubkey(b.target_public_key)}
                state={t("hub.admin.bans.state", {
                  reason: b.reason || t("hub.admin.bans.state.no_reason"),
                  when: formatRelative(b.created_at),
                })}
                {...adminRow(b.target_public_key)}
              >
                <p className="muted" style={{ marginBottom: "var(--space-3)" }}>
                  {t("hub.admin.bans.state.by", { who: formatPubkey(b.banned_by) })}
                </p>
                <button className="btn-small" onClick={() => props.onUnban(b.target_public_key)}>{t("hub.admin.bans.unban")}</button>
              </SettingRow>
            ))}
          </section>
        )}

        {section === "invites" && (
          <InviteManager
            invites={props.invites}
            activeHubUrl={props.activeHubUrl}
            myMaxPriority={props.myMaxPriority}
            isAdmin={props.isAdmin}
            supportsBoundInvites={props.supportsBoundInvites}
            onCreateInvite={props.onCreateInvite}
            onRevokeInvite={props.onRevokeInvite}
            actions={props.inviteActions}
          />
        )}

        {section === "roles" && <RolesSection actions={props.rolesActions} myMaxPriority={props.myMaxPriority} />}

        {section === "integrations" && (
          <section>
            <h1>{t("webhooks.title")}</h1>
            <WebhooksSection channels={props.channels} actions={props.webhookActions} />
            {props.renderOutgoingWebhooks?.()}
          </section>
        )}

        {section === "certifications" && (
          <CertificationsSection actions={props.certActions} />
        )}

        {section === "recovery" && (
          <section>
            <h1>{t("hub.admin.tabs.recovery")}</h1>
            {props.renderRecoveryContacts?.()}
          </section>
        )}

        {section === "soundboard" && props.canManageSoundboard && props.soundboardActions && (
          <SoundboardAdminSection actions={props.soundboardActions} />
        )}

        {section === "stickers" && props.stickersAdmin?.packs && (
          <StickerPacksSection actions={props.stickersAdmin.packs} hubUrl={props.stickersAdmin.hubUrl} />
        )}

        {section === "sticker-storage" && props.stickersAdmin?.storage && (
          <StickerStorageSection actions={props.stickersAdmin.storage} hubUrl={props.stickersAdmin.hubUrl} />
        )}

        {section === "sticker-settings" && props.stickersAdmin?.settings && (
          <StickerSettingsSection
            actions={props.stickersAdmin.settings}
            rolesActions={props.rolesActions}
            canManageRoles={props.canManageRoles}
          />
        )}

        {section === "widget" && props.widgetActions && (
          <WidgetSection actions={props.widgetActions} hubUrl={props.activeHubUrl} />
        )}

        {section === "attachments" && props.attachmentSettingsActions && (
          <AttachmentSettingsSection actions={props.attachmentSettingsActions} />
        )}

        {section === "moderation" && props.isAdmin && props.renderModerationTab?.()}

        {section === "alliances" && showAlliances && (
          <AlliancesSection
            activeHubUrl={props.activeHubUrl}
            channels={props.channels}
            actions={props.allianceActions}
            managerRoles={{
              listRoles: props.rolesActions.listRoles,
              canManageRoles: props.canManageRoles,
              myMaxPriority: props.myMaxPriority,
            }}
            canManageHubAlliances={props.canManageHubAlliances}
          />
        )}
        {section === "hub-icons" && props.isAdmin && (
          <HubIconsSection actions={props.hubIconActions} />
        )}
        {section === "hub-theme" && props.hubThemeActions && (
          <HubThemeSection actions={props.hubThemeActions} />
        )}
        {section === "hub-languages" && props.hubLanguagesActions && (
          <HubLanguagesSection actions={props.hubLanguagesActions} />
        )}
        {section === "onboarding" && props.isAdmin && (
          <OnboardingAdminSection actions={props.onboardingActions} />
        )}
        {section === "survey" && props.isAdmin && (
          <SurveyAdminSection actions={props.surveyActions} extendedKinds={props.joinFormsCapable} />
        )}
        {section === "application" && props.isAdmin && props.joinFormsCapable && props.applicationActions && (
          <SurveyAdminSection key="application" actions={props.applicationActions} purpose="application" extendedKinds />
        )}
        {section === "audit-log" && props.isAdmin && (
          <AuditLogSection actions={props.auditLogActions} members={props.members} channels={props.channels} />
        )}
      </>
    );
  }

  return (
    <SettingsShell
      title={t("hub.admin.nav.title")}
      areas={AREAS}
      sections={SECTIONS}
      activeSection={SECTIONS.some((sec) => sec.id === props.tab) ? props.tab : "overview"}
      onSection={props.onTab}
      renderSection={renderSection}
      onClose={props.onClose}
      status={props.saveError ? (
        <span className="error-text">{props.saveError}</span>
      ) : saveStatus === "saving" ? t("hub.admin.overview.saving") : saveStatus === "saved" ? t("hub.admin.overview.saved") : undefined}
    />
  );
}
