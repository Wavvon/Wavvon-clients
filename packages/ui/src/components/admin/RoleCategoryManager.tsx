import { useState } from "react";
import type { RoleCategory } from "../../types";
import { safeRoleColor } from "../../utils/roleAppearance";
import { EmojiPicker } from "../content/EmojiPicker";
import { ColorSwatchPicker } from "./ColorSwatchPicker";

export interface RoleCategoryManagerActions {
  createRoleCategory: (input: { name: string; position: number }) => Promise<RoleCategory>;
  updateRoleCategory: (
    id: string,
    updates: { name?: string; color?: string | null; icon?: string | null; position?: number },
  ) => Promise<RoleCategory>;
  deleteRoleCategory: (id: string) => Promise<void>;
}

interface Props {
  categories: RoleCategory[];
  onChange: (categories: RoleCategory[]) => void;
  actions: RoleCategoryManagerActions;
}

export function RoleCategoryManager({ categories, onChange, actions }: Props) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = categories.slice().sort((a, b) => a.position - b.position);

  function replace(updated: RoleCategory) {
    onChange(categories.map((c) => (c.id === updated.id ? updated : c)));
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
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    await runMutation(async () => {
      const position = sorted.length > 0 ? sorted[sorted.length - 1].position + 1 : 0;
      const created = await actions.createRoleCategory({ name, position });
      onChange([...categories, created]);
      setNewName("");
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
        actions.updateRoleCategory(a.id, { position: b.position }),
        actions.updateRoleCategory(b.id, { position: a.position }),
      ]);
      onChange(
        categories.map((c) => {
          if (c.id === updatedA.id) return updatedA;
          if (c.id === updatedB.id) return updatedB;
          return c;
        }),
      );
    });
  }

  async function handleDelete(cat: RoleCategory) {
    if (!window.confirm(`Delete category "${cat.name}"? Roles in it become uncategorized.`)) return;
    await runMutation(async () => {
      await actions.deleteRoleCategory(cat.id);
      onChange(categories.filter((c) => c.id !== cat.id));
    });
  }

  return (
    <div className="settings-section">
      <label className="settings-label">Role categories</label>
      <p className="muted">Group roles under headings in the members list and this editor.</p>
      {error && <p className="error-text">{error}</p>}

      {sorted.length === 0 && <p className="muted">No categories yet.</p>}

      {sorted.map((cat, index) => (
        <div key={cat.id} className="settings-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
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
          <span style={{ minWidth: 20, textAlign: "center" }}>{cat.icon ?? "—"}</span>
          <EmojiPicker onPick={(icon) => runMutation(async () => replace(await actions.updateRoleCategory(cat.id, { icon })))} unicodeOnly />
          {cat.icon && (
            <button
              type="button"
              className="btn-small btn-secondary"
              onClick={() => runMutation(async () => replace(await actions.updateRoleCategory(cat.id, { icon: null })))}
            >
              Clear
            </button>
          )}
          <input
            type="text"
            defaultValue={cat.name}
            style={{ flex: 1, minWidth: 120 }}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== cat.name) {
                runMutation(async () => replace(await actions.updateRoleCategory(cat.id, { name })));
              }
            }}
          />
          <button
            type="button"
            className="color-swatch"
            style={{
              background: safeRoleColor(cat.color) ?? "transparent",
              border: safeRoleColor(cat.color) ? undefined : "1px solid var(--border)",
            }}
            onClick={() => setColorPickerFor(colorPickerFor === cat.id ? null : cat.id)}
            title="Category color"
          />
          <button
            type="button"
            className="btn-small btn-secondary danger"
            onClick={() => handleDelete(cat)}
          >
            Delete
          </button>
          {colorPickerFor === cat.id && (
            <ColorSwatchPicker
              value={cat.color}
              noColorLabel="No color"
              onChange={(color) => runMutation(async () => replace(await actions.updateRoleCategory(cat.id, { color })))}
            />
          )}
        </div>
      ))}

      <div className="settings-row">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
        />
        <button type="button" onClick={handleCreate} disabled={creating || !newName.trim()}>
          Create category
        </button>
      </div>
    </div>
  );
}
