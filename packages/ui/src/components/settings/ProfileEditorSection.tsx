import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "../Avatar";
import { EmojiPicker } from "../content/EmojiPicker";
import { ImagePicker } from "../ImagePicker";
import { formatPubkey } from "@wavvon/core";
import type { Hub, FavoriteHub, ProfileAccountRef, ProfileDraftFields, ProfileEditorActions } from "../../types";
import { AutoGrowTextarea } from "../profile/AutoGrowTextarea";
import { GameEmojiRow } from "../profile/GameEmojiRow";
import { StatusBubble } from "../profile/StatusBubble";
import { insertAtLineStart } from "../../utils/activityEmoji";
import { profileBannerStyle } from "../../utils/identityColor";
import { loadHiddenBadgeSet } from "../../utils/hiddenBadges";
import { FavoriteHubsEditor } from "./FavoriteHubsEditor";
import { AvatarChooser } from "./AvatarChooser";

interface Props {
  hubs: Hub[];
  account: ProfileAccountRef;
  // Managing the active account? Hub contexts need its live sessions; for a
  // non-active account only the (purely local) default profile is editable.
  isActive: boolean;
  // Active account's pubkey — hub profiles (incl. badges) are read via the
  // public profile endpoint, which is keyed by it.
  publicKey: string | null;
  // All on-device accounts + the active one, so the scope line can offer
  // "[profile] for [account]" when there's more than one. The account choice
  // flows back through onManagingChange (owned by the settings shell).
  accounts: ProfileAccountRef[] | null;
  activeId: string | null;
  onManagingChange: (id: string) => void;
  // Lets the caller refresh meInfo/users when a saved hub is the active one.
  onHubProfileSaved?: (hubId: string) => void;
  actions: ProfileEditorActions;
}

const DEFAULT_CONTEXT = "__default__";
const BIO_MAX = 500;
const PRONOUNS_MAX = 40;
const STATUS_MAX = 140;
const ACTIVITIES_MAX = 500;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// No year is ever stored, so Feb always offers 29 — rejecting Feb 29 for a
// birthday's own year is meaningless.
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function parseBirthday(v: string): { month: string; day: string } {
  const m = /^(\d{2})-(\d{2})$/.exec(v);
  return m ? { month: m[1], day: m[2] } : { month: "", day: "" };
}

function composeBirthday(month: string, day: string): string {
  return month && day ? `${month}-${day}` : "";
}

type CardTab = "bio" | "activities" | "hubs";

// Internal working-copy shape: text fields are always strings (never null)
// so inputs stay controlled — unlike ProfileEditorActions' external
// ProfileDraftFields (which mirrors storage/wire shapes using null for
// "unset"). Converted at the boundary: fromExternal() on load, trimToNull()
// on save.
interface Draft {
  display_name: string;
  avatar: string | null;
  bio: string;
  pronouns: string;
  status_message: string;
  activities: string;
  accent_color: string | null;
  cover: string | null;
  favorite_hubs: FavoriteHub[];
  show_hubs: boolean;
  /** MM-DD, or "" for unset. Never a year. */
  birthday: string;
}

function fromExternal(p: Omit<ProfileDraftFields, "display_name"> & { display_name: string | null }): Draft {
  return {
    display_name: p.display_name ?? "",
    avatar: p.avatar,
    bio: p.bio ?? "",
    pronouns: p.pronouns ?? "",
    status_message: p.status_message ?? "",
    activities: p.activities ?? "",
    accent_color: p.accent_color,
    cover: p.cover,
    favorite_hubs: p.favorite_hubs,
    show_hubs: p.show_hubs,
    birthday: p.birthday ?? "",
  };
}

const sameDraft = (a: Draft, b: Draft) =>
  a.display_name === b.display_name &&
  a.avatar === b.avatar &&
  a.bio === b.bio &&
  a.pronouns === b.pronouns &&
  a.status_message === b.status_message &&
  a.activities === b.activities &&
  a.accent_color === b.accent_color &&
  a.cover === b.cover &&
  a.show_hubs === b.show_hubs &&
  a.birthday === b.birthday &&
  JSON.stringify(a.favorite_hubs) === JSON.stringify(b.favorite_hubs);

const trimToNull = (s: string) => {
  const v = s.trim();
  return v ? v : null;
};

