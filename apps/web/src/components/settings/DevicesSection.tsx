import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { bytesToHex } from "@wavvon/core";
import {
  loadIdentity,
  saveIdentity,
  publicKeyHex,
  masterSeedHex,
  masterPublicKeyHex,
  buildSubkeyCert,
  buildRevocation,
  buildPairingOffer,
  dhKeypairFromSeed,
  wrapBlobKey,
  type SubkeyCert,
  type PairingStatus,
} from "@identity/index";
import {
  listDeviceCerts,
  registerDeviceCert,
  postDeviceRevocation,
  postPairingOffer,
  getPairingStatus,
  postPairingComplete,
  upgradeActiveHubIdentity,
} from "@platform";

interface Props {
  activeHubUrl?: string;
}

interface Derived {
  seedHex: string; // this device's subkey seed
  devicePubkey: string; // this device's subkey pubkey (= subkey 0)
  masterSeed: string;
  masterPubkey: string;
  enabled: boolean; // multi-device opted in (a self-cert is stored)
}

type OfferState =
  | { phase: "idle" }
  | { phase: "waiting"; token: string; hubUrl: string }
  | { phase: "claimed"; token: string; hubUrl: string; subkeyPubkey: string; label: string }
  | { phase: "completing" }
  | { phase: "done"; label: string }
  | { phase: "error"; message: string };

function randomToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32))); // 64 hex chars
}

