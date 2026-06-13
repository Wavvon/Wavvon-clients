import React, { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

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
  onNavigate: (channelId: string, messageId: string) => void;
}

export function SearchBar({ onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await invoke<GlobalSearchResult[]>("search_messages_global", { q });
        setResults(res);
        setOpen(res.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  function handleFocus() {
    if (results.length > 0) setOpen(true);
  }

  function handleBlur() {
    setTimeout(() => setOpen(false), 150);
  }

  function handleSelect(channelId: string, messageId: string) {
    onNavigate(channelId, messageId);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="global-search-wrap">
      <input
        className="global-search-input"
        placeholder="Search messages..."
        value={query}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        aria-label="Search messages"
        aria-expanded={open}
        aria-haspopup="listbox"
        role="combobox"
      />
      {loading && (
        <span className="global-search-spinner" aria-hidden="true">&#8635;</span>
      )}
      {open && results.length > 0 && (
        <div className="global-search-results" role="listbox">
          {results.map((r) => (
            <div
              key={r.message_id}
              className="global-search-result-item"
              role="option"
              aria-selected={false}
              onMouseDown={() => handleSelect(r.channel_id, r.message_id)}
            >
              <div className="global-search-result-channel">
                #{r.channel_name}
              </div>
              <div className="global-search-result-sender">
                {r.sender_name ?? r.sender.slice(0, 8)}
              </div>
              <div className="global-search-result-preview">
                {r.content_preview}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
