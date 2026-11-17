import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HubListing } from "../../types";
import { matchHubs, orderByLatency, type HubInterests, type HubSuggestion } from "../../utils/hubInterests";
import { languageName } from "./InterestsStep";

// Few candidates, measured once: each costs one /info request to a stranger's hub.
const MAX_SUGGESTIONS = 6;

/** Directory hubs matching the device's interests, each saying why. Only
 *  rendered when the app has a directory to ask. */
export function HubSuggestions({ directoryUrl, fetchUrl, interests, onJoinHub, onEditInterests, onSeeAll }: {
  directoryUrl: string;
  fetchUrl: (url: string) => Promise<Response>;
  interests: HubInterests;
  onJoinHub: (hubUrl: string, inviteCode: string) => void;
  onEditInterests?: () => void;
  onSeeAll?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<HubSuggestion[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Keyed on the interests' content: callers rebuild the object and pass an
  // inline fetchUrl, and neither should send a stranger's hub another request.
  const key = JSON.stringify(interests);
  useEffect(() => {
    let cancelled = false;
    setList(null);
    setFailed(false);
    (async () => {
      try {
        const params = new URLSearchParams({ sort: "members" });
        // The directory filters on one language; several are filtered here instead.
        if (interests.languages.length === 1) params.set("language", interests.languages[0]);
        const res = await fetchUrl(`${directoryUrl}/api/hubs?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { hubs: HubListing[] } = await res.json();
        const picked = matchHubs(data.hubs, interests).slice(0, MAX_SUGGESTIONS);
        const timed = await Promise.all(picked.map(async (s) => {
          const start = performance.now();
          try {
            const r = await fetchUrl(`${s.hub.hub_url.replace(/\/$/, "")}/info`);
            return { ...s, latencyMs: r.ok ? Math.round(performance.now() - start) : null };
          } catch {
            return s;
          }
        }));
        if (!cancelled) setList(interests.nearestFirst ? orderByLatency(timed) : timed);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryUrl, key]);

  const filters = [
    ...interests.tags,
    ...interests.languages.map((l) => languageName(l, i18n.language)),
    ...(interests.openOnly ? [t("onboarding.interests.open_only")] : []),
    ...(interests.nearestFirst ? [t("onboarding.interests.nearest_first")] : []),
  ];

  return (
    <section className="hub-suggestions">
      <div className="discover-tag-chips" style={{ alignItems: "center" }}>
        {filters.map((f) => <span key={f} className="discover-tag">{f}</span>)}
        {onEditInterests && (
          <button type="button" className="btn-small btn-secondary" onClick={onEditInterests}>
            {t("onboarding.hubs.edit")}
          </button>
        )}
      </div>
      {list === null && !failed && <p className="muted">{t("discover.loading")}</p>}
      {failed && <p className="muted">{t("discover.unavailable_body")}</p>}
      {list && list.length === 0 && <p className="muted">{t("onboarding.hubs.empty")}</p>}
      <div className="discover-grid">
        {list?.map((s) => (
          <div key={s.hub.hub_pubkey} className="discover-card">
            <div className="discover-card-header">
              {s.hub.icon ? (
                <img src={s.hub.icon} alt="" className="discover-card-icon" />
              ) : (
                <div className="discover-card-icon placeholder">{s.hub.name.slice(0, 2).toUpperCase()}</div>
              )}
              <div className="discover-card-meta">
                <span className="discover-card-name">{s.hub.name}</span>
                {s.hub.member_count != null && (
                  <span className="muted">{t("onboarding.frame.members", { count: s.hub.member_count })}</span>
                )}
              </div>
            </div>
            {s.hub.bio && <p className="discover-card-bio">{s.hub.bio}</p>}
            <p className="muted">
              {[
                s.matchedTags.length > 0 ? t("onboarding.hubs.why_tags", { tags: s.matchedTags.join(", ") }) : null,
                s.languageMatch ? t("onboarding.hubs.why_language", { language: languageName(s.hub.language, i18n.language) }) : null,
                s.latencyMs != null ? t("onboarding.hubs.why_latency", { ms: s.latencyMs }) : null,
              ].filter(Boolean).join(" · ")}
            </p>
            <div className="discover-card-footer">
              {s.hub.invite_only && <span className="discover-badge">{t("discover.invite_only")}</span>}
              <button className="primary discover-join-btn" onClick={() => onJoinHub(s.hub.hub_url, s.hub.invite_code ?? "")}>
                {t("discover.join")}
              </button>
            </div>
          </div>
        ))}
      </div>
      {onSeeAll && (
        <button type="button" className="btn-ghost" onClick={onSeeAll}>{t("onboarding.hubs.see_all")}</button>
      )}
    </section>
  );
}
