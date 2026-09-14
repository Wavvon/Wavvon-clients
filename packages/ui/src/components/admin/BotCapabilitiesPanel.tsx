import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BotCapabilityGrants } from "@wavvon/core";
import { toggleBotCapability } from "@wavvon/core";

/** Reading and replacing the granted set. Each app supplies its own transport
 *  — `hubFetch` on web, a Tauri command on desktop — the way every other
 *  shared admin section takes its actions. */
export interface BotCapabilitiesActions {
  get: (pubkey: string) => Promise<BotCapabilityGrants>;
  set: (pubkey: string, capabilities: string[]) => Promise<void>;
}

interface Props {
  pubkey: string;
  actions: BotCapabilitiesActions;
}

// Registry copy per bot-capability-layer.md §1 "Capability registry". Baseline
// UI (components, embeds, the launch card) is ungated and never appears here.
// Risk and the presence of a note are the only per-capability facts left here;
// the words live in the catalogs under the bot.cap prefix, keyed by capability
// id, so a capability the hub knows and this build does not still renders its
// id rather than nothing.
const CAPABILITY_RISK: Record<string, "medium" | "high"> = {
  can_read_message_content: "medium",
  can_use_interactive_ui: "medium",
  can_speak_voice: "medium",
  can_inject_video: "high",
  can_use_camera: "high",
};

const CAPABILITIES_WITH_NOTE = new Set(["can_inject_video", "can_use_camera"]);

export function BotCapabilitiesPanel({ pubkey, actions }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<BotCapabilityGrants | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingCap, setSavingCap] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await actions.get(pubkey));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => { void load(); }, [pubkey]);

  async function handleToggle(capability: string, checked: boolean) {
    if (!data) return;
    const nextGranted = toggleBotCapability(data.granted, capability, checked);
    setSavingCap(capability);
    setError(null);
    try {
      await actions.set(pubkey, nextGranted);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingCap(null);
    }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">{t("bot.cap.loading")}</p>;

  if (data.requested.length === 0) {
    return <p className="muted">{t("bot.cap.none_requested")}</p>;
  }

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      <table className="members-table">
        <thead>
          <tr>
            <th>{t("bot.cap.col.capability")}</th>
            <th>{t("bot.cap.col.risk")}</th>
            <th>{t("bot.cap.col.unlocks")}</th>
            <th>{t("bot.cap.col.granted")}</th>
          </tr>
        </thead>
        <tbody>
          {data.requested.map((cap) => {
            const risk = CAPABILITY_RISK[cap];
            const granted = data.granted.includes(cap);
            return (
              <tr key={cap}>
                <td>{t(`bot.cap.${cap}.label`, { defaultValue: cap })}</td>
                <td className={risk === "high" ? "error-text" : undefined}>
                  {t(`bot.cap.risk.${risk ?? "unknown"}`)}
                </td>
                <td>
                  {t(`bot.cap.${cap}.unlocks`, { defaultValue: "—" })}
                  {CAPABILITIES_WITH_NOTE.has(cap) && <div className="muted">{t(`bot.cap.${cap}.note`)}</div>}
                </td>
                <td>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={granted}
                      disabled={savingCap === cap}
                      onChange={(e) => handleToggle(cap, e.target.checked)}
                    />
                    {savingCap === cap ? t("bot.cap.saving") : granted ? t("bot.cap.granted") : t("bot.cap.not_granted")}
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: "var(--space-2)" }}>
        {t("bot.cap.effective", {
          list: data.effective.length > 0 ? data.effective.join(", ") : t("bot.cap.effective_none"),
        })}
      </p>
    </div>
  );
}
