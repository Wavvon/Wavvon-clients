import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "../Icons";

export interface SettingsAreaDef<TArea extends string = string> {
  id: TArea;
  label: string;
  /** Applies to this device whatever account is picked; said once at the
   *  top of the page when there is an account picker. */
  deviceWide?: boolean;
  /** Reached from the header link, not from the area tabs. */
  hidden?: boolean;
}

export interface SettingsSectionDef<TSection extends string = string, TArea extends string = string> {
  id: TSection;
  label: string;
  area: TArea;
  /** Accessible label for a marker: something here needs the user. */
  attention?: string;
}

interface Props<TSection extends string, TArea extends string> {
  title: string;
  areas: SettingsAreaDef<TArea>[];
  /** In page order: an area's sections stack in the order listed here. */
  sections: SettingsSectionDef<TSection, TArea>[];
  activeSection: TSection;
  onSection: (s: TSection) => void;
  renderSection: (s: TSection) => ReactNode;
  onClose: () => void;
  /** Whose settings the account-scoped areas show; sits in the header. */
  accountPicker?: ReactNode;
  /** The section the header's help link opens. */
  helpSection?: TSection;
  /** Save progress or an error for the whole page, shown in one bar at the
   *  bottom instead of once per section. */
  status?: ReactNode;
}

const anchorId = (id: string) => `settings-section-${id}`;

// Settings as a few areas across the top, each one scrolling page whose
// sections stack in order, with an index of them on the left (settings
// redesign, Wavvon-clients#464). Shared by both apps; callers own the ids,
// the grouping and the section bodies, which keep their own <section> root so
// the `.settings-content > section` rhythm still applies.
export function SettingsShell<TSection extends string, TArea extends string>({
  title, areas, sections, activeSection, onSection, renderSection, onClose, accountPicker, helpSection, status,
}: Props<TSection, TArea>) {
  const { t } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);
  const [spied, setSpied] = useState<TSection | null>(null);

  const activeArea = sections.find((s) => s.id === activeSection)?.area ?? sections[0]?.area;
  const areaDef = areas.find((a) => a.id === activeArea);
  const pageSections = sections.filter((s) => s.area === activeArea);

  // Land on the asked-for section, whether it came from a tab, the index or a
  // deep link from elsewhere in the app.
  useEffect(() => {
    setSpied(null);
    const main = mainRef.current;
    const anchor = document.getElementById(anchorId(activeSection));
    if (!main || !anchor) return;
    const first = pageSections[0]?.id === activeSection;
    main.scrollTop = first ? 0 : anchor.offsetTop - main.offsetTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection]);

  // The index follows the scroll: the current section is the last one whose
  // anchor has passed the top of the page.
  function onScroll() {
    const main = mainRef.current;
    if (!main || pageSections.length < 2) return;
    let current = pageSections[0].id;
    for (const s of pageSections) {
      const a = document.getElementById(anchorId(s.id));
      if (a && a.offsetTop - main.offsetTop <= main.scrollTop + 24) current = s.id;
    }
    setSpied(current);
  }

  const highlighted = spied ?? activeSection;
  const firstOf = (area: TArea) => sections.find((s) => s.area === area)?.id;
  const areaAttention = (area: TArea) => sections.find((s) => s.area === area && s.attention)?.attention;

  return (
    <div className="settings-page settings-shell">
      <header className="settings-header">
        <div className="settings-header-row">
          <h2>{title}</h2>
          {accountPicker}
          <span style={{ flex: 1 }} />
          {helpSection && (
            <button type="button" className="btn-ghost settings-help-link" onClick={() => onSection(helpSection)}>
              {t("settings.tabs.help")}
            </button>
          )}
          <button type="button" className="settings-close-x" onClick={onClose} title={t("modal.close")} aria-label={t("modal.close")}>
            <CloseIcon size={13} />
          </button>
        </div>
        <nav className="settings-areas" aria-label={title}>
          {areas.filter((a) => !a.hidden).map((a) => {
            const attention = areaAttention(a.id);
            return (
              <button
                key={a.id}
                type="button"
                className={`settings-area-tab${a.id === activeArea ? " active" : ""}`}
                aria-current={a.id === activeArea ? "page" : undefined}
                title={attention}
                onClick={() => {
                  const first = firstOf(a.id);
                  if (first) onSection(first);
                }}
              >
                {a.label}
                {attention && <span className="settings-nav-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="settings-body">
        {pageSections.length > 1 && (
          <nav className="settings-nav settings-index" aria-label={areaDef?.label}>
            <ul>
              {pageSections.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`settings-nav-item${s.id === highlighted ? " active" : ""}`}
                    aria-current={s.id === highlighted ? "location" : undefined}
                    title={s.attention}
                    onClick={() => onSection(s.id)}
                  >
                    {s.label}
                    {s.attention && <span className="settings-nav-dot" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <main ref={mainRef} className="settings-content" onScroll={onScroll}>
          {accountPicker && areaDef?.deviceWide && (
            <p className="muted settings-device-note">{t("settings.device_wide")}</p>
          )}
          {pageSections.map((s) => (
            <Fragment key={s.id}>
              <span id={anchorId(s.id)} className="settings-anchor" />
              {renderSection(s.id)}
            </Fragment>
          ))}
          <div className="settings-status-bar" role="status">{status}</div>
        </main>
      </div>
    </div>
  );
}
