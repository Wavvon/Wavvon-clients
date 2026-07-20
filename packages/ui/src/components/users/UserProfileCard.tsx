import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RoleCategory, UserProfile } from "../../types";
import { formatRelative } from "@wavvon/core";
import { Avatar } from "../Avatar";
import { distinguishingRoles, groupRolesByCategory, roleTintStyle } from "../../utils/roleAppearance";
import { profileBannerStyle } from "../../utils/identityColor";
import { insertAtLineStart } from "../../utils/activityEmoji";
import { AutoGrowTextarea } from "../profile/AutoGrowTextarea";
import { GameEmojiRow } from "../profile/GameEmojiRow";
import { StatusBubble } from "../profile/StatusBubble";

const ACTIVITIES_MAX = 500;

const trimToNull = (s: string) => {
  const v = s.trim();
  return v ? v : null;
};

/** Platform-calling operations the profile card needs. The optional members
 * degrade gracefully when omitted: no `listRoleCategories` → flat role list;
 * no `saveMyProfile` → view-only own-profile fields. */
export interface UserProfileCardActions {
  getUserProfile: (pubkey: string) => Promise<UserProfile>;
  listRoleCategories?: (hubId: string) => Promise<RoleCategory[]>;
  saveMyProfile?: (
    hubId: string,
    fields: { status_message: string | null; bio: string | null; activities: string | null },
  ) => Promise<void>;
}

interface Props {
  pubkey: string;
  /** The active account's own pubkey — used to hide the Message action on your own profile. */
  myPubkey?: string | null;
  activeHubId?: string | null;
  actions: UserProfileCardActions;
  onClose: () => void;
  onStartConversation?: (pubkey: string) => void;
}

// Categories rarely change and are shared by every profile card opened
// against the same hub — cache them here (keyed by hub id) instead of
// refetching every time a card opens.
const categoryCache = new Map<string, Promise<RoleCategory[]>>();

function loadRoleCategories(hubId: string, listRoleCategories: (hubId: string) => Promise<RoleCategory[]>): Promise<RoleCategory[]> {
  let cached = categoryCache.get(hubId);
  if (!cached) {
    cached = listRoleCategories(hubId).catch((e) => {
      categoryCache.delete(hubId);
      throw e;
    });
    categoryCache.set(hubId, cached);
  }
  return cached;
}

