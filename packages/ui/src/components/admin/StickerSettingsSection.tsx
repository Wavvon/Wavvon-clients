import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { StickerSettings } from "../../types";
import { parseHubError, stickerErrorKey } from "../../utils/stickers";
import type { RolesSectionActions } from "./RolesSection";
import { ErrorRetry } from "../ErrorRetry";
import { SettingRow } from "../SettingRow";

const EVERYONE = "builtin-everyone";
const EXTERNAL = "stickers.external";
const KB = 1024;
const MB = 1024 * 1024;

export interface StickerSettingsActions {
  getSettings: () => Promise<StickerSettings>;
  saveSettings: (patch: Partial<StickerSettings>) => Promise<void>;
}

interface Props {
  actions: StickerSettingsActions;
  /** The role routes the "allow stickers from other hubs" toggle edits;
   *  `canManageRoles` is the permission that changing it needs. */
  rolesActions: Pick<RolesSectionActions, "listRoles" | "updateRole">;
  canManageRoles: boolean;
}

interface Field {
  key: Exclude<keyof StickerSettings, "stickers_export">;
  unit: number;
  min: number;
  max: number;
}

const FIELDS: Field[] = [
  { key: "stickers_max_file_bytes", unit: KB, min: 64, max: 4096 },
  { key: "stickers_per_pack", unit: 1, min: 1, max: 500 },
  { key: "sticker_packs_per_hub", unit: 1, min: 1, max: 200 },
  { key: "stickers_packs_cap_bytes", unit: MB, min: 16, max: 102400 },
  { key: "stickers_packs_warn_percent", unit: 1, min: 50, max: 99 },
  { key: "stickers_copies_cap_bytes", unit: MB, min: 64, max: 1048576 },
  { key: "stickers_orphan_gc_days", unit: 1, min: 1, max: 365 },
];

export function StickerSettingsSection({ actions, rolesActions, canManageRoles }: Props) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<StickerSettings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [external, setExternal] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      const s = await actions.getSettings();
      setSettings(s);
      setDraft(Object.fromEntries(FIELDS.map((f) => [f.key, String(Math.round(s[f.key] / f.unit))])));
      if (canManageRoles) {
        const roles = await rolesActions.listRoles();
        setExternal(roles.find((r) => r.id === EVERYONE)?.permissions.includes(EXTERNAL) ?? false);
      }
    } catch (e) {
      setLoadError(t(stickerErrorKey(e, "manage")));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleExport(on: boolean) {
    setError(null);
    try {
      await actions.saveSettings({ stickers_export: on });
      setSettings((s) => (s ? { ...s, stickers_export: on } : s));
    } catch (e) {
      setError(t(stickerErrorKey(e, "manage")));
    }
  }

  async function toggleExternal(on: boolean) {
    setError(null);
    try {
      const roles = await rolesActions.listRoles();
      const everyone = roles.find((r) => r.id === EVERYONE);
      if (!everyone) throw new Error("no everyone role");
      const without = everyone.permissions.filter((p) => p !== EXTERNAL);
      await rolesActions.updateRole(EVERYONE, { permissions: on ? [...without, EXTERNAL] : without });
      setExternal(on);
    } catch (e) {
      const { body } = parseHubError(e);
      setError(t(body.includes("Cannot modify built-in")
        ? "hub.admin.sticker_settings.external_unsupported"
        : stickerErrorKey(e, "manage")));
    }
  }

  async function save() {
    if (!settings) return;
    const patch: Partial<StickerSettings> = {};
    for (const f of FIELDS) {
      const next = Number(draft[f.key]) * f.unit;
      if (Number.isFinite(next) && next !== settings[f.key]) patch[f.key] = Math.round(next);
    }
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await actions.saveSettings(patch);
      await load();
    } catch (e) {
      setError(t(stickerErrorKey(e, "manage")));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return loadError
      ? <section><ErrorRetry message={loadError} onRetry={load} /></section>
      : <section><p className="muted">{t("hub.admin.sticker_settings.loading")}</p></section>;
  }

  return (
    <section>
      <h1>{t("hub.admin.sticker_settings.title")}</h1>
      <p className="muted">{t("hub.admin.sticker_settings.hint")}</p>
      {error && <p className="error-text">{error}</p>}

      <SettingRow
        title={t("hub.admin.sticker_settings.export")}
        state={t(settings.stickers_export ? "hub.admin.sticker_settings.export_on" : "hub.admin.sticker_settings.export_off")}
        control={
          <input
            type="checkbox"
            checked={settings.stickers_export}
            aria-label={t("hub.admin.sticker_settings.export")}
            onChange={(e) => void toggleExport(e.target.checked)}
          />
        }
      />

      {canManageRoles && external !== null && (
        <SettingRow
          title={t("hub.admin.sticker_settings.external")}
          state={t(external ? "hub.admin.sticker_settings.external_on" : "hub.admin.sticker_settings.external_off")}
          control={
            <input
              type="checkbox"
              checked={external}
              aria-label={t("hub.admin.sticker_settings.external")}
              onChange={(e) => void toggleExternal(e.target.checked)}
            />
          }
        />
      )}

      <SettingRow
        title={t("hub.admin.sticker_settings.limits")}
        state={t("hub.admin.sticker_settings.limits_state", {
          perPack: settings.stickers_per_pack,
          packs: settings.sticker_packs_per_hub,
        })}
        open={open}
        onToggle={() => setOpen((v) => !v)}
      >
        {FIELDS.map((f) => (
          <div className="settings-section" key={f.key}>
            <label className="settings-label" htmlFor={`sticker-set-${f.key}`}>
              {t(`hub.admin.sticker_settings.field.${f.key}`)}
            </label>
            <input
              id={`sticker-set-${f.key}`}
              type="number"
              min={f.min}
              max={f.max}
              value={draft[f.key] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="settings-section">
          <button onClick={() => void save()} disabled={saving}>{t("hub.admin.sticker_settings.save")}</button>
        </div>
      </SettingRow>
    </section>
  );
}
