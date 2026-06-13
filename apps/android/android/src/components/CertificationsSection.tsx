import React, { useEffect, useState } from "react";
import type { Certification } from "../types";
import { formatRelative } from "@voxply/core";

interface Props {
  hubUrl: string;
  isAdmin: boolean;
  publicKey: string | null;
}

interface TrustedIssuer {
  pubkey: string;
  url: string;
  label: string;
}

interface CertSettings {
  cert_mode: "off" | "any" | "all";
  cert_auto_issue: boolean;
  cert_min_age_days: number;
  cert_validity_days: number;
  cert_trusted_issuers: TrustedIssuer[];
  cert_require: Record<string, unknown>;
}

export function CertificationsSection({ hubUrl, isAdmin, publicKey }: Props) {
  const [myCert, setMyCert] = useState<Certification | null>(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError, setCertError] = useState("");

  const [settings, setSettings] = useState<CertSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  const [issuerInput, setIssuerInput] = useState("");
  const [issuerUrl, setIssuerUrl] = useState("");
  const [issuerLabel, setIssuerLabel] = useState("");

  useEffect(() => {
    if (publicKey) fetchMyCert();
    if (isAdmin) fetchSettings();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubUrl, publicKey, isAdmin]);

  async function fetchMyCert() {
    setCertLoading(true);
    setCertError("");
    try {
      const res = await fetch(`${hubUrl}/certs/me`);
      if (res.status === 404) { setMyCert(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Certification = await res.json();
      setMyCert(data);
    } catch (e) {
      setCertError(String(e));
    } finally {
      setCertLoading(false);
    }
  }

  async function fetchSettings() {
    setSettingsLoading(true);
    try {
      const res = await fetch(`${hubUrl}/admin/cert-settings`);
      if (!res.ok) return;
      const data: CertSettings = await res.json();
      setSettings(data);
    } catch { /* ignore */ } finally {
      setSettingsLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    setSettingsError("");
    try {
      const res = await fetch(`${hubUrl}/admin/cert-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setSettingsError(String(e));
    } finally {
      setSavingSettings(false);
    }
  }

  function addIssuer() {
    if (!issuerInput.trim() || !issuerUrl.trim()) return;
    setSettings((s) => {
      if (!s) return s;
      return {
        ...s,
        cert_trusted_issuers: [
          ...s.cert_trusted_issuers,
          { pubkey: issuerInput.trim(), url: issuerUrl.trim(), label: issuerLabel.trim() || issuerUrl.trim() },
        ],
      };
    });
    setIssuerInput("");
    setIssuerUrl("");
    setIssuerLabel("");
  }

  function removeIssuer(pubkey: string) {
    setSettings((s) => {
      if (!s) return s;
      return { ...s, cert_trusted_issuers: s.cert_trusted_issuers.filter((i) => i.pubkey !== pubkey) };
    });
  }

  return (
    <div className="certifications-section">
      <h1>Certifications</h1>

      <div className="settings-section">
        <label className="settings-label">Your certification from this hub</label>
        {certLoading && <p className="muted">Loading…</p>}
        {certError && <p className="error-text">{certError}</p>}
        {!certLoading && !certError && myCert === null && (
          <p className="muted">No certification issued yet. Certifications are issued automatically after {30} days of good standing.</p>
        )}
        {myCert && (
          <div className="cert-card settings-row">
            <div>
              <strong>Standing:</strong> {myCert.payload.standing}
            </div>
            <div>
              <strong>Member since:</strong> {formatRelative(myCert.payload.member_since)}
            </div>
            {myCert.payload.pow_level !== null && (
              <div><strong>PoW level:</strong> {myCert.payload.pow_level}</div>
            )}
            <div>
              <strong>Expires:</strong> {formatRelative(myCert.payload.expires_at)}
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <>
          {settingsLoading && <p className="muted">Loading settings…</p>}
          {settings && (
            <>
              <div className="settings-section">
                <label className="settings-label">Auto-issue policy</label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={settings.cert_auto_issue}
                    onChange={(e) => setSettings((s) => s ? { ...s, cert_auto_issue: e.target.checked } : s)}
                  />
                  Automatically issue certs to eligible members
                </label>
                <div className="settings-row" style={{ marginTop: 8 }}>
                  <label htmlFor="cert-min-age">Min age (days):</label>
                  <input
                    id="cert-min-age"
                    type="number"
                    min={0}
                    value={settings.cert_min_age_days}
                    onChange={(e) => setSettings((s) => s ? { ...s, cert_min_age_days: Number(e.target.value) } : s)}
                    style={{ width: 80 }}
                  />
                </div>
                <div className="settings-row" style={{ marginTop: 4 }}>
                  <label htmlFor="cert-validity">Cert validity (days):</label>
                  <input
                    id="cert-validity"
                    type="number"
                    min={1}
                    value={settings.cert_validity_days}
                    onChange={(e) => setSettings((s) => s ? { ...s, cert_validity_days: Number(e.target.value) } : s)}
                    style={{ width: 80 }}
                  />
                </div>
              </div>

              <div className="settings-section">
                <label className="settings-label">Admission requirement</label>
                <select
                  value={settings.cert_mode}
                  onChange={(e) => setSettings((s) => s ? { ...s, cert_mode: e.target.value as CertSettings["cert_mode"] } : s)}
                >
                  <option value="off">Off (no cert required)</option>
                  <option value="any">Any — satisfy trusted-issuer list OR property rule</option>
                  <option value="all">All — must satisfy trusted-issuer list</option>
                </select>
              </div>

              <div className="settings-section">
                <label className="settings-label">Trusted issuers</label>
                {settings.cert_trusted_issuers.map((issuer) => (
                  <div key={issuer.pubkey} className="settings-row">
                    <span>{issuer.label} ({issuer.url})</span>
                    <button className="btn-danger btn-small" onClick={() => removeIssuer(issuer.pubkey)}>Remove</button>
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    value={issuerInput}
                    onChange={(e) => setIssuerInput(e.target.value)}
                    placeholder="Issuer pubkey (hex)"
                    style={{ marginBottom: 4 }}
                  />
                  <input
                    type="text"
                    value={issuerUrl}
                    onChange={(e) => setIssuerUrl(e.target.value)}
                    placeholder="Issuer hub URL"
                    style={{ marginBottom: 4 }}
                  />
                  <input
                    type="text"
                    value={issuerLabel}
                    onChange={(e) => setIssuerLabel(e.target.value)}
                    placeholder="Label (optional)"
                  />
                  <button className="btn-secondary" onClick={addIssuer} style={{ marginTop: 6 }}>
                    Add issuer
                  </button>
                </div>
              </div>

              {settingsError && <p className="error-text">{settingsError}</p>}
              <button
                className="btn-primary"
                onClick={saveSettings}
                disabled={savingSettings}
              >
                {savingSettings ? "Saving…" : "Save certification settings"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
