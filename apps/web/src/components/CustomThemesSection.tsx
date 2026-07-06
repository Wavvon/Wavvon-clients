import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { NamedCustomTheme } from "../utils/customThemes";
import { readBaseToken } from "../skinValidation";

interface Props {
  themes: NamedCustomTheme[];
  activeId: string | null;
  onApply: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const SWATCH_TOKENS = ["--bg", "--surface", "--accent"];

function swatchColor(theme: NamedCustomTheme, token: string): string {
  return theme.skin.tokens[token] ?? readBaseToken(token, theme.skin.base);
}

// Named custom-theme library, mirroring ProfilesSection's array + active-id
// pattern. Editing (SkinEditor) always targets whichever theme is active
// here — this list only manages which one that is.
export function CustomThemesSection({ themes, activeId, onApply, onNew, onRename, onDuplicate, onDelete }: Props) {
  const { t } = useTranslation();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function startRename(theme: NamedCustomTheme) {
    setRenamingId(theme.id);
    setRenameValue(theme.name);
  }

  function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(id, trimmed);
    setRenamingId(null);
  }

  return (
    <div className="settings-section" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <label className="settings-label" style={{ marginBottom: 0 }}>{t("settings.theme.custom.saved_label")}</label>
        <button className="btn-small" onClick={onNew}>{t("settings.theme.custom.new")}</button>
      </div>

      {themes.length === 0 ? (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.theme.custom.empty")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {themes.map((theme) => {
            const isActive = theme.id === activeId;
            return (
              <div
                key={theme.id}
                className="settings-row"
                style={{
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 6,
                  padding: "6px 8px",
                  borderRadius: "var(--r-sm)",
                  border: isActive ? "2px solid var(--accent)" : "1px solid var(--border)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ display: "flex", gap: 3 }}>
                    {SWATCH_TOKENS.map((tok) => (
                      <span
                        key={tok}
                        style={{
                          display: "inline-block",
                          width: 16,
                          height: 16,
                          borderRadius: "var(--r-sm)",
                          background: swatchColor(theme, tok),
                          border: "1px solid var(--border)",
                        }}
                      />
                    ))}
                  </span>
                  {renamingId === theme.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={renameValue}
                      maxLength={48}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(theme.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(theme.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      style={{ fontSize: "var(--text-sm)" }}
                      aria-label={t("settings.theme.custom.name_placeholder")}
                    />
                  ) : (
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: isActive ? 600 : 400 }}>
                      {theme.name}
                      {isActive && (
                        <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                          {" · "}{t("settings.theme.custom.active_badge")}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button className="btn-small" onClick={() => onApply(theme.id)} disabled={isActive}>
                    {t("settings.theme.custom.apply")}
                  </button>
                  <button className="btn-small btn-secondary" onClick={() => startRename(theme)}>
                    {t("settings.theme.custom.rename")}
                  </button>
                  <button className="btn-small btn-secondary" onClick={() => onDuplicate(theme.id)}>
                    {t("settings.theme.custom.duplicate")}
                  </button>
                  <button className="btn-small btn-secondary danger" onClick={() => onDelete(theme.id)}>
                    {t("settings.theme.custom.delete")}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