// Multi-device identity: register/list this master's device certs, opt into
// pairing, and pair a new device by issuing it a master-signed cert. This
// device's own key is subkey 0 (its pubkey equals the legacy identity pubkey).
export function DevicesSection({ activeHubUrl }: Props) {
  const { t } = useTranslation();
  const [d, setD] = useState<Derived | null>(null);
  const [certs, setCerts] = useState<SubkeyCert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<OfferState>({ phase: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshCerts = useCallback(async (masterPubkey: string) => {
    try {
      setCerts(await listDeviceCerts(masterPubkey));
    } catch {
      /* 404 / unreachable — leave list as-is */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await loadIdentity();
      if (!rec || cancelled) return;
      const derived: Derived = {
        seedHex: rec.seed_hex,
        devicePubkey: publicKeyHex(rec.seed_hex),
        masterSeed: masterSeedHex(rec.seed_hex),
        masterPubkey: masterPublicKeyHex(rec.seed_hex),
        enabled: !!rec.subkey_cert,
      };
      setD(derived);
      if (derived.enabled) void refreshCerts(derived.masterPubkey);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCerts]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Opt into multi-device: self-issue a cert for this device (subkey 0) under
  // the master, persist it, and register it on the hub. From the next hub
  // connection on, auth presents the cert so every device resolves to one
  // canonical identity.
  async function enableMultiDevice() {
    if (!d) return;
    setBusy(true);
    setError(null);
    try {
      const issuedAt = Math.floor(Date.now() / 1000);
      const fallback = activeHubUrl ? [activeHubUrl.replace(/\/+$/, "")] : [];
      const cert = buildSubkeyCert(
        d.masterSeed,
        d.masterPubkey,
        d.devicePubkey,
        "This device",
        issuedAt,
        null,
        fallback,
      );
      const rec = await loadIdentity();
      if (!rec) throw new Error("No identity");
      await saveIdentity({ ...rec, master_pubkey: d.masterPubkey, device_label: "This device", subkey_cert: cert });
      await registerDeviceCert(cert).catch(() => {
        /* registration is also done implicitly at auth; ignore hub hiccups */
      });
      // Re-auth now so the hub records the master on our row — required for a
      // newly paired device to resolve to this same canonical identity.
      await upgradeActiveHubIdentity().catch(() => {});
      setD({ ...d, enabled: true });
      await refreshCerts(d.masterPubkey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(cert: SubkeyCert) {
    if (!d) return;
    if (cert.subkey_pubkey === d.devicePubkey) return; // never revoke self here
    setBusy(true);
    setError(null);
    try {
      const entry = buildRevocation(d.masterSeed, d.masterPubkey, cert.subkey_pubkey, Math.floor(Date.now() / 1000));
      await postDeviceRevocation(entry);
      await refreshCerts(d.masterPubkey);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Existing device: create a master-signed offer, post it, and poll for the
  // new device's claim.
  async function startPairing() {
    if (!d || !activeHubUrl) return;
    const hubUrl = activeHubUrl.replace(/\/+$/, "");
    setError(null);
    try {
      const token = randomToken();
      const issuedAt = Math.floor(Date.now() / 1000);
      const offerEnvelope = buildPairingOffer(d.masterSeed, d.masterPubkey, [hubUrl], token, issuedAt, issuedAt + 300);
      await postPairingOffer(hubUrl, offerEnvelope);
      setOffer({ phase: "waiting", token, hubUrl });
      startPolling(token, hubUrl);
    } catch (e) {
      setOffer({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function startPolling(token: string, hubUrl: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      let status: PairingStatus;
      try {
        status = await getPairingStatus(hubUrl, token);
      } catch {
        return; // transient; keep polling until expiry
      }
      if (status.state === "claimed") {
        if (pollRef.current) clearInterval(pollRef.current);
        setOffer({ phase: "claimed", token, hubUrl, subkeyPubkey: status.subkey_pubkey, label: status.device_label });
      } else if (status.state === "expired") {
        if (pollRef.current) clearInterval(pollRef.current);
        setOffer({ phase: "error", message: t("settings.account.devices.error_expired") });
      }
    }, 2000);
  }

  // Existing device: approve the claim by issuing the new device a cert.
  // Also wraps this device's canonical DM DH scalar for the claiming
  // subkey (decisions.md "DH capability via a wrapped canonical scalar") so
  // the paired device can agree on E2E DM keys as the canonical identity
  // without ever holding a signing seed. Only the device that holds the
  // entropy (this device, since it derived d.masterSeed) can do this wrap —
  // d.seedHex IS that entropy.
  async function approve() {
    if (!d || offer.phase !== "claimed") return;
    const { hubUrl, token, subkeyPubkey, label } = offer;
    setOffer({ phase: "completing" });
    try {
      const issuedAt = Math.floor(Date.now() / 1000);
      const cert = buildSubkeyCert(d.masterSeed, d.masterPubkey, subkeyPubkey, label, issuedAt, null, [hubUrl]);
      const { dhPriv: canonicalDhPriv } = dhKeypairFromSeed(d.seedHex);
      const wrappedDhSeedHex = wrapBlobKey(canonicalDhPriv, subkeyPubkey);
      // No prefs-blob handoff yet — the new device joins fresh. When the web
      // gains a synced prefs blob, wrap its key for subkeyPubkey here.
      await postPairingComplete(hubUrl, {
        pairing_token: token,
        cert,
        wrapped_blob_key_hex: "",
        wrapped_dh_seed_hex: wrappedDhSeedHex,
      });
      setOffer({ phase: "done", label });
      await refreshCerts(d.masterPubkey);
    } catch (e) {
      setOffer({ phase: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function resetOffer() {
    if (pollRef.current) clearInterval(pollRef.current);
    setOffer({ phase: "idle" });
  }

  if (!d) return null;

  const pairingCode =
    offer.phase === "waiting"
      ? btoa(JSON.stringify({ hub: offer.hubUrl, token: offer.token }))
      : null;

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">{t("settings.account.devices.label")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        {t("settings.account.devices.hint")}
      </p>

      {!d.enabled ? (
        <button className="btn-primary" onClick={enableMultiDevice} disabled={busy}>
          {busy ? t("settings.account.devices.enabling") : t("settings.account.devices.enable_button")}
        </button>
      ) : (
        <>
          <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {t("settings.account.devices.master_key_label", { key: d.masterPubkey.slice(0, 16) })}
            </span>
          </div>

          {certs.length === 0 ? (
            <p className="muted">{t("settings.account.devices.empty")}</p>
          ) : (
            certs.map((c) => (
              <div
                key={c.subkey_pubkey}
                className="settings-row"
                style={{ alignItems: "center", justifyContent: "space-between", gap: 6 }}
              >
                <span>
                  <strong>{c.device_label}</strong>
                  {c.subkey_pubkey === d.devicePubkey && (
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}> · {t("settings.account.devices.this_device_suffix")}</span>
                  )}
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}> — {c.subkey_pubkey.slice(0, 12)}…</span>
                </span>
                {c.subkey_pubkey !== d.devicePubkey && (
                  <button className="btn-small btn-secondary danger" onClick={() => revoke(c)} disabled={busy}>
                    {t("settings.account.revoke_button")}
                  </button>
                )}
              </div>
            ))
          )}

          <div className="settings-section" style={{ marginTop: "var(--space-2)" }}>
            <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>{t("settings.account.devices.pair_label")}</label>
            {offer.phase === "idle" && (
              <button className="btn-secondary" onClick={startPairing} disabled={!activeHubUrl}>
                {t("settings.account.devices.start_pairing_button")}
              </button>
            )}
            {offer.phase === "waiting" && pairingCode && (
              <div>
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  {t("settings.account.devices.pair_code_hint")}
                </p>
                <textarea
                  readOnly
                  aria-label={t("settings.account.devices.pairing_code_aria")}
                  value={pairingCode}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ width: "100%", fontFamily: "monospace", fontSize: "var(--text-xs)", minHeight: 60 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="btn-small btn-secondary" onClick={() => navigator.clipboard.writeText(pairingCode)}>
                    {t("settings.account.devices.copy_code_button")}
                  </button>
                  <button className="btn-small btn-secondary" onClick={resetOffer}>{t("modal.cancel")}</button>
                </div>
                <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>{t("settings.account.devices.waiting_other")}</p>
              </div>
            )}
            {offer.phase === "claimed" && (
              <div>
                <p style={{ fontSize: "var(--text-sm)" }}>
                  <strong>{offer.label}</strong> {t("settings.account.devices.claim_wants_to_link")} (
                  <span className="muted">{offer.subkeyPubkey.slice(0, 12)}…</span>{t("settings.account.devices.claim_approve_suffix")}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={approve}>{t("hub.admin.members.pending.approve")}</button>
                  <button className="btn-small btn-secondary" onClick={resetOffer}>{t("settings.account.devices.reject_button")}</button>
                </div>
              </div>
            )}
            {offer.phase === "completing" && <p className="muted">{t("settings.account.devices.linking")}</p>}
            {offer.phase === "done" && (
              <p style={{ fontSize: "var(--text-sm)" }}>
                {t("settings.account.devices.linked_prefix")} <strong>{offer.label}</strong> ✓ <button className="btn-small btn-secondary" onClick={resetOffer}>{t("settings.account.done_button")}</button>
              </p>
            )}
            {offer.phase === "error" && (
              <p className="error-text">
                {offer.message} <button className="btn-small btn-secondary" onClick={resetOffer}>{t("settings.account.devices.reset_button")}</button>
              </p>
            )}
          </div>
        </>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
