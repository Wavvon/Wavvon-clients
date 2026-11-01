import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";

type Panel = "hub" | "channel" | "content";

interface MobileShellProps {
  showHubSidebar: boolean;
  showChannelSidebar: boolean;
  showContent: boolean;
  children: React.ReactNode;
  onBack?: () => void;
}

/**
 * MobileShell wraps the 3-panel layout (hub sidebar, channel sidebar, content area)
 * into a swipeable single-panel view on narrow screens.
 *
 * On desktop (>= 768px) it renders children normally via CSS; on narrow screens it
 * switches to a single-panel slide model.
 *
 * The children order is expected to be:
 *   [0] HubSidebar, [1] ChannelSidebar, [2] ContentArea
 */
export function MobileShell({ children, onBack }: MobileShellProps) {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<Panel>("hub");
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const childArray = React.Children.toArray(children);
  const hubChild = childArray[0];
  const channelChild = childArray[1];
  const contentChild = childArray[2];

  const panelOrder: Panel[] = ["hub", "channel", "content"];
  const currentIdx = panelOrder.indexOf(activePanel);

  function goBack() {
    if (currentIdx > 0) {
      setActivePanel(panelOrder[currentIdx - 1]);
    }
    onBack?.();
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // Only register horizontal swipes where X dominates Y
    if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && currentIdx < panelOrder.length - 1) {
      // Swipe left: advance panel
      setActivePanel(panelOrder[currentIdx + 1]);
    } else if (dx > 0 && currentIdx > 0) {
      // Swipe right: go back
      setActivePanel(panelOrder[currentIdx - 1]);
    }
  }

  return (
    <>
      {/* Layout rules live in styles.css: the hub serves this client under a CSP that forbids inline <style> */}


      {/* Desktop: pass through normally */}
      <div className="mobile-shell-desktop">
        {children}
      </div>

      {/* Mobile: single-panel view */}
      <div
        className="mobile-shell-mobile"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Header with back button + breadcrumbs */}
        <div className="mobile-shell-header">
          {currentIdx > 0 && (
            <button className="mobile-shell-back" onClick={goBack} aria-label={t("mobile.back")}>
              ‹
            </button>
          )}
          <div className="mobile-shell-breadcrumb" aria-label={t("mobile.nav")}>
            {panelOrder.map((panel, idx) => (
              <React.Fragment key={panel}>
                {idx > 0 && <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>›</span>}
                <button
                  className={`mobile-shell-crumb${activePanel === panel ? " active" : ""}`}
                  onClick={() => idx <= currentIdx && setActivePanel(panel)}
                  aria-current={activePanel === panel ? "page" : undefined}
                  disabled={idx > currentIdx}
                >
                  {t(`mobile.panel.${panel}`)}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Active panel */}
        <div className="mobile-shell-panel">
          {activePanel === "hub" && hubChild}
          {activePanel === "channel" && channelChild}
          {activePanel === "content" && contentChild}
        </div>
      </div>
    </>
  );
}
