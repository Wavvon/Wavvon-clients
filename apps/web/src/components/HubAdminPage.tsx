import { useState } from "react";
import type {
  BanInfo,
  Channel,
  InviteInfo,
  MemberAdminInfo,
  PendingUser,
  RoleInfo,
} from "../types";
import { formatPubkey, formatRelative } from "@voxply/core";
import { ServerTagsSection } from "./ServerTagsSection";
import { GamesAdminSection } from "./GamesAdminSection";
import { CertificationsSection } from "./CertificationsSection";
import { RecoveryContactsSection } from "./RecoveryContactsSection";
import { WebhooksSection } from "./WebhooksSection";
import { submitToDirectory } from "../platform/commands/hubAdmin";
import { ExternalBotSection } from "./ExternalBotSection";

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
  | "games"
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
  members: MemberAdminInfo[];
  onKickMember: (publicKey: string) => void;
  onBanMember: (publicKey: string) => void;
  bans: BanInfo[];
  onUnban: (publicKey: string) => void;
  invites: InviteInfo[];
  activeHubUrl: string;
  myPubkey: string;
  isAdmin: boolean;
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

export function HubAdminPage(props: HubAdminPageProps) {
  const [copiedShare, setCopiedShare] = useState(false);
  const [dirTags, setDirTags] = useState("");
  const [dirLanguage, setDirLanguage] = useState("en");
  const [dirBio, setDirBio] = useState("");
  const [dirInviteCode, setDirInviteCode] = useState("");
  const [dirUrl, setDirUrl] = useState("https://discovery.voxply.io");
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
        dirTags.split(",").map((t) => t.trim()).filter(Boolean),
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
    { id: "overview", label: "Overview" },
    { id: "discovery", label: "Discovery" },
    { id: "tags", label: "Tags & Badges" },
    { id: "roles", label: "Roles" },
    { id: "members", label: "Members" },
    { id: "bans", label: "Bans" },
    { id: "invites", label: "Invites" },
    { id: "integrations", label: "Integrations" },
    { id: "external-bots", label: "External Bots" },
    { id: "games", label: "Games" },
    { id: "certifications", label: "Certifications" },
    { id: "recovery", label: "Recovery" },
  ];

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <h2>Hub Settings</h2>
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
        <button className="settings-nav-close" onClick={props.onClose}>Close</button>
      </aside>
      <main className="settings-content">
        <button className="settings-close-x" onClick={props.onClose} title="Close">×</button>

        {props.tab === "overview" && (
          <section>
            <h1>Hub overview</h1>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-name">Hub name</label>
              <input id="admin-hub-name" type="text" value={props.hubName} onChange={(e) => props.onHubNameChange(e.target.value)} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-hub-desc">Description</label>
              <textarea id="admin-hub-desc" rows={3} value={props.hubDescription} onChange={(e) => props.onHubDescriptionChange(e.target.value)} />
            </div>
            <div className="settings-section">
              <label className="settings-label">Membership</label>
              <label className="checkbox-label">
                <input type="checkbox" checked={props.requireApproval} onChange={(e) => props.onRequireApprovalChange(e.target.checked)} />
                Require approval to join
              </label>
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-antispam">Min. security level (anti-spam)</label>
              <input id="admin-antispam" type="number" min={0} max={9999} value={props.minSecurityLevel} onChange={(e) => props.onMinSecurityLevelChange(Number(e.target.value))} />
            </div>
            <div className="settings-section">
              <label className="settings-label" htmlFor="admin-max-depth">Max channel depth</label>
              <p className="muted">0 = unlimited. Limits how deeply channels can be nested.</p>
              <input id="admin-max-depth" type="number" min={0} max={20} value={props.maxChannelDepth} onChange={(e) => props.onMaxChannelDepthChange(Number(e.target.value))} />
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
              <label className="settings-label">Hub invite link</label>
              <div className="settings-row">
                <code className="pubkey-display">{hubToVoxplyUrl(props.activeHubUrl)}</code>
                <button onClick={() => { navigator.clipboard.writeText(hubToVoxplyUrl(props.activeHubUrl)).catch(() => {}); setCopiedShare(true); setTimeout(() => setCopiedShare(false), 2000); }}>
                  {copiedShare ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <div className="settings-section">
              <label className="settings-label">Submit to directory</label>
              <p className="muted">Make your hub discoverable at <code>{dirUrl}</code>.</p>
              <div className="settings-section">
                <label className="settings-label">Tags (comma-separated)</label>
                <input type="text" placeholder="gaming, english, casual" value={dirTags} onChange={(e) => setDirTags(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Language</label>
                <input type="text" placeholder="en" value={dirLanguage} onChange={(e) => setDirLanguage(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Bio</label>
                <textarea rows={3} placeholder="A short description for the directory…" value={dirBio} onChange={(e) => setDirBio(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Invite code (optional)</label>
                <input type="text" placeholder="Open invite code for the directory" value={dirInviteCode} onChange={(e) => setDirInviteCode(e.target.value)} />
              </div>
              <div className="settings-section">
                <label className="settings-label">Directory URL</label>
                <input type="text" value={dirUrl} onChange={(e) => setDirUrl(e.target.value)} />
              </div>
              {dirStatus === "ok" && <p className="muted" style={{ color: "var(--success)" }}>Submitted.</p>}
              {dirStatus === "error" && <p className="error-text">{dirError}</p>}
              <button onClick={handleSubmitToDirectory} disabled={dirStatus === "submitting"}>
                {dirStatus === "submitting" ? "Submitting…" : "Submit to directory"}
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
                <h2>Pending members ({props.pendingMembers.length})</h2>
                <table className="members-table">
                  <thead><tr><th>User</th><th>Since</th><th>Actions</th></tr></thead>
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
              <thead><tr><th>Name</th><th>Roles</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {props.members.map((m) => (
                  <tr key={m.public_key}>
                    <td>
                      <div>{m.display_name || "(no name)"}</div>
                      <div className="member-pk" title={m.public_key}>{formatPubkey(m.public_key)}</div>
                    </td>
                    <td>{m.roles.map((r) => r.name).join(", ") || "—"}</td>
                    <td>{formatRelative(m.first_seen_at)}</td>
                    <td>
                      <button className="btn-small" onClick={() => props.onKickMember(m.public_key)}>Kick</button>
                      <button className="btn-small danger" onClick={() => props.onBanMember(m.public_key)}>Ban</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {props.members.length === 0 && <p className="muted">No members.</p>}
          </section>
        )}

        {props.tab === "bans" && (
          <section>
            <h1>Bans ({props.bans.length})</h1>
            {props.bans.length === 0 && <p className="muted">No bans.</p>}
            {props.bans.length > 0 && (
              <table className="members-table">
                <thead><tr><th>User</th><th>Reason</th><th>When</th><th>Actions</th></tr></thead>
                <tbody>
                  {props.bans.map((b) => (
                    <tr key={b.target_public_key}>
                      <td><span className="member-pk">{formatPubkey(b.target_public_key)}</span></td>
                      <td>{b.reason || <span className="muted">—</span>}</td>
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
          <section>
            <h1>Invites</h1>
            <div className="settings-section">
              <label className="settings-label">Create invite</label>
              <div className="settings-row">
                <input
                  type="number"
                  placeholder="Max uses (blank = unlimited)"
                  value={inviteMaxUses}
                  onChange={(e) => setInviteMaxUses(e.target.value)}
                  style={{ width: 180 }}
                />
                <input
                  type="number"
                  placeholder="Expires in seconds (blank = never)"
                  value={inviteExpiry}
                  onChange={(e) => setInviteExpiry(e.target.value)}
                  style={{ width: 220 }}
                />
                <button onClick={() => props.onCreateInvite(
                  inviteMaxUses ? Number(inviteMaxUses) : null,
                  inviteExpiry ? Number(inviteExpiry) : null,
                )}>
                  Create
                </button>
              </div>
            </div>
            {props.invites.map((inv) => (
              <div key={inv.code} className="settings-row">
                <code className="pubkey-display">{inv.code}</code>
                <span className="muted">
                  {inv.uses}/{inv.max_uses ?? "∞"} uses
                  {inv.expires_at ? ` · expires ${formatRelative(inv.expires_at)}` : ""}
                </span>
                <button className="btn-secondary danger" onClick={() => props.onRevokeInvite(inv.code)}>Revoke</button>
              </div>
            ))}
          </section>
        )}

        {props.tab === "roles" && (
          <section>
            <h1>Roles</h1>
            <p className="muted">Manage roles and permissions here.</p>
            {props.roles.map((r) => (
              <div key={r.id} className="settings-row">
                <span>{r.name}</span>
                <span className="muted">{r.permissions.join(", ")}</span>
              </div>
            ))}
          </section>
        )}

        {props.tab === "integrations" && (
          <WebhooksSection channels={props.channels} />
        )}

        {props.tab === "external-bots" && (
          <ExternalBotSection channels={props.channels} />
        )}

        {props.tab === "games" && (
          <GamesAdminSection hubUrl={props.activeHubUrl} channels={props.channels} />
        )}

        {props.tab === "certifications" && (
          <CertificationsSection
            hubUrl={props.activeHubUrl}
            members={props.members.map((m) => ({ public_key: m.public_key, display_name: m.display_name }))}
          />
        )}

        {props.tab === "recovery" && (
          <section>
            <h1>Recovery</h1>
            <RecoveryContactsSection hubUrl={props.activeHubUrl} isAdmin={props.isAdmin} publicKey={null} />
          </section>
        )}
      </main>
    </div>
  );
}
