import { useTranslation } from "react-i18next";
import type { LayoutChoice, LayoutKey } from "../themes/layout";
import type { StoredPackage } from "../themes/packageStore";
import type { ThemeManifest } from "../themes/theme";
import { LayoutPicker } from "./LayoutPicker";

interface Props {
  pkg: StoredPackage<ThemeManifest>;
  onChange: (pkg: StoredPackage<ThemeManifest>) => void;
}

export function ThemeLayoutEditor({ pkg, onChange }: Props) {
  const { t } = useTranslation();
  function set(key: LayoutKey, value: string | null) {
    const layout: LayoutChoice = { ...pkg.manifest.layout };
    if (value === null) delete layout[key];
    else layout[key] = value;
    const { layout: _drop, ...rest } = pkg.manifest;
    onChange({ ...pkg, manifest: Object.keys(layout).length ? { ...rest, layout } : rest });
  }
  return (
    <div className="settings-section">
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("settings.theme.layout.hint")}</p>
      <LayoutPicker value={pkg.manifest.layout ?? {}} unsetLabel={t("settings.theme.layout.default")} onChange={set} />
    </div>
  );
}
