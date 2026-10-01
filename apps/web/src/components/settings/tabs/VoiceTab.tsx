import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AudioProfileSection, SettingRow } from "@wavvon/ui";
import { MicLevelMeter } from "@components/voice/MicLevelMeter";
import { AudioDevicesSection } from "../AudioDevicesSection";
import { PushToTalkSection } from "../PushToTalkSection";

// The voice audio profile is persisted under this key; App reads it when
// joining voice, so the key and shape must stay in sync with App's reader.
const VOICE_PROFILE_KEY = "wavvon.audio_profile";

interface AudioProfileConfig {
  profile: "standard" | "music" | "custom";
  customBitrate: number | null;
  customApp: "voip" | "audio" | "lowdelay";
  customNoiseSuppress: boolean;
  customVad: boolean;
  /** Sensitivity that applies under every gating profile (desktop calls it
   *  vad_threshold). customVadThreshold overrides it inside custom only. */
  vadThreshold: number;
  customVadThreshold: number;
  customChannels: 1 | 2;
  customFrameMs: 20 | 40 | 60;
  customComplexity: number;
}

const DEFAULT_AUDIO_PROFILE: AudioProfileConfig = {
  profile: "standard",
  customBitrate: null,
  customApp: "voip",
  customNoiseSuppress: true,
  customVad: true,
  vadThreshold: 0.02,
  customVadThreshold: 0.02,
  customChannels: 1,
  customFrameMs: 20,
  customComplexity: 9,
};

function loadAudioProfile(): AudioProfileConfig {
  try {
    const raw = localStorage.getItem(VOICE_PROFILE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<AudioProfileConfig>;
      // vadThreshold arrived after this key was already in people's browsers,
      // and an undefined here would hand React an uncontrolled slider.
      return { ...DEFAULT_AUDIO_PROFILE, ...stored };
    }
  } catch {}
  return DEFAULT_AUDIO_PROFILE;
}

function saveAudioProfile(cfg: AudioProfileConfig) {
  try { localStorage.setItem(VOICE_PROFILE_KEY, JSON.stringify(cfg)); } catch {}
}

export function VoiceTab() {
  const { t } = useTranslation();
  const [audioProfile, setAudioProfile] = useState<AudioProfileConfig>(loadAudioProfile);
  const [open, setOpen] = useState<string | null>(null);
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });

  function updateAudioProfile(patch: Partial<AudioProfileConfig>) {
    setAudioProfile((prev) => {
      const next = { ...prev, ...patch };
      saveAudioProfile(next);
      return next;
    });
  }

  // Music encodes continuously; there is no gate for a threshold to move.
  const gateOff = audioProfile.profile === "music";

  return (
    <section>
      <h1>{t("settings.tabs.voice")}</h1>

      <AudioDevicesSection />

      {/* Meter and threshold in one row, because this is the line drawn on
          it: the setting and the evidence for it belong in one place. Music
          transmits continuously and gates nothing, so the slider goes inert
          and says why — it does not leave, because a control that moves
          house when you pick an option makes the panel unreadable. */}
      <SettingRow
        title={t("settings.voice.vad.sensitivity")}
        state={gateOff
          ? t("settings.voice.vad.state.inert")
          : audioProfile.vadThreshold.toFixed(3)}
        {...row("sensitivity")}
      >
        <MicLevelMeter audioProfile={audioProfile} />
        <div className={gateOff ? "is-inert" : undefined}>
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
            {gateOff ? t("settings.voice.vad.inert_in_music") : t("settings.voice.vad.sensitivity_hint")}
          </p>
          <div className="settings-row" style={{ alignItems: "center", gap: 12 }}>
            <input
              id="vad-sensitivity"
              type="range"
              min={0.001}
              max={0.2}
              step={0.001}
              value={audioProfile.vadThreshold}
              disabled={gateOff}
              aria-label={t("settings.voice.vad.sensitivity")}
              onChange={(e) => updateAudioProfile({ vadThreshold: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span className="settings-value">{audioProfile.vadThreshold.toFixed(3)}</span>
          </div>
          {audioProfile.profile === "custom" &&
            audioProfile.customVadThreshold !== audioProfile.vadThreshold && (
              // Say it rather than let the slider above look broken: the
              // custom panel's own value is what the gate is using.
              <p className="muted" style={{ fontSize: "var(--text-xs)" }}>
                {t("settings.voice.vad.custom_override", {
                  value: audioProfile.customVadThreshold.toFixed(3),
                })}
              </p>
            )}
        </div>
      </SettingRow>

      <PushToTalkSection />

      <SettingRow
        title={t("settings.voice.quality.label")}
        state={t(`settings.voice.quality.${audioProfile.profile}`)}
        {...row("quality")}
      >
        <AudioProfileSection
          profile={audioProfile.profile}
          onProfile={(p) => updateAudioProfile({ profile: p })}
          customBitrate={audioProfile.customBitrate}
          onCustomBitrate={(v) => updateAudioProfile({ customBitrate: v })}
          customApp={audioProfile.customApp}
          onCustomApp={(v) => updateAudioProfile({ customApp: v })}
          customNoiseSuppress={audioProfile.customNoiseSuppress}
          onCustomNoiseSuppress={(v) => updateAudioProfile({ customNoiseSuppress: v })}
          customVad={audioProfile.customVad}
          onCustomVad={(v) => updateAudioProfile({ customVad: v })}
          customVadThreshold={audioProfile.customVadThreshold}
          onCustomVadThreshold={(v) => updateAudioProfile({ customVadThreshold: v })}
          customChannels={audioProfile.customChannels}
          onCustomChannels={(v) => updateAudioProfile({ customChannels: v })}
          customFrameMs={audioProfile.customFrameMs}
          onCustomFrameMs={(v) => updateAudioProfile({ customFrameMs: v })}
          customComplexity={audioProfile.customComplexity}
          onCustomComplexity={(v) => updateAudioProfile({ customComplexity: v })}
          inVoice={false}
        />
      </SettingRow>
    </section>
  );
}
