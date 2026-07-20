import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { HubListing } from "../../types";

interface Props {
  onClose: () => void;
  onJoinHub: (hubUrl: string, inviteCode: string) => void;
  fetchUrl: (url: string) => Promise<Response>;
  directoryUrl?: string;
}

const DEFAULT_DIR = "https://discovery.wavvon.io";
const PAGE_SIZE = 20;
const POPULAR_TAGS = ["gaming", "music", "art", "tech", "anime", "sports", "community", "18+", "english", "social"];

export function DiscoverPage({ onClose, onJoinHub, fetchUrl, directoryUrl = DEFAULT_DIR }: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [hideNsfw, setHideNsfw] = useState(true);
  const [hubs, setHubs] = useState<HubListing[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  const fetchPage = useCallback(async (query: string, lang: string, tag: string, pageNum: number, replace: boolean) => {
    setLoading(true);
    setError("");
    setUnavailable(false);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(pageNum) });
      if (query.trim()) params.set("q", query.trim());
      if (lang.trim()) params.set("language", lang.trim());
      if (tag.trim()) params.set("tag", tag.trim());
      const res = await fetchUrl(`${directoryUrl}/api/hubs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { hubs: HubListing[]; total: number; page: number; limit: number } = await res.json();
      setHubs((prev) => replace ? data.hubs : [...prev, ...data.hubs]);
      setHasMore(pageNum * PAGE_SIZE < data.total);
    } catch (e) {
      // fetchUrl turns an unreachable/hung host into a friendly message —
      // treat those as "service unavailable" (the directory is an optional
      // external service) rather than surfacing a raw error.
      const msg = e instanceof Error ? e.message : String(e);
      if (/Could not reach|Timed out reaching/i.test(msg)) {
        setUnavailable(true);
        setError("");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [directoryUrl, fetchUrl]);

  useEffect(() => {
    fetchPage(q, language, tagFilter, 1, true);
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchPage(q, language, tagFilter, 1, true);
  }

  function handleLoadMore() {
    const next = page + 1;
    setPage(next);
    fetchPage(q, language, tagFilter, next, false);
  }

  function handleJoin(hub: HubListing) {
    onJoinHub(hub.hub_url, hub.invite_code ?? "");
    onClose();
  }

  function handleTagClick(tag: string) {
    setTagFilter(tag);
    setPage(1);
    fetchPage(q, language, tag, 1, true);
  }

  function handleClear() {
    setQ(""); setLanguage(""); setTagFilter("");
    fetchPage("", "", "", 1, true);
    setPage(1);
  }

  const visibleHubs = hideNsfw ? hubs.filter((h) => !h.nsfw) : hubs;

  return (
    <div className="discover-page">
      <div className="discover-header">
        <h1>{t("discover.title")}</h1>
        <button className="settings-close-x" onClick={onClose} title={t("modal.close")}>×</button>
      </div>

      <form className="discover-search-bar" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder={t("discover.search.placeholder")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="discover-search-input"
        />
        <input
          type="text"
          placeholder={t("discover.search.language")}
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="discover-lang-input"
        />
        <input
          type="text"
          placeholder="Tag filter"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="discover-tag-input"
        />
        <button type="submit" disabled={loading || unavailable}>{t("discover.search.button")}</button>
        {(q || language || tagFilter) && (
          <button type="button" className="btn-secondary" onClick={handleClear}>
            {t("discover.search.clear")}
          </button>
        )}
      </form>

      <div className="discover-tag-chips" aria-label="Filter by tag">
        {POPULAR_TAGS.map((tag) => (
          <button
            key={tag}
            className={`discover-tag-chip ${tagFilter === tag ? "active" : ""}`}
            onClick={() => handleTagClick(tag)}
            aria-pressed={tagFilter === tag}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className="discover-filters">
        <label className="checkbox-label">
          <input type="checkbox" checked={hideNsfw} onChange={(e) => setHideNsfw(e.target.checked)} />
          Hide NSFW
        </label>
      </div>

      {unavailable && (
        <div
          className="discover-unavailable"
          style={{ textAlign: "center", padding: "var(--space-5)", opacity: 0.75 }}
        >
          <p style={{ fontSize: "var(--text-lg)" }}>📡 Service not available</p>
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
            The community directory couldn't be reached. It may be offline — try again later.
          </p>
          <button className="btn-secondary" onClick={() => fetchPage(q, language, tagFilter, 1, true)}>
            Retry
          </button>
        </div>
      )}

      {error && !unavailable && <p className="error-text">{error}</p>}

      {!unavailable && visibleHubs.length === 0 && !loading && !error && (
        <div className="discover-empty">
          <p className="muted">{t("discover.empty")}</p>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("discover.empty.hint")}
          </p>
        </div>
      )}

      <div className="discover-grid">
        {visibleHubs.map((hub) => (
          <div key={hub.hub_pubkey} className="discover-card">
            <div className="discover-card-header">
              {hub.icon ? (
                <img src={hub.icon} alt={hub.name} className="discover-card-icon" />
              ) : (
                <div className="discover-card-icon placeholder">
                  {hub.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="discover-card-meta">
                <span className="discover-card-name">{hub.name}</span>
                <span className="discover-card-url muted">{hub.hub_url}</span>
              </div>
            </div>
            {hub.bio && <p className="discover-card-bio">{hub.bio}</p>}
            {hub.tags.length > 0 && (
              <div className="discover-card-tags">
                {hub.tags.map((tag) => (
                  <button
                    key={tag}
                    className="discover-tag"
                    onClick={() => handleTagClick(tag)}
                    title={`Filter by tag: ${tag}`}
                  >
                    {tag}
                  </button>
                ))}
                {hub.language && (
                  <span className="discover-tag lang">{hub.language}</span>
                )}
              </div>
            )}
            {hub.badges && hub.badges.length > 0 && (
              <div className="discover-card-badges">
                {hub.badges.map((b) => (
                  <span key={`${b.payload.issuer_url}:${b.payload.label}`} className="discover-badge-attestation" title={`Issuer: ${b.payload.issuer_url}`}>
                    🏅 {b.payload.label}
                  </span>
                ))}
              </div>
            )}
            <div className="discover-card-footer">
              {hub.nsfw && <span className="discover-badge nsfw">18+</span>}
              {hub.invite_only && <span className="discover-badge">{t("discover.invite_only")}</span>}
              {hub.min_security_level > 0 && (
                <span className="discover-badge">PoW {hub.min_security_level}</span>
              )}
              <button className="primary discover-join-btn" onClick={() => handleJoin(hub)}>
                {hub.invite_only && hub.invite_code ? t("discover.join_with_invite") : t("discover.join")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="discover-loading muted">{t("discover.loading")}</p>}

      {hasMore && !loading && (
        <div className="discover-load-more">
          <button className="btn-secondary" onClick={handleLoadMore}>{t("discover.load_more")}</button>
        </div>
      )}
    </div>
  );
}
