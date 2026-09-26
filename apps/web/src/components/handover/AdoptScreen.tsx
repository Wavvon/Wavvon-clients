import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  handoverDone,
  handoverReady,
  isHandoverOffer,
  publicKeyHex,
  type HandoverOffer,
} from "@wavvon/core";
import { listAccounts, resolveOrCreateAccount, setActiveAccountId } from "@identity/index";

// Receiving end of the late handover (decisions.md 2026-08-25). Rendered
// instead of the app when the path is /adopt, so it stays out of App.tsx.
//
// It deliberately does not join the hub itself: once the identity is in place
// it navigates to the same `?hub=&code=` route the early handoff already
// uses, and the normal add-hub flow takes over. One join path, not two.

/** Enough of a key to compare against what the other window is showing, and
 *  not so much that nobody reads it. */
function fingerprint(pubkey: string): string {
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-8)}`;
}

type Phase =
  | { state: "waiting" }
  | { state: "offered"; origin: string; offer: HandoverOffer }
  | { state: "working" }
  | { state: "error"; message: string };

export function AdoptScreen() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ state: "waiting" });
  const [haveIdentity, setHaveIdentity] = useState<boolean | null>(null);
  const senderRef = useRef<{ window: Window; origin: string } | null>(null);

  useEffect(() => {
    listAccounts().then((a) => setHaveIdentity(a.length > 0)).catch(() => setHaveIdentity(false));
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only the window that opened us, and only a message we can parse. The
      // origin is the browser's word, not the sender's, which is why it is
      // what gets shown to the user below.
      if (!window.opener || e.source !== window.opener) return;
      if (!isHandoverOffer(e.data)) return;
      senderRef.current = { window: e.source as Window, origin: e.origin };
      setPhase({ state: "offered", origin: e.origin, offer: e.data });
    }
    window.addEventListener("message", onMessage);

    // Says only "I am here". Safe to broadcast: every reply that carries
    // anything is addressed to the origin an offer arrived from.
    if (window.opener) window.opener.postMessage(handoverReady(), "*");
    else setPhase({ state: "error", message: t("handover.adopt.no_opener") });

    return () => window.removeEventListener("message", onMessage);
  }, [t]);

  function leaveFor(offer: HandoverOffer) {
    const target = new URL("/join", window.location.origin);
    target.searchParams.set("hub", offer.hub_url);
    if (offer.invite_code) target.searchParams.set("code", offer.invite_code);
    window.location.href = target.toString();
  }

  async function adoptIdentity(offer: HandoverOffer) {
    if (!offer.seed_hex) return;
    setPhase({ state: "working" });
    try {
      const { account } = await resolveOrCreateAccount(offer.seed_hex);
      setActiveAccountId(account.id);
      // Tell the sender only now: it wipes its copy on this message, so
      // sending it before the identity is stored here would lose the key.
      senderRef.current?.window.postMessage(
        handoverDone(publicKeyHex(offer.seed_hex)),
        senderRef.current.origin,
      );
      leaveFor(offer);
    } catch (e) {
      setPhase({ state: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  function keepMine(offer: HandoverOffer) {
    // No `done`: the sender must not wipe an identity that did not move.
    leaveFor(offer);
  }

  return (
    <div className="handover-adopt" style={{ maxWidth: 460, margin: "80px auto", padding: 32 }}>
      <h1 style={{ marginBottom: 8 }}>{t("handover.adopt.title")}</h1>

      {phase.state === "waiting" && <p className="muted">{t("handover.adopt.waiting")}</p>}

      {phase.state === "working" && <p className="muted">{t("handover.adopt.working")}</p>}

      {phase.state === "error" && (
        <p className="error-text" style={{ color: "var(--danger)" }}>{phase.message}</p>
      )}

      {phase.state === "offered" && (
        <>
          <p>{t("handover.adopt.from", { origin: phase.origin })}</p>
          <div className="settings-section" style={{ marginBottom: 20 }}>
            <div className="settings-row" style={{ justifyContent: "space-between" }}>
              <span className="muted">{t("handover.adopt.hub_label")}</span>
              <span style={{ overflowWrap: "anywhere" }}>{phase.offer.hub_url}</span>
            </div>
            {phase.offer.seed_hex && (
              <div className="settings-row" style={{ justifyContent: "space-between" }}>
                <span className="muted">{t("handover.adopt.identity_label")}</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>
                  {fingerprint(publicKeyHex(phase.offer.seed_hex))}
                </span>
              </div>
            )}
          </div>

          {phase.offer.seed_hex && (
            <>
              <button
                className="btn-primary"
                style={{ width: "100%", marginBottom: 8 }}
                onClick={() => void adoptIdentity(phase.offer)}
              >
                {t("handover.adopt.bring_identity")}
              </button>
              <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 16 }}>
                {t("handover.adopt.bring_identity_hint")}
              </p>
            </>
          )}

          <button
            className="btn-secondary"
            style={{ width: "100%", marginBottom: 8 }}
            onClick={() => keepMine(phase.offer)}
          >
            {haveIdentity ? t("handover.adopt.keep_mine") : t("handover.adopt.start_here")}
          </button>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {haveIdentity ? t("handover.adopt.keep_mine_hint") : t("handover.adopt.start_here_hint")}
          </p>
        </>
      )}
    </div>
  );
}
