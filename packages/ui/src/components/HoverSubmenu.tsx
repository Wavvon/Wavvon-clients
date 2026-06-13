import React, { useRef, useState } from "react";

interface Props {
  trigger: React.ReactNode;
  children: React.ReactNode;
  triggerClassName?: string;
}

export function HoverSubmenu({ trigger, children, triggerClassName }: Props) {
  const groupRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<"right" | "left" | "below">("right");

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
  }

  return (
    <div
      ref={groupRef}
      className={`hover-submenu-group hover-submenu-${side} ${triggerClassName ?? ""}`}
      onMouseEnter={handleMouseEnter}
    >
      <div className="hover-submenu-trigger">{trigger}</div>
      <div className="hover-submenu-items">{children}</div>
    </div>
  );
}
