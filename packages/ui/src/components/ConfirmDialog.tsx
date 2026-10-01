import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";
import { useCloseOnEscape } from "../hooks/useCloseOnEscape";

export interface ConfirmRequest {
  /** What is about to happen, naming the target: "Ban Marco from Videogamezone?" */
  title: string;
  /** What it costs. Omit when the title already says everything. */
  body?: string;
  /** The button that goes through with it. Says the action, never "OK". */
  confirmLabel: string;
  /** Styles the confirm button as destructive. */
  danger?: boolean;
}

/**
 * A confirmation the app owns.
 *
 * `window.confirm()` blocks the event loop, renders the browser's own chrome
 * with the page's origin in it, cannot be themed, and takes its button labels
 * from the operating system in the OS's language — so on an Italian machine an
 * English hub asked "OK / Annulla". Half the admin sections used it and half
 * guarded nothing at all.
 *
 * Returns a `confirm` you await and the element to render:
 *
 *     const { confirm, dialog } = useConfirm();
 *     if (!(await confirm({ title: …, confirmLabel: …, danger: true }))) return;
 *     …
 *     return (<section>{dialog}…</section>);
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((req: ConfirmRequest) => {
    setRequest(req);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setRequest(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const dialog = request ? <ConfirmDialog request={request} onSettle={settle} /> : null;

  return { confirm, dialog };
}

function ConfirmDialog({
  request,
  onSettle,
}: {
  request: ConfirmRequest;
  onSettle: (ok: boolean) => void;
}) {
  const { t } = useTranslation();
  useCloseOnEscape(() => onSettle(false));
  return (
    <div
      className="modal-overlay"
      onClick={() => onSettle(false)}
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onKeyDown={(e) => { if (e.key === "Escape") onSettle(false); }}
    >
      <FocusTrap>
        <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
          <h3>{request.title}</h3>
          {request.body && <p className="muted">{request.body}</p>}
          <div className="confirm-modal-actions">
            <button className="btn-secondary" onClick={() => onSettle(false)}>
              {t("modal.cancel")}
            </button>
            <button
              className={request.danger ? "btn-danger" : "btn-primary"}
              onClick={() => onSettle(true)}
              autoFocus
            >
              {request.confirmLabel}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
