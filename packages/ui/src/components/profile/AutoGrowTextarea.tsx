import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";

// A transparent, auto-growing textarea (no manual resize handle) styled as
// the surrounding card text via `.profile-inline-input`. Shared by the
// settings profile editor and the member card so the bio/activities fields
// look and behave identically in both — height re-derived from content on
// every change, with a floor.
//
// Forwards the underlying textarea element so a caller can read cursor
// position (e.g. the Activities game-icon row inserting at the current
// line) — optional, most callers don't pass a ref.
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  minHeight?: number;
  style?: CSSProperties;
}>(function AutoGrowTextarea({ value, onChange, placeholder, ariaLabel, maxLength, minHeight = 120, style }, forwardedRef) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLTextAreaElement);
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
});
