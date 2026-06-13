import { useState } from "react";
import { ALL_PERMISSIONS } from "../constants";

export function RoleCreator({
  onCreate,
}: {
  onCreate: (
    name: string,
    perms: string[],
    priority: number,
    displaySeparately: boolean,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [priority, setPriority] = useState(10);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [displaySeparately, setDisplaySeparately] = useState(false);

  function togglePerm(p: string) {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  }

  function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, Array.from(perms), priority, displaySeparately);
    setName("");
    setPriority(10);
    setPerms(new Set());
    setDisplaySeparately(false);
  }

  return (
    <div className="role-editor role-creator">
      <h3>Create role</h3>
      <div className="settings-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name"
        />
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
          style={{ maxWidth: 90 }}
          title="Priority"
        />
      </div>
      <div className="role-perms">
        {ALL_PERMISSIONS.map((p) => (
          <label key={p.id} className="checkbox-label">
            <input
              type="checkbox"
              checked={perms.has(p.id)}
              onChange={() => togglePerm(p.id)}
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
        <button onClick={create}>Create role</button>
      </div>
    </div>
  );
}
