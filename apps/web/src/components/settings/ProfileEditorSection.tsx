import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@wavvon/ui";
import { formatPubkey } from "@wavvon/core";
import type { Hub, InterestEntry, InterestKind } from "@shared/types";
import type { IdentityRecord } from "@identity/index";
import { ImagePicker } from "@components/common/ImagePicker";
import { loadDefaultProfile, saveDefaultProfile, loadFollowsDefault, saveFollowsDefault } from "@shared/utils/profiles";
import { getScoped } from "@shared/utils/accountScope";
import { identityGradient } from "@shared/utils/identityColor";
import { getMyProfileOnHub, updateMyProfileOnHub, listMyCertifications, NO_HUB_SESSION } from "@platform";
import { AvatarChooser } from "@components/users/AvatarChooser";

interface Props {
  hubs: Hub[];
  account: IdentityRecord;
  // Managing the active account? Hub contexts need its live sessions; for a
  // non-active account only the (purely local) default profile is editable.
  isActive: boolean;
  // Active account's pubkey — hub profiles (incl. badges) are read via the
  // public profile endpoint, which is keyed by it.
  publicKey: string | null;
  // All on-device accounts + the active one, so the scope line can offer
  // "[profile] for [account]" when there's more than one. The account choice
  // flows back through onManagingChange (owned by SettingsPage).
  accounts: IdentityRecord[] | null;
  activeId: string | null;
  onManagingChange: (id: string) => void;
  // Lets App refresh meInfo/users when a saved hub is the active one.
  onHubProfileSaved?: (hubId: string) => void;
}

const DEFAULT_CONTEXT = "__default__";
const BIO_MAX = 500;
const PRONOUNS_MAX = 40;

interface Draft {
  display_name: string;
  avatar: string | null;
  bio: string;
  pronouns: string;
  interests: InterestEntry[];
  accent_color: string | null;
  cover: string | null;
}

const INTEREST_KINDS: InterestKind[] = ["playing", "want", "lfg", "into"];
const MAX_INTERESTS = 6;
const INTEREST_TEXT_MAX = 80;

const sameDraft = (a: Draft, b: Draft) =>
  a.display_name === b.display_name &&
  a.avatar === b.avatar &&
  a.bio === b.bio &&
  a.pronouns === b.pronouns &&
  a.accent_color === b.accent_color &&
  a.cover === b.cover &&
  JSON.stringify(a.interests) === JSON.stringify(b.interests);

const trimToNull = (s: string) => {
  const v = s.trim();
  return v ? v : null;
};

