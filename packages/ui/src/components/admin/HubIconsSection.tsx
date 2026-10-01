import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorRetry } from "../ErrorRetry";
import type { HubIcon } from "../../types";
import { sanitizeSvgMarkup } from "../../utils/svgSanitize";
import { useConfirm } from "../ConfirmDialog";
import { SettingRow } from "../SettingRow";

const RASTER_SIZE = 64;

// Raster files never reach the server as raw pixels — they're drawn to an
// offscreen canvas, center-cropped to a square, and embedded as a data URI
// inside a generated <svg> wrapper so the existing sanitized-SVG storage
// pipeline (name + svg_content, ≤50KB) doesn't need to change shape.
function rasterToSvg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = RASTER_SIZE;
      canvas.height = RASTER_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Canvas unavailable"));
        return;
      }
      const scale = Math.max(RASTER_SIZE / img.naturalWidth, RASTER_SIZE / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (RASTER_SIZE - w) / 2, (RASTER_SIZE - h) / 2, w, h);
      const dataUrl = canvas.toDataURL("image/png");
      URL.revokeObjectURL(objectUrl);
      resolve(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${RASTER_SIZE}" height="${RASTER_SIZE}" viewBox="0 0 ${RASTER_SIZE} ${RASTER_SIZE}"><image width="${RASTER_SIZE}" height="${RASTER_SIZE}" href="${dataUrl}"/></svg>`,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image — try a different file."));
    };
    img.src = objectUrl;
  });
}

function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsText(file);
  });
}

export interface HubIconsSectionActions {
  listHubIcons: () => Promise<HubIcon[]>;
  createHubIcon: (name: string, svgContent: string) => Promise<HubIcon>;
  renameHubIcon: (id: string, name: string) => Promise<void>;
  deleteHubIcon: (id: string) => Promise<void>;
}

interface Props {
  actions: HubIconsSectionActions;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// SVG icon library for the hub (MANAGE_HUB_ICONS). SVG markup, ≤50KB.
export function HubIconsSection({ actions }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState<string | null>(null);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const row = (id: string) => ({
    open: open === id,
    onToggle: () => setOpen((cur) => (cur === id ? null : id)),
  });
  const [icons, setIcons] = useState<HubIcon[] | null>(null);
  const [name, setName] = useState("");
  const [svg, setSvg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try { setIcons(await actions.listHubIcons()); }
    catch (e) { setError(errorMessage(e)); }
  }

  useEffect(() => { void load(); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }

  function handleCreate() {
    const n = name.trim();
    const s = sanitizeSvgMarkup(svg.trim());
    if (!n || !s) return;
    void run(async () => { await actions.createHubIcon(n, s); setName(""); setSvg(""); });
  }

  async function handleFilePicked(file: File) {
    setPickerError(null);
    const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
    try {
      const raw = isSvg ? await readTextFile(file) : await rasterToSvg(file);
      const content = sanitizeSvgMarkup(raw);
      if (content.length > 50 * 1024) {
        setPickerError("That image is too large once encoded (max 50 KB). Try a smaller or simpler image.");
        return;
      }
      setSvg(content);
      if (!name.trim()) setName(file.name.replace(/\.[^./]+$/, ""));
    } catch (e) {
      setPickerError(errorMessage(e));
    }
  }

  return (
    <section>
      {dialog}
      <h1>{t("hub.admin.icons.title")}</h1>
      <p className="muted">{t("hub.admin.icons.hint", { size: RASTER_SIZE })}</p>
      {error && <p className="error-text">{error}</p>}

      <SettingRow
        title={t("hub.admin.icons.add.title")}
        state={icons === null
          ? t("hub.admin.icons.loading")
          : t("hub.admin.icons.state.count", { count: icons.length })}
        {...row("add")}
      >
      <div className="settings-section">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("hub.admin.icons.name_placeholder")}
          aria-label={t("hub.admin.icons.name_placeholder")}
          style={{ width: "100%", maxWidth: 280 }}
        />
        <div className="settings-row" style={{ marginTop: "var(--space-2)", alignItems: "center" }}>
          <label className="btn-secondary">
            {t("hub.admin.icons.choose_image")}
            <input
              type="file"
              accept=".svg,.png,.jpg,.jpeg,.gif,image/svg+xml,image/png,image/jpeg,image/gif"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFilePicked(f);
                e.target.value = "";
              }}
            />
          </label>
          {svg.trim() && (
            <div
              aria-hidden="true"
              style={{ width: 32, height: 32 }}
              dangerouslySetInnerHTML={{ __html: sanitizeSvgMarkup(svg) }}
            />
          )}
        </div>
        {pickerError && <p className="error-text">{pickerError}</p>}

        <details style={{ marginTop: "var(--space-2)" }} open={showAdvanced} onToggle={(e) => setShowAdvanced(e.currentTarget.open)}>
          <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            {t("hub.admin.icons.advanced")}
          </summary>
          <textarea
            value={svg}
            onChange={(e) => setSvg(e.target.value)}
            placeholder="<svg …>…</svg>"
            aria-label={t("hub.admin.icons.svg_aria")}
            rows={4}
            style={{ width: "100%", marginTop: "var(--space-2)", fontFamily: "monospace" }}
          />
        </details>

        <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
          <button className="btn-primary" onClick={handleCreate} disabled={busy || !name.trim() || !svg.trim()}>{t("hub.admin.icons.add")}</button>
        </div>
      </div>
      </SettingRow>

      {icons === null ? (
        error ? <ErrorRetry message={error} onRetry={load} /> : <p className="muted">{t("hub.admin.icons.loading")}</p>
      ) : icons.length === 0 ? null : (
        <div>
          {icons.map((icon) => (
            <SettingRow
              key={icon.id}
              title={icon.name}
              state={t("hub.admin.icons.state.icon")}
              {...row(icon.id)}
            >
              <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start" }}>
                <div
                  aria-hidden="true"
                  style={{ width: 40, height: 40, flexShrink: 0 }}
                  // Server validates + stores the SVG; render at fixed size.
                  dangerouslySetInnerHTML={{ __html: icon.svg_content }}
                />
                <div style={{ flexGrow: 1 }}>
                  <label className="settings-label" htmlFor={`icon-name-${icon.id}`}>
                    {t("hub.admin.icons.name_placeholder")}
                  </label>
                  <div className="settings-row">
                    <input
                      id={`icon-name-${icon.id}`}
                      type="text"
                      defaultValue={icon.name}
                      onChange={(e) => setRenames((r) => ({ ...r, [icon.id]: e.target.value }))}
                      style={{ maxWidth: 280 }}
                    />
                    <button
                      className="btn-small"
                      disabled={busy || !(renames[icon.id] ?? icon.name).trim()}
                      onClick={() => {
                        const next = (renames[icon.id] ?? icon.name).trim();
                        if (next && next !== icon.name) void run(() => actions.renameHubIcon(icon.id, next));
                      }}
                    >
                      {t("hub.admin.icons.rename")}
                    </button>
                    <button
                      className="btn-small danger"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t("hub.admin.icons.delete_confirm", { name: icon.name }),
                          confirmLabel: t("hub.admin.icons.delete"),
                          danger: true,
                        });
                        if (ok) run(() => actions.deleteHubIcon(icon.id));
                      }}
                    >
                      {t("hub.admin.icons.delete")}
                    </button>
                  </div>
                </div>
              </div>
            </SettingRow>
          ))}
        </div>
      )}
    </section>
  );
}
