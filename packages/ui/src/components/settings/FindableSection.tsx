import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  normalizeListingLanguages, normalizeListingTags, type IdentityListingDoc, type IdentityListingFields,
} from "@wavvon/core";
import { useConfirm } from "../ConfirmDialog";

export interface FindableActions {
  /** The current listing for this identity, or null when it has none. */
  load: () => Promise<IdentityListingDoc | null>;
  /** Sign and submit (a re-publish replaces the listing). */
  publish: (fields: IdentityListingFields) => Promise<void>;
  /** Send the signed delete. */
  unpublish: () => Promise<void>;
}

/** "Be findable in the directory": list this identity in the invite
 *  directory so hubs it has not joined can find and invite it
 *  (invite-directory.md). `disabledReason` explains why it cannot, e.g. no
 *  home hub to route invites to, or a device without the master key. */
export function FindableSection({ actions, homeHub, disabledReason }: {
  actions: FindableActions;
  homeHub: string | null;
  disabledReason: string | null;
}) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [listed, setListed] = useState<IdentityListingDoc | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [tags, setTags] = useState("");
  const [languages, setLanguages] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    actions.load()
      .then((doc) => {
        if (cancelled) return;
        setListed(doc);
        if (doc) {
          setName(doc.name);
          setTagline(doc.tagline);
          setTags(doc.tags.join(", "));
          setLanguages(doc.languages.join(", "));
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e instanceof Error ? e.message : e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const on = !!listed || editing;

  async function toggle() {
    setError(null);
    setSaved(false);
    if (on) {
      if (!listed) { setEditing(false); return; }
      setBusy(true);
      try {
        await actions.unpublish();
        setListed(null);
        setEditing(false);
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
      return;
    }
    const ok = await confirm({
      title: t("findable.consent_title"),
      body: t("findable.consent_body", { hub: homeHub ?? "" }),
      confirmLabel: t("findable.consent_confirm"),
    });
    if (ok) setEditing(true);
  }

  async function publish() {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await actions.publish({
        name,
        tagline,
        tags: normalizeListingTags(tags),
        languages: normalizeListingLanguages(languages),
      });
      setListed(await actions.load());
      setEditing(false);
      setSaved(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section">
      <label className="settings-row" style={{ gap: "var(--space-2)", alignItems: "center", cursor: "pointer" }}>
        <input type="checkbox" checked={on} disabled={busy || !!disabledReason} onChange={() => void toggle()} />
        <span style={{ fontSize: "var(--text-sm)" }}>{t("findable.toggle")}</span>
      </label>
      <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{disabledReason ?? t("findable.hint")}</p>
      {on && !disabledReason && (
        <>
          <label className="settings-label" htmlFor="findable-name">{t("findable.name")}</label>
          <input id="findable-name" type="text" maxLength={48} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="settings-label" htmlFor="findable-tagline">{t("findable.tagline")}</label>
          <input id="findable-tagline" type="text" maxLength={160} value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <label className="settings-label" htmlFor="findable-tags">{t("findable.tags")}</label>
          <input id="findable-tags" type="text" value={tags} placeholder={t("findable.tags_placeholder")} onChange={(e) => setTags(e.target.value)} />
          <label className="settings-label" htmlFor="findable-languages">{t("findable.languages")}</label>
          <input id="findable-languages" type="text" value={languages} placeholder={t("findable.languages_placeholder")} onChange={(e) => setLanguages(e.target.value)} />
          <p className="muted" style={{ fontSize: "var(--text-xs)" }}>{t("findable.routes_to", { hub: homeHub ?? "" })}</p>
          <button type="button" className="btn-primary" disabled={busy || !name.trim()} onClick={() => void publish()}>
            {listed ? t("findable.republish") : t("findable.publish")}
          </button>
        </>
      )}
      {saved && <p className="muted" role="status">{t("findable.published")}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      {dialog}
    </div>
  );
}
