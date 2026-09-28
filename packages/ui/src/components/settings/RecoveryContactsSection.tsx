import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { RecoveryContactItem, RecoveryAdminRequest, RecoveryRequestBundle } from "../../types";
import { SettingRow } from "../SettingRow";

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
  /** Designate/request/vouch cards — the member-facing surface. Default on.
   *  Hosts that mount a dedicated admin-queue-only view (e.g. HubAdminPage,
   *  once the member surface already lives in Settings) pass false so the
   *  cards aren't shown twice. */
  showMemberCards?: boolean;
}

const POLL_MS = 5000;

export function RecoveryContactsSection({ isAdmin, actions, showMemberCards = true }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });
  const { t } = useTranslation();
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
      {showMemberCards && (
      <>
      <SettingRow
        title={t("recovery.contacts.label")}
        state={contacts.length === 0
          ? t("recovery.contacts.state.none")
          : t("recovery.contacts.state.set", { count: contacts.length, threshold })}
        meta={contacts.length > 0 ? String(contacts.length) : undefined}
        {...row("contacts")}
      >
        <p className="muted">{t("recovery.contacts.hint")}</p>
        <label className="settings-label" htmlFor="recovery-contacts">{t("recovery.contacts.pubkeys_label")}</label>
        <textarea
          id="recovery-contacts"
          rows={4}
          value={contactsText}
          onChange={(e) => setContactsText(e.target.value)}
          placeholder={t("recovery.contacts.pubkeys_placeholder")}
          style={{ width: "100%", fontFamily: "var(--font-mono)" }}
        />
        {contacts.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {contacts.map((c) => (
              <div key={c.pubkey} className="settings-row" style={{ marginBottom: 2 }}>
                <code style={{ flex: 1, fontSize: "var(--text-xs)" }}>{c.display_name ?? formatPubkey(c.pubkey)}</code>
                <button className="btn-small" onClick={() => handleRemove(c.pubkey)}>{t("recovery.contacts.remove")}</button>
              </div>
            ))}
          </div>
        )}
        <div className="settings-row" style={{ marginTop: 8 }}>
          <label className="settings-label" htmlFor="recovery-threshold">{t("recovery.contacts.threshold_label")}</label>
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
        {saveStatus === "saved" && <p className="muted">{t("recovery.contacts.saved")}</p>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <p className="error-text">{saveStatus}</p>
        )}
        <div className="settings-row">
          <button className="btn-primary" onClick={handleSave} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? t("recovery.contacts.saving") : t("recovery.contacts.save")}
          </button>
        </div>
      </SettingRow>

      <SettingRow
        title={t("recovery.request.label")}
        state={openRequest
          ? t("recovery.request.progress", {
              count: openRequest.attestation_count,
              threshold: openRequest.threshold,
              status: openRequest.status,
            })
          : t("recovery.request.state.none")}
        attention={!!openRequest}
        {...row("request")}
      >
        <p className="muted">{t("recovery.request.hint")}</p>
        {!openRequest ? (
          <>
            <div className="settings-row">
              <input
                type="text"
                value={oldPubkeyInput}
                onChange={(e) => setOldPubkeyInput(e.target.value)}
                placeholder={t("recovery.request.old_pubkey_placeholder")}
                style={{ flex: 1 }}
              />
            </div>
            <div className="settings-row" style={{ marginTop: 4 }}>
              <input
                type="text"
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                placeholder={t("recovery.request.reason_placeholder")}
                style={{ flex: 1 }}
              />
              <button className="btn-primary" onClick={handleOpenRequest} disabled={requestStatus === "opening" || !oldPubkeyInput.trim()}>
                {requestStatus === "opening" ? t("recovery.request.opening") : t("recovery.request.open")}
              </button>
            </div>
            {requestStatus !== "idle" && requestStatus !== "opening" && <p className="error-text">{requestStatus}</p>}
          </>
        ) : (
          <div className="status-readout">
            <div>{t("recovery.request.id_label")} <code>{openRequest.id}</code></div>
            <div className="muted">{t("recovery.request.share_hint")}</div>
            <div className="settings-row" style={{ marginTop: 4 }}>
              <button className="btn-small" onClick={() => actions.getRotationRequest(openRequest.id).then(setOpenRequest).catch(() => {})}>
                {t("recovery.request.check_now")}
              </button>
              <button className="btn-small" onClick={() => setOpenRequest(null)}>{t("recovery.request.dismiss")}</button>
            </div>
          </div>
        )}
      </SettingRow>

      <SettingRow
        title={t("recovery.vouch.label")}
        state={reviewBundle
          ? t("recovery.vouch.progress", {
              count: reviewBundle.attestation_count,
              threshold: reviewBundle.threshold,
              status: reviewBundle.status,
            })
          : t("recovery.vouch.state.idle")}
        {...row("vouch")}
      >
        <p className="muted">{t("recovery.vouch.hint")}</p>
        <div className="settings-row">
          <input
            type="text"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder={t("recovery.vouch.id_placeholder")}
            style={{ flex: 1 }}
          />
          <button className="btn-small" onClick={handleLookup} disabled={reviewStatus === "looking" || !lookupId.trim()}>
            {reviewStatus === "looking" ? t("recovery.vouch.looking_up") : t("recovery.vouch.look_up")}
          </button>
        </div>
        {reviewBundle && (
          <div className="status-readout" style={{ marginTop: 8 }}>
            <div><strong>{t("recovery.old_key")}</strong> <code>{formatPubkey(reviewBundle.old_pubkey)}</code></div>
            <div><strong>{t("recovery.new_key")}</strong> <code>{formatPubkey(reviewBundle.new_pubkey)}</code></div>
            <div className="muted">{t("recovery.hub_key")} <code>{formatPubkey(reviewBundle.hub_pubkey)}</code></div>
            {reviewStatus === "attested" ? (
              <p className="muted">{t("recovery.vouch.attested")}</p>
            ) : (
              <div className="settings-row" style={{ marginTop: 4 }}>
                <button className="btn-primary" onClick={handleAttest} disabled={reviewStatus === "attesting" || reviewBundle.status !== "pending"}>
                  {reviewStatus === "attesting" ? t("recovery.vouch.signing") : t("recovery.vouch.confirm")}
                </button>
              </div>
            )}
            {reviewStatus !== "idle" && reviewStatus !== "looking" && reviewStatus !== "attesting" && reviewStatus !== "attested" && (
              <p className="error-text">{reviewStatus}</p>
            )}
          </div>
        )}
      </SettingRow>
      </>
      )}

      {isAdmin && actions.listAdminRequests && (
        <SettingRow
          title={t("recovery.queue.label")}
          state={adminRequests.length === 0
            ? t("recovery.queue.empty")
            : t("recovery.queue.state.waiting", { count: adminRequests.length })}
          attention={adminRequests.length > 0}
          meta={adminRequests.length > 0 ? String(adminRequests.length) : undefined}
          {...row("queue")}
        >
          <p className="muted">{t("recovery.queue.hint")}</p>
          {adminError && <p className="error-text">{adminError}</p>}
          {adminRequests.length === 0 && !adminError && <p className="muted">{t("recovery.queue.empty")}</p>}
          {adminRequests.map((req) => (
            <div key={req.id} className="status-readout" style={{ marginTop: "var(--space-2)" }}>
              <div><strong>{t("recovery.old_key")}</strong> <code>{formatPubkey(req.old_pubkey)}</code></div>
              <div><strong>{t("recovery.new_key")}</strong> <code>{formatPubkey(req.new_pubkey)}</code></div>
              {req.reason && <div className="muted">{req.reason}</div>}
              <div className="muted">
                {t("recovery.queue.progress", { count: req.attestation_count, status: req.status })}
              </div>
              {(req.status === "ready_for_review" || req.status === "pending") && (
                <div className="settings-row" style={{ marginTop: 8 }}>
                  <button className="btn-small" onClick={() => handleDecide(req.id, "approve")}>{t("recovery.queue.approve")}</button>
                  <button className="btn-small danger" onClick={() => handleDecide(req.id, "deny")}>
                    {t("recovery.queue.deny")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </SettingRow>
      )}
    </div>
  );
}
