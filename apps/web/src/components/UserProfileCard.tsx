import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleCategory, UserProfile } from "../types";
import { getUserProfile, listRoleCategories, getActiveHubId } from "@platform";
import { formatRelative } from "@wavvon/core";
import { Avatar } from "@wavvon/ui";
import { groupRolesByCategory, roleTintStyle } from "../utils/roleAppearance";

interface Props {
  pubkey: string;
  onClose: () => void;
}

// Categories rarely change and are shared by every profile card opened
// against the same hub — cache them here (keyed by hub id) instead of
// refetching every time a card opens.
const categoryCache = new Map<string, Promise<RoleCategory[]>>();

function loadRoleCategories(hubId: string): Promise<RoleCategory[]> {
  let cached = categoryCache.get(hubId);
  if (!cached) {
    cached = listRoleCategories().catch((e) => {
      categoryCache.delete(hubId);
      throw e;
    });
    categoryCache.set(hubId, cached);
  }
  return cached;
}

export function UserProfileCard({ pubkey, onClose }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUserProfile(pubkey)
      .then(setProfile)
      .catch((e) => setError(String(e)));
    const hubId = getActiveHubId();
    if (hubId) {
      loadRoleCategories(hubId)
        .then(setCategories)
        .catch(() => setCategories([]));
    }
  }, [pubkey]);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("user.profile.aria_label")}
    >
      <div
        className="modal-box"
        style={{ maxWidth: 360, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label={t("user.profile.close")}
        >
          ×
        </button>

        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

        {!profile && !error && (
          <p className="muted" style={{ textAlign: "center", padding: 16 }}>
            {t("modal.loading")}
          </p>
        )}

        {profile && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar src={profile.avatar} name={profile.display_name ?? pubkey} pubkey={pubkey} size={48} />
              <div>
                <div style={{ fontWeight: 600, fontSize: "var(--text-md)" }}>
                  {profile.display_name ?? <span className="muted">{t("profile.no_display_name")}</span>}
                </div>
                <div
                  className="muted"
                  style={{ fontFamily: "monospace", fontSize: "var(--text-sm)" }}
                >
                  {pubkey.slice(0, 16)}…{pubkey.slice(-8)}
                </div>
              </div>
            </div>

            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              {t("user.profile.joined", { date: formatRelative(profile.joined_at) })}
            </div>

            {profile.roles.length > 0 && (
              <div>
                <div
                  className="muted"
                  style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}
                >
                  {t("user.profile.roles")}
                </div>
                {groupRolesByCategory(profile.roles, categories).map((group) => (
                  <div key={group.category?.id ?? "uncategorized"} className="role-category-group">
                    <div
                      className={`role-category-header ${group.category?.color ? "role-category-header-tinted" : ""}`}
                      style={roleTintStyle(group.category?.color)}
                    >
                      {group.category?.icon && <span>{group.category.icon}</span>}
                      <span>{group.category?.name ?? t("hub.admin.roles.uncategorized")}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {group.roles.map((r) => (
                        <span
                          key={r.id}
                          className={`role-badge ${r.color ? "role-badge-tinted" : ""}`}
                          style={roleTintStyle(r.color)}
                        >
                          {r.icon && <span>{r.icon}</span>} {r.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {profile.badges.length > 0 && (
              <div>
                <div
                  className="muted"
                  style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}
                >
                  {t("user.profile.badges")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {profile.badges.map((b, i) => (
                    <span key={i} className="role-badge">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
