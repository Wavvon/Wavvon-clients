import React, { useState, useEffect } from "react";
import { claimPairingOffer, isPaired } from "./pairing";

export function PairingPanel({ onClose }: { onClose: () => void }) {
  const [paired, setPaired] = useState<boolean | null>(null);
  const [deviceLabel, setDeviceLabel] = useState("My Android");
  const [offerText, setOfferText] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    isPaired().then(setPaired);
  }, []);

  async function handleClaim() {
    if (!offerText.trim() || !deviceLabel.trim()) return;
    setStatus("working");
    setMessage("Starting…");
    try {
      await claimPairingOffer(offerText.trim(), deviceLabel.trim(), setMessage);
      setStatus("done");
      setPaired(true);
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
    }
  }

  if (paired === null) return <p style={{ padding: 16, color: "var(--text-muted)" }}>Loading…</p>;

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ margin: "0 0 8px" }}>Device pairing</h3>
      {paired ? (
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            This device is paired with an existing identity.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
            To unpair, use the Devices section on your desktop or web client.
          </p>
        </div>
      ) : (
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
            On your existing device, open Settings → Devices → "Pair a new device…" and copy the pairing code. Paste it below.
          </p>
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Pairing code
          </label>
          <textarea
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
            placeholder='{"master_pubkey":"...","home_hubs":[...],...}'
            rows={5}
            disabled={status === "working" || status === "done"}
            style={{ width: "100%", marginBottom: 8, resize: "vertical", fontFamily: "monospace", fontSize: 11 }}
          />
          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
            Device label
          </label>
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="e.g. My Android"
            disabled={status === "working" || status === "done"}
            style={{ width: "100%", marginBottom: 12 }}
          />
          {message && (
            <p style={{ fontSize: 12, color: status === "error" ? "#ed4245" : "var(--text-muted)", marginBottom: 8 }}>
              {message}
            </p>
          )}
          {status === "done" ? (
            <p style={{ color: "#3ba55c", fontSize: 13, fontWeight: 600 }}>
              Paired! Restart Wavvon to reconnect with your shared identity.
            </p>
          ) : (
            <button
              onClick={handleClaim}
              disabled={status === "working" || !offerText.trim() || !deviceLabel.trim()}
              style={{ padding: "8px 16px", borderRadius: 4, cursor: "pointer", background: "var(--accent)", color: "#fff", border: "none", width: "100%" }}
            >
              {status === "working" ? "Pairing…" : "Pair this device"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
