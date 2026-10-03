import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@wavvon/ui";
import { CameraSection } from "../CameraSection";
import type { BackgroundMode } from "@wavvon/ui";

interface Props {
  backgroundMode: BackgroundMode;
  backgroundSource: string | null;
  backgroundActive: boolean | null;
  onChangeBackground: (mode: BackgroundMode, source?: string | null) => void;
  videoInputs: { deviceId: string; label: string }[];
  videoInputDevice: string;
  onVideoInputDeviceChange: (v: string) => void;
}

export function CameraTab({ videoInputs, videoInputDevice, onVideoInputDeviceChange, ...cameraSectionProps }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section>
      <h1>{t("settings.tabs.camera")}</h1>
      {videoInputs.length > 0 && (
        <SettingRow
          title={t("settings.camera.device_label")}
          state={videoInputs.find((d) => d.deviceId === videoInputDevice)?.label
            ?? t("settings.voice.system_default")}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        >
          <select
            id="settings-camera"
            aria-label={t("settings.camera.device_aria")}
            value={videoInputDevice}
            onChange={(e) => onVideoInputDeviceChange(e.target.value)}
          >
            <option value="">{t("settings.voice.system_default")}</option>
            {videoInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </SettingRow>
      )}
      <CameraSection videoInputDevice={videoInputDevice} {...cameraSectionProps} />
    </section>
  );
}
