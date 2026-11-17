import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { captureNode } from "../themes/capturePreview";
import type { StoredPackage } from "../themes/packageStore";
import type { ThemeManifest } from "../themes/theme";
import { useBlobUrl } from "../themes/useBlobUrl";
import { ThemePreviewDemo } from "./ThemePreviewDemo";

interface Props {
  pkg: StoredPackage<ThemeManifest>;
  onChange: (pkg: StoredPackage<ThemeManifest>) => void;
}

export function ThemePreviewMaker({ pkg, onChange }: Props) {
  const { t } = useTranslation();
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const path = pkg.manifest.preview;
  const url = useBlobUrl(path ? pkg.files[path] : undefined, path);

  // Runs once the offscreen demo is in the DOM, so it is measured with the
  // theme already applied.
  async function run(host: HTMLElement) {
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const blob = await captureNode(host.firstElementChild as HTMLElement);
      const name = `preview.${blob.type === "image/png" ? "png" : "webp"}`;
      const files = { ...pkg.files };
      if (path) delete files[path];
      files[name] = new Uint8Array(await blob.arrayBuffer());
      onChange({ ...pkg, manifest: { ...pkg.manifest, preview: name }, files });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.theme.preview.failed"));
    } finally {
      busy.current = false;
      setCapturing(false);
    }
  }

  function setHost(el: HTMLDivElement | null) {
    if (!el || busy.current) return;
    busy.current = true;
    void run(el);
  }

  function download() {
    if (!path || !url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pkg.manifest.name.replace(/[^a-zA-Z0-9\-_]/g, "_")}-${path}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="settings-section">
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("settings.theme.preview.hint")}</p>
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {url && <img src={url} alt={t("settings.theme.preview.alt")} width={192} height={108} style={{ borderRadius: "var(--r-sm)", border: "1px solid var(--border)" }} />}
        <button className="btn-small" disabled={capturing} onClick={() => setCapturing(true)}>
          {path ? t("settings.theme.preview.redo") : t("settings.theme.preview.make")}
        </button>
        {path && <button className="btn-small btn-secondary" onClick={download}>{t("settings.theme.preview.download")}</button>}
      </div>
      {capturing && (
        <div ref={setHost} aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }}>
          <ThemePreviewDemo />
        </div>
      )}
    </div>
  );
}
