import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ThemesController } from "../hooks/useThemes";
import { downloadTheme, readBaseToken, resolveScheme, type SchemeMode } from "../themes/theme";
import { LayoutPicker } from "./LayoutPicker";
import { ThemeEditor } from "./ThemeEditor";

const MODES: SchemeMode[] = ["system", "dark", "light"];
const SWATCH_TOKENS = ["--bg", "--surface", "--accent"];

export function ThemesSection({ controller }: { controller: ThemesController }) {
  const { t } = useTranslation();
  const { themes, active, mode, systemDark } = controller;
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      await controller.install(new Uint8Array(await file.arrayBuffer()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("settings.theme.invalid"));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <label className="settings-label" htmlFor="theme-mode" style={{ marginBottom: 0 }}>{t("settings.theme.mode")}</label>
        <select id="theme-mode" value={mode} onChange={(e) => controller.setMode(e.target.value as SchemeMode)}>
          {MODES.map((m) => <option key={m} value={m}>{t(`settings.theme.mode.${m}`)}</option>)}
        </select>
      </div>

      <div className="settings-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label className="settings-label" style={{ marginBottom: 0 }}>{t("settings.theme.installed")}</label>
          <span style={{ display: "flex", gap: 6 }}>
            <button className="btn-small" onClick={() => fileRef.current?.click()}>{t("settings.theme.install")}</button>
            <button className="btn-small" onClick={() => void controller.create(t("settings.theme.new_name"))}>{t("settings.theme.new")}</button>
          </span>
        </div>
        <input ref={fileRef} type="file" accept=".wavvontheme,application/zip" style={{ display: "none" }} onChange={onFile} aria-label={t("settings.theme.install_aria")} />
        {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <ThemeRow
            name={t("settings.theme.builtin")}
            tokens={null}
            scheme={resolveScheme(null, mode, systemDark)}
            isActive={!active}
            onUse={() => controller.select(null)}
          />
          {themes.map((pkg) => (
            <ThemeRow
              key={pkg.id}
              name={pkg.manifest.name}
              tokens={pkg.manifest.colors[resolveScheme(pkg.manifest, mode, systemDark)] ?? {}}
              scheme={resolveScheme(pkg.manifest, mode, systemDark)}
              isActive={active?.id === pkg.id}
              onUse={() => controller.select(pkg.id)}
              onExport={() => downloadTheme(pkg)}
              onRemove={() => void controller.remove(pkg.id)}
            />
          ))}
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">{t("settings.theme.layout.yours")}</label>
        <LayoutPicker value={controller.userLayout} unsetLabel={t("settings.theme.layout.follow_theme")} onChange={controller.setUserLayout} />
      </div>

      {active?.manifest.background && (
        <div className="settings-section">
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={!controller.bgOff} onChange={(e) => controller.setBackgroundOff(!e.target.checked)} />
            {t("settings.theme.background.show")}
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "var(--text-sm)" }}>
            <input type="checkbox" checked={!controller.blurOff} disabled={controller.bgOff} onChange={(e) => controller.setBlurOff(!e.target.checked)} />
            {t("settings.theme.background.blur_on")}
          </label>
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("settings.theme.background.reduced_hint")}</p>
        </div>
      )}

      {active && <ThemeEditor key={active.id} pkg={active} onChange={controller.edit} />}
    </div>
  );
}

function ThemeRow({
  name,
  tokens,
  scheme,
  isActive,
  onUse,
  onExport,
  onRemove,
}: {
  name: string;
  tokens: Record<string, string> | null;
  scheme: "dark" | "light";
  isActive: boolean;
  onUse: () => void;
  onExport?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
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
                background: tokens?.[tok] ?? readBaseToken(tok, scheme),
                border: "1px solid var(--border)",
              }}
            />
          ))}
        </span>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: isActive ? 600 : 400 }}>
          {name}
          {isActive && <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{" · "}{t("settings.theme.active_badge")}</span>}
        </span>
      </span>
      <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button className="btn-small" onClick={onUse} disabled={isActive}>{t("settings.theme.use")}</button>
        {onExport && <button className="btn-small btn-secondary" onClick={onExport}>{t("settings.theme.export")}</button>}
        {onRemove && <button className="btn-small btn-secondary danger" onClick={onRemove}>{t("settings.theme.remove")}</button>}
      </span>
    </div>
  );
}
