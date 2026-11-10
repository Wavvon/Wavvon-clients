import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PermissionSection } from "../../utils/channelPermissions";

const LABELS: Record<string, string> = {
  messages: "hub.admin.roles.section.messages",
  voice: "hub.admin.roles.section.voice",
  moderation: "hub.admin.roles.section.moderation",
  members: "hub.admin.roles.section.members",
  channels: "hub.admin.roles.section.channels",
  events: "hub.admin.roles.section.events",
  hub: "hub.admin.roles.section.hub",
  integrations: "hub.admin.roles.section.integrations",
  federation: "hub.admin.roles.section.federation",
  other: "hub.admin.roles.section.other",
  all: "hub.admin.roles.section.all",
};

/** The permission list in collapsible sections, each with how many of its
 *  permissions are set. Shared by the role editor and the channel overwrites
 *  tab so both show the same sections. A section holding something set starts
 *  open; which are open is state, so a reload of the list does not fold them. */
export function PermissionSections({
  sections,
  isSet,
  renderItem,
  layout = "wrap",
}: {
  sections: PermissionSection[];
  isSet: (id: string) => boolean;
  renderItem: (id: string) => ReactNode;
  /** `wrap` for checkboxes side by side, `rows` for one per line. */
  layout?: "wrap" | "rows";
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(sections.filter((s) => s.ids.some(isSet)).map((s) => s.key)),
  );
  return (
    <>
      {sections.map((s) => {
        const isOpen = open.has(s.key);
        return (
          <div key={s.key} className="permission-section" data-open={isOpen || undefined}>
            <button
              type="button"
              className="btn-small btn-secondary"
              aria-expanded={isOpen}
              onClick={() => setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(s.key)) next.delete(s.key); else next.add(s.key);
                return next;
              })}
            >
              {LABELS[s.key] ? t(LABELS[s.key]) : s.key}{" "}
              <span className="muted">
                {t("hub.admin.roles.section.count", { set: s.ids.filter(isSet).length, total: s.ids.length })}
              </span>
            </button>
            {isOpen && (
              <div
                style={layout === "wrap"
                  ? { display: "flex", flexWrap: "wrap", gap: "var(--space-2)", margin: "var(--space-2) 0" }
                  : { margin: "var(--space-2) 0" }}
              >
                {s.ids.map((id) => renderItem(id))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
