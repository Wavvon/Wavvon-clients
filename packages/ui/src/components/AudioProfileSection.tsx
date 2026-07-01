import React from "react";

type Profile = "standard" | "music" | "custom";

interface Props {
  profile: Profile;
  onProfile: (p: Profile) => void;
  customBitrate: number | null;
  onCustomBitrate: (v: number | null) => void;
  customApp: "voip" | "audio" | "lowdelay";
  onCustomApp: (v: "voip" | "audio" | "lowdelay") => void;
  customNoiseSuppress: boolean;
  onCustomNoiseSuppress: (v: boolean) => void;
  customVad: boolean;
  onCustomVad: (v: boolean) => void;
  customVadThreshold: number;
  onCustomVadThreshold: (v: number) => void;
  customChannels: 1 | 2;
  onCustomChannels: (v: 1 | 2) => void;
  customFrameMs: 20 | 40 | 60;
  onCustomFrameMs: (v: 20 | 40 | 60) => void;
  customComplexity: number;
  onCustomComplexity: (v: number) => void;
  inVoice: boolean;
}

export function AudioProfileSection({
  profile,
  onProfile,
  customBitrate,
  onCustomBitrate,
  customApp,
  onCustomApp,
  customNoiseSuppress,
  onCustomNoiseSuppress,
  customVad,
  onCustomVad,
  customVadThreshold,
  onCustomVadThreshold,
  customChannels,
  onCustomChannels,
  customFrameMs,
  onCustomFrameMs,
  customComplexity,
  onCustomComplexity,
  inVoice,
}: Props) {
  const profiles: { id: Profile; label: string; description: string }[] = [
    {
      id: "standard",
      label: "Standard",
      description:
        "Optimised for voice. RNNoise denoising, voice activity detection, mono audio.",
    },
    {
      id: "music",
      label: "Music",
      description:
        "For live performance and instruments. 128 kbps stereo, Opus Audio mode, no denoiser or VAD.",
    },
    {
      id: "custom",
      label: "Custom",
      description: "Configure every parameter manually.",
    },
  ];

  return (
    <div className="settings-section">
      <label className="settings-label">Audio quality</label>

      <div className="audio-profile-picker">
        {profiles.map((p) => (
          <button
            key={p.id}
            className={`audio-profile-btn${profile === p.id ? " active" : ""}`}
            onClick={() => onProfile(p.id)}
          >
            <span className="audio-profile-btn-name">{p.label}</span>
            <span className="audio-profile-btn-desc">{p.description}</span>
          </button>
        ))}
      </div>

      {profile === "custom" && (
        <div className="audio-custom-panel">
          <div className="settings-row">
            <label className="settings-label" htmlFor="audio-opus-mode" style={{ width: 160 }}>
              Opus mode
            </label>
            <select
              id="audio-opus-mode"
              value={customApp}
              onChange={(e) =>
                onCustomApp(e.target.value as "voip" | "audio" | "lowdelay")
              }
            >
              <option value="voip">VOIP (speech-optimised)</option>
              <option value="audio">Audio (music/general)</option>
              <option value="lowdelay">Low-delay (minimal latency)</option>
            </select>
          </div>

          <div className="settings-row">
            <label className="settings-label" htmlFor="audio-bitrate" style={{ width: 160 }}>
              Bitrate
            </label>
            <input
              id="audio-bitrate"
              type="range"
              min={6}
              max={320}
              step={2}
              value={customBitrate ?? 48}
              onChange={(e) => onCustomBitrate(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className="settings-value">
              {customBitrate ? `${customBitrate} kbps` : "auto"}
            </span>
            <button
              className="btn-secondary"
              style={{ fontSize: 11, padding: "2px 6px", marginLeft: 4 }}
              onClick={() => onCustomBitrate(null)}
            >
              auto
            </button>
          </div>

          <div className="settings-row">
            <label className="settings-label" style={{ width: 160 }}>
              Channels
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={customChannels === 2}
                onChange={(e) => onCustomChannels(e.target.checked ? 2 : 1)}
              />
              Stereo (doubles bandwidth)
            </label>
          </div>

          <div className="settings-row">
            <label className="settings-label" style={{ width: 160 }}>
              Noise suppression
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={customNoiseSuppress}
                onChange={(e) => onCustomNoiseSuppress(e.target.checked)}
              />
              Enable RNNoise denoiser
            </label>
          </div>

          <div className="settings-row">
            <label className="settings-label" style={{ width: 160 }}>
              Voice activity
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={customVad}
                onChange={(e) => onCustomVad(e.target.checked)}
              />
              Enable voice activity detection (drops silence)
            </label>
          </div>

          {customVad && (
            <div className="settings-row" style={{ paddingLeft: 160 }}>
              <label className="settings-label" style={{ width: 120 }}>
                Sensitivity
              </label>
              <input
                type="range"
                min={0.001}
                max={0.2}
                step={0.001}
                value={customVadThreshold}
                onChange={(e) => onCustomVadThreshold(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span className="settings-value">
                {customVadThreshold.toFixed(3)}
              </span>
            </div>
          )}

          <div className="settings-row">
            <label className="settings-label" style={{ width: 160 }}>
              Frame duration
            </label>
            <select
              value={customFrameMs}
              onChange={(e) =>
                onCustomFrameMs(Number(e.target.value) as 20 | 40 | 60)
              }
            >
              <option value={20}>20 ms (lowest latency)</option>
              <option value={40}>40 ms</option>
              <option value={60}>60 ms (lowest overhead)</option>
            </select>
          </div>

          <div className="settings-row">
            <label className="settings-label" style={{ width: 160 }}>
              Complexity
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={customComplexity}
              onChange={(e) => onCustomComplexity(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span className="settings-value">{customComplexity}/10</span>
          </div>
        </div>
      )}

      {inVoice && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Changes take effect when you next join a voice channel.
        </p>
      )}
    </div>
  );
}
