import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { validateSkin } from "../skinValidation";
import type { WavvonSkin } from "../skinValidation";

// Supplied by the app (prop-only package); the literal that used to be here
// did not resolve.

interface SkinListItem {
  id: string;
  author_pubkey: string;
  name: string;
  base: string;
  swatch_bg: string;
  swatch_surface: string;
  swatch_accent: string;
  featured: number;
  listed_at: number;
}

interface Props {
  /** Fetch with a request timeout — desktop and web each supply their own
   *  (kept app-side since packages/ui stays network-free). Only ever called
   *  here with a bare URL, so any richer app-side signature still fits. */
  fetchWithTimeout: (url: string) => Promise<Response>;
  /** Base URL of the hub directory that hosts the gallery. The app does not
   *  render this component when it has none, so this is required rather than
   *  defaulted — a default is how the dead hostname got here. */
  discoveryUrl: string;
  onImport: (skin: WavvonSkin) => void;
}

// "" is the no-filter option; the rest reuse the skin editor's base names.
const BASE_OPTIONS = ["", "calm", "classic", "linear", "light"];

function truncatePubkey(pk: string): string {
  if (pk.length <= 20) return pk;
  return pk.slice(0, 10) + "…" + pk.slice(-6);
}

export function SkinsGallery({ fetchWithTimeout, onImport, discoveryUrl }: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [base, setBase] = useState("");
  const [page, setPage] = useState(1);
  const [skins, setSkins] = useState<SkinListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // Self-hosted users who never opted into discovery shouldn't see a loud
  // connection error here — the whole section just hides itself. Only a
  // reachable-but-empty response ("no skins") stays visible.
  const [unreachable, setUnreachable] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function fetchSkins(query: string, baseFilter: string, pageNum: number) {
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (baseFilter) params.set("base", baseFilter);
    params.set("page", String(pageNum));
    fetchWithTimeout(`${discoveryUrl}/api/skins?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ skins: SkinListItem[]; total: number }>;
      })
      .then((data) => {
        setSkins(data.skins);
        setTotal(data.total);
        setUnreachable(false);
      })
      .catch(() => setUnreachable(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchSkins(q, base, page);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, page]);

  function handleQChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchSkins(value, base, 1);
    }, 300);
  }

  function handleBaseChange(value: string) {
    setBase(value);
    setPage(1);
  }

  async function handleCardClick(skin: SkinListItem) {
    setImportingId(skin.id);
    try {
      const res = await fetchWithTimeout(`${discoveryUrl}/api/skins/${skin.id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const full = await res.json() as { payload: string };
      const parsed = JSON.parse(full.payload) as unknown;
      const validated = validateSkin(parsed);
      onImport(validated);
    } catch (e) {
      alert(`Failed to import skin: ${e}`);
    } finally {
      setImportingId(null);
    }
  }

  if (unreachable && !loading) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <label className="settings-label">{t("settings.skins.browse")}</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="search"
          placeholder={t("settings.skins.search")}
          value={q}
          onChange={(e) => handleQChange(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <select
          value={base}
          onChange={(e) => handleBaseChange(e.target.value)}
          style={{ minWidth: 100 }}
        >
          {BASE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === "" ? t("settings.skins.filter_all") : t(`settings.skin.base.${o}`)}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.skins.loading")}</p>
      )}
      {!loading && skins.length === 0 && (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.skins.empty")}</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {skins.map((skin) => (
          <button
            key={skin.id}
            onClick={() => handleCardClick(skin)}
            disabled={importingId === skin.id}
            style={{
              textAlign: "left",
              padding: 12,
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: "pointer",
              opacity: importingId === skin.id ? 0.6 : 1,
            }}
          >
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {[skin.swatch_bg, skin.swatch_surface, skin.swatch_accent].map((color, i) => (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    width: 20,
                    height: 20,
                    borderRadius: "var(--r-sm)",
                    background: color || "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                />
              ))}
            </div>
            <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 2 }}>
              {skin.name}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: 2 }}>
              {skin.base}
            </div>
            <div
              style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)", fontFamily: "monospace" }}
              title={skin.author_pubkey}
            >
              {truncatePubkey(skin.author_pubkey)}
            </div>
          </button>
        ))}
      </div>

      {total > 20 && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          {page > 1 && (
            <button className="btn-secondary" onClick={() => setPage((p) => p - 1)}>
              {t("settings.skins.previous")}
            </button>
          )}
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.skins.page", { page, total: Math.ceil(total / 20) })}
          </span>
          {page * 20 < total && (
            <button className="btn-secondary" onClick={() => setPage((p) => p + 1)}>
              {t("settings.skins.load_more")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
