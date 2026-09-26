import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DISCOVERY_URL } from "../constants";
import type { HubListing } from "../types";

interface HubBrowserProps {
  onClose: () => void;
  onJoinHub: (hubUrl: string, inviteCode: string) => void;
}

interface HubListingResult extends HubListing {
  fetchError?: string;
}

const FALLBACK_HUBS: string[] = [];

// Derived from the one configured directory instead of a third hostname of
// its own — hub-directory.wavvon.io, which was hardcoded here, does not
// resolve. Null when no directory is configured; the caller does not open
// this browser then.
const KNOWN_HUBS_URL = DISCOVERY_URL === null ? null : `${DISCOVERY_URL}/known-hubs.json`;

function normalizeHubUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/$/, "");
  return "https://" + trimmed.replace(/\/$/, "");
}

async function fetchListing(hubUrl: string): Promise<HubListingResult> {
  const res = await fetch(hubUrl + "/federation/listing");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: HubListing = await res.json();
  return { ...data, hub_url: hubUrl };
}

interface HubCardProps {
  hub: HubListingResult;
  onJoin: (url: string) => void;
}

function HubCard({ hub, onJoin }: HubCardProps) {
  const { t } = useTranslation();
  const desc = hub.description
    ? hub.description.length > 120
      ? hub.description.slice(0, 120) + "…"
      : hub.description
    : null;

  return (
    <div className={`discover-card${!hub.listed ? " hub-card-unlisted" : ""}`}>
      <div className="discover-card-header">
        <div className="discover-card-icon placeholder">
          {hub.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="discover-card-meta">
          <div className="discover-card-name">
            {hub.name}
            {!hub.listed && (
              <span className="muted" style={{ fontSize: "0.75em", marginLeft: "0.5em" }}>
                {t("hub_browser.not_listed")}
              </span>
            )}
          </div>
          <div className="discover-card-url">{hub.hub_url}</div>
        </div>
      </div>
      {desc && <p className="discover-card-bio">{desc}</p>}
      {hub.tags.length > 0 && (
        <div className="discover-card-tags">
          {hub.tags.map((tag) => (
            <span key={tag} className="discover-tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="discover-card-footer">
        <span className="muted" style={{ fontSize: "0.8em" }}>
          {t("hub_browser.members_approx", { count: hub.member_count_approx })}
        </span>
        <button className="discover-join-btn" onClick={() => onJoin(hub.hub_url)}>
          {t("discover.join")}
        </button>
      </div>
    </div>
  );
}

export function HubBrowser({ onClose, onJoinHub }: HubBrowserProps) {
  const { t } = useTranslation();
  const [urlInput, setUrlInput] = useState("");
  const [checkedHub, setCheckedHub] = useState<HubListingResult | null>(null);
  const [checkState, setCheckState] = useState<"idle" | "loading" | "error">("idle");
  const [checkError, setCheckError] = useState("");
  const [knownHubs, setKnownHubs] = useState<HubListingResult[]>([]);
  const [knownLoading, setKnownLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedUrl = useRef("");

  useEffect(() => {
    let cancelled = false;

    async function loadKnownHubs() {
      let urls: string[] = FALLBACK_HUBS;
      try {
        if (!KNOWN_HUBS_URL) return;
        const res = await fetch(KNOWN_HUBS_URL);
        if (res.ok) {
          const data: unknown = await res.json();
          if (Array.isArray(data)) urls = data as string[];
        }
      } catch {
        // use fallback
      }

      if (cancelled) return;

      const results = await Promise.allSettled(urls.map(fetchListing));
      if (cancelled) return;

      const loaded: HubListingResult[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") loaded.push(r.value);
      }
      setKnownHubs(loaded);
      setKnownLoading(false);
    }

    loadKnownHubs();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = normalizeHubUrl(urlInput);
    if (!normalized) {
      setCheckedHub(null);
      setCheckState("idle");
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (normalized === lastCheckedUrl.current) return;
      lastCheckedUrl.current = normalized;
      setCheckState("loading");
      setCheckedHub(null);
      try {
        const result = await fetchListing(normalized);
        setCheckedHub(result);
        setCheckState("idle");
      } catch (e) {
        setCheckError(e instanceof Error ? e.message : String(e));
        setCheckState("error");
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [urlInput]);

  function handleJoin(url: string) {
    onJoinHub(url, "");
  }

  return (
    <div className="discover-page">
      <div className="discover-header">
        <h1>{t("hub_browser.title")}</h1>
        <button className="btn-secondary" onClick={onClose}>
          {t("modal.close")}
        </button>
      </div>

      <section style={{ marginBottom: "var(--space-6)" }}>
        <h2 style={{ marginBottom: "var(--space-2)" }}>{t("hub_browser.check_url")}</h2>
        <div className="discover-search-bar">
          <input
            className="discover-search-input"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="hub.example.com"
          />
        </div>
        {checkState === "loading" && <p className="muted">{t("hub_browser.checking")}</p>}
        {checkState === "error" && (
          <p className="hub-preview-error">{checkError}</p>
        )}
        {checkedHub && (
          <div className="discover-grid" style={{ marginTop: "var(--space-3)" }}>
            <HubCard hub={checkedHub} onJoin={handleJoin} />
          </div>
        )}
      </section>

      <section>
        <h2 style={{ marginBottom: "var(--space-2)" }}>{t("hub_browser.public_hubs")}</h2>
        {knownLoading && <p className="muted discover-loading">{t("discover.loading")}</p>}
        {!knownLoading && knownHubs.length === 0 && (
          <p className="muted discover-empty">{t("hub_browser.empty")}</p>
        )}
        {knownHubs.length > 0 && (
          <div className="discover-grid">
            {knownHubs.map((h) => (
              <HubCard key={h.hub_url} hub={h} onJoin={handleJoin} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
