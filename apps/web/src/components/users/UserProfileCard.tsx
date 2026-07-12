import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleCategory, UserProfile } from "@shared/types";
import { getUserProfile, listRoleCategories, getActiveHubId } from "@platform";
import { formatRelative } from "@wavvon/core";
import { Avatar } from "@wavvon/ui";
import { groupRolesByCategory, roleTintStyle } from "@shared/utils/roleAppearance";
import { identityGradient } from "@shared/utils/identityColor";

interface Props {
  pubkey: string;
  /** The active account's own pubkey — used to hide the Message action on your own profile. */
  myPubkey?: string | null;
  onClose: () => void;
  onStartConversation?: (pubkey: string) => void;
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

export function UserProfileCard({ pubkey, myPubkey, onClose, onStartConversation }: Props) {
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
      {/* .modal, not the undefined .modal-box — the card was rendering with
          a transparent background. */}
      <div
        className="modal"
        style={{ maxWidth: 360, position: "relative", padding: 0, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("user.profile.close")}
          style={{ position: "absolute", top: 10, right: 12, zIndex: 2, background: "rgba(0,0,0,0.3)", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "#fff", borderRadius: "var(--r-pill)", width: 26, height: 26 }}
        >
          ×
        </button>

        {error && <p style={{ color: "var(--danger)", padding: 24 }}>{error}</p>}

        {!profile && !error && (
          <p className="muted" style={{ textAlign: "center", padding: 24 }}>
            {t("modal.loading")}
          </p>
        )}

        {profile && (
          <>
            {/* Banner: the member's cover / accent / key-derived colors —
                the payoff for the profile cosmetics. */}
            <div
              className="profile-card-banner"
              style={
                profile.cover
                  ? { backgroundImage: `url(${profile.cover})`, backgroundSize: "cover", backgroundPosition: "center" }
                  : profile.accent_color
                    ? { background: `linear-gradient(120deg, ${profile.accent_color}, ${profile.accent_color}99)` }
                    : { background: identityGradient(pubkey) }
              }
              aria-hidden="true"
            />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 24px 24px" }}>
            <div style={{ marginTop: -28 }}>
              <Avatar src={profile.avatar} name={profile.display_name ?? pubkey} pubkey={pubkey} size={56} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "var(--text-md)" }}>
                {profile.display_name ?? <span className="muted">{t("profile.no_display_name")}</span>}
              </div>
              {profile.pronouns && (
                <div className="muted" style={{ fontSize: "var(--text-sm)" }}>{profile.pronouns}</div>
              )}
              {profile.status_message && (
                <div style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>💬 {profile.status_message}</div>
              )}
              <div
                className="muted"
                style={{ fontFamily: "monospace", fontSize: "var(--text-sm)" }}
              >
                {pubkey.slice(0, 16)}…{pubkey.slice(-8)}
              </div>
            </div>

            {onStartConversation && myPubkey !== pubkey && (
              <button
                className="btn-primary"
                onClick={() => onStartConversation(pubkey)}
              >
                {t("user.profile.message")}
              </button>
            )}

            {profile.bio && (
              <p style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", margin: 0 }}>{profile.bio}</p>
            )}

            {profile.activities && (
              <div>
                <div
                  className="muted"
                  style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}
                >
                  {t("settings.profile.fields.activities_label")}
                </div>
                <p style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", margin: 0 }}>{profile.activities}</p>
              </div>
            )}

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
                  {profile.badges.map((b) => (
                    <span key={b.id} className="role-badge">
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
