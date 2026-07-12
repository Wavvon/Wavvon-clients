import type { CSSProperties, ReactNode } from "react";

// The "what are you thinking?" thought bubble beside the avatar. Shared by
// the settings editor (always editable, with an emoji picker in `trailing`)
// and the member card (editable on your own, static text otherwise) so the
// two look identical.
export function StatusBubble({
  value,
  editable,
  onChange,
  placeholder,
  ariaLabel,
  maxLength = 140,
  trailing,
  style,
}: {
  value: string;
  editable: boolean;
  onChange?: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  trailing?: ReactNode;
  style?: CSSProperties;
}) {
  if (!editable) {
    return (
      <div className="thought-bubble" style={style}>
        <span style={{ fontSize: "var(--text-sm)" }}>{value}</span>
      </div>
    );
  }
  return (
    <div className="thought-bubble" style={{ display: "flex", alignItems: "center", gap: 4, ...style }}>
      <input
        type="text"
        className="profile-inline-input"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        style={{ fontSize: "var(--text-sm)", flex: 1, minWidth: 0 }}
      />
      {trailing}
    </div>
  );
}
