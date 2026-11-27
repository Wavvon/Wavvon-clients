import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import type { CertAdmissionSettings, CertIssuance, CertType, MemberAdminInfo, RoleInfo } from "../../types";
import { useConfirm } from "../ConfirmDialog";
import { IssuerHubPicker, type IssuerHub } from "../settings/IssuerHubPicker";
import { BadgeCatalogue } from "./BadgeCatalogue";
import type { BadgeCatalogueActions } from "./BadgeCatalogueActions";
import { CertAdmissionBlock } from "./CertAdmissionBlock";

export interface CertificationsSectionActions {
  listCertIssuances: () => Promise<CertIssuance[]>;
  getCertSettings: () => Promise<CertAdmissionSettings>;
  saveCertSettings: (settings: CertAdmissionSettings) => Promise<void>;
  /** `certType` names a type from this hub's catalogue; absent issues a
   *  plain standing certificate. */
  issueCertManual: (subjectPubkey: string, certType?: string) => Promise<void>;
  /** A hub's catalogue by base URL; no URL reads this hub's own. Used only on
   *  hubs with certified admission. */
  listCertTypes: (hubUrl?: string) => Promise<CertType[]>;
  createCertType: (name: string, description?: string) => Promise<void>;
  deleteCertType: (id: string) => Promise<void>;
  revokeCert: (subjectPubkey: string) => Promise<void>;
  /** Member-badge grants use a separate hub route from hub-to-hub badges
   *  (ServerTagsSection); omitted where the Tauri command doesn't exist yet.
   *  `icon` is optional — desktop's Tauri command doesn't accept it yet. */
  grantUserBadge?: (subjectPubkey: string, label: string, description?: string, icon?: string) => Promise<void>;
  /** Present only on hubs advertising `badges.catalogue`; replaces the one-off
   *  grant form in the Badges tab. */
  badgeCatalogue?: BadgeCatalogueActions;
  /** Hubs to offer as issuers: the ones this client joined and this hub's
   *  alliance partners. */
  listKnownHubs: () => Promise<IssuerHub[]>;
  lookupHub: (url: string) => Promise<IssuerHub>;
}

interface Props {
  actions: CertificationsSectionActions;
  members?: MemberAdminInfo[];
  listRoles?: () => Promise<RoleInfo[]>;
}

type Tab = "issued" | "badges" | "admission";

/** Hub settings › Certifications: what this hub signs (Issued), the badges it
 *  hands out (Badges), and whose certificates let a newcomer in (Admission). */