// One WYSIWYG editor over many contexts (the Discord server-profiles
// pattern): the dropdown picks the default profile or any joined hub, and
// the card below IS the profile. The card is tabbed — Bio (about me +
// badges) and Activities (a status line + a free-text "what I'm up to").
// Edits are kept as per-context drafts (dirty contexts get a • in the
// dropdown) and a single "Save changes" persists all of them: default →
// local scoped storage, each hub → its own session (PATCH /me).
export function ProfileEditorSection({ hubs, account, isActive, publicKey, accounts, activeId, onManagingChange, onHubProfileSaved, actions }: Props) {
  const { t } = useTranslation();
  const [context, setContext] = useState<string>(DEFAULT_CONTEXT);
  const [tab, setTab] = useState<CardTab>("bio");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [baselines, setBaselines] = useState<Record<string, Draft>>({});
  // Read-only: badges earned on each hub, shown as members see them.
  const [badgesByCtx, setBadgesByCtx] = useState<Record<string, string[]>>({});
  // Identity-wide badges (cross-hub certs with a label) for the default
  // context, honoring the hide/show curation from MyCertificationsSection
  // (utils/hiddenBadges.ts).
  const [identityBadges, setIdentityBadges] = useState<string[]>([]);
  const [choosingAvatar, setChoosingAvatar] = useState(false);
  const [editingBanner, setEditingBanner] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved">("idle");
  const [error, setError] = useState<"no_session" | "name_required" | string | null>(null);
  const [hasDefault, setHasDefault] = useState(false);
  // Hub contexts following the default profile: they mirror the default
  // draft LIVE (later default edits carry over) until the user edits a field
  // in that context, which detaches it. "Use default" links; typing unlinks.
  // The link is persistent per account — `following` is the working copy,
  // `followingBaseline` what's in storage; like field edits, link changes
  // only persist on "Save changes".
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [followingBaseline, setFollowingBaseline] = useState<Set<string>>(new Set());
  const activitiesRef = useRef<HTMLTextAreaElement>(null);

  const isDefault = context === DEFAULT_CONTEXT;
  const contextHub = hubs.find((h) => h.hub_id === context);
  const isFollowing = following.has(context);
  // What a context actually shows/saves: the default draft when following.
  const effectiveOf = (c: string): Draft | undefined =>
    following.has(c) ? drafts[DEFAULT_CONTEXT] : drafts[c];
  const draft = effectiveOf(context);

  // A different account means different profiles everywhere: reset to just
  // its default context. We seed the default draft HERE rather than leaving
  // it to the context-loader effect below — that effect is keyed on
  // [context, account.id], so when the context was already DEFAULT before the
  // switch it wouldn't re-run, and the card would render with no draft (it
  // vanished). Seeding synchronously keeps the card populated across a switch.
  useEffect(() => {
    const loaded = actions.loadDefaultProfile(account.id);
    const d = loaded ? fromExternal(loaded) : blankDraft();
    setDrafts({ [DEFAULT_CONTEXT]: d });
    setBaselines({ [DEFAULT_CONTEXT]: d });
    setBadgesByCtx({});
    setContext(DEFAULT_CONTEXT);
    setHasDefault(loaded !== null);
    // Restore the persistent follow links, pruning hubs no longer saved.
    const stored = new Set(actions.loadFollowsDefault(account.id).filter((id) => hubs.some((h) => h.hub_id === id)));
    setFollowing(stored);
    setFollowingBaseline(new Set(stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  function draftFromHub(p: Awaited<ReturnType<typeof actions.getMyProfileOnHub>>): Draft {
    return fromExternal(p);
  }

  // Followed hubs need their baseline even if never opened this session —
  // otherwise a default edit couldn't mark them dirty and Save would skip
  // them. Hubs without a live session are silently left out: they can't be
  // written right now anyway, and they'll catch up next time they're both
  // connected and the default is saved.
  useEffect(() => {
    if (!publicKey) return;
    for (const id of following) {
      if (baselines[id]) continue;
      actions.getMyProfileOnHub(id, publicKey)
        .then((p) => {
          const d = draftFromHub(p);
          setBaselines((b) => (b[id] ? b : { ...b, [id]: d }));
          setDrafts((ds) => (ds[id] ? ds : { ...ds, [id]: d }));
          setBadgesByCtx((m) => ({ ...m, [id]: p.badges }));
        })
        .catch(() => { /* offline hub — see comment above */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following, account.id, publicKey]);

  // Hub contexts vanish when managing a non-active account; snap back.
  useEffect(() => {
    if (!isActive) setContext(DEFAULT_CONTEXT);
  }, [isActive, account.id]);

  useEffect(() => {
    setIdentityBadges([]);
    if (!isActive || !publicKey) return;
    let cancelled = false;
    const hidden = loadHiddenBadgeSet();
    actions.listMyCertifications(publicKey)
      .then((certs) => {
        if (cancelled) return;
        setIdentityBadges(
          certs
            .filter((c) => c.payload.label && c.payload.standing !== "revoked" && !hidden.has(c.signature))
            .map((c) => `${c.payload.icon ? `${c.payload.icon} ` : ""}${c.payload.label}`),
        );
      })
      .catch(() => { /* offline / no hubs — empty state is fine */ });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, publicKey, account.id]);

  // Load a context's baseline the first time it's opened. Already-loaded
  // contexts keep their draft — that's what lets edits survive switching.
  // A month alone can't live in the draft (composeBirthday collapses a
  // month-without-day to ""), so it parks here until a day completes it.
  const [pendingMonth, setPendingMonth] = useState("");

  useEffect(() => {
    setChoosingAvatar(false);
    setPendingMonth("");
    if (error === "no_session" || (error && error !== "name_required")) setError(null);
    if (baselines[context]) return;
    if (context === DEFAULT_CONTEXT) {
      // Usually already seeded by the account-reset effect; this covers a
      // direct switch back to Default that somehow finds no baseline.
      const loaded = actions.loadDefaultProfile(account.id);
      const d = loaded ? fromExternal(loaded) : blankDraft();
      setBaselines((b) => ({ ...b, [context]: d }));
      setDrafts((ds) => ({ ...ds, [context]: d }));
      return;
    }
    if (!publicKey) return;
    let cancelled = false;
    setStatus("loading");
    actions.getMyProfileOnHub(context, publicKey)
      .then((p) => {
        if (cancelled) return;
        const d = draftFromHub(p);
        setBaselines((b) => ({ ...b, [context]: d }));
        setDrafts((ds) => ({ ...ds, [context]: d }));
        setBadgesByCtx((m) => ({ ...m, [context]: p.badges }));
        setStatus("idle");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("idle");
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg === actions.noHubSessionError ? "no_session" : msg);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, account.id]);

  const contentDirty = Object.keys(drafts).filter((c) => {
    const eff = effectiveOf(c);
    return baselines[c] && eff && !sameDraft(eff, baselines[c]);
  });
  // A link/unlink is a change of its own even when values happen to match.
  const followDirty = [...new Set([...following, ...followingBaseline])].filter(
    (c) => following.has(c) !== followingBaseline.has(c),
  );
  const dirtyContexts = [...new Set([...contentDirty, ...followDirty])];

  function update(patch: Partial<Draft>) {
    setDrafts((ds) => {
      // Editing a following context detaches it: materialize the default
      // values it was mirroring, then apply the edit on top.
      const base = following.has(context) ? ds[DEFAULT_CONTEXT] : ds[context];
      return { ...ds, [context]: { ...base, ...patch } };
    });
    if (following.has(context)) {
      setFollowing((s) => {
        const n = new Set(s);
        n.delete(context);
        return n;
      });
    }
    if (status === "saved") setStatus("idle");
    if (error === "name_required") setError(null);
  }

  // Append an emoji from the picker to a text field, staying within the
  // field's cap (counted by code points, closer to the hub's char count).
  function appendEmoji(field: "status_message" | "bio" | "activities", emoji: string, max: number) {
    const cur = draft?.[field] ?? "";
    if ([...(cur + emoji)].length > max) return;
    update({ [field]: cur + emoji } as Partial<Draft>);
  }

  // Game-icon row: insert at the start of the line under the cursor rather
  // than appending, since activities entries are meant to read as one
  // line per activity.
  function insertGameEmoji(emoji: string) {
    const el = activitiesRef.current;
    const cursor = el?.selectionStart ?? draft?.activities.length ?? 0;
    const result = insertAtLineStart(draft?.activities ?? "", cursor, `${emoji} `, ACTIVITIES_MAX);
    if (!result) return;
    update({ activities: result.text });
    requestAnimationFrame(() => {
      el?.setSelectionRange(result.cursorPos, result.cursorPos);
      el?.focus();
    });
  }

  // "Use default" links this hub context to the default profile: it mirrors
  // the default draft from now on — including edits made to the default
  // afterwards — until a field here is edited (detach) or settings closes.
  // Still nothing persisted until "Save changes".
  const parsedBirthday = parseBirthday(draft?.birthday ?? "");
  const birthdayMonth = parsedBirthday.month || pendingMonth;
  const birthdayDay = parsedBirthday.day;

  function updateBirthdayMonth(month: string) {
    setPendingMonth(month);
    const maxDay = DAYS_IN_MONTH[Number(month) - 1] ?? 31;
    const day = birthdayDay && Number(birthdayDay) <= maxDay ? birthdayDay : "";
    update({ birthday: composeBirthday(month, day) });
  }

  function updateBirthdayDay(day: string) {
    update({ birthday: composeBirthday(birthdayMonth, day) });
  }

  function applyDefault() {
    setFollowing((s) => new Set(s).add(context));
    setChoosingAvatar(false);
    if (status === "saved") setStatus("idle");
  }

  async function saveAll() {
    setError(null);
    if (contentDirty.some((c) => !effectiveOf(c)?.display_name.trim())) {
      setError("name_required");
      return;
    }
    setStatus("saving");
    try {
      for (const c of contentDirty) {
        const d = effectiveOf(c)!;
        const profile: ProfileDraftFields = {
          display_name: d.display_name.trim(),
          avatar: d.avatar,
          bio: trimToNull(d.bio),
          pronouns: trimToNull(d.pronouns),
          status_message: trimToNull(d.status_message),
          activities: trimToNull(d.activities),
          accent_color: d.accent_color,
          cover: d.cover,
          favorite_hubs: d.favorite_hubs,
          show_hubs: d.show_hubs,
          birthday: d.birthday || null,
        };
        if (c === DEFAULT_CONTEXT) {
          actions.saveDefaultProfile(profile, account.id);
          setHasDefault(true);
        } else {
          await actions.updateMyProfileOnHub(c, profile);
          onHubProfileSaved?.(c);
        }
        setBaselines((b) => ({ ...b, [c]: { ...d } }));
      }
      // Persist link changes (pure preference — no hub write of its own).
      if (followDirty.length > 0) {
        actions.saveFollowsDefault([...following], account.id);
        setFollowingBaseline(new Set(following));
      }
      setStatus("saved");
    } catch (e) {
      setStatus("idle");
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === actions.noHubSessionError ? "no_session" : msg);
    }
  }

  const contextLabel = (id: string, label: string) =>
    dirtyContexts.includes(id) ? `${label} •` : label;

  // Banner + auto-grow fields come from shared profile components so the
  // settings preview and the member card stay identical (see
  // profileBannerStyle / AutoGrowTextarea / StatusBubble).
  const banner = draft
    ? profileBannerStyle({ pubkey: account.id, cover: draft.cover, accentColor: draft.accent_color })
    : {};

  const badges = isDefault ? identityBadges : badgesByCtx[context] ?? [];

  return (
    <div className="settings-section">
      <label className="settings-label" htmlFor="profile-context-select">
        {t("settings.profile.context.label")}
      </label>
      {/* Scope line reads as a phrase: "[profile] for [account]". The account
          half only appears with more than one on-device account — with one,
          "who" is unambiguous and the extra control is just noise. */}
      <div className="profile-scope-bar">
        <select
          id="profile-context-select"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          style={{ maxWidth: 260 }}
        >
          <option value={DEFAULT_CONTEXT}>
            {contextLabel(DEFAULT_CONTEXT, t("settings.profile.context.default_option"))}
          </option>
          {isActive &&
            hubs.map((h) => (
              <option key={h.hub_id} value={h.hub_id}>
                {contextLabel(h.hub_id, h.hub_name || h.hub_url)}
              </option>
            ))}
        </select>
        {accounts && accounts.length > 1 && (
          <>
            <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
              {t("settings.profile.scope.for")}
            </span>
            <select
              id="profile-account-select"
              value={account.id}
              onChange={(e) => onManagingChange(e.target.value)}
              style={{ maxWidth: 220 }}
            >
              {accounts.map((a) => {
                const label = a.account_label || formatPubkey(a.id);
                return (
                  <option key={a.id} value={a.id}>
                    {a.id === activeId ? t("settings.account.managing.active_option", { label }) : label}
                  </option>
                );
              })}
            </select>
          </>
        )}
        {/* Fixed home next to the dropdowns — never hidden, disabled when it
            can't apply (default context, already following, or no default). */}
        <button
          type="button"
          className="btn-small btn-secondary"
          onClick={applyDefault}
          disabled={isDefault || isFollowing || !(hasDefault || !!drafts[DEFAULT_CONTEXT]?.display_name.trim())}
          title={t("settings.profile.context.apply_default")}
        >
          {t("settings.profile.context.apply_default")}
        </button>
      </div>
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
        {isDefault
          ? t("settings.profile.default.hint")
          : t("settings.profile.current_hub.hint", { hub: contextHub?.hub_name || contextHub?.hub_url || "" })}
      </p>
      {!isDefault && isFollowing && (
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.profile.context.following")}
        </p>
      )}
      {!isActive && (
        <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
          {t("settings.profile.current_hub.active_only")}
        </p>
      )}

      {status === "loading" && <p className="muted">{t("settings.profile.context.loading")}</p>}
      {error === "no_session" && (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.profile.context.no_session")}
        </p>
      )}
      {error === "name_required" && (
        <p className="error-text">{t("settings.profile.save_name_required")}</p>
      )}
      {error && error !== "no_session" && error !== "name_required" && (
        <p className="error-text">{error}</p>
      )}

      {draft && status !== "loading" && error !== "no_session" && (
        <>
          {/* WYSIWYG profile card: an identity-colored banner + overlapping
              avatar header, then tabbed content. Nothing is persisted until
              the explicit save. */}
          <div className="profile-card" style={{ maxWidth: 560 }}>
            <button
              type="button"
              className="profile-card-banner profile-card-banner-btn"
              style={banner}
              onClick={() => setEditingBanner(true)}
              aria-label={t("settings.profile.banner.edit")}
              title={t("settings.profile.banner.edit")}
            >
              <span className="avatar-edit-overlay" aria-hidden="true">✏️</span>
            </button>
            <div className="profile-card-body">
              {/* Avatar + a thought bubble carrying the status — the avatar
                  "thinking". Editable inline here; static on the member card. */}
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div className="profile-card-avatar-wrap">
                  <button
                    type="button"
                    className="avatar-edit-btn"
                    onClick={() => setChoosingAvatar((v) => !v)}
                    aria-label={t("profile.avatar_chooser.change_avatar")}
                    title={t("profile.avatar_chooser.change_avatar")}
                  >
                    <Avatar src={draft.avatar} name={draft.display_name} size={80} />
                    <span className="avatar-edit-overlay" aria-hidden="true">✏️</span>
                  </button>
                </div>
                <StatusBubble
                  value={draft.status_message}
                  editable
                  onChange={(v) => update({ status_message: v })}
                  placeholder={t("settings.profile.fields.status_placeholder")}
                  ariaLabel={t("settings.profile.fields.status_label")}
                  maxLength={STATUS_MAX}
                  style={{ flex: 1 }}
                  trailing={<EmojiPicker unicodeOnly buttonClassName="reaction-add-btn" onPick={(e) => appendEmoji("status_message", e, STATUS_MAX)} />}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <input
                  id="profile-editor-name"
                  type="text"
                  className="profile-inline-input"
                  value={draft.display_name}
                  onChange={(e) => update({ display_name: e.target.value })}
                  placeholder={t("settings.profile.default.name_placeholder")}
                  aria-label={t("settings.profile.default.name_placeholder")}
                  style={{ fontWeight: 700, fontSize: "var(--text-xl)" }}
                />
                <input
                  id="profile-editor-pronouns"
                  type="text"
                  className="profile-inline-input"
                  value={draft.pronouns}
                  maxLength={PRONOUNS_MAX}
                  onChange={(e) => update({ pronouns: e.target.value })}
                  placeholder={t("settings.profile.fields.pronouns_placeholder")}
                  aria-label={t("settings.profile.fields.pronouns_label")}
                  style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)" }}
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <label className="settings-label" style={{ fontSize: "var(--text-sm)" }}>
                  {t("settings.profile.fields.birthday_label", "Birthday (visible to everyone on this hub)")}
                </label>
                <div className="settings-row" style={{ gap: "var(--space-2)" }}>
                  <select
                    aria-label={t("settings.profile.fields.birthday_month_label", "Birthday month")}
                    value={birthdayMonth}
                    onChange={(e) => updateBirthdayMonth(e.target.value)}
                  >
                    <option value="">{t("settings.profile.fields.birthday_month_placeholder", "Month")}</option>
                    {MONTH_NAMES.map((name, i) => {
                      const mm = String(i + 1).padStart(2, "0");
                      return <option key={mm} value={mm}>{name}</option>;
                    })}
                  </select>
                  <select
                    aria-label={t("settings.profile.fields.birthday_day_label", "Birthday day")}
                    value={birthdayDay}
                    onChange={(e) => updateBirthdayDay(e.target.value)}
                    disabled={!birthdayMonth}
                  >
                    <option value="">{t("settings.profile.fields.birthday_day_placeholder", "Day")}</option>
                    {birthdayMonth &&
                      Array.from({ length: DAYS_IN_MONTH[Number(birthdayMonth) - 1] }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
                        <option key={d} value={d}>{Number(d)}</option>
                      ))}
                  </select>
                  {draft.birthday && (
                    <button
                      type="button"
                      className="btn-small btn-secondary"
                      onClick={() => {
                        setPendingMonth("");
                        update({ birthday: "" });
                      }}
                    >
                      {t("settings.profile.fields.birthday_clear", "Clear")}
                    </button>
                  )}
                </div>
              </div>
              <div className="profile-card-idline">
                {account.id.slice(0, 16)}…{account.id.slice(-8)}
              </div>

              {/* Tabs */}
              <div className="profile-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "bio"}
                  className={`profile-tab${tab === "bio" ? " active" : ""}`}
                  onClick={() => setTab("bio")}
                >
                  {t("settings.profile.tabs.bio")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "activities"}
                  className={`profile-tab${tab === "activities" ? " active" : ""}`}
                  onClick={() => setTab("activities")}
                >
                  {t("settings.profile.tabs.activities")}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "hubs"}
                  className={`profile-tab${tab === "hubs" ? " active" : ""}`}
                  onClick={() => setTab("hubs")}
                >
                  {t("settings.profile.tabs.hubs")}
                </button>
              </div>

              {/* Fixed-height panel so the card doesn't resize between tabs. */}
              <div className="profile-tab-panel">
                {tab === "bio" && (
                  <>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div className="profile-section-label">{t("settings.profile.fields.bio_label")}</div>
                        <EmojiPicker unicodeOnly buttonClassName="reaction-add-btn" onPick={(e) => appendEmoji("bio", e, BIO_MAX)} />
                      </div>
                      <AutoGrowTextarea
                        value={draft.bio}
                        maxLength={BIO_MAX}
                        onChange={(v) => update({ bio: v })}
                        placeholder={t("settings.profile.fields.bio_placeholder")}
                        ariaLabel={t("settings.profile.fields.bio_label")}
                        minHeight={200}
                      />
                      <div className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "right" }}>
                        {draft.bio.length}/{BIO_MAX}
                      </div>
                    </div>
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                      <div className="profile-section-label">{t("user.profile.badges")}</div>
                      {badges.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {badges.map((label, i) => (
                            <span key={i} className="role-badge">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                          {t("settings.profile.card.no_badges")}
                        </span>
                      )}
                    </div>
                  </>
                )}

                {tab === "activities" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div className="profile-section-label">{t("settings.profile.fields.activities_label")}</div>
                      <EmojiPicker unicodeOnly buttonClassName="reaction-add-btn" onPick={(e) => appendEmoji("activities", e, ACTIVITIES_MAX)} />
                    </div>
                    <GameEmojiRow onPick={insertGameEmoji} />
                    <AutoGrowTextarea
                      ref={activitiesRef}
                      value={draft.activities}
                      maxLength={ACTIVITIES_MAX}
                      onChange={(v) => update({ activities: v })}
                      placeholder={t("settings.profile.fields.activities_placeholder")}
                      ariaLabel={t("settings.profile.fields.activities_label")}
                      minHeight={220}
                    />
                    <div className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "right" }}>
                      {draft.activities.length}/{ACTIVITIES_MAX}
                    </div>
                  </div>
                )}

                {tab === "hubs" && (
                  <FavoriteHubsEditor
                    hubs={hubs}
                    favorites={draft.favorite_hubs}
                    show={draft.show_hubs}
                    onToggleShow={(show) => update({ show_hubs: show })}
                    onChange={(favorite_hubs) => update({ favorite_hubs })}
                  />
                )}
              </div>
            </div>
          </div>
          {choosingAvatar && (
            <div
              className="modal-overlay"
              onClick={() => setChoosingAvatar(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t("profile.avatar_chooser.change_avatar")}
            >
              <div className="modal" style={{ maxWidth: 480, position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setChoosingAvatar(false)}
                  aria-label={t("modal.close")}
                  style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}
                >
                  ×
                </button>
                <label className="settings-label" style={{ marginBottom: 8, display: "block" }}>
                  {t("profile.avatar_chooser.change_avatar")}
                </label>
                <AvatarChooser
                  value={draft.avatar}
                  fallbackName={draft.display_name}
                  onChange={(a) => {
                    update({ avatar: a });
                    setChoosingAvatar(false);
                  }}
                  onClear={() => update({ avatar: null })}
                />
              </div>
            </div>
          )}
          {editingBanner && (
            <div
              className="modal-overlay"
              onClick={() => setEditingBanner(false)}
              role="dialog"
              aria-modal="true"
              aria-label={t("settings.profile.banner.edit")}
            >
              <div className="modal" style={{ maxWidth: 480, position: "relative" }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setEditingBanner(false)}
                  aria-label={t("modal.close")}
                  style={{ position: "absolute", top: 12, right: 12, background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}
                >
                  ×
                </button>
                <label className="settings-label" style={{ marginBottom: 8, display: "block" }}>
                  {t("settings.profile.banner.edit")}
                </label>
                {/* Live preview of the current banner choice. */}
                <div className="profile-card-banner" style={{ ...banner, borderRadius: "var(--r-md)", marginBottom: "var(--space-3)" }} aria-hidden="true" />

                <div className="settings-label" style={{ fontSize: "var(--text-sm)", marginBottom: 4 }}>
                  {t("settings.profile.banner.cover_label")}
                </div>
                <ImagePicker
                  onPick={(dataUrl) => update({ cover: dataUrl })}
                  onClear={() => update({ cover: null })}
                  hasValue={!!draft.cover}
                  buttonLabel={t("settings.profile.banner.cover_button")}
                  width={960}
                  height={240}
                  quality={0.82}
                />

                <div className="settings-label" style={{ fontSize: "var(--text-sm)", margin: "var(--space-3) 0 4px" }}>
                  {t("settings.profile.banner.accent_label")}
                </div>
                <div className="settings-row" style={{ gap: "var(--space-2)", alignItems: "center" }}>
                  <input
                    type="color"
                    value={draft.accent_color ?? "#7c5cff"}
                    onChange={(e) => update({ accent_color: e.target.value, cover: null })}
                    aria-label={t("settings.profile.banner.accent_label")}
                    style={{ width: 44, height: 32, padding: 0, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "none", cursor: "pointer" }}
                  />
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    onClick={() => update({ accent_color: null, cover: null })}
                    disabled={!draft.accent_color && !draft.cover}
                  >
                    {t("settings.profile.banner.reset")}
                  </button>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {t("settings.profile.banner.reset_hint")}
                  </span>
                </div>
              </div>
            </div>
          )}
          <div className="settings-row" style={{ maxWidth: 560, gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginTop: 14 }}>
            <button onClick={saveAll} disabled={dirtyContexts.length === 0 || status === "saving"}>
              {t("settings.profile.save_all")}
            </button>
            {status === "saved" && (
              <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                ✓ {t("settings.profile.default.saved")}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function blankDraft(): Draft {
  return {
    display_name: "",
    avatar: null,
    bio: "",
    pronouns: "",
    status_message: "",
    activities: "",
    accent_color: null,
    cover: null,
    favorite_hubs: [],
    show_hubs: false,
    birthday: "",
  };
}
