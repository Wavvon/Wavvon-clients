import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HubIcon } from "../types";
import { sanitizeSvg } from "../utils/svgSanitize";

export function HubIconsSection() {
  const [icons, setIcons] = useState<HubIcon[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newSvg, setNewSvg] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<HubIcon[]>("list_hub_icons")
      .then((list) => { setIcons(list); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setUploadError("Only .svg files are supported.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const clean = sanitizeSvg(reader.result as string);
      if (!clean) {
        setUploadError("Invalid or unsafe SVG.");
      } else {
        setNewSvg(clean);
        setUploadError(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleUpload() {
    if (!newName.trim() || !newSvg) return;
    setUploading(true);
    setActionError(null);
    try {
      const icon = await invoke<HubIcon>("create_hub_icon", {
        name: newName.trim(),
        svgContent: newSvg,
      });
      setIcons((prev) => [...prev, icon]);
      setNewName("");
      setNewSvg(null);
    } catch (e) {
      setActionError(String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await invoke("delete_hub_icon", { iconId: id });
      setIcons((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) return;
    setActionError(null);
    try {
      await invoke("rename_hub_icon", { iconId: id, name });
      setIcons((prev) => prev.map((i) => (i.id === id ? { ...i, name } : i)));
      setRenamingId(null);
    } catch (e) {
      setActionError(String(e));
    }
  }

  return (
    <div>
      <div className="settings-section">
        <label className="settings-label">Upload new icon</label>
        <div className="settings-row" style={{ gap: "8px", flexWrap: "wrap" }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Icon name"
            style={{ flex: "1", minWidth: "120px" }}
          />
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileRef.current?.click()}
          >
            {newSvg ? "SVG ready ✓" : "Choose SVG…"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".svg,image/svg+xml"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            onClick={handleUpload}
            disabled={!newName.trim() || !newSvg || uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
        {uploadError && (
          <p style={{ color: "var(--color-error, red)", marginTop: "4px" }}>{uploadError}</p>
        )}
        {newSvg && !uploadError && (
          <p className="muted" style={{ marginTop: "4px" }}>SVG loaded and sanitized.</p>
        )}
      </div>

      {actionError && (
        <p style={{ color: "var(--color-error, red)", marginBottom: "8px" }}>{actionError}</p>
      )}
      {loading && <p className="muted">Loading…</p>}
      {!loading && icons.length === 0 && (
        <p className="muted">No hub icons yet. Upload one above.</p>
      )}
      {icons.length > 0 && (
        <div className="hub-icons-grid">
          {icons.map((icon) => {
            const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(icon.svg_content)}`;
            return (
              <div key={icon.id} className="hub-icon-card">
                <div className="hub-icon-card-preview">
                  <img src={dataUri} width={40} height={40} style={{ objectFit: "contain" }} aria-hidden="true" />
                </div>
                {renamingId === icon.id ? (
                  <div className="hub-icon-card-rename">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(icon.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleRename(icon.id)}>Save</button>
                    <button className="btn-secondary" onClick={() => setRenamingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="hub-icon-card-info">
                    <span className="hub-icon-card-name" title={icon.name}>{icon.name}</span>
                    <div className="hub-icon-card-actions">
                      <button
                        className="btn-secondary"
                        onClick={() => { setRenamingId(icon.id); setRenameValue(icon.name); }}
                      >
                        Rename
                      </button>
                      <button
                        className="btn-secondary danger"
                        onClick={() => handleDelete(icon.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
