import { useTranslation } from "react-i18next";
import { HoverSubmenu } from "../HoverSubmenu";
import type { NotifyMode } from "../../types";

/** Where these items are being rendered. Only the class names differ — the
 *  items, their order and their conditions do not, which is the whole reason
 *  this component exists. */
export type HubMenuVariant = "dropdown" | "context";

export interface HubMenuItemsProps {
  variant: HubMenuVariant;
  /** Close whichever menu is showing these. The dropdown and the context menu
   *  each close themselves their own way; every item does it first. */
  onDone: () => void;

  activeHubId: string | null;
  isAdmin: boolean;
  canCreateInvites?: boolean;
  hideSilenced?: boolean;
  hubNotifyMode: Record<string, NotifyMode>;
  notifyModeLabels: Record<NotifyMode, string>;
  unreadByChannel: Record<string, Record<string, boolean>>;

  onOpenHubAdmin: () => void;
  onOpenHubAdminInvites: () => void;
  onOpenQuickInvite?: () => void;
  onOpenCreateChannel: (parentId: string | null, isCategory: boolean) => void;
  onSetHubMode: (hubId: string, mode: NotifyMode) => void;
  onToggleHideSilenced?: () => void;
  onClearHubUnread: (hubId: string) => void;
  onRemoveHub: (hubId: string) => void;
}

// The hub menu's items, in one place, rendered by both ways of reaching it:
// the chevron dropdown beside the hub name and the right-click menu on the
// hub header.
//
// They were two copies with the same seven items, and they had already
// drifted — same items, different order — which is how the next divergence
// starts: an entry added to one and not the other, with nothing to notice.
// One control, one set of items, two gestures (future-features.md,
// "Right-click a hub").
export function HubMenuItems({
  variant,
  onDone,
  activeHubId,
  isAdmin,
  canCreateInvites,
  hideSilenced,
  hubNotifyMode,
  notifyModeLabels,
  unreadByChannel,
  onOpenHubAdmin,
  onOpenHubAdminInvites,
  onOpenQuickInvite,
  onOpenCreateChannel,
  onSetHubMode,
  onToggleHideSilenced,
  onClearHubUnread,
  onRemoveHub,
}: HubMenuItemsProps) {
  const { t } = useTranslation();
  const item = variant === "dropdown" ? "hub-dropdown-item" : "context-menu-item";
  const subitem = variant === "dropdown" ? "hub-dropdown-subitem" : "context-menu-subitem";
  const submenuTrigger =
    variant === "dropdown" ? "hub-dropdown-submenu-trigger" : "context-menu-submenu-trigger";

  const hasUnread =
    !!activeHubId && Object.keys(unreadByChannel[activeHubId] ?? {}).length > 0;

  return (
    <>
      {(canCreateInvites ?? isAdmin) && (
        <button
          className={item}
          onClick={() => {
            onDone();
            if (isAdmin) onOpenHubAdminInvites();
            else onOpenQuickInvite?.();
          }}
        >
          {t("hub.invite_people")}
        </button>
      )}

      {isAdmin && (
        <button className={item} onClick={() => { onDone(); onOpenHubAdmin(); }}>
          {t("hub.settings")}
        </button>
      )}

      {isAdmin && (
        <button className={item} onClick={() => { onDone(); onOpenCreateChannel(null, false); }}>
          {t("hub.create_channel")}
        </button>
      )}

      <HoverSubmenu
        trigger={<button className={`${item} ${submenuTrigger}`}>{t("hub.notifications")} ▸</button>}
      >
        {activeHubId &&
          (["all", "mentions", "silent"] as NotifyMode[]).map((mode) => {
            const cur = hubNotifyMode[activeHubId] ?? "all";
            return (
              <button
                key={mode}
                className={`${item} ${subitem}`}
                onClick={() => { onDone(); onSetHubMode(activeHubId, mode); }}
              >
                {cur === mode ? "✓ " : "   "}
                {notifyModeLabels[mode]}
              </button>
            );
          })}
      </HoverSubmenu>

      <button className={item} onClick={() => { onDone(); onToggleHideSilenced?.(); }}>
        {hideSilenced ? "✓ " : ""}
        {t("hub.hide_silenced")}
      </button>

      {hasUnread && activeHubId && (
        <button className={item} onClick={() => { onDone(); onClearHubUnread(activeHubId); }}>
          {t("hub.mark_all_read")}
        </button>
      )}

      <button
        className={`${item} danger`}
        onClick={() => { onDone(); if (activeHubId) onRemoveHub(activeHubId); }}
      >
        {t("hub.leave")}
      </button>
    </>
  );
}
