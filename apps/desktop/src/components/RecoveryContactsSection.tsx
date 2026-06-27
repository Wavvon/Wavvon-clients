import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RecoveryContact, RotationRequest } from "../types";
import { formatPubkey, formatRelative } from "@wavvon/core";

interface Props {
  activeHubUrl: string;
}

export function RecoveryContactsSection({ activeHubUrl }: Props) {
  const [contacts, setContacts] = useState<RecoveryContact[]>([]);
  const [requests, setRequests] = useState<RotationRequest[]>([]);
  const [addPubkey, setAddPubkey] = useState("");
  const [addStatus, setAddStatus] = useState<"idle" | "adding" | "added" | string>("idle");
  const [newPubkey, setNewPubkey] = useState("");
  const [rotateStatus, setRotateStatus] = useState<"idle" | "submitting" | "submitted" | string>("idle");
  const [guideOpen, setGuideOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeHubUrl) return;
    Promise.all([
      invoke<RecoveryContact[]>("list_recovery_contacts", { hubUrl: activeHubUrl }).catch(() => [] as RecoveryContact[]),
      invoke<RotationRequest[]>("list_rotation_requests", { hubUrl: activeHubUrl }).catch(() => [] as RotationRequest[]),
    ]).then(([c, r]) => {
      setContacts(c);
      setRequests(r);
    }).finally(() => setLoading(false));
  }, [activeHubUrl]);

  async function handleAdd() {
    const pk = addPubkey.trim();
    if (!pk || contacts.length >= 5) return;
    setAddStatus("adding");
    try {
      const contact = await invoke<RecoveryContact>("add_recovery_contact", { hubUrl: activeHubUrl, pubkey: pk });
      setContacts((prev) => [...prev, contact]);
      setAddPubkey("");
      setAddStatus("added");
      setTimeout(() => setAddStatus("idle"), 2000);
    } catch (e) {
      setAddStatus(String(e));
    }
  }

  async function handleRemove(pubkey: string) {
    try {
      await invoke("remove_recovery_contact", { hubUrl: activeHubUrl, pubkey });
      setContacts((prev) => prev.filter((c) => c.pubkey !== pubkey));
    } catch {
      // noop
    }
  }

  async function handleRotationRequest() {
    const pk = newPubkey.trim();
    if (!pk) return;
    setRotateStatus("submitting");
    try {
      const req = await invoke<RotationRequest>("submit_rotation_request", { hubUrl: activeHubUrl, newPubkey: pk });
      setRequests((prev) => [req, ...prev]);
      setNewPubkey("");
      setRotateStatus("submitted");
      setTimeout(() => setRotateStatus("idle"), 2000);
    } catch (e) {
      setRotateStatus(String(e));
    }
  }

  if (loading) return <p className="muted">Loading recovery contacts…</p>;

  return (
    <div>
      <div className="settings-section">
        <div className="recovery-guide-header" onClick={() => setGuideOpen(g => !g)} style={{ cursor: "pointer", userSelect: "none" }}>
          <label className="settings-label" style={{ cursor: "pointer" }}>
            {guideOpen ? "▾" : "▸"} How recovery works
          </label>
        </div>
        {guideOpen && (
          <ol className="recovery-guide-steps">
            <li><strong>Set up contacts now</strong> — add 3–5 trusted identities below while you still have access to your key.</li>
            <li><strong>If you lose your key</strong>, generate a new identity on the restore screen.</li>
            <li><strong>Share your new public key out-of-band</strong> with your recovery contacts (e.g. by phone or another messaging app).</li>
            <li><strong>Ask each contact to attest</strong> — they go to their Settings → Security → Recovery Contacts on this hub and submit an attestation for your new key.</li>
            <li><strong>Once enough contacts have attested</strong> (the threshold is set by the hub admin), submit a rotation request below.</li>
            <li><strong>The hub admin reviews and approves</strong> the request. Roles other than Owner can transfer; owner role requires a pre-designated successor.</li>
          </ol>
        )}
      </div>
      <div className="settings-section">
        <label className="settings-label">Recovery contacts ({contacts.length}/5)</label>
        <p className="muted">
          Trusted identities who can vouch for a key rotation request to this hub's admins. They do not restore access automatically — their attestations are reviewed by a human admin.
        </p>
        {contacts.map((c) => (
          <div key={c.pubkey} className="settings-row" style={{ marginBottom: 4 }}>
            <span>{c.display_name ?? formatPubkey(c.pubkey)}</span>
            <span className="muted" style={{ marginLeft: 8 }}>added {formatRelative(c.added_at)}</span>
            <button className="btn-secondary" onClick={() => handleRemove(c.pubkey)}>Remove</button>
          </div>
        ))}
        {contacts.length < 5 && (
          <div className="settings-row" style={{ marginTop: 8 }}>
            <input
              type="text"
              value={addPubkey}
              onChange={(e) => setAddPubkey(e.target.value)}
              placeholder="Contact pubkey (hex)"
            />
            <button className="btn-secondary" onClick={handleAdd} disabled={addStatus === "adding" || !addPubkey.trim()}>
              {addStatus === "adding" ? "Adding…" : "Add contact"}
            </button>
          </div>
        )}
        {addStatus === "added" && <p className="muted">Contact added.</p>}
        {addStatus !== "idle" && addStatus !== "adding" && addStatus !== "added" && (
          <p className="error-text">{addStatus}</p>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">Key rotation request</label>
        <p className="muted">
          If you have lost access to your old key and enough recovery contacts attest to your new key, the hub admin will be notified to review the request.
        </p>
        <div className="settings-row">
          <input
            type="text"
            value={newPubkey}
            onChange={(e) => setNewPubkey(e.target.value)}
            placeholder="Your new pubkey (hex)"
          />
          <button onClick={handleRotationRequest} disabled={rotateStatus === "submitting" || !newPubkey.trim()}>
            {rotateStatus === "submitting" ? "Submitting…" : "Request rotation"}
          </button>
        </div>
        {rotateStatus === "submitted" && <p className="muted">Request submitted. Ask your contacts to attest.</p>}
        {rotateStatus !== "idle" && rotateStatus !== "submitting" && rotateStatus !== "submitted" && (
          <p className="error-text">{rotateStatus}</p>
        )}
        {requests.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {requests.map((r) => (
              <div key={r.id} className="settings-section" style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 8 }}>
                <div>New pubkey: <code>{formatPubkey(r.new_pubkey)}</code></div>
                <div className="muted">Attestations: {r.attestations.length} / {r.threshold} required</div>
                <div className="muted">Submitted {formatRelative(r.submitted_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
