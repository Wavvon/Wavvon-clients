import { useEffect, useRef, type CSSProperties } from "react";

// A transparent, auto-growing textarea (no manual resize handle) styled as
// the surrounding card text via `.profile-inline-input`. Shared by the
// settings profile editor and the member card so the bio/activities fields
// look and behave identically in both — height re-derived from content on
// every change, with a floor.
export function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  maxLength,
  minHeight = 120,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  minHeight?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);
  return (
    <textarea
      ref={ref}
      className="profile-inline-input"
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={{ fontSize: "var(--text-sm)", resize: "none", overflow: "hidden", minHeight, ...style }}
    />
  );
}
