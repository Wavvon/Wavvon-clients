import { useEffect, useState } from "react";
import type { BotCapabilityGrants } from "@wavvon/core";
import { toggleBotCapability } from "@wavvon/core";
import { adminGetBotCapabilities, adminSetBotCapabilities } from "../../platform/commands/bots";

interface Props {
  pubkey: string;
}

interface CapabilityInfo {
  label: string;
  risk: "medium" | "high";
  unlocks: string;
  note?: string;
}

// Registry copy per bot-capability-layer.md §1 "Capability registry". Baseline
// UI (components, embeds, the launch card) is ungated and never appears here.
const CAPABILITY_INFO: Record<string, CapabilityInfo> = {
  can_read_message_content: {
    label: "Read message content",
    risk: "medium",
    unlocks: "Full message bodies, not just previews.",
  },
  can_use_interactive_ui: {
    label: "Interactive UI",
    risk: "medium",
    unlocks: "Opening a mini-app or game-modal webview.",
  },
  can_speak_voice: {
    label: "Speak in voice",
    risk: "medium",
    unlocks: "Inject audio into the voice relay.",
  },
  can_inject_video: {
    label: "Inject video",
    risk: "high",
    unlocks: "Push video/canvas frames into the screen-share relay.",
    note: "Also requires the hub operator's WAVVON_BOTS_ALLOW_VIDEO setting; concurrent bot streams are budget-capped.",
  },
  can_use_camera: {
    label: "Use camera",
    risk: "high",
    unlocks: "Mini-app camera access (getUserMedia).",
    note: "Also requires the hub operator's \"Allow bot camera\" setting.",
  },
};

export function BotCapabilitiesPanel({ pubkey }: Props) {
  const [data, setData] = useState<BotCapabilityGrants | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingCap, setSavingCap] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setData(await adminGetBotCapabilities(pubkey));
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
      await adminSetBotCapabilities(pubkey, nextGranted);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingCap(null);
    }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  if (data.requested.length === 0) {
    return <p className="muted">This bot hasn't requested any capabilities.</p>;
  }

  return (
    <div>
      {error && <p className="error-text">{error}</p>}
      <table className="members-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Risk</th>
            <th>Unlocks</th>
            <th>Granted</th>
          </tr>
        </thead>
        <tbody>
          {data.requested.map((cap) => {
            const info = CAPABILITY_INFO[cap];
            const granted = data.granted.includes(cap);
            return (
              <tr key={cap}>
                <td>{info?.label ?? cap}</td>
                <td className={info?.risk === "high" ? "error-text" : undefined}>{info?.risk ?? "unknown"}</td>
                <td>
                  {info?.unlocks ?? "—"}
                  {info?.note && <div className="muted">{info.note}</div>}
                </td>
                <td>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={granted}
                      disabled={savingCap === cap}
                      onChange={(e) => handleToggle(cap, e.target.checked)}
                    />
                    {savingCap === cap ? "Saving…" : granted ? "Granted" : "Not granted"}
                  </label>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: "var(--space-2)" }}>
        Effective (what the bot can actually use right now): {data.effective.length > 0 ? data.effective.join(", ") : "none"}
      </p>
    </div>
  );
}
