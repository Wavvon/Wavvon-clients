import { useTranslation } from "react-i18next";
import { FocusTrap } from "./FocusTrap";

interface Props {
  hubName: string;
  /** Whether this hub is named in the identity's signed home hub list, and
   *  whether it is the only one. `null` while the answer is still being
   *  fetched, or when it could not be — the dialog then says nothing about
   *  home hubs rather than guessing either way. */
  homeHub: { isHomeHub: boolean; isLast: boolean } | null;
  /** Operator-written farewell from the hub's `/info`. Rendered attributed and
   *  secondary: this is the one moment a hub has an incentive to mislead. */
  hubFarewell?: string | null;
  onOpenHomeHubSettings: () => void;
  /** Offered only where the hub advertises `hub.leave`. Removing is local and
   *  reversible; leaving is neither, so it sits here as a secondary action
   *  rather than a second primary button. */
  onLeaveHub?: () => void;
  /** Whether the hub would need a fresh invite to let this person back in.
   *  Leaving drops the roles, and the invite gate is "has no roles". */
  leaveNeedsInvite?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation for removing a hub from this device.
 *
 *  The word matters and the dialog spends its first line on it: this does not
 *  leave the hub. `removeHub` is local — socket, session, token, saved hub —
 *  and there is no leave endpoint on the hub to call, so the user stays in the
 *  roster with their roles and can add the hub back without an invite
 *  (decisions.md, "Leave hub does not leave").
 *
 *  What is worth a warning is the part nothing else would tell them: a removed
 *  *home* hub is still named in their signed designation, so other people's
 *  hubs keep delivering DMs there and this client stops reading them. The
 *  dialog links to where that list is edited and never edits it itself. */
export function RemoveHubModal({
  hubName,
  homeHub,
  hubFarewell,
  onOpenHomeHubSettings,
  onLeaveHub,
  leaveNeedsInvite,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const farewell = hubFarewell?.trim();

  return (
    <div
      className="modal-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t("hub.remove.title", { hub: hubName })}
    >
      <FocusTrap>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t("hub.remove.title", { hub: hubName })}</h3>
          <p>{t("hub.remove.body")}</p>

          {homeHub?.isHomeHub && (
            <div className="settings-section">
              <p>{t("hub.remove.home_hub")}</p>
              {homeHub.isLast && <p>{t("hub.remove.home_hub_last")}</p>}
              <button className="btn-small btn-secondary" onClick={onOpenHomeHubSettings}>
                {t("hub.remove.edit_home_hubs")}
              </button>
            </div>
          )}

          {farewell && (
            <blockquote className="settings-section">
              <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {t("hub.remove.farewell_attribution", { hub: hubName })}
              </span>
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{farewell}</p>
            </blockquote>
          )}

          {onLeaveHub && (
            <div className="settings-section">
              <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                {t("hub.remove.leave_instead")}
                {leaveNeedsInvite ? ` ${t("hub.remove.leave_needs_invite")}` : ""}
              </p>
              <button className="btn-small btn-secondary danger" onClick={onLeaveHub}>
                {t("hub.remove.leave_button")}
              </button>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={onCancel}>
              {t("modal.cancel")}
            </button>
            <button className="btn-primary danger" onClick={onConfirm}>
              {t("hub.remove.confirm")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
