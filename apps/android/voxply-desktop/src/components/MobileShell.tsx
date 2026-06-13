import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";

export interface MobileShellHandle {
  closeTopDrawer(): boolean;
}

interface MobileShellProps {
  hubDrawer: React.ReactNode;
  channelDrawer: React.ReactNode;
  children: React.ReactNode;
  title: string;
  onBack?: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
  },
  topBar: {
    height: 48,
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "var(--color-bg-primary, #1a1a2e)",
    padding: "0 12px",
    flexShrink: 0,
    zIndex: 1,
  },
  title: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: 600,
    fontSize: 15,
  },
  content: {
    flex: 1,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "inherit",
    padding: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
    borderRadius: 6,
  },
};

const drawerCss = `
.ms-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10;
}
.ms-drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(80vw, 320px);
  background: var(--color-bg-secondary, #16213e);
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  z-index: 11;
  overflow-y: auto;
}
.ms-drawer.open {
  transform: translateX(0);
}
`;

function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function ChannelListIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export const MobileShell = forwardRef<MobileShellHandle, MobileShellProps>(
  function MobileShell(
    { hubDrawer, channelDrawer, children, title, onBack },
    ref
  ) {
    const [hubOpen, setHubOpen] = useState(false);
    const [channelOpen, setChannelOpen] = useState(false);

    const openHub = useCallback(() => {
      setChannelOpen(false);
      setHubOpen(true);
    }, []);

    const openChannel = useCallback(() => {
      setHubOpen(false);
      setChannelOpen(true);
    }, []);

    const closeAll = useCallback(() => {
      setHubOpen(false);
      setChannelOpen(false);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        closeTopDrawer() {
          if (channelOpen) {
            setChannelOpen(false);
            return true;
          }
          if (hubOpen) {
            setHubOpen(false);
            return true;
          }
          onBack?.();
          return false;
        },
      }),
      [channelOpen, hubOpen, onBack]
    );

    const anyOpen = hubOpen || channelOpen;

    return (
      <div data-mobile-shell style={styles.shell}>
        <style>{drawerCss}</style>

        <div style={styles.topBar}>
          <button
            style={styles.iconBtn}
            aria-label="Open hub list"
            onClick={openHub}
          >
            <HamburgerIcon />
          </button>
          <button
            style={styles.iconBtn}
            aria-label="Open channel list"
            onClick={openChannel}
          >
            <ChannelListIcon />
          </button>
          <span style={styles.title}>{title}</span>
        </div>

        <div style={styles.content}>{children}</div>

        {anyOpen && (
          <div
            className="ms-overlay"
            role="presentation"
            onClick={closeAll}
          />
        )}

        <div className={`ms-drawer${hubOpen ? " open" : ""}`}>
          {hubDrawer}
        </div>

        <div className={`ms-drawer${channelOpen ? " open" : ""}`}>
          {channelDrawer}
        </div>
      </div>
    );
  }
);