export function UserProfileCard({ pubkey, myPubkey, activeHubId, actions, onClose, onStartConversation }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [categories, setCategories] = useState<RoleCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"bio" | "activities" | "hubs">("bio");
  const isOwn = !!myPubkey && myPubkey === pubkey && !!actions.saveMyProfile;
  // Own card is directly editable (WYSIWYG) for the free-text fields —
  // status / bio / activities are live inputs, seeded from the loaded
  // profile, with a Save that appears only when something changed.
  // Name/avatar/pronouns/cosmetics/hubs stay in the full Settings editor.
  const [draft, setDraft] = useState({ status_message: "", bio: "", activities: "" });
  const [saving, setSaving] = useState(false);
  const activitiesRef = useRef<HTMLTextAreaElement>(null);

  // Game-icon row: insert at the start of the line under the cursor (see
  // ProfileEditorSection's own copy — this card has its own draft state).
  function insertGameEmoji(emoji: string) {
    const el = activitiesRef.current;
    const cursor = el?.selectionStart ?? draft.activities.length;
    const result = insertAtLineStart(draft.activities, cursor, `${emoji} `, ACTIVITIES_MAX);
    if (!result) return;
    setDraft((d) => ({ ...d, activities: result.text }));
    requestAnimationFrame(() => {
      el?.setSelectionRange(result.cursorPos, result.cursorPos);
      el?.focus();
    });
  }

  useEffect(() => {
    if (profile) {
      setDraft({
        status_message: profile.status_message ?? "",
        bio: profile.bio ?? "",
        activities: profile.activities ?? "",
      });
    }
  }, [profile]);

  const dirty =
    isOwn &&
    !!profile &&
    (draft.status_message !== (profile.status_message ?? "") ||
      draft.bio !== (profile.bio ?? "") ||
      draft.activities !== (profile.activities ?? ""));

  async function saveEdit() {
    if (!activeHubId || !actions.saveMyProfile) return;
    setSaving(true);
    const fields = {
      status_message: trimToNull(draft.status_message),
      bio: trimToNull(draft.bio),
      activities: trimToNull(draft.activities),
    };
    try {
      await actions.saveMyProfile(activeHubId, fields);
      setProfile((p) => (p ? { ...p, ...fields } : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    actions.getUserProfile(pubkey)
      .then(setProfile)
      .catch((e) => setError(String(e)));
    if (activeHubId && actions.listRoleCategories) {
      loadRoleCategories(activeHubId, actions.listRoleCategories)
        .then(setCategories)
        .catch(() => setCategories([]));
    } else {
      setCategories([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, activeHubId]);

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
              style={profileBannerStyle({ pubkey, cover: profile.cover, accentColor: profile.accent_color })}
              aria-hidden="true"
            />
          <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 24px 24px" }}>
            {/* Avatar + status thought bubble — the avatar "thinking". */}
            <div style={{ marginTop: -28, display: "flex", gap: 12, alignItems: "flex-start" }}>
              <Avatar src={profile.avatar} name={profile.display_name ?? pubkey} pubkey={pubkey} size={56} />
              {isOwn ? (
                <StatusBubble
                  value={draft.status_message}
                  editable
                  onChange={(v) => setDraft((d) => ({ ...d, status_message: v }))}
                  placeholder={t("settings.profile.fields.status_placeholder")}
                  ariaLabel={t("settings.profile.fields.status_label")}
                  style={{ marginTop: 16, flex: 1 }}
                />
              ) : (
                profile.status_message && (
                  <StatusBubble value={profile.status_message} editable={false} style={{ marginTop: 20 }} />
                )
              )}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "var(--text-md)" }}>
                {profile.display_name ?? <span className="muted">{t("profile.no_display_name")}</span>}
              </div>
              {profile.pronouns && (
                <div className="muted" style={{ fontSize: "var(--text-sm)" }}>{profile.pronouns}</div>
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
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
              {t("user.profile.joined", { date: formatRelative(profile.joined_at) })}
            </div>

            {/* Tabbed, mirroring the profile editor so what you edit is what
                others see. On your own card the Bio/Activities fields are
                directly editable (WYSIWYG); Save appears only when dirty. */}
            <div className="profile-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "bio"} className={`profile-tab${tab === "bio" ? " active" : ""}`} onClick={() => setTab("bio")}>
                {t("settings.profile.tabs.bio")}
              </button>
              <button type="button" role="tab" aria-selected={tab === "activities"} className={`profile-tab${tab === "activities" ? " active" : ""}`} onClick={() => setTab("activities")}>
                {t("settings.profile.tabs.activities")}
              </button>
              <button type="button" role="tab" aria-selected={tab === "hubs"} className={`profile-tab${tab === "hubs" ? " active" : ""}`} onClick={() => setTab("hubs")}>
                {t("settings.profile.tabs.hubs")}
              </button>
            </div>

            <div style={{ minHeight: 150, display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
              {tab === "bio" && (
                <>
                  {isOwn ? (
                    <AutoGrowTextarea
                      value={draft.bio}
                      maxLength={500}
                      onChange={(v) => setDraft((d) => ({ ...d, bio: v }))}
                      placeholder={t("settings.profile.fields.bio_placeholder")}
                      ariaLabel={t("settings.profile.fields.bio_label")}
                      minHeight={80}
                    />
                  ) : profile.bio ? (
                    <p style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", margin: 0 }}>{profile.bio}</p>
                  ) : (
                    <span className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("user.profile.no_bio")}</span>
                  )}
                  {distinguishingRoles(profile.roles).length > 0 && (
                    <div>
                      <div className="profile-section-label">{t("user.profile.roles")}</div>
                      {groupRolesByCategory(distinguishingRoles(profile.roles), categories).map((group) => (
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
                              <span key={r.id} className={`role-badge ${r.color ? "role-badge-tinted" : ""}`} style={roleTintStyle(r.color)}>
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
                      <div className="profile-section-label">{t("user.profile.badges")}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {profile.badges.map((b) => (
                          <span
                            key={b.id}
                            className="role-badge"
                            style={b.color ? { borderColor: b.color, color: b.color } : undefined}
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "activities" && (
                isOwn ? (
                  <>
                    <GameEmojiRow onPick={insertGameEmoji} />
                    <AutoGrowTextarea
                      ref={activitiesRef}
                      value={draft.activities}
                      maxLength={ACTIVITIES_MAX}
                      onChange={(v) => setDraft((d) => ({ ...d, activities: v }))}
                      placeholder={t("settings.profile.fields.activities_placeholder")}
                      ariaLabel={t("settings.profile.fields.activities_label")}
                      minHeight={100}
                    />
                  </>
                ) : profile.activities ? (
                  <p style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", margin: 0 }}>{profile.activities}</p>
                ) : (
                  <span className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("user.profile.no_activities")}</span>
                )
              )}

              {tab === "hubs" && (
                // The hub gates this to empty when the member hides it, so a
                // non-empty list means they chose to show it.
                profile.favorite_hubs.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {profile.favorite_hubs.map((h) => (
                      <div key={h.url} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)" }}>
                        {h.icon ? (
                          <img src={h.icon} alt="" width={18} height={18} style={{ borderRadius: 4, objectFit: "cover" }} />
                        ) : (
                          <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 4, background: "var(--bg-elevated)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "var(--text-xs)" }}>
                            {(h.name || "?").charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name || h.url}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.profile.hubs.viewer_empty")}</span>
                )
              )}
            </div>

            {dirty && (
              <div className="settings-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                <button onClick={saveEdit} disabled={saving}>{t("settings.profile.save_all")}</button>
              </div>
            )}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
