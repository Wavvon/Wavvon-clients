import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BanInfo,
  Channel,
  InviteInfo,
  MemberAdminInfo,
  PendingUser,
} from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";
import { ServerTagsSection } from "./ServerTagsSection";
import { CertificationsSection } from "./CertificationsSection";
import { RecoveryContactsSection } from "./RecoveryContactsSection";
import { WebhooksSection } from "./WebhooksSection";
import { submitToDirectory } from "../platform/commands/hubAdmin";
import { ExternalBotSection } from "./ExternalBotSection";
import { ModerationTab } from "./ModerationTab";
import { OutgoingWebhooksSection } from "./OutgoingWebhooksSection";
import { RolesSection } from "./RolesSection";
import { SoundboardAdminSection } from "./SoundboardAdminSection";
import { AuditLogSection } from "./AuditLogSection";
import { NativeBotsSection } from "./NativeBotsSection";
import { AlliancesSection } from "./AlliancesSection";
import { HubIconsSection } from "./HubIconsSection";
import { OnboardingAdminSection } from "./OnboardingAdminSection";
import { SurveyAdminSection } from "./SurveyAdminSection";

export type HubAdminTab =
  | "overview"
  | "discovery"
  | "tags"
  | "roles"
  | "members"
  | "bans"
  | "external-bots"
  | "invites"
  | "integrations"
  | "outgoing-webhooks"
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
  onSave: () => void;
  pendingMembers: PendingUser[];
  onApproveMember: (publicKey: string) => void;
  members: MemberAdminInfo[];
  onKickMember: (publicKey: string) => void;
  onBanMember: (publicKey: string) => void;
  bans: BanInfo[];
  onUnban: (publicKey: string) => void;
  invites: InviteInfo[];
  activeHubUrl: string;
  myPubkey: string;
  isAdmin: boolean;
  canManageSoundboard: boolean;
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

