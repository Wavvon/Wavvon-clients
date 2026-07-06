import { useEffect, useState } from "react";
import type { RoleInfo } from "../types";
import { ALL_PERMISSIONS } from "../constants";

export function RoleEditor({
  role,
  onUpdate,
  onDelete,
}: {
  role: RoleInfo;
  onUpdate: (updates: {
    name?: string;
    permissions?: string[];
    priority?: number;
    display_separately?: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const isBuiltin = role.id.startsWith("builtin-");
  const isOwner = role.id === "builtin-owner";
  const [name, setName] = useState(role.name);
  const [priority, setPriority] = useState(role.priority);
  const [perms, setPerms] = useState<Set<string>>(new Set(role.permissions));
  const [displaySeparately, setDisplaySeparately] = useState(
    role.display_separately ?? false,
  );

  // Sync local state when the role prop changes (e.g., after a refresh)
  useEffect(() => {
    setName(role.name);
    setPriority(role.priority);
    setPerms(new Set(role.permissions));
    setDisplaySeparately(role.display_separately ?? false);
  }, [
    role.id,
    role.name,
    role.priority,
    role.permissions.join(","),
    role.display_separately,
  ]);

  function togglePerm(p: string) {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  }

  function save() {
    onUpdate({
      name: isBuiltin ? undefined : name,
      priority: isBuiltin ? undefined : priority,
      permissions: isOwner ? undefined : Array.from(perms),
      display_separately: displaySeparately,
    });
  }

  return (
    <div className="role-editor">
      <div className="settings-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isBuiltin}
          maxLength={64}
        />
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          disabled={isBuiltin}
          style={{ maxWidth: 90 }}
          title="Priority (higher = more powerful)"
        />
      </div>
      <div className="role-perms">
        {ALL_PERMISSIONS.map((p) => (
          <label key={p.id} className="checkbox-label">
            <input
              type="checkbox"
              checked={perms.has(p.id)}
              onChange={() => togglePerm(p.id)}
              disabled={isOwner}
            />
            {p.label}
          </label>
        ))}
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={displaySeparately}
          onChange={(e) => setDisplaySeparately(e.target.checked)}
        />
        Display members of this role separately in the user list
      </label>
      <div className="settings-row">
        <button onClick={save}>Save</button>
        {!isBuiltin && (
          <button onClick={onDelete} className="btn-secondary">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
