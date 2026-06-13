import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Hub, SyncResult } from "../types";

interface PairedIdentityInfo {
  master_pubkey: string;
  subkey_pubkey: string;
  device_label: string;
  home_hubs: string[];
}

interface PairingOffer {
  master_pubkey: string;
  home_hubs: string[];
  pairing_token: string;
  issued_at: number;
  expires_at: number;
  signature: string;
}

interface SubkeyCert {
  master_pubkey: string;
  subkey_pubkey: string;
  device_label: string;
  issued_at: number;
  not_after: number | null;
  fallback_hubs: string[];
  signature: string;
}

type PairingStatus =
  | { state: "pending" }
  | { state: "claimed"; subkey_pubkey: string; device_label: string }
  | { state: "complete"; cert: SubkeyCert; wrapped_blob_key_hex: string }
  | { state: "expired" };

type Mode = null | "offer" | "claim";
type OfferStep = "picking" | "showing" | "confirming" | "done" | "error";
type ClaimStep = "pasting" | "claiming" | "waiting" | "done" | "error";

const POLL_INTERVAL_MS = 2000;

export function PairingSection({ hubs }: { hubs: Hub[] }) {
  const [pairedId, setPairedId] = useState<PairedIdentityInfo | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode>(null);

  // --- E-side state ---
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

  // --- N-side state ---
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
    invoke<PairedIdentityInfo | null>("get_paired_identity").then(setPairedId).catch(() => setPairedId(null));
  }, []);

  // Pre-select all hubs when the picker opens
  useEffect(() => {
    if (mode === "offer" && selectedHubs.length === 0 && hubs.length > 0) {
      setSelectedHubs(hubs.map((h) => h.hub_url));
    }
  }, [mode, hubs]);

  function stopPoll() {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function reset() {
    stopPoll();
    setMode(null);
    setOfferStep("picking");
    setOfferPayload("");
    setPairingToken("");
    setHomeHubUrl("");
    setHomeHubs([]);
    setPendingClaim(null);
    setOfferError("");
    setPasteValue("");
    setDeviceLabel("");
    setClaimStep("pasting");
    setPollInfo(null);
    setClaimError("");
    setSyncResult(null);
    setCopied(false);
  }

  // --- E-side: generate offer ---
  async function handleGenerateOffer() {
    if (selectedHubs.length === 0) {
      setOfferError("Select at least one hub.");
      return;
    }
    setOfferError("");
    try {
      const result = await invoke<{
        offer: PairingOffer; qr_payload: string; posted_count: number;
      }>("start_pairing_offer", { homeHubs: selectedHubs });

      setOfferPayload(result.qr_payload);
      setPairingToken(result.offer.pairing_token);
      setHomeHubUrl(selectedHubs[0]);
      setHomeHubs(selectedHubs);
      setOfferStep("showing");
      startOfferPoll(selectedHubs[0], result.offer.pairing_token);
    } catch (e) {
      setOfferError(String(e));
    }
  }

  function startOfferPoll(hubUrl: string, token: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const status = await invoke<PairingStatus>("poll_pairing_status", {
          homeHubUrl: hubUrl,
          pairingToken: token,
        });
        if (status.state === "claimed") {
          stopPoll();
          const fp = await invoke<string>("fingerprint_pubkey", {
            publicKeyHex: status.subkey_pubkey,
          });
          setPendingClaim({
            subkeyPubkey: status.subkey_pubkey,
            deviceLabel: status.device_label,
            fingerprint: fp,
          });
          setOfferStep("confirming");
        } else if (status.state === "expired") {
          stopPoll();
          setOfferStep("error");
          setOfferError("Pairing offer expired. Generate a new code.");
        }
      } catch {
        // transient poll errors are ignored — keep retrying
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleConfirmClaim() {
    if (!pendingClaim) return;
    try {
      await invoke("complete_pairing", {
        homeHubUrl: homeHubUrl,
        pairingToken: pairingToken,
        claimSubkeyPubkey: pendingClaim.subkeyPubkey,
        deviceLabel: pendingClaim.deviceLabel,
        fallbackHubs: homeHubs,
      });
      setOfferStep("done");
    } catch (e) {
      setOfferError(String(e));
      setOfferStep("error");
    }
  }

  // --- N-side: claim ---
  async function handleClaim() {
    const label = deviceLabel.trim();
    if (!label) {
      setClaimError("Enter a device label.");
      return;
    }
    setClaimError("");
    setClaimStep("claiming");
    try {
      const offer = await invoke<PairingOffer>("parse_pairing_offer", {
        qrPayload: pasteValue,
      });
      const result = await invoke<{
        home_hub_url: string; master_pubkey: string;
        subkey_pubkey: string; subkey_secret_hex: string;
        pairing_token: string; home_hubs: string[];
      }>("claim_pairing_offer", { offer, deviceLabel: label });

      setPollInfo({
        homeHubUrl: result.home_hub_url,
        pairingToken: result.pairing_token,
        subkeyPubkey: result.subkey_pubkey,
        subkeySecretHex: result.subkey_secret_hex,
        masterPubkey: result.master_pubkey,
        homeHubs: result.home_hubs,
      });
      setClaimStep("waiting");
      startClaimPoll(result.home_hub_url, result.pairing_token, {
        subkeyPubkey: result.subkey_pubkey,
        subkeySecretHex: result.subkey_secret_hex,
        masterPubkey: result.master_pubkey,
        homeHubs: result.home_hubs,
        deviceLabel: label,
      });
    } catch (e) {
      setClaimError(String(e));
      setClaimStep("pasting");
    }
  }

  function startClaimPoll(
    hubUrl: string,
    token: string,
    saved: {
      subkeyPubkey: string; subkeySecretHex: string;
      masterPubkey: string; homeHubs: string[]; deviceLabel: string;
    }
  ) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const status = await invoke<PairingStatus>("poll_pairing_status", {
          homeHubUrl: hubUrl,
          pairingToken: token,
        });
        if (status.state === "complete") {
          stopPoll();
          const result = await invoke<SyncResult>("save_paired_identity", {
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
          stopPoll();
          setClaimError("Pairing offer expired before confirmation.");
          setClaimStep("pasting");
        }
      } catch {
        // ignore transient errors
      }
    }, POLL_INTERVAL_MS);
  }

  // clean up poll on unmount
  useEffect(() => () => stopPoll(), []);

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(offerPayload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  }

  if (pairedId === undefined) return <p className="muted">Loading…</p>;

  return (
    <div className="settings-section">
      {pairedId ? (
        <div className="pairing-status-card paired">
          <span className="pairing-status-icon">🔗</span>
          <div>
            <strong>This device is paired</strong>
            <p className="muted">
              Device: <strong>{pairedId.device_label}</strong> &mdash;{" "}
              master {pairedId.master_pubkey.slice(0, 16)}…
            </p>
          </div>
        </div>
      ) : (
        <div className="pairing-status-card legacy">
          <span className="pairing-status-icon">🔑</span>
          <div>
            <strong>Single-device identity</strong>
            <p className="muted">
              This device uses a standalone identity. Pair it with another
              device to share your identity across machines.
            </p>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="pairing-action-row">
          <button onClick={() => setMode("offer")}>
            Pair a new device…
          </button>
          <button className="btn-secondary" onClick={() => setMode("claim")}>
            Pair this device with another…
          </button>
        </div>
      )}

      {/* E-side: generate an offer for a new device to scan */}
      {mode === "offer" && (
        <div className="pairing-flow">
          <h3>Pair a new device</h3>

          {offerStep === "picking" && (
            <>
              <p className="muted">
                Select the hubs that will relay the pairing handshake. The new
                device will contact them to complete pairing.
              </p>
              <div className="pairing-hub-list">
                {hubs.map((h) => (
                  <label key={h.hub_id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedHubs.includes(h.hub_url)}
                      onChange={(e) =>
                        setSelectedHubs((prev) =>
                          e.target.checked
                            ? [...prev, h.hub_url]
                            : prev.filter((u) => u !== h.hub_url)
                        )
                      }
                    />
                    {h.hub_name} <span className="muted">({h.hub_url})</span>
                  </label>
                ))}
                {hubs.length === 0 && (
                  <p className="muted">Add at least one hub before pairing.</p>
                )}
              </div>
              {offerError && <p className="error-text">{offerError}</p>}
              <div className="pairing-action-row">
                <button
                  onClick={handleGenerateOffer}
                  disabled={selectedHubs.length === 0}
                >
                  Generate pairing code
                </button>
                <button className="btn-secondary" onClick={reset}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {offerStep === "showing" && (
            <>
              <p className="muted">
                Copy this code and paste it on the new device under "Pair this
                device with another…". The code expires in 4 minutes.
              </p>
              <textarea
                className="pairing-code-area"
                readOnly
                value={offerPayload}
                rows={6}
              />
              <div className="pairing-action-row">
                <button onClick={copyPayload}>
                  {copied ? "Copied!" : "Copy pairing code"}
                </button>
                <button className="btn-secondary" onClick={reset}>
                  Cancel
                </button>
              </div>
              <p className="muted pairing-waiting">
                ⏳ Waiting for the new device to scan…
              </p>
            </>
          )}

          {offerStep === "confirming" && pendingClaim && (
            <>
              <p>
                <strong>{pendingClaim.deviceLabel}</strong> wants to pair with
                this identity.
              </p>
              <p className="muted">
                Fingerprint:{" "}
                <code className="pairing-fingerprint">{pendingClaim.fingerprint}</code>
              </p>
              <p className="muted">
                Verify this fingerprint matches what the new device shows before
                confirming.
              </p>
              <div className="pairing-action-row">
                <button onClick={handleConfirmClaim}>Confirm pairing</button>
                <button className="btn-secondary" onClick={reset}>
                  Deny
                </button>
              </div>
            </>
          )}

          {offerStep === "done" && (
            <>
              <p>✅ Device paired successfully.</p>
              <p className="muted">
                The new device can now connect to your hubs using your identity.
              </p>
              <button onClick={reset}>Done</button>
            </>
          )}

          {offerStep === "error" && (
            <>
              <p className="error-text">{offerError}</p>
              <button onClick={reset}>Back</button>
            </>
          )}
        </div>
      )}

      {/* N-side: claim an offer from an existing device */}
      {mode === "claim" && (
        <div className="pairing-flow">
          <h3>Pair this device with another</h3>

          {(claimStep === "pasting" || claimStep === "claiming") && (
            <>
              <p className="muted">
                On your existing device, open Settings → Devices → "Pair a new
                device…" and copy the pairing code. Paste it below.
              </p>
              <textarea
                className="pairing-code-area"
                placeholder="Paste pairing code here…"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                rows={6}
                disabled={claimStep === "claiming"}
              />
              <div className="settings-section">
                <label className="settings-label" htmlFor="pairing-device-label">Device label</label>
                <input
                  id="pairing-device-label"
                  type="text"
                  placeholder="e.g. My Laptop"
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  disabled={claimStep === "claiming"}
                />
              </div>
              {claimError && <p className="error-text">{claimError}</p>}
              <div className="pairing-action-row">
                <button
                  onClick={handleClaim}
                  disabled={
                    claimStep === "claiming" ||
                    !pasteValue.trim() ||
                    !deviceLabel.trim()
                  }
                >
                  {claimStep === "claiming" ? "Pairing…" : "Pair this device"}
                </button>
                <button className="btn-secondary" onClick={reset}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {claimStep === "waiting" && (
            <>
              <p className="muted">
                ⏳ Waiting for your existing device to confirm the pairing…
              </p>
              <p className="muted">
                On the existing device, accept the pairing request.
              </p>
              <button className="btn-secondary" onClick={reset}>
                Cancel
              </button>
            </>
          )}

          {claimStep === "done" && (
            <>
              <p>✅ This device is now paired.</p>
              {syncResult?.synced ? (
                <p className="muted">Done! Preferences synced from your other device.</p>
              ) : (
                <p className="muted">
                  {"Done! (Preferences sync skipped"}
                  {syncResult?.error ? `: ${syncResult.error}` : ""}
                  {")"}
                </p>
              )}
              <p className="muted">
                Restart Voxply to connect with your shared identity.
              </p>
              <button onClick={reset}>Done</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
