import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { hubFetch } from "@platform";

export interface GlobalSearchResult {
  message_id: string;
  channel_id: string;
  channel_name: string;
  sender: string;
  sender_name: string | null;
  content_preview: string;
  created_at: number;
}

interface Props {
  hubUrl: string;
  activeChannelId?: string;
  onClose: () => void;
  onNavigate?: (channelId: string, messageId: string) => void;
}

export function SearchBar({ onClose, onNavigate }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await hubFetch(`/search?q=${encodeURIComponent(q)}`);
        const data = await res.json() as GlobalSearchResult[];
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function handleSelect(channelId: string, messageId: string) {
    onNavigate?.(channelId, messageId);
    onClose();
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ alignItems: "flex-start", paddingTop: "80px" }}
    >
      <div
        className="global-search-wrap"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "12px",
          minWidth: "480px",
          maxWidth: "600px",
          width: "100%",
          boxShadow: "var(--shadow-lg, 0 8px 32px rgba(0,0,0,.4))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <input
            ref={inputRef}
            className="global-search-input"
            placeholder={t("search.placeholder")}
            value={query}
            onChange={handleChange}
            aria-label={t("search.placeholder")}
            aria-expanded={results.length > 0}
            aria-haspopup="listbox"
            role="combobox"
            style={{ flex: 1, padding: "8px 12px" }}
          />
          {loading && (
            <span className="global-search-spinner" aria-hidden="true" style={{ fontSize: 18 }}>&#8635;</span>
          )}
          <button
            onClick={onClose}
            className="btn-ghost"
            aria-label={t("channel.search.close")}
            style={{ padding: "4px 8px" }}
          >
            Esc
          </button>
        </div>

        {results.length > 0 && (
          <div className="global-search-results" role="listbox" style={{ maxHeight: 360, overflowY: "auto" }}>
            {results.map((r) => (
              <div
                key={r.message_id}
                className="global-search-result-item"
                role="option"
                aria-selected={false}
                onMouseDown={() => handleSelect(r.channel_id, r.message_id)}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderRadius: "var(--r-sm)",
                  marginBottom: 2,
                }}
              >
                <div className="global-search-result-channel" style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
                  #{r.channel_name}
                </div>
                <div className="global-search-result-sender" style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>
                  {r.sender_name ?? r.sender.slice(0, 8)}
                </div>
                <div className="global-search-result-preview" style={{ fontSize: "var(--text-sm)", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.content_preview}
                </div>
              </div>
            ))}
          </div>
        )}

        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <p className="muted" style={{ padding: "8px 12px", margin: 0, fontSize: "var(--text-sm)" }}>
            {t("search.no_results")}
          </p>
        )}
      </div>
    </div>
  );
}
