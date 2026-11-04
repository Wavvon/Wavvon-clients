import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CloseIcon } from "../Icons";

export interface SettingsTabDef<TTab extends string = string> {
  id: TTab;
  label: string;
  group: string;
  /** Accessible label for a marker on the tab: something there needs the
   *  user. Absent means no marker. */
  attention?: string;
  /** The tab applies to this device whatever account is picked. */
  deviceWide?: boolean;
}

interface Props<TTab extends string> {
  title: string;
  tabs: SettingsTabDef<TTab>[];
  activeTab: TTab;
  onTab: (t: TTab) => void;
  onClose: () => void;
  /** Whose settings the account-scoped tabs show; rendered under the title. */
  accountPicker?: ReactNode;
  children: ReactNode;
}

// The grouped-nav settings skeleton (Accounts / App / Audio & video —
// settings-ia.md §2), shared by both apps. Callers own their own TAB id
// union and tab bodies; this only owns the sidebar layout and the
// contiguous-group-header rendering.
export function SettingsShell<TTab extends string>({ title, tabs, activeTab, onTab, onClose, accountPicker, children }: Props<TTab>) {
  const { t } = useTranslation();

  return (
    <div className="settings-page" style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <aside className="settings-nav" style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "16px 8px", display: "flex", flexDirection: "column" }}>
        <h2>{title}</h2>
        {accountPicker}
        {accountPicker && tabs.find((tab) => tab.id === activeTab)?.deviceWide && (
          <p className="muted" style={{ fontSize: "var(--text-xs)", margin: "var(--space-1) var(--space-3) 0" }}>
            {t("settings.device_wide")}
          </p>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1 }}>
          {tabs.map((tab, i) => (
            <li key={tab.id}>
              {(i === 0 || tabs[i - 1].group !== tab.group) && (
                <div className="settings-nav-group">{tab.group}</div>
              )}
              <button
                className={`settings-nav-item${activeTab === tab.id ? " active" : ""}`}
                onClick={() => onTab(tab.id)}
                title={tab.attention}
                style={{ width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: "var(--r-sm)" }}
              >
                {tab.label}
                {/* A description, not part of the name: the tab is still
                    called what it says, for people and for lookups by name. */}
                {tab.attention && <span className="settings-nav-dot" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
        <button className="settings-nav-close btn-ghost" onClick={onClose} style={{ marginTop: 8 }}>
          {t("modal.close")}
        </button>
      </aside>

      <main className="settings-content" style={{ flex: 1, overflow: "auto", padding: 24, position: "relative" }}>
        <button
          className="settings-close-x"
          onClick={onClose}
          title={t("modal.close")}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)" }}
        >
          <CloseIcon size={13} />
        </button>
        {children}
      </main>
    </div>
  );
}
