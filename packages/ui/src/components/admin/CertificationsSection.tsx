import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import type { CertAdmissionSettings, CertIssuance, CertType } from "../../types";
import { useConfirm } from "../ConfirmDialog";
import { SettingRow } from "../SettingRow";
import { IssuerHubPicker, type IssuerHub } from "../settings/IssuerHubPicker";
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
  /** Hubs to offer as issuers: the ones this client joined and this hub's
   *  alliance partners. */
  listKnownHubs: () => Promise<IssuerHub[]>;
  lookupHub: (url: string) => Promise<IssuerHub>;
}

interface Props {
  actions: CertificationsSectionActions;
}

export function CertificationsSection({ actions }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });
  const [issuances, setIssuances] = useState<CertIssuance[]>([]);
  const [settings, setSettings] = useState<CertAdmissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [manualTarget, setManualTarget] = useState("");
  const [trustedInput, setTrustedInput] = useState("");
  const [badgeTarget, setBadgeTarget] = useState("");
  const [badgeLabel, setBadgeLabel] = useState("");
  const [badgeIcon, setBadgeIcon] = useState("");
  const [badgeStatus, setBadgeStatus] = useState("");
  const [knownHubs, setKnownHubs] = useState<IssuerHub[]>([]);
  const [ownTypes, setOwnTypes] = useState<CertType[]>([]);
  const [manualType, setManualType] = useState("");
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
  }, []);

  async function handleSaveSettings() {
    if (!settings) return;
    setSaveStatus("saving");
    try {
      await actions.saveCertSettings(settings);
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
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRevoke(pubkey: string) {
    if (!(await confirm({
      title: t("hub.admin.certs.revoke_confirm", { pubkey: formatPubkey(pubkey) }),
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

  if (loading) return <section><p className="muted">{t("hub.admin.certs.loading")}</p></section>;
  if (error || !settings) return <section><h1>{t("hub.admin.certs.title")}</h1><p className="error-text">{error ?? t("hub.admin.certs.load_error")}</p></section>;

  const fastLane = settings.cert_others !== undefined;
  const goodCerts = issuances.filter((i) => i.standing === "good");

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

  const saveRow = (
    <div className="settings-row">
      <button className="btn-primary" onClick={handleSaveSettings} disabled={saveStatus === "saving"}>
        {saveStatus === "saving" ? t("hub.admin.certs.saving") : t("hub.admin.certs.save")}
      </button>
      {saveStatus === "saved" && <span className="muted">{t("hub.admin.certs.saved")}</span>}
      {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
        <span className="error-text">{saveStatus}</span>
      )}
    </div>
  );
  const revokedCerts = issuances.filter((i) => i.standing === "revoked");

  return (
    <section>
      {dialog}
      <h1>{t("hub.admin.certs.title")}</h1>
      <p className="muted">{t("hub.admin.certs.intro")}</p>

      {fastLane && (
        <SettingRow
          title={t("hub.admin.certs.admission.title")}
          state={settings.cert_trusted_issuers.length + (settings.cert_trusted_types?.length ?? 0) === 0
            ? t("hub.admin.certs.admission.state_off")
            : settings.cert_others === "refuse"
              ? t("hub.admin.certs.admission.state_refuse")
              : t("hub.admin.certs.admission.state_lobby")}
          {...row("admission")}
        >
          <CertAdmissionBlock
            settings={settings}
            onChange={setSettings}
            knownHubs={knownHubs}
            lookupHub={actions.lookupHub}
            listCertTypes={(url) => actions.listCertTypes(url)}
          />
          {saveRow}
        </SettingRow>
      )}

      {fastLane && (
        <SettingRow
          title={t("hub.admin.certs.types.title")}
          state={ownTypes.length === 0
            ? t("hub.admin.certs.types.state_none")
            : t("hub.admin.certs.types.state", { count: ownTypes.length })}
          {...row("types")}
        >
          <p className="muted">{t("hub.admin.certs.types.hint")}</p>
          {ownTypes.length > 0 && (
            <ul className="cert-admission-types">
              {ownTypes.map((ty) => (
                <li key={ty.id}>
                  <span><strong>{ty.name}</strong>{ty.description ? <span className="muted"> · {ty.description}</span> : null}</span>
                  <button type="button" className="btn-small danger" onClick={() => void removeType(ty)}>
                    {t("hub.admin.certs.types.delete")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="settings-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder={t("hub.admin.certs.types.name_placeholder")}
              aria-label={t("hub.admin.certs.types.name_placeholder")}
              style={{ flex: 1, minWidth: 160 }}
            />
            <input
              type="text"
              value={newTypeDesc}
              onChange={(e) => setNewTypeDesc(e.target.value)}
              placeholder={t("hub.admin.certs.types.desc_placeholder")}
              aria-label={t("hub.admin.certs.types.desc_placeholder")}
              style={{ flex: 2, minWidth: 200 }}
            />
            <button className="btn-secondary" onClick={() => void addType()} disabled={!newTypeName.trim()}>
              {t("hub.admin.certs.types.add")}
            </button>
          </div>
        </SettingRow>
      )}

      {!fastLane && <SettingRow
        title={t("hub.admin.certs.mode")}
        state={t(`hub.admin.certs.mode.${settings.cert_mode ?? "none"}`)}
        {...row("mode")}
      >
        <p className="muted">{t("hub.admin.certs.mode_hint")}</p>
        <select
          value={settings.cert_mode}
          onChange={(e) => setSettings({ ...settings, cert_mode: e.target.value as CertAdmissionSettings["cert_mode"] })}
        >
          <option value="none">{t("hub.admin.certs.mode.none")}</option>
          <option value="any">{t("hub.admin.certs.mode.any")}</option>
          <option value="trusted">{t("hub.admin.certs.mode.trusted")}</option>
        </select>
      </SettingRow>}

      {!fastLane && settings.cert_mode !== "none" && (
        <div className="cert-lockout-warning">
          {/* One sentence, one key. The <em> that used to sit on "None" is
              gone: splitting a sentence around emphasis gives a translator
              fragments to reorder and no way to move the emphasis with them. */}
          <strong>{t("hub.admin.certs.lockout.title")}</strong>{" "}
          {t("hub.admin.certs.lockout.body")}
        </div>
      )}

      {!fastLane && settings.cert_mode === "trusted" && (
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
              <input
                type="text"
                value={trustedInput}
                onChange={(e) => setTrustedInput(e.target.value)}
                placeholder={t("hub.admin.certs.trusted.placeholder")}
              />
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

      <SettingRow
        title={t("hub.admin.certs.auto.label")}
        state={settings.cert_auto_issue
          ? t("hub.admin.certs.state.auto_on", { days: settings.cert_min_age_days })
          : t("hub.admin.certs.state.auto_off")}
        {...row("auto")}
      >
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.cert_auto_issue}
            onChange={(e) => setSettings({ ...settings, cert_auto_issue: e.target.checked })}
          />
          {t("hub.admin.certs.auto.enable")}
        </label>
        <div className="settings-row" style={{ marginTop: 8 }}>
          <label className="settings-label">{t("hub.admin.certs.auto.min_days")}</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={settings.cert_min_age_days}
            onChange={(e) => setSettings({ ...settings, cert_min_age_days: Number(e.target.value) })}
            style={{ width: 80 }}
          />
        </div>
        <div className="settings-row" style={{ marginTop: 8 }}>
          <label className="settings-label">{t("hub.admin.certs.auto.validity")}</label>
          <input
            type="number"
            min={1}
            max={3650}
            value={settings.cert_validity_days}
            onChange={(e) => setSettings({ ...settings, cert_validity_days: Number(e.target.value) })}
            style={{ width: 80 }}
          />
        </div>

      <div className="settings-row">
        <button className="btn-primary" onClick={handleSaveSettings} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? t("hub.admin.certs.saving") : t("hub.admin.certs.save")}
        </button>
        {saveStatus === "saved" && <span className="muted">{t("hub.admin.certs.saved")}</span>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <span className="error-text">{saveStatus}</span>
        )}
      </div>
      </SettingRow>

      <SettingRow
        title={t("hub.admin.certs.manual.label")}
        state={t("hub.admin.certs.state.manual")}
        {...row("manual")}
      >
        <p className="muted">{t("hub.admin.certs.manual.hint")}</p>
        <div className="settings-row">
          <input
            type="text"
            value={manualTarget}
            onChange={(e) => setManualTarget(e.target.value)}
            placeholder={t("hub.admin.certs.manual.placeholder")}
            style={{ flex: 1 }}
          />
          {fastLane && ownTypes.length > 0 && (
            <select
              aria-label={t("hub.admin.certs.types.pick")}
              value={manualType}
              onChange={(e) => setManualType(e.target.value)}
            >
              <option value="">{t("hub.admin.certs.types.plain")}</option>
              {ownTypes.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
            </select>
          )}
          <button className="btn-primary" onClick={handleManualIssue} disabled={!manualTarget.trim()}>{t("hub.admin.certs.manual.issue")}</button>
        </div>
      </SettingRow>

      {actions.grantUserBadge && (
        <SettingRow
          title={t("hub.admin.certs.badge.label")}
          state={t("hub.admin.certs.state.badge")}
          {...row("badge")}
        >
          <p className="muted">{t("hub.admin.certs.badge.hint")}</p>
          <div className="settings-row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
            <input
              type="text"
              value={badgeTarget}
              onChange={(e) => setBadgeTarget(e.target.value)}
              placeholder={t("hub.admin.certs.manual.placeholder")}
              style={{ flex: 1, minWidth: 160 }}
            />
            <input
              type="text"
              value={badgeLabel}
              onChange={(e) => setBadgeLabel(e.target.value)}
              placeholder={t("hub.admin.certs.badge.name_placeholder")}
              aria-label={t("hub.admin.certs.badge.name_placeholder")}
              style={{ flex: 1, minWidth: 140 }}
            />
            <input
              type="text"
              value={badgeIcon}
              onChange={(e) => setBadgeIcon(e.target.value)}
              placeholder={t("hub.admin.certs.badge.icon_placeholder")}
              aria-label={t("hub.admin.certs.badge.icon_aria")}
              style={{ width: 90 }}
            />
            <button className="btn-primary" onClick={handleGrantBadge} disabled={!badgeTarget.trim() || !badgeLabel.trim()}>{t("hub.admin.certs.badge.grant")}</button>
          </div>
          {badgeStatus && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{badgeStatus}</p>}
        </SettingRow>
      )}

      <SettingRow
        title={t("hub.admin.certs.issued.label")}
        state={goodCerts.length === 0
          ? t("hub.admin.certs.state.none_issued")
          : t("hub.admin.certs.state.issued", { count: goodCerts.length })}
        meta={goodCerts.length > 0 ? String(goodCerts.length) : undefined}
        {...row("issued")}
      >
        {goodCerts.length === 0 && <p className="muted">{t("hub.admin.certs.issued.empty")}</p>}
        {goodCerts.length > 0 && (
          <table className="members-table">
            <thead>
              <tr>
                <th>{t("hub.admin.certs.col.member")}</th>
                <th>{t("hub.admin.certs.col.issued")}</th>
                <th>{t("hub.admin.certs.col.expires")}</th>
                <th>{t("hub.admin.certs.col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {goodCerts.map((c) => (
                <tr key={c.subject_pubkey + c.issued_at}>
                  <td>
                    <span className="member-pk" title={c.subject_pubkey}>
                      {formatPubkey(c.subject_pubkey)}
                    </span>
                  </td>
                  <td>{formatRelative(c.issued_at)}</td>
                  <td>{formatRelative(c.expires_at)}</td>
                  <td>
                    <button className="btn-small danger" onClick={() => handleRevoke(c.subject_pubkey)}>
                      {t("hub.admin.certs.revoke")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SettingRow>

      {revokedCerts.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">{t("hub.admin.certs.revoked.title", { count: revokedCerts.length })}</label>
          <table className="members-table">
            <thead>
              <tr><th>{t("hub.admin.certs.col.member")}</th><th>{t("hub.admin.certs.col.revoked")}</th></tr>
            </thead>
            <tbody>
              {revokedCerts.map((c) => (
                <tr key={c.subject_pubkey + c.issued_at}>
                  <td><span className="member-pk" title={c.subject_pubkey}>{formatPubkey(c.subject_pubkey)}</span></td>
                  <td>{formatRelative(c.issued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
