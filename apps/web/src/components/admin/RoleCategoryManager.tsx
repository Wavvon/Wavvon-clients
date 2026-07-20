import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleCategory } from "@shared/types";
import { createRoleCategory, updateRoleCategory, deleteRoleCategory } from "@platform";
import { HubApiError } from "../../platform/http";
import { safeRoleColor } from "@wavvon/ui";
import { EmojiPicker } from "@wavvon/ui";
import { ColorSwatchPicker } from "@components/common/ColorSwatchPicker";

interface Props {
  categories: RoleCategory[];
  onChange: (categories: RoleCategory[]) => void;
}

export function RoleCategoryManager({ categories, onChange }: Props) {
  const { t } = useTranslation();
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
      setError(e instanceof HubApiError ? e.message : String(e));
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    await runMutation(async () => {
      const position = sorted.length > 0 ? sorted[sorted.length - 1].position + 1 : 0;
      const created = await createRoleCategory({ name, position });
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
        updateRoleCategory(a.id, { position: b.position }),
        updateRoleCategory(b.id, { position: a.position }),
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
    if (!window.confirm(t("hub.admin.role_categories.delete_confirm"))) return;
    await runMutation(async () => {
      await deleteRoleCategory(cat.id);
      onChange(categories.filter((c) => c.id !== cat.id));
    });
  }

  return (
    <div className="settings-section">
      <label className="settings-label">{t("hub.admin.role_categories.title")}</label>
      <p className="muted">{t("hub.admin.role_categories.hint")}</p>
      {error && <p className="error-text">{error}</p>}

      {sorted.length === 0 && <p className="muted">{t("hub.admin.role_categories.empty")}</p>}

      {sorted.map((cat, index) => (
        <div key={cat.id} className="settings-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn-small btn-secondary"
            onClick={() => handleMove(index, -1)}
            disabled={index === 0}
            aria-label={t("hub.admin.role_categories.move_up")}
            title={t("hub.admin.role_categories.move_up")}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-small btn-secondary"
            onClick={() => handleMove(index, 1)}
            disabled={index === sorted.length - 1}
            aria-label={t("hub.admin.role_categories.move_down")}
            title={t("hub.admin.role_categories.move_down")}
          >
            ↓
          </button>
          <span style={{ minWidth: 20, textAlign: "center" }}>{cat.icon ?? "—"}</span>
          <EmojiPicker onPick={(icon) => runMutation(async () => replace(await updateRoleCategory(cat.id, { icon })))} unicodeOnly />
          {cat.icon && (
            <button
              type="button"
              className="btn-small btn-secondary"
              onClick={() => runMutation(async () => replace(await updateRoleCategory(cat.id, { icon: null })))}
            >
              {t("modal.clear")}
            </button>
          )}
          <input
            type="text"
            defaultValue={cat.name}
            style={{ flex: 1, minWidth: 120 }}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== cat.name) {
                runMutation(async () => replace(await updateRoleCategory(cat.id, { name })));
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
            title={t("hub.admin.role_categories.color_label")}
          />
          <button
            type="button"
            className="btn-small btn-secondary danger"
            onClick={() => handleDelete(cat)}
          >
            {t("hub.admin.role_categories.delete")}
          </button>
          {colorPickerFor === cat.id && (
            <ColorSwatchPicker
              value={cat.color}
              noColorLabel={t("hub.admin.role_categories.no_color")}
              onChange={(color) => runMutation(async () => replace(await updateRoleCategory(cat.id, { color })))}
            />
          )}
        </div>
      ))}

      <div className="settings-row">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t("hub.admin.role_categories.new_name_placeholder")}
        />
        <button type="button" onClick={handleCreate} disabled={creating || !newName.trim()}>
          {t("hub.admin.role_categories.create")}
        </button>
      </div>
    </div>
  );
}
