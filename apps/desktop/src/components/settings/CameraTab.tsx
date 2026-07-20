import { useTranslation } from "react-i18next";
import { CameraSection } from "../CameraSection";
import type { BackgroundMode } from "../../utils/backgroundProcessor";

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
  return (
    <section>
      <h1 style={{ marginBottom: 20 }}>{t("settings.tabs.camera")}</h1>
      {videoInputs.length > 0 && (
        <div className="settings-section">
          <label className="settings-label" htmlFor="settings-camera">{t("settings.voice.camera", "Camera")}</label>
          <select
            id="settings-camera"
            value={videoInputDevice}
            onChange={(e) => onVideoInputDeviceChange(e.target.value)}
          >
            <option value="">{t("settings.voice.system_default")}</option>
            {videoInputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
            ))}
          </select>
        </div>
      )}
      <CameraSection videoInputDevice={videoInputDevice} {...cameraSectionProps} />
    </section>
  );
}
