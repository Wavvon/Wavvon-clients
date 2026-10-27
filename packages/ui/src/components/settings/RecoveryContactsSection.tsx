import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import type {
  RecoveryContactItem,
  RecoveryAdminRequest,
  RecoveryRequestBundle,
  RecoveryRequestToAttest,
  RecoveryPerson,
} from "../../types";
import { SettingRow } from "../SettingRow";
import { Avatar } from "../Avatar";

export type { RecoveryContactItem, RecoveryAdminRequest, RecoveryRequestBundle, RecoveryRequestToAttest, RecoveryPerson } from "../../types";

export interface RecoveryContactsSectionActions {
  getContacts: () => Promise<{ threshold: number; contacts: RecoveryContactItem[] }>;
  setContacts: (threshold: number, contactPubkeys: string[]) => Promise<void>;
  removeContact: (pubkey: string) => Promise<void>;

  /** This hub's members and the account's friends, to pick contacts from
   *  and to find the account you were, by name rather than by key. */
  listPeople: () => Promise<RecoveryPerson[]>;
  /** Open requests naming this account as a contact; `null` when the hub
   *  cannot list them (no `recovery.attest.requests`), which keeps the
   *  request-id field. */
  listRequestsToAttest: () => Promise<RecoveryRequestToAttest[] | null>;

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
const MAX_CONTACTS = 5;

/** A majority of `n`: the default the threshold starts from, never 0. */
function majority(n: number): number {
  return Math.floor(n / 2) + 1;
}

export function RecoveryContactsSection({ isAdmin, actions, showMemberCards = true }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });
  const { t } = useTranslation();
  const [people, setPeople] = useState<RecoveryPerson[]>([]);
  const [threshold, setThreshold] = useState(1);
  const [contacts, setContacts] = useState<RecoveryContactItem[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");

  const [adminRequests, setAdminRequests] = useState<RecoveryAdminRequest[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [oldPubkeyInput, setOldPubkeyInput] = useState("");
  const [oldSearch, setOldSearch] = useState("");
  const [reasonInput, setReasonInput] = useState("");
  const [openRequest, setOpenRequest] = useState<RecoveryRequestBundle | null>(null);
  const [requestStatus, setRequestStatus] = useState<"idle" | "opening" | string>("idle");

  const [toAttest, setToAttest] = useState<RecoveryRequestToAttest[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [attestStatus, setAttestStatus] = useState<Record<string, string>>({});
  const [lookupId, setLookupId] = useState("");
  const [reviewBundle, setReviewBundle] = useState<RecoveryRequestBundle | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"idle" | "looking" | "attesting" | "attested" | string>("idle");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void loadContacts();
    actions.listPeople().then(setPeople).catch(() => setPeople([]));
    void loadToAttest();
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

  const nameOf = (pubkey: string, fallback?: string | null) =>
    people.find((p) => p.pubkey === pubkey)?.display_name || fallback || formatPubkey(pubkey);

  async function loadContacts() {
    try {
      const s = await actions.getContacts();
      setThreshold(Math.max(1, s.threshold));
      setContacts(s.contacts);
      setPicked(s.contacts.map((c) => c.pubkey));
    } catch { /* first load — ignore */ }
  }

  async function loadToAttest() {
    try {
      setToAttest(await actions.listRequestsToAttest());
    } catch {
      // Could not ask: fall back to the id field rather than claim "none".
      setToAttest(null);
    }
  }

  async function loadAdminRequests() {
    setAdminError(null);
    try {
      setAdminRequests(await actions.listAdminRequests!());
    } catch (e) {
      setAdminError(String(e));
    }
  }

  function togglePicked(pubkey: string) {
    setPicked((prev) => {
      const next = prev.includes(pubkey) ? prev.filter((k) => k !== pubkey) : [...prev, pubkey];
      // Keep the threshold meaningful as the list changes: within 1..n, and
      // back to a majority when it would fall outside.
      setThreshold((th) => (next.length === 0 ? 1 : th < 1 || th > next.length ? majority(next.length) : th));
      return next;
    });
  }

  async function handleSave() {
    setSaveStatus("saving");
    try {
      await actions.setContacts(threshold, picked);
      await loadContacts();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
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

  async function confirmListed(req: RecoveryRequestToAttest) {
    setAttestStatus((s) => ({ ...s, [req.id]: "attesting" }));
    try {
      await actions.attestRotationRequest(await actions.getRotationRequest(req.id));
      setAttestStatus((s) => ({ ...s, [req.id]: "attested" }));
    } catch (e) {
      setAttestStatus((s) => ({ ...s, [req.id]: String(e) }));
    }
  }

  const matches = (p: RecoveryPerson, q: string) =>
    !q.trim() || (p.display_name ?? "").toLowerCase().includes(q.trim().toLowerCase());
  const waiting = (toAttest ?? []).filter((r) => !dismissed.has(r.id));

  const personRow = (p: RecoveryPerson, control: React.ReactNode) => (
    <label key={p.pubkey} className="settings-row" style={{ gap: "var(--space-2)" }} title={p.pubkey}>
      {control}
      <Avatar src={p.avatar} name={p.display_name || p.pubkey} pubkey={p.pubkey} size={22} />
      <span>{p.display_name || formatPubkey(p.pubkey)}</span>
    </label>
  );

  return (
    <div>
      {showMemberCards && (
      <>
      <SettingRow
        title={t("recovery.contacts.label")}
        state={contacts.length === 0
          ? t("recovery.contacts.state.none")
          : contacts.map((c) => nameOf(c.pubkey, c.display_name)).join(", ")}
        meta={contacts.length > 0 ? String(contacts.length) : undefined}
        {...row("contacts")}
      >
        <p className="muted">{t("recovery.contacts.hint")}</p>
        <input
          type="search"
          value={contactSearch}
          onChange={(e) => setContactSearch(e.target.value)}
          placeholder={t("recovery.people.search")}
          aria-label={t("recovery.people.search")}
          style={{ width: "100%", maxWidth: 320 }}
        />
        <div style={{ maxHeight: 220, overflowY: "auto", marginTop: "var(--space-2)" }}>
          {people.filter((p) => picked.includes(p.pubkey) || matches(p, contactSearch)).map((p) =>
            personRow(
              p,
              <input
                type="checkbox"
                checked={picked.includes(p.pubkey)}
                disabled={!picked.includes(p.pubkey) && picked.length >= MAX_CONTACTS}
                onChange={() => togglePicked(p.pubkey)}
              />,
            ),
          )}
          {people.length === 0 && <p className="muted">{t("recovery.people.none")}</p>}
        </div>
        {picked.length > 0 && (
          <div className="settings-row" style={{ marginTop: "var(--space-3)", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button className="btn-small btn-secondary" aria-label={t("recovery.contacts.fewer")} disabled={threshold <= 1} onClick={() => setThreshold((n) => n - 1)}>−</button>
            <strong aria-live="polite">{threshold}</strong>
            <button className="btn-small btn-secondary" aria-label={t("recovery.contacts.more")} disabled={threshold >= picked.length} onClick={() => setThreshold((n) => n + 1)}>+</button>
            <span>{t("recovery.contacts.threshold_sentence", { threshold, count: picked.length })}</span>
          </div>
        )}
        {saveStatus === "saved" && <p className="muted">{t("recovery.contacts.saved")}</p>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <p className="error-text">{saveStatus}</p>
        )}
        <div className="settings-row">
          <button className="btn-primary" onClick={handleSave} disabled={saveStatus === "saving" || picked.length === 0}>
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
            <label className="settings-label">{t("recovery.request.who_were_you")}</label>
            <input
              type="search"
              value={oldSearch}
              onChange={(e) => setOldSearch(e.target.value)}
              placeholder={t("recovery.people.search")}
              aria-label={t("recovery.request.who_were_you")}
              style={{ width: "100%", maxWidth: 320 }}
            />
            {oldSearch.trim() && (
              <div style={{ maxHeight: 200, overflowY: "auto", marginTop: "var(--space-2)" }}>
                {people.filter((p) => matches(p, oldSearch)).map((p) =>
                  personRow(
                    p,
                    <input type="radio" name="recovery-old-account" checked={oldPubkeyInput === p.pubkey} onChange={() => setOldPubkeyInput(p.pubkey)} />,
                  ),
                )}
              </div>
            )}
            <details style={{ marginTop: "var(--space-2)" }}>
              <summary className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("recovery.request.by_key")}</summary>
              <input
                type="text"
                value={oldPubkeyInput}
                onChange={(e) => setOldPubkeyInput(e.target.value)}
                placeholder={t("recovery.request.old_pubkey_placeholder")}
                style={{ width: "100%" }}
              />
            </details>
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
            <div>{t("recovery.request.progress_sentence", { count: openRequest.attestation_count, threshold: openRequest.threshold })}</div>
            {/* Only a hub that cannot list requests to its contacts needs the
                id passed on by hand. */}
            <details>
              <summary className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("recovery.request.id_label")}</summary>
              <code>{openRequest.id}</code>
              <div className="muted">{t("recovery.request.share_hint")}</div>
            </details>
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
        state={waiting.length > 0
          ? t("recovery.vouch.state.waiting", { count: waiting.length })
          : t("recovery.vouch.state.idle")}
        attention={waiting.length > 0}
        meta={waiting.length > 0 ? String(waiting.length) : undefined}
        {...row("vouch")}
      >
        <p className="muted">{t("recovery.vouch.warning")}</p>
        {waiting.map((req) => (
          <div key={req.id} className="status-readout" style={{ marginTop: "var(--space-2)" }}>
            <div>{t("recovery.vouch.asks", { name: nameOf(req.old_pubkey) })}</div>
            {req.reason && <div className="muted">{req.reason}</div>}
            <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {formatRelative(req.created_at)} · {t("recovery.request.progress_sentence", { count: req.attestation_count, threshold: req.threshold })}
            </div>
            {attestStatus[req.id] === "attested" ? (
              <p className="muted">{t("recovery.vouch.attested")}</p>
            ) : (
              <div className="settings-row" style={{ marginTop: 4 }}>
                <button className="btn-primary" disabled={attestStatus[req.id] === "attesting"} onClick={() => void confirmListed(req)}>
                  {attestStatus[req.id] === "attesting" ? t("recovery.vouch.signing") : t("recovery.vouch.confirm")}
                </button>
                <button className="btn-small btn-secondary" onClick={() => setDismissed((d) => new Set(d).add(req.id))}>
                  {t("recovery.vouch.not_them")}
                </button>
              </div>
            )}
            {attestStatus[req.id] && !["attesting", "attested"].includes(attestStatus[req.id]) && (
              <p className="error-text">{attestStatus[req.id]}</p>
            )}
          </div>
        ))}
        {toAttest !== null && waiting.length === 0 && <p className="muted">{t("recovery.vouch.none_waiting")}</p>}
        <details open={toAttest === null} style={{ marginTop: "var(--space-3)" }}>
          <summary className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("recovery.vouch.have_id")}</summary>
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
              <div>{t("recovery.vouch.asks", { name: nameOf(reviewBundle.old_pubkey) })}</div>
              <div className="muted">{t("recovery.vouch.progress", {
                count: reviewBundle.attestation_count,
                threshold: reviewBundle.threshold,
                status: reviewBundle.status,
              })}</div>
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
        </details>
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
