import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow } from "../SettingRow";

/** The hub's public online widget (`/admin/settings/widget`). */
export interface WidgetSettings {
  mode: "off" | "counts" | "names" | "voice";
  invite_code?: string | null;
}

export interface WidgetActions {
  getWidget: () => Promise<WidgetSettings>;
  putWidget: (settings: WidgetSettings) => Promise<WidgetSettings>;
}

const MODES: { mode: WidgetSettings["mode"]; label: string; hint: string }[] = [
  { mode: "off", label: "hub.admin.widget.mode_off", hint: "hub.admin.widget.mode_off_hint" },
  { mode: "counts", label: "hub.admin.widget.mode_counts", hint: "hub.admin.widget.mode_counts_hint" },
  { mode: "names", label: "hub.admin.widget.mode_names", hint: "hub.admin.widget.mode_names_hint" },
  { mode: "voice", label: "hub.admin.widget.mode_voice", hint: "hub.admin.widget.mode_voice_hint" },
];

/** The snippet an admin pastes into the community's own site. */
export function widgetEmbedCode(hubUrl: string): string {
  return `<iframe src="${hubUrl.replace(/\/+$/, "")}/widget" width="320" height="400" style="border:0"></iframe>`;
}

/** Off by default: the widget is the first thing a hub shows to people who
 *  are not members, so the admin turns it on and picks how much it shows. */
export function WidgetSection({ actions, hubUrl }: { actions: WidgetActions; hubUrl: string }) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<WidgetSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    actions.getWidget().then(setSettings).catch((e) => setError(String(e instanceof Error ? e.message : e)));
  }, [actions]);

  async function save(next: WidgetSettings) {
    setSaving(true);
    setError(null);
    try {
      setSettings(await actions.putWidget(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return error ? <p className="error-text">{error}</p> : null;
  const code = widgetEmbedCode(hubUrl);

  return (
    <div className="settings-section">
      <h2>{t("hub.admin.widget.title")}</h2>
      <p className="muted">{t("hub.admin.widget.hint")}</p>
      <SettingRow
        title={t("hub.admin.widget.mode")}
        state={t(MODES.find((m) => m.mode === settings.mode)?.hint ?? "hub.admin.widget.mode_off_hint")}
        control={
        <select
          value={settings.mode}
          disabled={saving}
          onChange={(e) => save({ ...settings, mode: e.target.value as WidgetSettings["mode"] })}
        >
          {MODES.map((m) => <option key={m.mode} value={m.mode}>{t(m.label)}</option>)}
        </select>
        }
      />
      <SettingRow
        title={t("hub.admin.widget.invite")}
        state={t("hub.admin.widget.invite_hint")}
        control={
        <input
          type="text"
          value={settings.invite_code ?? ""}
          disabled={saving}
          maxLength={64}
          onChange={(e) => setSettings({ ...settings, invite_code: e.target.value })}
          onBlur={() => save(settings)}
          style={{ width: 160 }}
        />
        }
      />
      {settings.mode !== "off" && (
        <>
          <p className="muted">{t("hub.admin.widget.embed_hint")}</p>
          <code className="pubkey-display">{code}</code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(code).catch(() => {});
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? t("modal.copied") : t("modal.copy")}
          </button>
        </>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
