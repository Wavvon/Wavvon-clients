import type { ForumTagDef } from "../../types";

interface Props {
  tags: ForumTagDef[];
  selected: string[];
  onToggle: (tagId: string) => void;
  max?: number;
}

/** Multi-select tag toggle row for the post composer and edit path
 * (forum.md §10.3) — reuses the `.forum-tag-chip` look from the read-only
 * chips on post rows, just interactive. */
export function ForumTagPicker({ tags, selected, onToggle, max = 5 }: Props) {
  if (!tags.length) return null;
  return (
    <div className="settings-section">
      <label className="settings-label">Tags</label>
      <div className="forum-tag-row">
        {tags.map((tag) => {
          const active = selected.includes(tag.id);
          const disabled = !active && selected.length >= max;
          return (
            <button
              key={tag.id}
              type="button"
              className={`forum-tag-chip toggle${active ? " active" : ""}`}
              style={tag.color ? { borderColor: tag.color, background: active ? tag.color : undefined } : undefined}
              onClick={() => onToggle(tag.id)}
              disabled={disabled}
              aria-pressed={active}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
      {selected.length >= max && <p className="muted">Up to {max} tags per post.</p>}
    </div>
  );
}
