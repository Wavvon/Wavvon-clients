import { useState } from "react";
import type { ForumTagDef } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";
import { ColorSwatchPicker } from "../admin/ColorSwatchPicker";

export interface ForumTagManagerActions {
  createTag: (channelId: string, label: string, color?: string | null, position?: number) => Promise<ForumTagDef>;
  editTag: (
    tagId: string,
    updates: { label?: string; color?: string | null; position?: number },
  ) => Promise<ForumTagDef>;
  deleteTag: (tagId: string) => Promise<void>;
}

interface Props {
  channelId: string;
  tags: ForumTagDef[];
  onChange: (tags: ForumTagDef[]) => void;
  actions: ForumTagManagerActions;
}

/** Tag definitions editor for a forum channel's admin settings tab
 * (forum.md §10.3) — mirrors RoleCategoryManager's label/color/reorder/delete
 * pattern one-for-one. */
export function ForumTagManager({ channelId, tags, onChange, actions }: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = tags.slice().sort((a, b) => a.position - b.position);

  function replace(updated: ForumTagDef) {
    onChange(tags.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function runMutation(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreate() {
    const label = newLabel.trim();
    if (!label) return;
    setCreating(true);
    await runMutation(async () => {
      const position = sorted.length > 0 ? sorted[sorted.length - 1].position + 1 : 0;
      const created = await actions.createTag(channelId, label, null, position);
      onChange([...tags, created]);
      setNewLabel("");
    });
    setCreating(false);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= sorted.length) return;
    const a = sorted[index];
    const b = sorted[otherIndex];
    await runMutation(async () => {
      const [updatedA, updatedB] = await Promise.all([
        actions.editTag(a.id, { position: b.position }),
        actions.editTag(b.id, { position: a.position }),
      ]);
      onChange(
        tags.map((t) => {
          if (t.id === updatedA.id) return updatedA;
          if (t.id === updatedB.id) return updatedB;
          return t;
        }),
      );
    });
  }

  async function handleDelete(tag: ForumTagDef) {
    if (!window.confirm(`Delete tag "${tag.label}"? It will be removed from every post.`)) return;
    await runMutation(async () => {
      await actions.deleteTag(tag.id);
      onChange(tags.filter((t) => t.id !== tag.id));
    });
  }

  return (
    <div className="settings-section">
      <label className="settings-label">Tags</label>
      <p className="muted">Define the tags members can pick when posting.</p>
      {error && <p className="error-text">{error}</p>}

      {sorted.length === 0 && <p className="muted">No tags yet.</p>}

      {sorted.map((tag, index) => (
        <div key={tag.id} className="settings-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-small btn-secondary"
            onClick={() => handleMove(index, -1)}
            disabled={index === 0}
            aria-label="Move up"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-small btn-secondary"
            onClick={() => handleMove(index, 1)}
            disabled={index === sorted.length - 1}
            aria-label="Move down"
            title="Move down"
          >
            ↓
          </button>
          <input
            type="text"
            defaultValue={tag.label}
            style={{ flex: 1, minWidth: 120 }}
            onBlur={(e) => {
              const label = e.target.value.trim();
              if (label && label !== tag.label) {
                runMutation(async () => replace(await actions.editTag(tag.id, { label })));
              }
            }}
          />
          <button
            type="button"
            className="color-swatch"
            style={{
              background: safeRoleColor(tag.color) ?? "transparent",
              border: safeRoleColor(tag.color) ? undefined : "1px solid var(--border)",
            }}
            onClick={() => setColorPickerFor(colorPickerFor === tag.id ? null : tag.id)}
            title="Tag color"
          />
          <button
            type="button"
            className="btn-small btn-secondary danger"
            onClick={() => handleDelete(tag)}
          >
            Delete
          </button>
          {colorPickerFor === tag.id && (
            <ColorSwatchPicker
              value={tag.color}
              noColorLabel="No color"
              onChange={(color) => runMutation(async () => replace(await actions.editTag(tag.id, { color })))}
            />
          )}
        </div>
      ))}

      <div className="settings-row">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New tag label"
        />
        <button type="button" onClick={handleCreate} disabled={creating || !newLabel.trim()}>
          Create tag
        </button>
      </div>
    </div>
  );
}
