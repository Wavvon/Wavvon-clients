import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import type { CertAdmissionSettings, CertIssuance } from "../../types";

export interface CertificationsSectionActions {
  listCertIssuances: () => Promise<CertIssuance[]>;
  getCertSettings: () => Promise<CertAdmissionSettings>;
  saveCertSettings: (settings: CertAdmissionSettings) => Promise<void>;
  issueCertManual: (subjectPubkey: string) => Promise<void>;
  revokeCert: (subjectPubkey: string) => Promise<void>;
  /** Member-badge grants use a separate hub route from hub-to-hub badges
   *  (ServerTagsSection); omitted where the Tauri command doesn't exist yet.
   *  `icon` is optional — desktop's Tauri command doesn't accept it yet. */
  grantUserBadge?: (subjectPubkey: string, label: string, description?: string, icon?: string) => Promise<void>;
}

interface Props {
  actions: CertificationsSectionActions;
}

export function CertificationsSection({ actions }: Props) {
  const { t } = useTranslation();
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

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [iss, sett] = await Promise.all([actions.listCertIssuances(), actions.getCertSettings()]);
      setIssuances(iss);
      setSettings(sett);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

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
      await actions.issueCertManual(target);
      setManualTarget("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRevoke(pubkey: string) {
    if (!window.confirm(t("hub.admin.certs.revoke_confirm", { pubkey: formatPubkey(pubkey) }))) return;
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

  const goodCerts = issuances.filter((i) => i.standing === "good");
  const revokedCerts = issuances.filter((i) => i.standing === "revoked");

  return (
    <section>
      <h1>{t("hub.admin.certs.title")}</h1>
      <p className="muted">{t("hub.admin.certs.intro")}</p>

      <div className="settings-section">
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
      </div>

      {settings.cert_mode !== "none" && (
        <div className="cert-lockout-warning">
          {/* One sentence, one key. The <em> that used to sit on "None" is
              gone: splitting a sentence around emphasis gives a translator
              fragments to reorder and no way to move the emphasis with them. */}
          <strong>{t("hub.admin.certs.lockout.title")}</strong>{" "}
          {t("hub.admin.certs.lockout.body")}
        </div>
      )}

      {settings.cert_mode === "trusted" && (
        <div className="settings-section">
          <label className="settings-label">{t("hub.admin.certs.trusted.label")}</label>
          <p className="muted">{t("hub.admin.certs.trusted.hint")}</p>
          {settings.cert_trusted_issuers.map((pk) => (
            <div key={pk} className="settings-row" style={{ marginBottom: 4, gap: 6 }}>
              <code className="pubkey-display">{formatPubkey(pk)}</code>
              {/* An address is what makes trust usable: without one the hub
                  can only honour a cert someone pushed, and nothing pushes.
                  Optional on purpose — an issuer with no URL is still
                  trusted, just not pullable. */}
              <input
                type="text"
                value={settings.cert_issuer_urls?.[pk] ?? ""}
                onChange={(e) => {
                  const urls = { ...(settings.cert_issuer_urls ?? {}) };
                  const url = e.target.value.trim();
                  if (url) urls[pk] = url; else delete urls[pk];
                  setSettings({ ...settings, cert_issuer_urls: urls });
                }}
                placeholder={t("hub.admin.certs.trusted.url_placeholder")}
                style={{ flex: 1 }}
              />
              <button
                className="btn-secondary"
                onClick={() => {
                  const urls = { ...(settings.cert_issuer_urls ?? {}) };
                  delete urls[pk];
                  setSettings({
                    ...settings,
                    cert_trusted_issuers: settings.cert_trusted_issuers.filter((x) => x !== pk),
                    cert_issuer_urls: urls,
                  });
                }}
              >
                {t("hub.admin.certs.trusted.remove")}
              </button>
            </div>
          ))}
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
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.certs.auto.label")}</label>
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
      </div>

      <div className="settings-row" style={{ marginBottom: 16 }}>
        <button onClick={handleSaveSettings} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? t("hub.admin.certs.saving") : t("hub.admin.certs.save")}
        </button>
        {saveStatus === "saved" && <span className="muted">{t("hub.admin.certs.saved")}</span>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <span className="error-text">{saveStatus}</span>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.certs.manual.label")}</label>
        <p className="muted">{t("hub.admin.certs.manual.hint")}</p>
        <div className="settings-row">
          <input
            type="text"
            value={manualTarget}
            onChange={(e) => setManualTarget(e.target.value)}
            placeholder={t("hub.admin.certs.manual.placeholder")}
            style={{ flex: 1 }}
          />
          <button onClick={handleManualIssue} disabled={!manualTarget.trim()}>{t("hub.admin.certs.manual.issue")}</button>
        </div>
      </div>

      {actions.grantUserBadge && (
        <div className="settings-section">
          <label className="settings-label">{t("hub.admin.certs.badge.label")}</label>
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
            <button onClick={handleGrantBadge} disabled={!badgeTarget.trim() || !badgeLabel.trim()}>{t("hub.admin.certs.badge.grant")}</button>
          </div>
          {badgeStatus && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{badgeStatus}</p>}
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.certs.issued.title", { count: goodCerts.length })}</label>
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
      </div>

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
