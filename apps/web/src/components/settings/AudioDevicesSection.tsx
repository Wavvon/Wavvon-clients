import { useEffect, useState } from "react";
import { SettingRow } from "@wavvon/ui";
import { useTranslation } from "react-i18next";

// Input/output device selection for voice (Settings → Voice). The choices are
// persisted to localStorage and read by VoiceWtSession on join
// (wavvon.audioInputDevice → getUserMedia, wavvon.audioOutputDevice →
// AudioContext.setSinkId where supported).
const INPUT_KEY = "wavvon.audioInputDevice";
const OUTPUT_KEY = "wavvon.audioOutputDevice";

export function AudioDevicesSection() {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [input, setInput] = useState<string>(() => localStorage.getItem(INPUT_KEY) ?? "");
  const [output, setOutput] = useState<string>(() => localStorage.getItem(OUTPUT_KEY) ?? "");
  const [needsPermission, setNeedsPermission] = useState(false);
  const [justGranted, setJustGranted] = useState(false);
  const [open, setOpen] = useState(false);
  const supportsOutput = typeof (AudioContext.prototype as { setSinkId?: unknown }).setSinkId === "function";

  async function refresh() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const ins = devices.filter((d) => d.kind === "audioinput");
      const outs = devices.filter((d) => d.kind === "audiooutput");
      setInputs(ins);
      setOutputs(outs);
      // Labels are blank until mic permission is granted at least once.
      setNeedsPermission(ins.length > 0 && ins.every((d) => !d.label));
    } catch {
      setInputs([]);
      setOutputs([]);
    }
  }

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, []);

  async function grantAndRefresh() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      await refresh();
      setJustGranted(true);
      setTimeout(() => setJustGranted(false), 4000);
    } catch { /* denied */ }
  }

  function pickInput(v: string) {
    setInput(v);
    if (v) localStorage.setItem(INPUT_KEY, v); else localStorage.removeItem(INPUT_KEY);
  }
  function pickOutput(v: string) {
    setOutput(v);
    if (v) localStorage.setItem(OUTPUT_KEY, v); else localStorage.removeItem(OUTPUT_KEY);
  }

  const label = (d: MediaDeviceInfo, i: number) => d.label || t("settings.voice.devices.unnamed", { n: i + 1 });
  const outputDisabled = !supportsOutput || outputs.length === 0;
  const chosenLabel = (list: MediaDeviceInfo[], id: string) => {
    if (!id) return t("settings.voice.devices.system_default");
    const i = list.findIndex((d) => d.deviceId === id);
    return i < 0 ? t("settings.voice.devices.system_default") : label(list[i], i);
  };

  return (
    <SettingRow
      title={t("settings.voice.devices.label")}
      state={chosenLabel(inputs, input)}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <p className="muted">{t("settings.voice.devices.hint")}</p>

      <div className="settings-row-2col">
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <label className="settings-label" style={{ fontSize: "var(--text-sm)" }} htmlFor="audio-input">
            {t("settings.voice.devices.input_label")}
          </label>
          <select id="audio-input" value={input} onChange={(e) => pickInput(e.target.value)} style={{ width: "100%" }}>
            <option value="">{t("settings.voice.devices.system_default")}</option>
            {inputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i)}</option>)}
          </select>
        </div>

        <div className="settings-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
          <label className="settings-label" style={{ fontSize: "var(--text-sm)" }} htmlFor="audio-output">
            {t("settings.voice.devices.output_label")}
          </label>
          <select id="audio-output" value={output} onChange={(e) => pickOutput(e.target.value)} disabled={outputDisabled} style={{ width: "100%" }}>
            <option value="">{t("settings.voice.devices.system_default")}</option>
            {outputs.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i)}</option>)}
          </select>
          {!supportsOutput ? (
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {t("settings.voice.devices.output_unsupported")}
            </span>
          ) : outputs.length === 0 ? (
            <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
              {t("settings.voice.devices.output_empty")}
            </span>
          ) : null}
        </div>
      </div>

      {needsPermission && (
        <div style={{ marginTop: 12 }}>
          <button className="btn-small" onClick={grantAndRefresh}>
            {t("settings.voice.devices.permission_button")}
          </button>
          <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 4, marginBottom: 0 }}>
            {t("settings.voice.devices.permission_hint")}
          </p>
        </div>
      )}
      <span aria-live="polite" className="muted" style={{ display: "block", fontSize: "var(--text-xs)" }}>
        {justGranted ? t("settings.voice.devices.permission_granted") : ""}
      </span>
    </SettingRow>
  );
}
