import { useEffect, useRef, useState } from "react";
import { formatPubkey } from "@wavvon/core";
import type { RecoveryContactItem, RecoveryAdminRequest, RecoveryRequestBundle } from "../../types";

export type { RecoveryContactItem, RecoveryAdminRequest, RecoveryRequestBundle } from "../../types";

export interface RecoveryContactsSectionActions {
  getContacts: () => Promise<{ threshold: number; contacts: RecoveryContactItem[] }>;
  setContacts: (threshold: number, contactPubkeys: string[]) => Promise<void>;
  removeContact: (pubkey: string) => Promise<void>;

  /** Admin queue — omitted on platforms/roles where it doesn't apply. */
  listAdminRequests?: () => Promise<RecoveryAdminRequest[]>;
  approveRequest?: (id: string) => Promise<void>;
  denyRequest?: (id: string) => Promise<void>;

  /** Requester side: this device's active identity always signs as the new
   *  key (identity-recovery.md — "O-new opens the request"); the caller
   *  supplies the old (lost) pubkey. Crypto happens inside the callback so
   *  web can sign in JS and desktop can sign in Rust without ever exposing
   *  the master seed here. */
  openRotationRequest: (oldPubkey: string, reason?: string) => Promise<RecoveryRequestBundle>;
  getRotationRequest: (id: string) => Promise<RecoveryRequestBundle>;
  /** Signs the bundle as this device's active identity and submits it. */
  attestRotationRequest: (bundle: RecoveryRequestBundle) => Promise<void>;
}

interface Props {
  isAdmin: boolean;
  actions: RecoveryContactsSectionActions;
}

const POLL_MS = 5000;

