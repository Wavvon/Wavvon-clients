import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

interface HubListing {
  hub_pubkey: string;
  hub_url: string;
  name: string;
  description: string | null;
  icon: string | null;
  invite_only: boolean;
  min_security_level: number;
  invite_code: string | null;
  bio: string;
  tags: string[];
  language: string;
  badges?: { label: string; issuer_url: string }[];
}

interface Props {
  onClose: () => void;
  onJoinHub: (hubUrl: string, inviteCode: string) => void;
  directoryUrl?: string;
}

const DEFAULT_DIR = "https://discovery.voxply.io";
const PAGE_SIZE = 20;

const POPULAR_TAGS = ["gaming", "music", "art", "tech", "anime", "sports", "community", "18+", "english", "social"];

export function DiscoverPage({ onClose, onJoinHub, directoryUrl = DEFAULT_DIR }: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [hubs, setHubs] = useState<HubListing[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback(async (query: string, lang: string, tag: string | null, pageNum: number, replace: boolean) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(pageNum) });
      if (query.trim()) params.set("q", query.trim());
      if (lang.trim()) params.set("language", lang.trim());
      if (tag) params.set("tag", tag);
      const res = await fetch(`${directoryUrl}/api/hubs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { hubs: HubListing[]; total: number; page: number; limit: number } = await res.json();
      setHubs((prev) => replace ? data.hubs : [...prev, ...data.hubs]);
      setHasMore(pageNum * PAGE_SIZE < data.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [directoryUrl]);

  useEffect(() => {
    fetchPage(q, language, activeTag, 1, true);
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchPage(q, language, activeTag, 1, true);
  }

  function handleTagFilter(tag: string) {
    const next = activeTag === tag ? null : tag;
    setActiveTag(next);
    setPage(1);
    fetchPage(q, language, next, 1, true);
  }

  function handleLoadMore() {
    const next = page + 1;
    setPage(next);
    fetchPage(q, language, activeTag, next, false);
  }

  function handleJoin(hub: HubListing) {
    onJoinHub(hub.hub_url, hub.invite_code ?? "");
    onClose();
  }

  function handleClear() {
    setQ("");
    setLanguage("");
    setActiveTag(null);
    fetchPage("", "", null, 1, true);
    setPage(1);
  }

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
        <button type="submit" disabled={loading}>{t("discover.search.button")}</button>
        {(q || language || activeTag) && (
          <button type="button" className="btn-secondary" onClick={handleClear}>
            {t("discover.search.clear")}
          </button>
        )}
      </form>

      <div className="discover-tag-chips" aria-label="Filter by tag">
        {POPULAR_TAGS.map((tag) => (
          <button
            key={tag}
            className={`discover-tag-chip ${activeTag === tag ? "active" : ""}`}
            onClick={() => handleTagFilter(tag)}
            aria-pressed={activeTag === tag}
          >
            {tag}
          </button>
        ))}
      </div>

      {error && <p className="error-text">{error}</p>}

      {hubs.length === 0 && !loading && !error && (
        <div className="discover-empty">
          <p className="muted">{t("discover.empty")}</p>
          <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("discover.empty.hint")}
          </p>
        </div>
      )}

      <div className="discover-grid">
        {hubs.map((hub) => (
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
                    className={`discover-tag ${activeTag === tag ? "active" : ""}`}
                    onClick={() => handleTagFilter(tag)}
                    title={`Filter by ${tag}`}
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
                {hub.badges.map((b, i) => (
                  <span key={i} className="discover-badge-chip" title={`Issued by ${b.issuer_url}`}>
                    {b.label}
                  </span>
                ))}
              </div>
            )}
            <div className="discover-card-footer">
              {hub.invite_only && (
                <span className="discover-badge">{t("discover.invite_only")}</span>
              )}
              {hub.min_security_level > 0 && (
                <span className="discover-badge">PoW {hub.min_security_level}</span>
              )}
              <button
                className="primary discover-join-btn"
                onClick={() => handleJoin(hub)}
              >
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
