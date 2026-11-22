import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SoundboardChip } from "../types";
import { SettingRow } from "./SettingRow";

const KEY = "wavvon.soundboardBursts";

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
      {[0, 1, 2, 3, 4].map((i) => <span key={i}>{emoji}</span>)}
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
