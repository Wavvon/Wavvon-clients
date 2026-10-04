import React, { useRef, useState } from "react";

interface Props {
  trigger: React.ReactNode;
  children: React.ReactNode;
  triggerClassName?: string;
}

export function HoverSubmenu({ trigger, children, triggerClassName }: Props) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<"right" | "left" | "below">("right");
  const [shiftUp, setShiftUp] = useState(0);

  function handleMouseEnter() {
    if (!groupRef.current) return;
    const rect = groupRef.current.getBoundingClientRect();
    const submenuWidth = 180;
    if (rect.right + submenuWidth <= window.innerWidth) {
      setSide("right");
    } else if (rect.left >= submenuWidth) {
      setSide("left");
    } else {
      setSide("below");
    }
    // Opened beside its trigger, the list starts at the trigger's top; low in
    // a long sidebar that put most of it below the fold, out of reach. Lift it
    // by what would overflow, never above the top of the viewport. Matches the
    // .hover-submenu-items max-height, min(320px, 70vh).
    const height = Math.min(320, window.innerHeight * 0.7);
    const overflow = rect.top + height - window.innerHeight;
    setShiftUp(overflow > 0 ? Math.min(overflow + 8, rect.top) : 0);
  }

  return (
    <div
      ref={groupRef}
      className={`hover-submenu-group hover-submenu-${side} ${triggerClassName ?? ""}`}
      onMouseEnter={handleMouseEnter}
    >
      <div className="hover-submenu-trigger">{trigger}</div>
      <div
        className="hover-submenu-items"
        style={side !== "below" && shiftUp > 0 ? { top: -shiftUp } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
