import { useEffect, useState } from "react";
import { listHubIcons, createHubIcon, renameHubIcon, deleteHubIcon } from "@platform";
import type { HubIcon } from "@platform";
import { HubApiError } from "../../platform/http";
import { ErrorRetry } from "@wavvon/ui";

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

// SVG icon library for the hub (MANAGE_HUB_ICONS). SVG markup, ≤50KB.
export function HubIconsSection() {
  const [icons, setIcons] = useState<HubIcon[] | null>(null);
  const [name, setName] = useState("");
  const [svg, setSvg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try { setIcons(await listHubIcons()); }
    catch (e) { setError(e instanceof HubApiError ? e.message : String(e)); }
  }

  useEffect(() => { void load(); }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof HubApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  function handleCreate() {
    const n = name.trim();
    const s = svg.trim();
    if (!n || !s) return;
    void run(async () => { await createHubIcon(n, s); setName(""); setSvg(""); });
  }

  async function handleFilePicked(file: File) {
    setPickerError(null);
    const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
    try {
      const content = isSvg ? await readTextFile(file) : await rasterToSvg(file);
      if (content.length > 50 * 1024) {
        setPickerError("That image is too large once encoded (max 50 KB). Try a smaller or simpler image.");
        return;
      }
      setSvg(content);
      if (!name.trim()) setName(file.name.replace(/\.[^./]+$/, ""));
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section>
      <h1>Icon library</h1>
      <p className="muted">
        Build a library of custom vector icons your members can pick for channels and roles.
        Give each icon a name and pick an image — SVG, PNG, JPG, or GIF. Raster images are
        cropped to a {RASTER_SIZE}×{RASTER_SIZE} square automatically.
      </p>
      {error && <p className="error-text">{error}</p>}

      <div className="settings-section">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Icon name"
          aria-label="Icon name"
          style={{ width: "100%", maxWidth: 280 }}
        />
        <div className="settings-row" style={{ marginTop: "var(--space-2)", alignItems: "center" }}>
          <label className="btn-secondary">
            Choose image…
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
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}
        </div>
        {pickerError && <p className="error-text">{pickerError}</p>}

        <details style={{ marginTop: "var(--space-2)" }} open={showAdvanced} onToggle={(e) => setShowAdvanced(e.currentTarget.open)}>
          <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
            Advanced: paste SVG markup
          </summary>
          <textarea
            value={svg}
            onChange={(e) => setSvg(e.target.value)}
            placeholder="<svg …>…</svg>"
            aria-label="SVG markup"
            rows={4}
            style={{ width: "100%", marginTop: "var(--space-2)", fontFamily: "monospace" }}
          />
        </details>

        <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
          <button onClick={handleCreate} disabled={busy || !name.trim() || !svg.trim()}>Add icon</button>
        </div>
      </div>

      {icons === null ? (
        error ? <ErrorRetry message={error} onRetry={load} /> : <p className="muted">Loading…</p>
      ) : icons.length === 0 ? (
        <p className="muted">No icons yet.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
          {icons.map((icon) => (
            <div key={icon.id} className="settings-section" style={{ width: 140, textAlign: "center" }}>
              <div
                aria-hidden="true"
                style={{ width: 40, height: 40, margin: "0 auto" }}
                // Server validates + stores the SVG; render at fixed size.
                dangerouslySetInnerHTML={{ __html: icon.svg_content }}
              />
              <div style={{ fontSize: "var(--text-sm)", margin: "var(--space-2) 0", wordBreak: "break-word" }}>{icon.name}</div>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                <button
                  className="btn-small btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    const next = window.prompt("Rename icon", icon.name);
                    if (next && next.trim()) void run(() => renameHubIcon(icon.id, next.trim()));
                  }}
                >
                  Rename
                </button>
                <button className="btn-small btn-secondary danger" disabled={busy} onClick={() => run(() => deleteHubIcon(icon.id))}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
