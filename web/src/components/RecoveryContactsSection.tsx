import { useState, useEffect } from "react";
import type { RecoveryRotationRequest } from "../types";
import { formatPubkey } from "@voxply/utils";
import {
  getRecoveryContacts,
  setRecoveryContacts,
  removeRecoveryContact,
  listAdminRecoveryRequests,
  approveRecoveryRequest,
  denyRecoveryRequest,
} from "../platform/commands/hubAdmin";

interface Props {
  hubUrl: string;
  isAdmin: boolean;
  publicKey: string | null;
}

export function RecoveryContactsSection({ hubUrl: _hubUrl, isAdmin, publicKey: _publicKey }: Props) {
  const [threshold, setThreshold] = useState(2);
  const [contactsText, setContactsText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [requests, setRequests] = useState<RecoveryRotationRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  useEffect(() => {
    void loadContacts();
    if (isAdmin) void loadRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function loadContacts() {
    try {
      const s = await getRecoveryContacts();
      setThreshold(s.threshold);
      setContactsText(s.contacts.map((c) => c.pubkey).join("\n"));
    } catch { /* first load — ignore */ }
  }

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const reqs = await listAdminRecoveryRequests();
      setRequests(reqs);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoadingRequests(false);
    }
  }

  async function handleSave() {
    const keys = contactsText.split(/[\n,]/).map((k) => k.trim()).filter(Boolean);
    setSaveStatus("saving");
    try {
      await setRecoveryContacts(threshold, keys);
      await loadContacts();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleRemove(pubkey: string) {
    try {
      await removeRecoveryContact(pubkey);
      setContactsText((prev) =>
        prev
          .split(/[\n,]/)
          .map((k) => k.trim())
          .filter((k) => k !== pubkey)
          .join("\n"),
      );
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleDecide(requestId: string, decision: "approve" | "deny") {
    try {
      if (decision === "approve") {
        await approveRecoveryRequest(requestId);
      } else {
        await denyRecoveryRequest(requestId);
      }
      await loadRequests();
    } catch (e) {
      setLoadError(String(e));
    }
  }

  return (
    <div>
      <div className="settings-section">
        <label className="settings-label">Recovery contacts for this hub</label>
        <p className="muted">
          If you lose your key, these contacts can vouch to this hub's admins that a new
          key is you. They can't take over your account — an admin still decides.
          Set this up before you need it.
        </p>
        <label className="settings-label" htmlFor="recovery-contacts">Contact pubkeys (one per line or comma-separated)</label>
        <textarea
          id="recovery-contacts"
          rows={4}
          value={contactsText}
          onChange={(e) => setContactsText(e.target.value)}
          placeholder="Enter master pubkeys of trusted contacts…"
          style={{ width: "100%", fontFamily: "monospace" }}
        />
        {contactsText.trim() && (
          <div style={{ marginTop: 4 }}>
            {contactsText.split(/[\n,]/).map((k) => k.trim()).filter(Boolean).map((pk) => (
              <div key={pk} className="settings-row" style={{ marginBottom: 2 }}>
                <code style={{ flex: 1, fontSize: "var(--text-xs)" }}>{formatPubkey(pk)}</code>
                <button className="btn-secondary" onClick={() => handleRemove(pk)}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="settings-row" style={{ marginTop: 8 }}>
          <label className="settings-label" htmlFor="recovery-threshold">Threshold (K-of-N needed)</label>
          <input
            id="recovery-threshold"
            type="number"
            min={1}
            max={20}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            style={{ width: 60 }}
          />
        </div>
        {saveStatus === "saved" && <p className="muted">Saved.</p>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <p className="error-text">{saveStatus}</p>
        )}
        <div className="settings-row">
          <button onClick={handleSave} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving…" : "Save contacts"}
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="settings-section">
          <label className="settings-label">Recovery requests queue</label>
          <p className="muted">
            Requests that have gathered enough contact attestations and await your decision.
          </p>
          {loadingRequests && <p className="muted">Loading…</p>}
          {loadError && <p className="error-text">{loadError}</p>}
          {requests.length === 0 && !loadingRequests && <p className="muted">No pending requests.</p>}
          {requests.map((req) => (
            <div key={req.id} className="settings-section" style={{ borderLeft: "2px solid var(--border)", paddingLeft: 12 }}>
              <div className="settings-row">
                <div>
                  <div><strong>Old key:</strong> <code>{formatPubkey(req.old_pubkey)}</code></div>
                  <div><strong>New key:</strong> <code>{formatPubkey(req.new_pubkey)}</code></div>
                  {req.reason && <div className="muted">{req.reason}</div>}
                  <div className="muted">
                    Attestations: {req.attestation_count} · Status: {req.status}
                  </div>
                </div>
              </div>
              {(req.status === "ready_for_review" || req.status === "pending") && (
                <div className="settings-row" style={{ marginTop: 8 }}>
                  <button onClick={() => handleDecide(req.id, "approve")}>Approve transfer</button>
                  <button className="btn-secondary danger" onClick={() => handleDecide(req.id, "deny")}>
                    Deny
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