export function HubAdminPage(props: HubAdminPageProps) {
  const { t } = useTranslation();
  const [copiedShare, setCopiedShare] = useState(false);
  const [dirTags, setDirTags] = useState("");
  const [dirLanguage, setDirLanguage] = useState("en");
  const [dirBio, setDirBio] = useState("");
  const [dirInviteCode, setDirInviteCode] = useState("");
  const [dirUrl, setDirUrl] = useState("https://discovery.wavvon.io");
  const [dirStatus, setDirStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [dirError, setDirError] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("");

  async function handleSubmitToDirectory() {
    setDirStatus("submitting");
    setDirError("");
    try {
      await submitToDirectory(
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

  const TABS: { id: HubAdminTab; label: string }[] = [
    { id: "overview", label: t("hub.admin.tabs.overview") },
    { id: "discovery", label: t("hub.admin.tabs.discovery") },
    { id: "tags", label: t("admin.tabs.tags") },
    { id: "roles", label: t("hub.admin.tabs.roles") },
    { id: "members", label: t("hub.admin.tabs.members") },
    { id: "bans", label: t("hub.admin.tabs.bans") },
    { id: "invites", label: t("hub.admin.tabs.invites") },
    { id: "integrations", label: t("hub.admin.tabs.integrations") },
    { id: "outgoing-webhooks", label: t("hub.admin.tabs.outgoing_webhooks") },
    { id: "external-bots", label: t("admin.tabs.external_bots") },
    { id: "certifications", label: t("admin.tabs.certifications") },
    { id: "recovery", label: t("admin.tabs.recovery") },
    ...(props.canManageSoundboard ? [{ id: "soundboard" as HubAdminTab, label: t("hub.admin.tabs.soundboard") }] : []),
    ...(props.isAdmin ? [{ id: "moderation" as HubAdminTab, label: "Moderation" }] : []),
    ...(props.isAdmin ? [
      { id: "native-bots" as HubAdminTab, label: "Bots" },
      { id: "alliances" as HubAdminTab, label: "Alliances" },
      { id: "hub-icons" as HubAdminTab, label: "Icons" },
      { id: "onboarding" as HubAdminTab, label: "Onboarding" },
      { id: "survey" as HubAdminTab, label: "Survey" },
      { id: "audit-log" as HubAdminTab, label: "Audit log" },
    ] : []),
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>{t("hub.admin.title")}</h2>
        <ul>
          {TABS.map((tab) => (
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
        <button className="settings-nav-close" onClick={props.onClose}>{t("modal.close")}</button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title={t("modal.close")}>×</button>

        {props.tab === "overview" && (
          <section>
            <h1>{t("hub.admin.overview.title")}</h1>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-name">{t("hub.admin.overview.name")}</label>
              <input id="admin-hub-name" type="text" value={props.hubName} onChange={(e) => props.onHubNameChange(e.target.value)} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-desc">{t("hub.admin.overview.description")}</label>
              <textarea id="admin-hub-desc" rows={3} value={props.hubDescription} onChange={(e) => props.onHubDescriptionChange(e.target.value)} />
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.overview.membership")}</label>
              <label className="checkbox-label">
                <input type="checkbox" checked={props.requireApproval} onChange={(e) => props.onRequireApprovalChange(e.target.checked)} />
                {t("admin.overview.require_approval_short")}
              </label>
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-antispam">{t("hub.admin.overview.antispam")}</label>
              <input id="admin-antispam" type="number" min={0} max={9999} value={props.minSecurityLevel} onChange={(e) => props.onMinSecurityLevelChange(Number(e.target.value))} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-max-depth">{t("hub.admin.overview.max_depth")}</label>
              <p className="muted">{t("hub.admin.overview.max_depth_hint")}</p>
              <input id="admin-max-depth" type="number" min={0} max={20} value={props.maxChannelDepth} onChange={(e) => props.onMaxChannelDepthChange(Number(e.target.value))} />
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
              <label className="settings-label">{t("hub.admin.discovery.share.label")}</label>
              <div className="settings-row">
                <code className="pubkey-display">{hubToWavvonUrl(props.activeHubUrl)}</code>
                <button onClick={() => { navigator.clipboard.writeText(hubToWavvonUrl(props.activeHubUrl)).catch(() => {}); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000); }}>
                  {copiedShare ? t("hub.admin.discovery.share.copied") : t("hub.admin.discovery.share.copy")}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">{t("hub.admin.discovery.directory.label")}</label>
              <p className="muted">{t("admin.discovery.directory.hint_url", { url: dirUrl })}</p>
              <div className="settings-section">
                <label className="settings-label">{t("hub.admin.discovery.directory.tags")}</label>
                <input type="text" placeholder={t("hub.admin.discovery.directory.tags_placeholder")} value={dirTags} onChange={(e) => setDirTags(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">{t("hub.admin.discovery.directory.language")}</label>
                <input type="text" placeholder="en" value={dirLanguage} onChange={(e) => setDirLanguage(e.target.value)} />
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
              {dirStatus === "ok" && <p className="muted" style={{ color: "var(--success)" }}>{t("hub.admin.discovery.directory.ok")}</p>}
              {dirStatus === "error" && <p className="error-text">{dirError}</p>}
              <button onClick={handleSubmitToDirectory} disabled={dirStatus === "submitting"}>
                {dirStatus === "submitting" ? t("hub.admin.discovery.directory.submitting") : t("hub.admin.discovery.directory.submit")}
              </button>
            </div>
          </section>
        )}

        {props.tab === "tags" && (
          <ServerTagsSection hubUrl={props.activeHubUrl} />
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
                    <td>{m.roles.map((r) => r.name).join(", ") || "—"}</td>
                    <td>{formatRelative(m.first_seen_at)}</td>
                    <td>
                      <button className="btn-small" onClick={() => props.onKickMember(m.public_key)}>{t("admin.members.kick")}</button>
                      <button className="btn-small danger" onClick={() => props.onBanMember(m.public_key)}>{t("admin.members.ban")}</button>
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
                  <th>{t("hub.admin.bans.col.when")}</th>
                  <th>{t("hub.admin.bans.col.actions")}</th>
                </tr></thead>
                <tbody>
                  {props.bans.map((b) => (
                    <tr key={b.target_public_key}>
                      <td><span className="member-pk">{formatPubkey(b.target_public_key)}</span></td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
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
          <section>
            <h1>{t("hub.admin.tabs.invites")}</h1>
            <div className="settings-section">
              <label className="settings-label">{t("invites.create.title")}</label>
              <div className="settings-row">
                <input
                  type="number"
                  placeholder={t("invites.create.max_uses_placeholder")}
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(e.target.value)}
                  style={{ width: 180 }}
                />
                <input
                  type="number"
                  placeholder={t("admin.invite.expires_placeholder")}
                  value={inviteExpiry}
                  onChange={(e) => setInviteExpiry(e.target.value)}
                  style={{ width: 220 }}
                />
                <button onClick={() => props.onCreateInvite(
                  inviteMaxUses ? Number(inviteMaxUses) : null,
                  inviteExpiry ? Number(inviteExpiry) : null,
                )}>
                  {t("invites.create.button")}
                </button>
              </div>
            </div>
            {props.invites.map((inv) => (
              <div key={inv.code} className="settings-row">
                <code className="pubkey-display">{inv.code}</code>
                <span className="muted">
                  {inv.uses}/{inv.max_uses ?? "∞"} {t("admin.invite.uses_label")}
                  {inv.expires_at ? ` · ${t("admin.invite.expires_relative", { date: formatRelative(inv.expires_at) })}` : ""}
                </span>
                <button className="btn-secondary danger" onClick={() => props.onRevokeInvite(inv.code)}>{t("invites.revoke")}</button>
              </div>
            ))}
          </section>
        )}

        {props.tab === "roles" && <RolesSection />}

        {props.tab === "integrations" && (
          <WebhooksSection channels={props.channels} />
        )}

        {props.tab === "outgoing-webhooks" && (
          <OutgoingWebhooksSection channels={props.channels} />
        )}

        {props.tab === "external-bots" && (
          <ExternalBotSection channels={props.channels} />
        )}

        {props.tab === "certifications" && (
          <CertificationsSection
            hubUrl={props.activeHubUrl}
            members={props.members.map((m) => ({ public_key: m.public_key, display_name: m.display_name }))}
          />
        )}

        {props.tab === "recovery" && (
          <section>
            <h1>{t("admin.tabs.recovery")}</h1>
            <RecoveryContactsSection hubUrl={props.activeHubUrl} isAdmin={props.isAdmin} publicKey={null} />
          </section>
        )}

        {props.tab === "soundboard" && props.canManageSoundboard && (
          <SoundboardAdminSection />
        )}

        {props.tab === "moderation" && props.isAdmin && (
          <ModerationTab />
        )}

        {props.tab === "native-bots" && props.isAdmin && <NativeBotsSection />}
        {props.tab === "alliances" && props.isAdmin && <AlliancesSection activeHubUrl={props.activeHubUrl} channels={props.channels} />}
        {props.tab === "hub-icons" && props.isAdmin && <HubIconsSection />}
        {props.tab === "onboarding" && props.isAdmin && <OnboardingAdminSection />}
        {props.tab === "survey" && props.isAdmin && <SurveyAdminSection />}
        {props.tab === "audit-log" && props.isAdmin && <AuditLogSection />}
      </main>
    </div>
  );
}
