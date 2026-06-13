import { useState, useEffect } from "react";
import type { RecoveryContactEntry, RecoveryPendingRequest } from "../types";
import { formatPubkey, formatRelative } from "@voxply/utils";
import {
  getRecoveryContacts,
  setRecoveryContacts,
  removeRecoveryContact,
  listAdminRecoveryRequests,
  approveRecoveryRequest,
  denyRecoveryRequest,
} from "../platform/commands/hubAdmin";

interface Props {
  isAdmin: boolean;
}

export function RecoveryContactsSection({ isAdmin }: Props) {
  const [threshold, setThreshold] = useState(2);
  const [contacts, setContacts] = useState<RecoveryContactEntry[]>([]);
  const [contactsText, setContactsText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [requests, setRequests] = useState<RecoveryPendingRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);

  useEffect(() => {
    void loadContacts();
    if (isAdmin) void loadRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function loadContacts() {
    try {
      const s = await getRecoveryContacts();
      setThreshold(s.threshold || 2);
      setContacts(s.contacts);
      setContactsText(s.contacts.map((c) => c.pubkey).join("\n"));
    } catch { /* first load, no contacts yet */ }
  }

  async function loadRequests() {
    setLoadingRequests(true);
    setRequestsError(null);
    try {
      const reqs = await listAdminRecoveryRequests();
      setRequests(reqs);
    } catch (e) {
      setRequestsError(String(e));
    } finally {
      setLoadingRequests(false);
    }
  }

  async function handleSave() {
    const keys = contactsText.split(/[\n,]/).map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) return;
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
      setContacts((prev) => prev.filter((c) => c.pubkey !== pubkey));
      setContactsText((prev) =>
        prev
          .split(/[\n,]/)
          .map((k) => k.trim())
          .filter((k) => k !== pubkey)
          .join("\n"),
      );
    } catch { /* noop */ }
  }

  async function handleDecide(id: string, decision: "approve" | "deny") {
    try {
      if (decision === "approve") {
        await approveRecoveryRequest(id);
      } else {
        await denyRecoveryRequest(id);
      }
      await loadRequests();
    } catch (e) {
      setRequestsError(String(e));
    }
  }

  return (
    <div>
      <div className="settings-section">
        <div
          style={{ cursor: "pointer", userSelect: "none" }}
          onClick={() => setGuideOpen((g) => !g)}
        >
          <label className="settings-label" style={{ cursor: "pointer" }}>
            {guideOpen ? "▾" : "▸"} How recovery works
          </label>
        </div>
        {guideOpen && (
          <ol className="recovery-guide-steps" style={{ paddingLeft: 20, marginTop: 8 }}>
            <li><strong>Set up contacts now</strong> — add up to 5 trusted identities below while you still have your key.</li>
            <li><strong>If you lose your key</strong>, generate a new identity, then share your new public key with your recovery contacts out-of-band (phone, another app, etc.).</li>
            <li><strong>Ask each contact to attest</strong> — they go to their Settings → Account → Recovery Contacts on this hub and submit an attestation for your new key.</li>
            <li><strong>Once enough contacts have attested</strong> (at least the threshold), submit a rotation request via Settings → Account → Key rotation request.</li>
            <li><strong>The hub admin reviews and approves</strong>. Roles other than Owner can transfer; owner role requires a pre-designated successor.</li>
          </ol>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">Recovery contacts ({contacts.length}/5)</label>
        <p className="muted">
          Trusted identities who can vouch for a key rotation request to this hub's admins.
          They cannot restore access automatically — an admin still decides.
        </p>
        {contacts.map((c) => (
          <div key={c.pubkey} className="settings-row" style={{ marginBottom: 4 }}>
            <span style={{ flex: 1 }}>{formatPubkey(c.pubkey)}</span>
            <span className="muted" style={{ marginRight: 8 }}>added {formatRelative(c.added_at)}</span>
            <button
              className="btn-secondary"
              aria-label={`Remove contact ${formatPubkey(c.pubkey)}`}
              onClick={() => handleRemove(c.pubkey)}
            >
              Remove
            </button>
          </div>
        ))}
        <label className="settings-label" htmlFor="recovery-contacts-input" style={{ marginTop: 8, display: "block" }}>
          Contact pubkeys (one per line or comma-separated)
        </label>
        <textarea
          id="recovery-contacts-input"
          rows={4}
          value={contactsText}
          onChange={(e) => setContactsText(e.target.value)}
          placeholder="Enter hex pubkeys of trusted contacts…"
          style={{ width: "100%", fontFamily: "monospace", boxSizing: "border-box" }}
        />
        <div className="settings-row" style={{ marginTop: 8 }}>
          <label className="settings-label" htmlFor="recovery-threshold-input">
            Threshold (K-of-N attestations required)
          </label>
          <input
            id="recovery-threshold-input"
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
        <button
          onClick={handleSave}
          disabled={saveStatus === "saving" || !contactsText.trim()}
          style={{ marginTop: 8 }}
        >
          {saveStatus === "saving" ? "Saving…" : "Save contacts"}
        </button>
      </div>

      {isAdmin && (
        <div className="settings-section">
          <label className="settings-label">Recovery requests queue</label>
          <p className="muted">
            Rotation requests that have gathered enough attestations and await your decision.
          </p>
          {loadingRequests && <p className="muted">Loading…</p>}
          {requestsError && <p className="error-text">{requestsError}</p>}
          {!loadingRequests && requests.length === 0 && (
            <p className="muted">No pending requests.</p>
          )}
          {requests.map((req) => (
            <div
              key={req.id}
              className="settings-section"
              style={{ borderLeft: "2px solid var(--border)", paddingLeft: 12 }}
            >
              <div>
                <div><strong>Old key:</strong> <code>{formatPubkey(req.old_pubkey)}</code></div>
                <div><strong>New key:</strong> <code>{formatPubkey(req.new_pubkey)}</code></div>
                {req.reason && <div className="muted">{req.reason}</div>}
                <div className="muted">
                  Attestations: {req.attestation_count} · Status: {req.status}
                </div>
              </div>
              {(req.status === "ready_for_review" || req.status === "pending") && (
                <div className="settings-row" style={{ marginTop: 8 }}>
                  <button onClick={() => handleDecide(req.id, "approve")}>
                    Approve transfer
                  </button>
                  <button
                    className="btn-secondary danger"
                    onClick={() => handleDecide(req.id, "deny")}
                  >
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
