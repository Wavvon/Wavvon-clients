import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface SettingRowProps {
  /** What this setting is. */
  title: string;
  /** What it is set to right now, in one line — the reason this row exists.
   *  A row that cannot say its own state is a heading with extra steps. */
  state?: ReactNode;
  /** Draws the marker in the accent: something here is waiting for someone. */
  attention?: boolean;
  /** A number the row is about (pending reports, synced entries), in mono at
   *  the end. Omit rather than showing a zero that means nothing. */
  meta?: ReactNode;
  /** Ordinal, for the few tabs where the rows really are a sequence — the
   *  gates a new member crosses, in the order they cross them. */
  step?: number;
  /** For a setting whose whole form is one control — a checkbox, a select.
   *  It sits where the toggle would, because opening a row to reveal a
   *  single checkbox is a disclosure that discloses nothing. */
  control?: ReactNode;
  /** Omitted by a row that is only a control: there is nothing to open. */
  open?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
}

/**
 * One setting, stating its current value, opening to the form that changes it.
 *
 * The hub-settings tabs used to stack every feature's whole form on top of each
 * other, so a tab was a column of controls you had to read to learn what the
 * hub was set to, and the ones below the fold did not exist until you went
 * looking. A row says what it is set to; you open only the one you are changing.
 */
export function SettingRow({
  title,
  state,
  attention,
  meta,
  step,
  control,
  open = false,
  onToggle = () => {},
  children,
}: SettingRowProps) {
  const { t } = useTranslation();
  return (
    <section className={`setting-row${open ? " open" : ""}`}>
      <div className="setting-row-head">
        {step !== undefined ? (
          <span className="setting-row-step" aria-hidden="true">{step}</span>
        ) : (
          <span className={`setting-row-mark${attention ? " attention" : ""}`} aria-hidden="true" />
        )}
        <span className="setting-row-id">
          <span className="setting-row-title">{title}</span>
          {state !== undefined && <span className="setting-row-state">{state}</span>}
        </span>
        {meta !== undefined && <span className="setting-row-meta">{meta}</span>}
        {control !== undefined && <span className="setting-row-control">{control}</span>}
        {children !== undefined && (
          <button type="button" className="btn-small" onClick={onToggle} aria-expanded={open}>
            {open ? t("settings.row.close") : t("settings.row.open")}
          </button>
        )}
      </div>
      {open && children !== undefined && <div className="setting-row-body">{children}</div>}
    </section>
  );
}
