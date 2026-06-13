import React, { useEffect, useRef, useState } from "react";
import type { Hub } from "@shared/types";
import {
  getPairedIdentity,
  startPairingOffer,
  pollPairingStatus,
  completePairing,
  fingerprintPubkey,
  parsePairingOffer,
  claimPairingOffer,
  savePairedIdentity,
} from "@platform";
import type { PairedIdentityInfo, SyncResult } from "@platform";

type Mode = null | "offer" | "claim";
type OfferStep = "picking" | "showing" | "confirming" | "done" | "error";
type ClaimStep = "pasting" | "claiming" | "waiting" | "done" | "error";

const POLL_MS = 2000;

export function PairingSection({ hubs }: { hubs: Hub[] }) {
  const [pairedId, setPairedId] = useState<PairedIdentityInfo | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>(null);

  const [selectedHubs, setSelectedHubs] = useState<string[]>([]);
  const [offerStep, setOfferStep] = useState<OfferStep>("picking");
  const [offerPayload, setOfferPayload] = useState("");
  const [pairingToken, setPairingToken] = useState("");
  const [homeHubUrl, setHomeHubUrl] = useState("");
  const [homeHubs, setHomeHubs] = useState<string[]>([]);
  const [pendingClaim, setPendingClaim] = useState<{
    subkeyPubkey: string; deviceLabel: string; fingerprint: string;
  } | null>(null);
  const [offerError, setOfferError] = useState("");

  const [pasteValue, setPasteValue] = useState("");
  const [deviceLabel, setDeviceLabel] = useState("");
  const [claimStep, setClaimStep] = useState<ClaimStep>("pasting");
  const [pollInfo, setPollInfo] = useState<{
    homeHubUrl: string; pairingToken: string;
    subkeyPubkey: string; subkeySecretHex: string;
    masterPubkey: string; homeHubs: string[];
  } | null>(null);
  const [claimError, setClaimError] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getPairedIdentity().then(setPairedId).catch(() => setPairedId(null));
  }, []);

  useEffect(() => {
    if (mode === "offer" && selectedHubs.length === 0 && hubs.length > 0) {
      setSelectedHubs(hubs.map((h) => h.hub_url));
    }
  }, [mode, hubs]);

  function stopPoll() {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function reset() {
    stopPoll();
    setMode(null);
    setOfferStep("picking"); setOfferPayload(""); setPairingToken("");
    setHomeHubUrl(""); setHomeHubs([]); setPendingClaim(null); setOfferError("");
    setPasteValue(""); setDeviceLabel(""); setClaimStep("pasting");
    setPollInfo(null); setClaimError(""); setSyncResult(null); setCopied(false);
  }

  async function handleGenerateOffer() {
    if (selectedHubs.length === 0) { setOfferError("Select at least one hub."); return; }
    setOfferError("");
    try {
      const result = await startPairingOffer(selectedHubs);
      setOfferPayload(result.qr_payload);
      setPairingToken(result.offer.pairing_token);
      setHomeHubUrl(selectedHubs[0]);
      setHomeHubs(selectedHubs);
      setOfferStep("showing");
      startOfferPoll(selectedHubs[0], result.offer.pairing_token);
    } catch (e) { setOfferError(String(e)); }
  }

  function startOfferPoll(hubUrl: string, token: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const status = await pollPairingStatus(hubUrl, token);
        if (status.state === "claimed") {
          stopPoll();
          const fp = fingerprintPubkey(status.subkey_pubkey);
          setPendingClaim({ subkeyPubkey: status.subkey_pubkey, deviceLabel: status.device_label, fingerprint: fp });
          setOfferStep("confirming");
        } else if (status.state === "expired") {
          stopPoll(); setOfferStep("error"); setOfferError("Pairing offer expired. Generate a new code.");
        }
      } catch { /* ignore transient poll errors */ }
    }, POLL_MS);
  }

  async function handleConfirmClaim() {
    if (!pendingClaim) return;
    try {
      await completePairing(homeHubUrl, pairingToken, pendingClaim.subkeyPubkey, pendingClaim.deviceLabel, homeHubs);
      setOfferStep("done");
    } catch (e) { setOfferError(String(e)); setOfferStep("error"); }
  }

  async function handleClaim() {
    const label = deviceLabel.trim();
    if (!label) { setClaimError("Enter a device label."); return; }
    setClaimError("");
    setClaimStep("claiming");
    try {
      const offer = parsePairingOffer(pasteValue);
      const result = await claimPairingOffer(offer, label);
      setPollInfo({
        homeHubUrl: result.home_hub_url, pairingToken: result.pairing_token,
        subkeyPubkey: result.subkey_pubkey, subkeySecretHex: result.subkey_secret_hex,
        masterPubkey: result.master_pubkey, homeHubs: result.home_hubs,
      });
      setClaimStep("waiting");
      startClaimPoll(result.home_hub_url, result.pairing_token, {
        subkeyPubkey: result.subkey_pubkey, subkeySecretHex: result.subkey_secret_hex,
        masterPubkey: result.master_pubkey, homeHubs: result.home_hubs, deviceLabel: label,
      });
    } catch (e) { setClaimError(String(e)); setClaimStep("pasting"); }
  }

  function startClaimPoll(
    hubUrl: string, token: string,
    saved: { subkeyPubkey: string; subkeySecretHex: string; masterPubkey: string; homeHubs: string[]; deviceLabel: string; },
  ) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const status = await pollPairingStatus(hubUrl, token);
        if (status.state === "complete") {
          stopPoll();
          const result = await savePairedIdentity({
            masterPubkey: saved.masterPubkey,
            subkeyPubkey: saved.subkeyPubkey,
            subkeySecretHex: saved.subkeySecretHex,
            deviceLabel: saved.deviceLabel,
            cert: status.cert,
            homeHubs: saved.homeHubs,
            wrappedBlobKeyHex: status.wrapped_blob_key_hex,
          });
          setSyncResult(result);
          setClaimStep("done");
        } else if (status.state === "expired") {
          stopPoll(); setClaimError("Pairing offer expired before confirmation."); setClaimStep("pasting");
        }
      } catch { /* ignore transient errors */ }
    }, POLL_MS);
  }

  useEffect(() => () => stopPoll(), []);

  async function copyPayload() {
    try { await navigator.clipboard.writeText(offerPayload); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* noop */ }
  }

  if (pairedId === undefined) return <p className="muted">Loading…</p>;

  return (
    <div className="settings-section">
      {pairedId ? (
        <div className="pairing-status-card paired">
          <span className="pairing-status-icon">🔗</span>
          <div>
            <strong>This device is paired</strong>
            <p className="muted">Device: <strong>{pairedId.device_label}</strong> — master {pairedId.master_pubkey.slice(0, 16)}…</p>
          </div>
        </div>
      ) : (
        <div className="pairing-status-card legacy">
          <span className="pairing-status-icon">🔑</span>
          <div>
            <strong>Single-device identity</strong>
            <p className="muted">Pair with another device to share your identity across devices.</p>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="pairing-action-row">
          <button onClick={() => setMode("offer")}>Pair a new device…</button>
          <button className="btn-secondary" onClick={() => setMode("claim")}>Pair this device with another…</button>
        </div>
      )}

      {mode === "offer" && (
        <div className="pairing-flow">
          <h3>Pair a new device</h3>
          {offerStep === "picking" && (
            <>
              <p className="muted">Select the hubs that will relay the pairing handshake.</p>
              <div className="pairing-hub-list">
                {hubs.map((h) => (
                  <label key={h.hub_id} className="checkbox-label">
                    <input type="checkbox" checked={selectedHubs.includes(h.hub_url)}
                      onChange={(e) => setSelectedHubs((prev) => e.target.checked ? [...prev, h.hub_url] : prev.filter((u) => u !== h.hub_url))} />
                    {h.hub_name} <span className="muted">({h.hub_url})</span>
                  </label>
                ))}
                {hubs.length === 0 && <p className="muted">Add at least one hub before pairing.</p>}
              </div>
              {offerError && <p className="error-text">{offerError}</p>}
              <div className="pairing-action-row">
                <button onClick={handleGenerateOffer} disabled={selectedHubs.length === 0}>Generate pairing code</button>
                <button className="btn-secondary" onClick={reset}>Cancel</button>
              </div>
            </>
          )}
          {offerStep === "showing" && (
            <>
              <p className="muted">Copy this code and paste it on the new device under "Pair this device with another…". The code expires in 4 minutes.</p>
              <textarea className="pairing-code-area" readOnly value={offerPayload} rows={6} />
              <div className="pairing-action-row">
                <button onClick={copyPayload}>{copied ? "Copied!" : "Copy pairing code"}</button>
                <button className="btn-secondary" onClick={reset}>Cancel</button>
              </div>
              <p className="muted pairing-waiting">⏳ Waiting for the new device to scan…</p>
            </>
          )}
          {offerStep === "confirming" && pendingClaim && (
            <>
              <p><strong>{pendingClaim.deviceLabel}</strong> wants to pair with this identity.</p>
              <p className="muted">Fingerprint: <code className="pairing-fingerprint">{pendingClaim.fingerprint}</code></p>
              <p className="muted">Verify this fingerprint matches what the new device shows before confirming.</p>
              <div className="pairing-action-row">
                <button onClick={handleConfirmClaim}>Confirm pairing</button>
                <button className="btn-secondary" onClick={reset}>Deny</button>
              </div>
            </>
          )}
          {offerStep === "done" && (
            <>
              <p>✅ Device paired successfully.</p>
              <p className="muted">The new device can now connect using your identity.</p>
              <button onClick={reset}>Done</button>
            </>
          )}
          {offerStep === "error" && (
            <><p className="error-text">{offerError}</p><button onClick={reset}>Back</button></>
          )}
        </div>
      )}

      {mode === "claim" && (
        <div className="pairing-flow">
          <h3>Pair this device with another</h3>
          {(claimStep === "pasting" || claimStep === "claiming") && (
            <>
              <p className="muted">On your existing device, open Settings → Devices → "Pair a new device…" and copy the pairing code. Paste it below.</p>
              <textarea className="pairing-code-area" placeholder="Paste pairing code here…"
                value={pasteValue} onChange={(e) => setPasteValue(e.target.value)} rows={6}
                disabled={claimStep === "claiming"} />
              <div className="settings-section">
                <label className="settings-label" htmlFor="pairing-device-label-web">Device label</label>
                <input id="pairing-device-label-web" type="text" placeholder="e.g. My Phone"
                  value={deviceLabel} onChange={(e) => setDeviceLabel(e.target.value)}
                  disabled={claimStep === "claiming"} />
              </div>
              {claimError && <p className="error-text">{claimError}</p>}
              <div className="pairing-action-row">
                <button onClick={handleClaim} disabled={claimStep === "claiming" || !pasteValue.trim() || !deviceLabel.trim()}>
                  {claimStep === "claiming" ? "Pairing…" : "Pair this device"}
                </button>
                <button className="btn-secondary" onClick={reset}>Cancel</button>
              </div>
            </>
          )}
          {claimStep === "waiting" && (
            <>
              <p className="muted">⏳ Waiting for your existing device to confirm the pairing…</p>
              <p className="muted">On the existing device, accept the pairing request.</p>
              <button className="btn-secondary" onClick={reset}>Cancel</button>
            </>
          )}
          {claimStep === "done" && (
            <>
              <p>✅ This device is now paired.</p>
              {syncResult?.synced
                ? <p className="muted">Preferences synced from your other device.</p>
                : <p className="muted">{"Preferences sync skipped"}{syncResult?.error ? `: ${syncResult.error}` : ""}.</p>
              }
              <p className="muted">Restart the app to connect with your shared identity.</p>
              <button onClick={reset}>Done</button>
            </>
          )}
          {claimStep === "error" && (
            <><p className="error-text">{claimError}</p><button onClick={reset}>Back</button></>
          )}
        </div>
      )}
    </div>
  );
}