// One WYSIWYG editor over many contexts (the Discord server-profiles
// pattern): the dropdown picks the default profile or any joined hub, and
// the card below IS the profile — every text is its own input, the avatar
// edits on click. Edits are kept as per-context drafts (dirty contexts get a
// • in the dropdown) and a single "Save changes" persists all of them:
// default → local scoped storage, each hub → its own session (PATCH /me).
export function ProfileEditorSection({ hubs, account, isActive, publicKey, accounts, activeId, onManagingChange, onHubProfileSaved }: Props) {
  const { t } = useTranslation();
  const [context, setContext] = useState<string>(DEFAULT_CONTEXT);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [baselines, setBaselines] = useState<Record<string, Draft>>({});
  // Read-only: badges earned on each hub, shown as members see them.
  const [badgesByCtx, setBadgesByCtx] = useState<Record<string, string[]>>({});
  // Identity-wide badges (cross-hub certs with a label) for the default
  // context, honoring the hide/show curation from the section below.
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

  const isDefault = context === DEFAULT_CONTEXT;
  const contextHub = hubs.find((h) => h.hub_id === context);
  const isFollowing = following.has(context);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  // What a context actually shows/saves: the default draft when following.
  const effectiveOf = (c: string): Draft | undefined =>
    following.has(c) ? drafts[DEFAULT_CONTEXT] : drafts[c];
  const draft = effectiveOf(context);

  // A different account means different profiles everywhere: drop all
  // drafts/baselines and start over from its default profile.
  useEffect(() => {
    setDrafts({});
    setBaselines({});
    setBadgesByCtx({});
    setContext(DEFAULT_CONTEXT);
    setHasDefault(loadDefaultProfile(account.id) !== null);
    // Restore the persistent follow links, pruning hubs no longer saved.
    const stored = new Set(loadFollowsDefault(account.id).filter((id) => hubs.some((h) => h.hub_id === id)));
    setFollowing(stored);
    setFollowingBaseline(new Set(stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  // Followed hubs need their baseline even if never opened this session —
  // otherwise a default edit couldn't mark them dirty and Save would skip
  // them. Hubs without a live session are silently left out: they can't be
  // written right now anyway, and they'll catch up next time they're both
  // connected and the default is saved.
  useEffect(() => {
    if (!publicKey) return;
    for (const id of following) {
      if (baselines[id]) continue;
      getMyProfileOnHub(id, publicKey)
        .then((p) => {
          const d: Draft = {
            display_name: p.display_name ?? "",
            avatar: p.avatar,
            bio: p.bio ?? "",
            pronouns: p.pronouns ?? "",
            interests: p.interests,
            accent_color: p.accent_color,
            cover: p.cover,
          };
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
    let hidden: Set<string>;
    try { hidden = new Set(JSON.parse(getScoped("wavvon.hiddenBadges") ?? "[]") as string[]); } catch { hidden = new Set(); }
    listMyCertifications(publicKey)
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
  }, [isActive, publicKey, account.id]);

  // Load a context's baseline the first time it's opened. Already-loaded
  // contexts keep their draft — that's what lets edits survive switching.
  useEffect(() => {
    setChoosingAvatar(false);
    if (error === "no_session" || (error && error !== "name_required")) setError(null);
    if (baselines[context]) return;
    if (context === DEFAULT_CONTEXT) {
      const p = loadDefaultProfile(account.id);
      const d: Draft = {
        display_name: p?.display_name ?? "",
        avatar: p?.avatar ?? null,
        bio: p?.bio ?? "",
        pronouns: p?.pronouns ?? "",
        interests: p?.interests ?? [],
        accent_color: p?.accent_color ?? null,
        cover: p?.cover ?? null,
      };
      setBaselines((b) => ({ ...b, [context]: d }));
      setDrafts((ds) => ({ ...ds, [context]: d }));
      return;
    }
    if (!publicKey) return;
    let cancelled = false;
    setStatus("loading");
    getMyProfileOnHub(context, publicKey)
      .then((p) => {
        if (cancelled) return;
        const d: Draft = {
          display_name: p.display_name ?? "",
          avatar: p.avatar,
          bio: p.bio ?? "",
          pronouns: p.pronouns ?? "",
          interests: p.interests,
          accent_color: p.accent_color,
          cover: p.cover,
        };
        setBaselines((b) => ({ ...b, [context]: d }));
        setDrafts((ds) => ({ ...ds, [context]: d }));
        setBadgesByCtx((m) => ({ ...m, [context]: p.badges }));
        setStatus("idle");
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus("idle");
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg === NO_HUB_SESSION ? "no_session" : msg);
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

  // "Use default" links this hub context to the default profile: it mirrors
  // the default draft from now on — including edits made to the default
  // afterwards — until a field here is edited (detach) or settings closes.
  // Still nothing persisted until "Save changes".
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
        const profile = {
          display_name: d.display_name.trim(),
          avatar: d.avatar,
          bio: trimToNull(d.bio),
          pronouns: trimToNull(d.pronouns),
          // Drop entries the user left blank; the hub rejects empty text.
          interests: d.interests
            .map((e) => ({ kind: e.kind, text: e.text.trim() }))
            .filter((e) => e.text.length > 0)
            .slice(0, MAX_INTERESTS),
          accent_color: d.accent_color,
          cover: d.cover,
        };
        if (c === DEFAULT_CONTEXT) {
          saveDefaultProfile(profile, account.id);
          setHasDefault(true);
        } else {
          await updateMyProfileOnHub(c, profile);
          onHubProfileSaved?.(c);
        }
        setBaselines((b) => ({ ...b, [c]: { ...d } }));
      }
      // Persist link changes (pure preference — no hub write of its own).
      if (followDirty.length > 0) {
        saveFollowsDefault([...following], account.id);
        setFollowingBaseline(new Set(following));
      }
      setStatus("saved");
    } catch (e) {
      setStatus("idle");
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg === NO_HUB_SESSION ? "no_session" : msg);
    }
  }

  const contextLabel = (id: string, label: string) =>
    dirtyContexts.includes(id) ? `${label} •` : label;

  // Banner precedence: an uploaded cover wins, then a chosen accent color
  // (rendered as a soft gradient), then the key-derived identity gradient.
  function bannerStyle(d: Draft): CSSProperties {
    if (d.cover) return { backgroundImage: `url(${d.cover})`, backgroundSize: "cover", backgroundPosition: "center" };
    if (d.accent_color) return { background: `linear-gradient(120deg, ${d.accent_color}, ${d.accent_color}99)` };
    return { background: identityGradient(account.id) };
  }

  // Interest-row helpers, operating on the current context's draft.
  function addInterest() {
    if (!draft || draft.interests.length >= MAX_INTERESTS) return;
    update({ interests: [...draft.interests, { kind: "playing", text: "" }] });
  }
  function updateInterest(i: number, patch: Partial<InterestEntry>) {
    if (!draft) return;
    update({ interests: draft.interests.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }
  function removeInterest(i: number) {
    if (!draft) return;
    update({ interests: draft.interests.filter((_, j) => j !== i) });
  }

  // The bio grows with its content (no manual resize handle): height is
  // re-derived from scrollHeight on every content or context change, with a
  // 200px floor.
  const bioText = draft?.bio;
  useEffect(() => {
    const el = bioRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 200)}px`;
  }, [bioText, context]);

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
          {/* WYSIWYG profile card: a real profile header (identity-colored
              banner + overlapping avatar), where every piece of text is the
              input itself. Nothing is persisted until the explicit save. */}
          <div className="profile-card" style={{ maxWidth: 560 }}>
            <button
              type="button"
              className="profile-card-banner profile-card-banner-btn"
              style={bannerStyle(draft)}
              onClick={() => setEditingBanner(true)}
              aria-label={t("settings.profile.banner.edit")}
              title={t("settings.profile.banner.edit")}
            >
              <span className="avatar-edit-overlay" aria-hidden="true">✏️</span>
            </button>
            <div className="profile-card-body">
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
              <div className="profile-card-idline">
                {account.id.slice(0, 16)}…{account.id.slice(-8)}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                <div
                  className="muted"
                  style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}
                >
                  {t("settings.profile.fields.bio_label")}
                </div>
                <textarea
                  id="profile-editor-bio"
                  ref={bioRef}
                  className="profile-inline-input"
                  value={draft.bio}
                  maxLength={BIO_MAX}
                  onChange={(e) => update({ bio: e.target.value })}
                  placeholder={t("settings.profile.fields.bio_placeholder")}
                  aria-label={t("settings.profile.fields.bio_label")}
                  style={{ fontSize: "var(--text-sm)", resize: "none", overflow: "hidden", minHeight: 200 }}
                />
                <div className="muted" style={{ fontSize: "var(--text-xs)", textAlign: "right" }}>
                  {draft.bio.length}/{BIO_MAX}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                <div
                  className="muted"
                  style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}
                >
                  {t("settings.profile.interests.label")}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {draft.interests.map((entry, i) => (
                    <div key={i} className="settings-row" style={{ gap: "var(--space-2)", alignItems: "center", flexWrap: "nowrap" }}>
                      <select
                        value={entry.kind}
                        onChange={(e) => updateInterest(i, { kind: e.target.value as InterestKind })}
                        aria-label={t("settings.profile.interests.kind_label")}
                        style={{ flexShrink: 0 }}
                      >
                        {INTEREST_KINDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`settings.profile.interests.kind.${k}`)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={entry.text}
                        maxLength={INTEREST_TEXT_MAX}
                        onChange={(e) => updateInterest(i, { text: e.target.value })}
                        placeholder={t("settings.profile.interests.text_placeholder")}
                        aria-label={t("settings.profile.interests.text_placeholder")}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        onClick={() => removeInterest(i)}
                        aria-label={t("modal.delete")}
                        title={t("modal.delete")}
                        style={{ flexShrink: 0 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {draft.interests.length < MAX_INTERESTS ? (
                    <button type="button" className="btn-small btn-secondary" onClick={addInterest} style={{ alignSelf: "flex-start" }}>
                      + {t("settings.profile.interests.add")}
                    </button>
                  ) : (
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      {t("settings.profile.interests.max", { max: MAX_INTERESTS })}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                <div
                  className="muted"
                  style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 4 }}
                >
                  {t("user.profile.badges")}
                </div>
                {(() => {
                  const badges = isDefault ? identityBadges : badgesByCtx[context] ?? [];
                  return badges.length > 0 ? (
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
                  );
                })()}
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
                <div className="profile-card-banner" style={{ ...bannerStyle(draft), borderRadius: "var(--r-md)", marginBottom: "var(--space-3)" }} aria-hidden="true" />

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
              {dirtyContexts.length > 1 ? ` (${dirtyContexts.length})` : ""}
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
