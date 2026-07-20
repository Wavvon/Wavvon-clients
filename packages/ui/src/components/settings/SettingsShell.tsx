import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface SettingsTabDef<TTab extends string = string> {
  id: TTab;
  label: string;
  group: string;
}

interface Props<TTab extends string> {
  title: string;
  tabs: SettingsTabDef<TTab>[];
  activeTab: TTab;
  onTab: (t: TTab) => void;
  onClose: () => void;
  children: ReactNode;
}

// The grouped-nav settings skeleton (Accounts / App / Audio & video —
// settings-ia.md §2), shared by both apps. Callers own their own TAB id
// union and tab bodies; this only owns the sidebar layout and the
// contiguous-group-header rendering.
export function SettingsShell<TTab extends string>({ title, tabs, activeTab, onTab, onClose, children }: Props<TTab>) {
  const { t } = useTranslation();

  return (
    <div className="settings-page" style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <aside className="settings-nav" style={{ width: 180, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "16px 8px", display: "flex", flexDirection: "column" }}>
        <h2 style={{ padding: "0 8px", marginBottom: 12, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>{title}</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: 1 }}>
          {tabs.map((tab, i) => (
            <li key={tab.id}>
              {(i === 0 || tabs[i - 1].group !== tab.group) && (
                <div className="settings-nav-group">{tab.group}</div>
              )}
              <button
                className={`settings-nav-item${activeTab === tab.id ? " active" : ""}`}
                onClick={() => onTab(tab.id)}
                style={{ width: "100%", textAlign: "left", padding: "6px 10px", borderRadius: "var(--r-sm)" }}
              >
                {tab.label}
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
          ×
        </button>
        {children}
      </main>
    </div>
  );
}