export function CertificationsSection({ actions, members = [], listRoles }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [tab, setTab] = useState<Tab>("issued");
  const [issuances, setIssuances] = useState<CertIssuance[]>([]);
  const [settings, setSettings] = useState<CertAdmissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [editingAuto, setEditingAuto] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [manualTarget, setManualTarget] = useState("");
  const [manualType, setManualType] = useState("");
  const [query, setQuery] = useState("");
  const [trustedInput, setTrustedInput] = useState("");
  const [badgeTarget, setBadgeTarget] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [badgeIcon, setBadgeIcon] = useState("");
  const [badgeStatus, setBadgeStatus] = useState("");
  const [badgeCount, setBadgeCount] = useState<number | null>(null);
  const [knownHubs, setKnownHubs] = useState<IssuerHub[]>([]);
  const [ownTypes, setOwnTypes] = useState<CertType[]>([]);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDesc, setNewTypeDesc] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [iss, sett] = await Promise.all([actions.listCertIssuances(), actions.getCertSettings()]);
      setIssuances(iss);
      setSettings(sett);
      // A hub with certified admission answers with `cert_others`.
      if (sett.cert_others !== undefined) setOwnTypes(await actions.listCertTypes().catch(() => []));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    actions.listKnownHubs().then(setKnownHubs).catch(() => setKnownHubs([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(next: CertAdmissionSettings) {
    setSaveStatus("saving");
    try {
      await actions.saveCertSettings(next);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleManualIssue() {
    const target = manualTarget.trim();
    if (!target) return;
    try {
      await actions.issueCertManual(target, manualType || undefined);
      setManualTarget("");
      setIssuing(false);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRevoke(pubkey: string) {
    if (!(await confirm({
      title: t("hub.admin.certs.revoke_confirm", { pubkey: nameOf(pubkey) }),
      confirmLabel: t("hub.admin.certs.revoke"),
      danger: true,
    }))) return;
    try {
      await actions.revokeCert(pubkey);
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleGrantBadge() {
    if (!actions.grantUserBadge || !badgeTarget.trim() || !badgeLabel.trim()) return;
    setBadgeStatus(t("hub.admin.certs.badge.granting"));
    try {
      await actions.grantUserBadge(badgeTarget.trim(), badgeLabel.trim(), undefined, badgeIcon.trim() || undefined);
      setBadgeStatus(t("hub.admin.certs.badge.granted", { label: badgeLabel.trim() }));
      setBadgeTarget("");
      setBadgeLabel("");
      setBadgeIcon("");
      setTimeout(() => setBadgeStatus(""), 2500);
    } catch (e) {
      setBadgeStatus(String(e));
    }
  }

  async function addType() {
    const name = newTypeName.trim();
    if (!name) return;
    try {
      await actions.createCertType(name, newTypeDesc.trim() || undefined);
      setNewTypeName("");
      setNewTypeDesc("");
      setOwnTypes(await actions.listCertTypes());
    } catch (e) {
      setError(String(e));
    }
  }

  async function removeType(type: CertType) {
    if (!(await confirm({
      title: t("hub.admin.certs.types.delete_confirm", { name: type.name }),
      confirmLabel: t("hub.admin.certs.types.delete"),
      danger: true,
    }))) return;
    try {
      await actions.deleteCertType(type.id);
      setOwnTypes(await actions.listCertTypes());
    } catch (e) {
      setError(String(e));
    }
  }

  const memberByKey = new Map(members.map((m) => [m.public_key, m]));
  function nameOf(pubkey: string) {
    return memberByKey.get(pubkey)?.display_name || formatPubkey(pubkey);
  }

  if (loading) return <section><p className="muted">{t("hub.admin.certs.loading")}</p></section>;
  if (error && !settings) return <section><h1>{t("hub.admin.certs.title")}</h1><p className="error-text">{error}</p></section>;
  if (!settings) return <section><h1>{t("hub.admin.certs.title")}</h1><p className="error-text">{t("hub.admin.certs.load_error")}</p></section>;

  const fastLane = settings.cert_others !== undefined;
  // Badges are labelled certificates; they live in the Badges tab.
  const certs = issuances.filter((i) => !i.payload?.label);
  const goodCount = certs.filter((i) => i.standing === "good").length;
  const needle = query.trim().toLowerCase();
  const shownCerts = certs
    .filter((c) => !needle || nameOf(c.subject_pubkey).toLowerCase().includes(needle) || c.subject_pubkey.includes(needle))
    .sort((a, b) => (a.standing === b.standing ? b.issued_at - a.issued_at : a.standing === "good" ? -1 : 1));
  const typeName = (id?: string | null) => (id ? ownTypes.find((x) => x.id === id)?.name ?? id : t("hub.admin.certs.types.plain"));

  const saveNote = saveStatus === "idle" ? null : (
    <span className={saveStatus === "saving" || saveStatus === "saved" ? "muted" : "error-text"}>
      {saveStatus === "saving" ? t("hub.admin.certs.saving") : saveStatus === "saved" ? t("hub.admin.certs.saved") : saveStatus}
    </span>
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "issued", label: t("hub.admin.certs.tab.issued", { count: goodCount }) },
    { id: "badges", label: badgeCount === null ? t("hub.admin.certs.tab.badges_plain") : t("hub.admin.certs.tab.badges", { count: badgeCount }) },
    { id: "admission", label: t("hub.admin.certs.tab.admission") },
  ];

  return (
    <section className="certs-admin">
      {dialog}
      <h1>{t("hub.admin.certs.title")}</h1>
      <p className="muted certs-intro">{t("hub.admin.certs.intro")}</p>
      {error && <p className="error-text">{error}</p>}

      <div className="profile-tabs certs-tabs" role="tablist" aria-label={t("hub.admin.certs.title")}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            className={`profile-tab${tab === x.id ? " active" : ""}`}
            onClick={() => setTab(x.id)}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === "issued" && (
        <div role="tabpanel" className="certs-panel">
          <div className="certs-auto">
            <span className="certs-auto-text">
              <strong>{t("hub.admin.certs.auto.title")}</strong>
              <span className="muted">
                {settings.cert_auto_issue
                  ? t("hub.admin.certs.auto.summary", { days: settings.cert_min_age_days, validity: settings.cert_validity_days })
                  : t("hub.admin.certs.auto.summary_off")}
              </span>
            </span>
            <button type="button" className="btn-secondary btn-small" aria-expanded={editingAuto} onClick={() => setEditingAuto((v) => !v)}>
              {t("hub.admin.certs.auto.edit")}
            </button>
            <input
              type="checkbox"
              role="switch"
              className="roles-switch"
              aria-label={t("hub.admin.certs.auto.title")}
              checked={settings.cert_auto_issue}
              onChange={(e) => {
                const next = { ...settings, cert_auto_issue: e.target.checked };
                setSettings(next);
                void save(next);
              }}
            />
          </div>
          {editingAuto && (
            <div className="certs-auto-edit">
              <label>
                <span className="settings-label">{t("hub.admin.certs.auto.min_days")}</span>
                <input type="number" min={1} max={3650} value={settings.cert_min_age_days}
                  onChange={(e) => setSettings({ ...settings, cert_min_age_days: Number(e.target.value) })} />
              </label>
              <label>
                <span className="settings-label">{t("hub.admin.certs.auto.validity")}</span>
                <input type="number" min={1} max={3650} value={settings.cert_validity_days}
                  onChange={(e) => setSettings({ ...settings, cert_validity_days: Number(e.target.value) })} />
              </label>
              <button type="button" className="btn-primary btn-small" onClick={() => { void save(settings); setEditingAuto(false); }}>
                {t("hub.admin.certs.save")}
              </button>
            </div>
          )}
          {saveNote}

          <div className="certs-toolbar">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("hub.admin.certs.search")}
              aria-label={t("hub.admin.certs.search")}
            />
            <span className="certs-toolbar-gap" />
            <button type="button" className="btn-primary btn-small" aria-expanded={issuing} onClick={() => setIssuing((v) => !v)}>
              {t("hub.admin.certs.issue_to")}
            </button>
          </div>
          {issuing && (
            <div className="certs-issue">
              <select
                aria-label={t("hub.admin.certs.issue_member")}
                value={memberByKey.has(manualTarget) ? manualTarget : ""}
                onChange={(e) => setManualTarget(e.target.value)}
              >
                <option value="">{t("hub.admin.certs.issue_member")}</option>
                {members.map((m) => (
                  <option key={m.public_key} value={m.public_key}>
                    {(m.display_name || t("hub.admin.members.pending.no_name"))} · {formatPubkey(m.public_key)}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={manualTarget}
                onChange={(e) => setManualTarget(e.target.value)}
                placeholder={t("hub.admin.certs.manual.placeholder")}
                aria-label={t("hub.admin.certs.manual.placeholder")}
              />
              {fastLane && ownTypes.length > 0 && (
                <select aria-label={t("hub.admin.certs.types.pick")} value={manualType} onChange={(e) => setManualType(e.target.value)}>
                  <option value="">{t("hub.admin.certs.types.plain")}</option>
                  {ownTypes.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                </select>
              )}
              <button type="button" className="btn-primary btn-small" onClick={() => void handleManualIssue()} disabled={!manualTarget.trim()}>
                {t("hub.admin.certs.manual.issue")}
              </button>
            </div>
          )}

          {certs.length === 0 ? (
            <p className="muted">{t("hub.admin.certs.issued.empty")}</p>
          ) : (
            <table className="certs-table">
              <thead>
                <tr>
                  <th scope="col">{t("hub.admin.certs.col.person")}</th>
                  <th scope="col">{t("hub.admin.certs.col.type")}</th>
                  <th scope="col">{t("hub.admin.certs.col.expires")}</th>
                  <th scope="col"><span className="sr-only">{t("hub.admin.certs.col.actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {shownCerts.map((c) => (
                  <tr key={c.id} className={c.standing === "revoked" ? "revoked" : undefined}>
                    <td>
                      <span className="certs-person">{nameOf(c.subject_pubkey)}</span>{" "}
                      <span className="member-pk" title={c.subject_pubkey}>{formatPubkey(c.subject_pubkey)}</span>
                    </td>
                    <td>{typeName(c.payload?.cert_type)}</td>
                    <td>
                      {c.standing === "revoked"
                        ? t("hub.admin.certs.revoked_ago", { when: formatRelative(c.revoked_at ?? c.issued_at) })
                        : formatRelative(c.expires_at)}
                    </td>
                    <td className="certs-actions">
                      {c.standing === "good" && (
                        <button type="button" className="btn-secondary btn-small danger" onClick={() => void handleRevoke(c.subject_pubkey)}>
                          {t("hub.admin.certs.revoke")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {fastLane && (
            <div className="certs-types">
              <h2>{t("hub.admin.certs.types.title")}</h2>
              <p className="muted">{t("hub.admin.certs.types.hint")}</p>
              {ownTypes.length > 0 && (
                <ul className="cert-admission-types">
                  {ownTypes.map((ty) => (
                    <li key={ty.id}>
                      <span><strong>{ty.name}</strong>{ty.description ? <span className="muted"> · {ty.description}</span> : null}</span>
                      <button type="button" className="btn-secondary btn-small danger" onClick={() => void removeType(ty)}>
                        {t("hub.admin.certs.types.delete")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="settings-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                <input type="text" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder={t("hub.admin.certs.types.name_placeholder")} aria-label={t("hub.admin.certs.types.name_placeholder")}
                  style={{ flex: 1, minWidth: 160 }} />
                <input type="text" value={newTypeDesc} onChange={(e) => setNewTypeDesc(e.target.value)}
                  placeholder={t("hub.admin.certs.types.desc_placeholder")} aria-label={t("hub.admin.certs.types.desc_placeholder")}
                  style={{ flex: 2, minWidth: 200 }} />
                <button type="button" className="btn-secondary btn-small" onClick={() => void addType()} disabled={!newTypeName.trim()}>
                  {t("hub.admin.certs.types.add")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "badges" && (
        <div role="tabpanel" className="certs-panel">
          {actions.badgeCatalogue ? (
            <BadgeCatalogue actions={actions.badgeCatalogue} members={members} listRoles={listRoles} onCount={setBadgeCount} />
          ) : actions.grantUserBadge ? (
            <div className="certs-legacy-badge">
              <p className="muted">{t("hub.admin.certs.badge.hint")}</p>
              <div className="settings-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
                <input type="text" value={badgeTarget} onChange={(e) => setBadgeTarget(e.target.value)}
                  placeholder={t("hub.admin.certs.manual.placeholder")} style={{ flex: 1, minWidth: 160 }} />
                <input type="text" value={badgeLabel} onChange={(e) => setBadgeLabel(e.target.value)}
                  placeholder={t("hub.admin.certs.badge.name_placeholder")} aria-label={t("hub.admin.certs.badge.name_placeholder")}
                  style={{ flex: 1, minWidth: 140 }} />
                <input type="text" value={badgeIcon} onChange={(e) => setBadgeIcon(e.target.value)}
                  placeholder={t("hub.admin.certs.badge.icon_placeholder")} aria-label={t("hub.admin.certs.badge.icon_aria")}
                  style={{ width: 90 }} />
                <button className="btn-primary" onClick={handleGrantBadge} disabled={!badgeTarget.trim() || !badgeLabel.trim()}>
                  {t("hub.admin.certs.badge.grant")}
                </button>
              </div>
              {badgeStatus && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{badgeStatus}</p>}
            </div>
          ) : (
            <p className="muted">{t("hub.admin.badges.unsupported")}</p>
          )}
        </div>
      )}

      {tab === "admission" && (
        <div role="tabpanel" className="certs-panel">
          {fastLane ? (
            <CertAdmissionBlock
              settings={settings}
              onChange={setSettings}
              knownHubs={knownHubs}
              lookupHub={actions.lookupHub}
              listCertTypes={(url) => actions.listCertTypes(url)}
            />
          ) : (
            <>
              <label className="settings-label">{t("hub.admin.certs.mode")}</label>
              <p className="muted">{t("hub.admin.certs.mode_hint")}</p>
              <select
                value={settings.cert_mode}
                onChange={(e) => setSettings({ ...settings, cert_mode: e.target.value as CertAdmissionSettings["cert_mode"] })}
              >
                <option value="none">{t("hub.admin.certs.mode.none")}</option>
                <option value="any">{t("hub.admin.certs.mode.any")}</option>
                <option value="trusted">{t("hub.admin.certs.mode.trusted")}</option>
              </select>
              {settings.cert_mode !== "none" && (
                <div className="cert-lockout-warning">
                  <strong>{t("hub.admin.certs.lockout.title")}</strong>{" "}
                  {t("hub.admin.certs.lockout.body")}
                </div>
              )}
              {settings.cert_mode === "trusted" && (
                <div className="settings-section">
                  <label className="settings-label">{t("hub.admin.certs.trusted.label")}</label>
                  <p className="muted">{t("hub.admin.certs.trusted.hint")}</p>
                  <IssuerHubPicker
                    hubs={[
                      ...knownHubs,
                      ...settings.cert_trusted_issuers
                        .filter((pk) => !knownHubs.some((h) => h.pubkey === pk))
                        .map((pk) => ({ pubkey: pk, name: formatPubkey(pk), url: settings.cert_issuer_urls?.[pk] ?? "" })),
                    ]}
                    trusted={new Set(settings.cert_trusted_issuers)}
                    // The hub's URL comes with it: an issuer with an address is one the
                    // hub can pull certificates from, not only receive them.
                    onToggle={(hub, on) => {
                      const urls = { ...(settings.cert_issuer_urls ?? {}) };
                      if (on) {
                        if (hub.url) urls[hub.pubkey] = hub.url;
                        setSettings({ ...settings, cert_trusted_issuers: [...settings.cert_trusted_issuers.filter((x) => x !== hub.pubkey), hub.pubkey], cert_issuer_urls: urls });
                      } else {
                        delete urls[hub.pubkey];
                        setSettings({ ...settings, cert_trusted_issuers: settings.cert_trusted_issuers.filter((x) => x !== hub.pubkey), cert_issuer_urls: urls });
                      }
                    }}
                    lookupHub={actions.lookupHub}
                  />
                  <details style={{ marginTop: "var(--space-3)" }}>
                    <summary className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.privacy.trusted_issuers.advanced")}</summary>
                    <div className="settings-row" style={{ marginTop: 8 }}>
                      <input type="text" value={trustedInput} onChange={(e) => setTrustedInput(e.target.value)}
                        placeholder={t("hub.admin.certs.trusted.placeholder")} />
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          const pk = trustedInput.trim();
                          if (pk && !settings.cert_trusted_issuers.includes(pk)) {
                            setSettings({ ...settings, cert_trusted_issuers: [...settings.cert_trusted_issuers, pk] });
                            setTrustedInput("");
                          }
                        }}
                        disabled={!trustedInput.trim()}
                      >
                        {t("hub.admin.certs.trusted.add")}
                      </button>
                    </div>
                  </details>
                </div>
              )}
            </>
          )}
          <div className="settings-row" style={{ marginTop: "var(--space-4)" }}>
            <button className="btn-primary" onClick={() => void save(settings)} disabled={saveStatus === "saving"}>
              {t("hub.admin.certs.save")}
            </button>
            {saveNote}
          </div>
        </div>
      )}
    </section>
  );
}
