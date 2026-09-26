import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { handoverOffer, isHandoverDone, isHandoverReady } from "@wavvon/core";
import { removeAccount, holdsMasterSeed, type IdentityRecord } from "@identity/index";
import { USER_CLIENT_URL } from "../../constants";
import { markMigrated } from "../../utils/migrated";

// Sending end of the late handover (decisions.md 2026-08-25): someone who
// already built an identity in a hub build and now wants the multi-hub one.
// Rendered only where USER_CLIENT_URL is set, which is the hub build.
//
// The seed travels by postMessage and never in a URL — a URL would put it in
// history, in the referrer and in logs. The receiving side asks the user
// before doing anything with it; this side wipes only on the acknowledgement,
// so a closed tab or a refusal leaves the identity exactly where it was.

interface Props {
  account: IdentityRecord;
  activeHubUrl?: string;
}

type State = "idle" | "waiting" | "offered" | "failed";

export function MoveToUserClientSection({ account, activeHubUrl }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const childRef = useRef<Window | null>(null);

  const target = USER_CLIENT_URL;
  const targetOrigin = target ? new URL(target).origin : "";
  // A paired device holds a subkey, not the master seed — there is nothing
  // here that would reconstitute the identity over there.
  const isPairedDevice = !holdsMasterSeed(account);

  useEffect(() => {
    if (!target) return;
    async function onMessage(e: MessageEvent) {
      if (e.origin !== targetOrigin || e.source !== childRef.current) return;

      if (isHandoverReady(e.data)) {
        childRef.current?.postMessage(
          handoverOffer({
            hub_url: activeHubUrl ?? window.location.origin,
            seed_hex: account.seed_hex,
          }),
          targetOrigin,
        );
        setState("offered");
        return;
      }

      if (isHandoverDone(e.data)) {
        // Only now. Before the acknowledgement this account is the only copy.
        try {
          await removeAccount(account.id);
          markMigrated(account.id);
          // Reload rather than render a "done" panel: the account this whole
          // settings page hangs off just stopped existing, so the section
          // unmounts and the message would never be seen. Coming back up with
          // no identity lands on the setup screen, which is where the
          // "you moved" notice lives. Not a redirect to the other origin —
          // the user asked to move an identity, not to be sent elsewhere.
          window.location.reload();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setState("failed");
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [target, targetOrigin, account.id, account.seed_hex, activeHubUrl]);

  if (!target || isPairedDevice) return null;

  function start() {
    setError(null);
    // A tab, not a popup: the user finishes the join in it, and popup
    // blockers are kinder to a gesture-opened tab.
    const child = window.open(`${target}/adopt`, "_blank");
    if (!child) {
      setError(t("handover.move.blocked"));
      setState("failed");
      return;
    }
    childRef.current = child;
    setState("waiting");
  }

  return (
    <div className="settings-section handover-move" style={{ marginTop: 20 }}>
      <label className="settings-label">{t("handover.move.label")}</label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("handover.move.hint")}</p>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("handover.move.passkey_warning")}</p>

      <button className="btn-secondary" onClick={start} disabled={state === "waiting" || state === "offered"}>
        {state === "idle" || state === "failed" ? t("handover.move.button") : t("handover.move.in_progress")}
      </button>

      {error && <p className="error-text" style={{ color: "var(--danger)", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
