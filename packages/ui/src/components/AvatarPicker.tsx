import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { generateAvatarDataUrl, randomAvatarSeed } from "../utils/avatarGenerator";

interface Props {
  onPick: (dataUrl: string) => void;
  count?: number;
}

export function AvatarPicker({ onPick, count = 20 }: Props) {
  const { t } = useTranslation();
  const [seeds, setSeeds] = useState<string[]>(() => Array.from({ length: count }, () => randomAvatarSeed()));
  const [selected, setSelected] = useState<string | null>(null);

  const options = useMemo(() => seeds.map((seed) => ({ seed, url: generateAvatarDataUrl(seed) })), [seeds]);

  function shuffle() {
    setSeeds(Array.from({ length: count }, () => randomAvatarSeed()));
    setSelected(null);
  }

  function choose(seed: string, url: string) {
    setSelected(seed);
    onPick(url);
  }

  return (
    <div className="avatar-picker">
      <div className="avatar-picker-toolbar">
        <span className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("avatar_picker.hint")}</span>
        <button type="button" className="btn-small btn-secondary" onClick={shuffle}>
          {t("avatar_picker.shuffle")}
        </button>
      </div>
      <div className="avatar-picker-grid">
        {options.map(({ seed, url }) => (
          <button
            key={seed}
            type="button"
            className={`avatar-picker-tile ${selected === seed ? "selected" : ""}`}
            onClick={() => choose(seed, url)}
            aria-label={t("avatar_picker.option_aria")}
            title={t("avatar_picker.option_aria")}
          >
            <img src={url} alt="" width={48} height={48} />
          </button>
        ))}
      </div>
    </div>
  );
}