export function RecoveryContactsSection({ isAdmin, actions }: Props) {
  const [threshold, setThreshold] = useState(2);
  const [contacts, setContacts] = useState<RecoveryContactItem[]>([]);
  const [contactsText, setContactsText] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");

  const [adminRequests, setAdminRequests] = useState<RecoveryAdminRequest[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [oldPubkeyInput, setOldPubkeyInput] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [openRequest, setOpenRequest] = useState<RecoveryRequestBundle | null>(null);
  const [requestStatus, setRequestStatus] = useState<"idle" | "opening" | string>("idle");

  const [lookupId, setLookupId] = useState("");
  const [reviewBundle, setReviewBundle] = useState<RecoveryRequestBundle | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"idle" | "looking" | "attesting" | "attested" | string>("idle");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void loadContacts();
    if (isAdmin && actions.listAdminRequests) void loadAdminRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (openRequest && openRequest.status === "pending") {
      pollRef.current = setInterval(() => {
        actions.getRotationRequest(openRequest.id).then(setOpenRequest).catch(() => {});
      }, POLL_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest?.id, openRequest?.status]);

  async function loadContacts() {
    try {
      const s = await actions.getContacts();
      setThreshold(s.threshold);
      setContacts(s.contacts);
      setContactsText(s.contacts.map((c) => c.pubkey).join("\n"));
    } catch { /* first load — ignore */ }
  }

  async function loadAdminRequests() {
    setAdminError(null);
    try {
      setAdminRequests(await actions.listAdminRequests!());
    } catch (e) {
      setAdminError(String(e));
    }
  }

  async function handleSave() {
    const keys = contactsText.split(/[\n,]/).map((k) => k.trim()).filter(Boolean);
    setSaveStatus("saving");
    try {
      await actions.setContacts(threshold, keys);
      await loadContacts();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleRemove(pubkey: string) {
    try {
      await actions.removeContact(pubkey);
      await loadContacts();
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleDecide(requestId: string, decision: "approve" | "deny") {
    try {
      if (decision === "approve") await actions.approveRequest!(requestId);
      else await actions.denyRequest!(requestId);
      await loadAdminRequests();
    } catch (e) {
      setAdminError(String(e));
    }
  }

  async function handleOpenRequest() {
    const oldPubkey = oldPubkeyInput.trim();
    if (!oldPubkey) return;
    setRequestStatus("opening");
    try {
      const bundle = await actions.openRotationRequest(oldPubkey, reasonInput.trim() || undefined);
      setOpenRequest(bundle);
      setRequestStatus("idle");
    } catch (e) {
      setRequestStatus(String(e));
    }
  }

  async function handleLookup() {
    const id = lookupId.trim();
    if (!id) return;
    setReviewStatus("looking");
    try {
      setReviewBundle(await actions.getRotationRequest(id));
      setReviewStatus("idle");
    } catch (e) {
      setReviewStatus(String(e));
      setReviewBundle(null);
    }
  }

  async function handleAttest() {
    if (!reviewBundle) return;
    setReviewStatus("attesting");
    try {
      await actions.attestRotationRequest(reviewBundle);
      setReviewStatus("attested");
    } catch (e) {
      setReviewStatus(String(e));
    }
  }

  return (
    <div>
      <div className="settings-section">
        <label className="settings-label">Recovery contacts for this hub</label>
        <p className="muted">
          If you lose your key, these contacts can vouch to this hub's admins that a new key is
          you. They can't take over your account — an admin still decides. Set this up before you
          need it.
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
        {contacts.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {contacts.map((c) => (
              <div key={c.pubkey} className="settings-row" style={{ marginBottom: 2 }}>
                <code style={{ flex: 1, fontSize: "var(--text-xs)" }}>{c.display_name ?? formatPubkey(c.pubkey)}</code>
                <button className="btn-secondary" onClick={() => handleRemove(c.pubkey)}>Remove</button>
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

      <div className="settings-section">
        <label className="settings-label">Recover your standing on this hub</label>
        <p className="muted">
          Lost your key but still control a new one? Enter the old (lost) pubkey below. This
          device's current identity opens the request as the new key — share the request id it
          gives you with your recovery contacts out-of-band so they can attest.
        </p>
        {!openRequest ? (
          <>
            <div className="settings-row">
              <input
                type="text"
                value={oldPubkeyInput}
                onChange={(e) => setOldPubkeyInput(e.target.value)}
                placeholder="Old (lost) pubkey (hex)"
                style={{ flex: 1 }}
              />
            </div>
            <div className="settings-row" style={{ marginTop: 4 }}>
              <input
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder="Reason (optional, shown to the admin)"
                style={{ flex: 1 }}
              />
              <button onClick={handleOpenRequest} disabled={requestStatus === "opening" || !oldPubkeyInput.trim()}>
                {requestStatus === "opening" ? "Opening…" : "Open request"}
              </button>
            </div>
            {requestStatus !== "idle" && requestStatus !== "opening" && <p className="error-text">{requestStatus}</p>}
          </>
        ) : (
          <div className="settings-section" style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 8 }}>
            <div>Request id: <code>{openRequest.id}</code></div>
            <div className="muted">Share this id with your recovery contacts — they paste it below to attest.</div>
            <div className="muted">
              Attestations: {openRequest.attestation_count} / {openRequest.threshold} · Status: {openRequest.status}
            </div>
            <div className="settings-row" style={{ marginTop: 4 }}>
              <button className="btn-secondary" onClick={() => actions.getRotationRequest(openRequest.id).then(setOpenRequest).catch(() => {})}>
                Check now
              </button>
              <button className="btn-secondary" onClick={() => setOpenRequest(null)}>Dismiss</button>
            </div>
          </div>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">Vouch for someone else's request</label>
        <p className="muted">
          A contact who asked you to vouch for them will send you a request id out-of-band. Paste
          it below, review, and confirm if you're sure it's them.
        </p>
        <div className="settings-row">
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="Request id"
            style={{ flex: 1 }}
          />
          <button className="btn-secondary" onClick={handleLookup} disabled={reviewStatus === "looking" || !lookupId.trim()}>
            {reviewStatus === "looking" ? "Looking up…" : "Look up"}
          </button>
        </div>
        {reviewBundle && (
          <div className="settings-section" style={{ background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 8, marginTop: 8 }}>
            <div><strong>Old key:</strong> <code>{formatPubkey(reviewBundle.old_pubkey)}</code></div>
            <div><strong>New key:</strong> <code>{formatPubkey(reviewBundle.new_pubkey)}</code></div>
            <div className="muted">Hub: <code>{formatPubkey(reviewBundle.hub_pubkey)}</code></div>
            <div className="muted">
              Attestations so far: {reviewBundle.attestation_count} / {reviewBundle.threshold} · Status: {reviewBundle.status}
            </div>
            {reviewStatus === "attested" ? (
              <p className="muted">Attestation recorded. Thank you.</p>
            ) : (
              <div className="settings-row" style={{ marginTop: 4 }}>
                <button onClick={handleAttest} disabled={reviewStatus === "attesting" || reviewBundle.status !== "pending"}>
                  {reviewStatus === "attesting" ? "Signing…" : "Confirm — this is them"}
                </button>
              </div>
            )}
            {reviewStatus !== "idle" && reviewStatus !== "looking" && reviewStatus !== "attesting" && reviewStatus !== "attested" && (
              <p className="error-text">{reviewStatus}</p>
            )}
          </div>
        )}
      </div>

      {isAdmin && actions.listAdminRequests && (
        <div className="settings-section">
          <label className="settings-label">Recovery requests queue</label>
          <p className="muted">
            Requests that have gathered enough contact attestations and await your decision.
          </p>
          {adminError && <p className="error-text">{adminError}</p>}
          {adminRequests.length === 0 && !adminError && <p className="muted">No pending requests.</p>}
          {adminRequests.map((req) => (
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
