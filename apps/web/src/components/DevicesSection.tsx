import { useCallback, useEffect, useRef, useState } from "react";
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
        setOffer({ phase: "error", message: "The pairing offer expired. Start again." });
      }
    }, 2000);
  }

  // Existing device: approve the claim by issuing the new device a cert.
  async function approve() {
    if (!d || offer.phase !== "claimed") return;
    const { hubUrl, token, subkeyPubkey, label } = offer;
    setOffer({ phase: "completing" });
    try {
      const issuedAt = Math.floor(Date.now() / 1000);
      const cert = buildSubkeyCert(d.masterSeed, d.masterPubkey, subkeyPubkey, label, issuedAt, null, [hubUrl]);
      // No prefs-blob handoff yet — the new device joins fresh. When the web
      // gains a synced prefs blob, wrap its key for subkeyPubkey here.
      await postPairingComplete(hubUrl, { pairing_token: token, cert, wrapped_blob_key_hex: "" });
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
      <label className="settings-label">Devices</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        Link more devices to this identity. Each device keeps its own key; a shared master key ties them together so
        every device is recognised as you.
      </p>

      {!d.enabled ? (
        <button className="btn-primary" onClick={enableMultiDevice} disabled={busy}>
          {busy ? "Enabling…" : "Enable multi-device"}
        </button>
      ) : (
        <>
          <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              Master key: {d.masterPubkey.slice(0, 16)}…
            </span>
          </div>

          {certs.length === 0 ? (
            <p className="muted">No linked devices registered on this hub yet.</p>
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
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}> · this device</span>
                  )}
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}> — {c.subkey_pubkey.slice(0, 12)}…</span>
                </span>
                {c.subkey_pubkey !== d.devicePubkey && (
                  <button className="btn-small btn-secondary danger" onClick={() => revoke(c)} disabled={busy}>
                    Revoke
                  </button>
                )}
              </div>
            ))
          )}

          <div className="settings-section" style={{ marginTop: "var(--space-2)" }}>
            <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>Pair a new device</label>
            {offer.phase === "idle" && (
              <button className="btn-secondary" onClick={startPairing} disabled={!activeHubUrl}>
                Start pairing
              </button>
            )}
            {offer.phase === "waiting" && pairingCode && (
              <div>
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  On your other device, choose “Pair with an existing device” and paste this code. It expires in 5 minutes.
                </p>
                <textarea
                  readOnly
                  aria-label="Pairing code"
                  value={pairingCode}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ width: "100%", fontFamily: "monospace", fontSize: "var(--text-xs)", minHeight: 60 }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="btn-small btn-secondary" onClick={() => navigator.clipboard.writeText(pairingCode)}>
                    Copy code
                  </button>
                  <button className="btn-small btn-secondary" onClick={resetOffer}>Cancel</button>
                </div>
                <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>Waiting for the other device…</p>
              </div>
            )}
            {offer.phase === "claimed" && (
              <div>
                <p style={{ fontSize: "var(--text-sm)" }}>
                  <strong>{offer.label}</strong> wants to link (
                  <span className="muted">{offer.subkeyPubkey.slice(0, 12)}…</span>). Approve only if you started this.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-primary" onClick={approve}>Approve</button>
                  <button className="btn-small btn-secondary" onClick={resetOffer}>Reject</button>
                </div>
              </div>
            )}
            {offer.phase === "completing" && <p className="muted">Linking…</p>}
            {offer.phase === "done" && (
              <p style={{ fontSize: "var(--text-sm)" }}>
                Linked <strong>{offer.label}</strong> ✓ <button className="btn-small btn-secondary" onClick={resetOffer}>Done</button>
              </p>
            )}
            {offer.phase === "error" && (
              <p className="error-text">
                {offer.message} <button className="btn-small btn-secondary" onClick={resetOffer}>Reset</button>
              </p>
            )}
          </div>
        </>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
