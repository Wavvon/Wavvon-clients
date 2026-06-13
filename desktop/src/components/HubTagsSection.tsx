import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const RESERVED_TAGS = ["verified", "certified", "official", "partner"];
const MAX_TAGS = 12;

function normalizeTag(t: string): string {
  return t.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function HubTagsSection() {
  const [tags, setTags] = useState<string[]>([]);
  const [nsfw, setNsfw] = useState(false);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | string>("idle");

  useEffect(() => {
    invoke<{ self_tags: string[]; nsfw: boolean }>("get_discovery_settings").then((s) => {
      setTags(s.self_tags);
      setNsfw(s.nsfw);
    }).catch(() => {});
  }, []);

  function addTag() {
    const normalized = normalizeTag(input);
    if (!normalized || normalized.length < 1 || normalized.length > 32) return;
    if (RESERVED_TAGS.includes(normalized)) return;
    if (tags.includes(normalized) || tags.length >= MAX_TAGS) return;
    setTags((prev) => [...prev, normalized]);
    setInput("");
  }

  function removeTag(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
  }

  async function handleSave() {
    setStatus("saving");
    try {
      await invoke("set_discovery_tags", { tags, nsfw });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setStatus(String(e));
    }
  }

  return (
    <div className="settings-section">
      <p className="muted" style={{ marginBottom: 12, padding: "8px 12px", background: "var(--color-bg-secondary, #f0f0f0)", borderRadius: 6, fontSize: "0.875rem" }}>
        <strong>Coming soon:</strong> A public hub directory is in development. Tags set here will be used for discovery once the directory launches.
      </p>
      <label className="settings-label">Self-tags</label>
      <p className="muted">
        Free-form discovery keywords visible on the directory. Max {MAX_TAGS}. Reserved words (verified, certified, official, partner) are not allowed.
      </p>
      <div className="hub-tags-chips">
        {tags.map((t) => (
          <span key={t} className="hub-tag-chip">
            {t}
            <button
              className="hub-tag-remove"
              onClick={() => removeTag(t)}
              aria-label={`Remove tag ${t}`}
              title="Remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      {tags.length < MAX_TAGS && (
        <div className="settings-row" style={{ marginTop: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag (a-z, 0-9, -)"
            maxLength={32}
          />
          <button className="btn-secondary" onClick={addTag} disabled={!input.trim()}>Add</button>
        </div>
      )}
      <div className="settings-section" style={{ marginTop: 12 }}>
        <label className="checkbox-label">
          <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
          18+ / NSFW content — hides this hub by default in the directory
        </label>
      </div>
      <div className="settings-row" style={{ marginTop: 8 }}>
        <button onClick={handleSave} disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save tags"}
        </button>
        {status === "saved" && <span className="muted">Saved</span>}
        {status !== "idle" && status !== "saving" && status !== "saved" && (
          <span className="error-text">{status}</span>
        )}
      </div>
    </div>
  );
}
