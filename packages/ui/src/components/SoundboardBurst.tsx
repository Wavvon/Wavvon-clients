import { useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { SoundboardChip } from "../types";
import { SettingRow } from "./SettingRow";

const KEY = "wavvon.soundboardBursts";

// A fountain: each emoji leaves at its own angle, height, spin and delay.
const PARTICLES: { dx: number; dist: number; rot: number; s: number; delay: number }[] = [
  { dx: -34, dist: 64, rot: -40, s: 1.3, delay: 0 },
  { dx: 30, dist: 72, rot: 35, s: 1.2, delay: 0.05 },
  { dx: -10, dist: 92, rot: -15, s: 1.5, delay: 0.1 },
  { dx: 14, dist: 84, rot: 20, s: 1, delay: 0.16 },
  { dx: -46, dist: 46, rot: -60, s: 0.9, delay: 0.22 },
  { dx: 44, dist: 52, rot: 55, s: 1, delay: 0.28 },
  { dx: -22, dist: 76, rot: -25, s: 1.1, delay: 0.36 },
  { dx: 24, dist: 98, rot: 30, s: 1.3, delay: 0.42 },
  { dx: 0, dist: 108, rot: 0, s: 1.6, delay: 0.5 },
  { dx: -4, dist: 58, rot: -10, s: 0.8, delay: 0.6 },
];

function burstsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** A short rise of the clip's emoji over whoever just played a soundboard
 *  clip. Place it inside a positioned element (a roster row, a video tile).
 *  Keyed by the chip id, so a new play restarts the animation; the chip's own
 *  expiry removes it. Reduced motion hides it in CSS. */
export function SoundboardBurst({ chips, pubkey }: { chips?: SoundboardChip[]; pubkey: string }) {
  const chip = chips?.filter((c) => c.public_key === pubkey).pop();
  if (!chip || !burstsEnabled()) return null;
  const emoji = chip.emoji || "🔊";
  return (
    <span key={chip.id} className="soundboard-burst" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          style={{ "--dx": `${p.dx}px`, "--dist": `${p.dist}px`, "--rot": `${p.rot}deg`, "--s": p.s, animationDelay: `${p.delay}s` } as CSSProperties}
        >
          {emoji}
        </span>
      ))}
    </span>
  );
}

/** Settings → Appearance row that turns the bursts off on this device. */
export function SoundboardBurstSetting() {
  const { t } = useTranslation();
  const [on, setOn] = useState(burstsEnabled);
  function toggle(next: boolean) {
    setOn(next);
    try {
      if (next) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, "off");
    } catch {
      // private mode: the choice lasts for this page
    }
  }
  return (
    <SettingRow
      title={t("settings.soundboard_bursts.label")}
      state={t("settings.soundboard_bursts.hint")}
      control={
        <input
          type="checkbox"
          aria-label={t("settings.soundboard_bursts.label")}
          checked={on}
          onChange={(e) => toggle(e.target.checked)}
        />
      }
    />
  );
}
