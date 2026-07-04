import { useEffect, useState } from "react";
import { listHubIcons, createHubIcon, renameHubIcon, deleteHubIcon } from "@platform";
import type { HubIcon } from "@platform";
import { HubApiError } from "../platform/http";

// SVG icon library for the hub (MANAGE_HUB_ICONS). SVG markup, ≤50KB.
export function HubIconsSection() {
  const [icons, setIcons] = useState<HubIcon[] | null>(null);
  const [name, setName] = useState("");
  const [svg, setSvg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section>
      <h1>Icon library</h1>
      <p className="muted">Custom SVG icons members can use on channels. Paste SVG markup (≤50 KB).</p>
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
        <textarea
          value={svg}
          onChange={(e) => setSvg(e.target.value)}
          placeholder="<svg …>…</svg>"
          aria-label="SVG markup"
          rows={4}
          style={{ width: "100%", marginTop: "var(--space-2)", fontFamily: "monospace" }}
        />
        <div className="settings-row" style={{ marginTop: "var(--space-2)" }}>
          <button onClick={handleCreate} disabled={busy || !name.trim() || !svg.trim()}>Add icon</button>
        </div>
      </div>

      {icons === null ? (
        <p className="muted">Loading…</p>
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
