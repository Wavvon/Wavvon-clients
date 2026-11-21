import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ThemesController } from "../hooks/useThemes";
import {
  downloadListing,
  findInstalled,
  isUpdate,
  listingPassesContrast,
  type ThemeListing,
} from "../themes/gallery";

interface Props {
  controller: ThemesController;
  /** Fetch with a request timeout; each app supplies its own. */
  fetchWithTimeout: (url: string) => Promise<Response>;
  /** Base URL of the directory. The app does not render this when it has none. */
  discoveryUrl: string;
}

const PAGE_SIZE = 20;

function truncatePubkey(pk: string): string {
  return pk.length <= 20 ? pk : `${pk.slice(0, 10)}…${pk.slice(-6)}`;
}

export function ThemesGallery({ controller, fetchWithTimeout, discoveryUrl }: Props) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [listings, setListings] = useState<ThemeListing[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  // A self-hoster who never opted into the directory should not see a loud
  // connection error: the whole section hides itself.
  const [unreachable, setUnreachable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  function load(query: string, pageNum: number) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(pageNum) });
    if (query.trim()) params.set("q", query.trim());
    fetchWithTimeout(`${discoveryUrl}/api/themes?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ themes: ThemeListing[]; total: number }>;
      })
      .then((data) => {
        setListings(data.themes);
        setTotal(data.total);
        setUnreachable(false);
      })
      .catch(() => setUnreachable(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load(q, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function onSearch(value: string) {
    setQ(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPage(1);
      load(value, 1);
    }, 300);
  }

  async function onInstall(listing: ThemeListing) {
    setBusyId(listing.id);
    setError(null);
    try {
      const bytes = await downloadListing(listing, fetchWithTimeout);
      controller.startPreview(bytes, listing.sha256, findInstalled(listing, controller.themes)?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.theme.gallery.failed"));
    } finally {
      setBusyId(null);
    }
  }

  const bar = controller.preview && (
    <div className="settings-section" role="status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>{t("settings.theme.gallery.previewing", { name: controller.preview.manifest.name })}</span>
      <button className="btn-small" onClick={() => void controller.keepPreview()}>{t("settings.theme.gallery.keep")}</button>
      <button className="btn-small btn-secondary" onClick={controller.discardPreview}>{t("settings.theme.gallery.discard")}</button>
    </div>
  );

  if (unreachable && !loading) return bar || null;

  return (
    <div style={{ marginTop: 24 }}>
      {bar}
      <label className="settings-label">{t("settings.theme.gallery.title")}</label>
      <input
        type="search"
        placeholder={t("settings.theme.gallery.search")}
        aria-label={t("settings.theme.gallery.search")}
        value={q}
        onChange={(e) => onSearch(e.target.value)}
        style={{ width: "100%", marginBottom: 12 }}
      />
      {error && <p role="alert" style={{ color: "var(--danger)", fontSize: "var(--text-xs)" }}>{error}</p>}
      {loading && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.theme.gallery.loading")}</p>}
      {!loading && listings.length === 0 && <p className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.theme.gallery.empty")}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {listings.map((l) => {
          const installed = findInstalled(l, controller.themes);
          const update = isUpdate(l, controller.themes);
          const passes = listingPassesContrast(l);
          return (
            <div key={l.id} style={{ padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)" }}>
              {l.preview_url && (
                <img src={l.preview_url} alt="" aria-hidden="true" loading="lazy" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: "var(--r-sm)", marginBottom: 8 }} />
              )}
              <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{l.name}</div>
              <div title={l.author_pubkey} style={{ fontSize: "var(--text-xs)", color: "var(--text-faint)", fontFamily: "monospace", marginBottom: 4 }}>
                {truncatePubkey(l.author_pubkey)}
              </div>
              {l.description && <p className="muted" style={{ fontSize: "var(--text-xs)", margin: "0 0 6px" }}>{l.description}</p>}
              <div style={{ fontSize: "var(--text-xs)", color: passes ? "var(--success)" : "var(--warning)", marginBottom: 8 }}>
                {passes ? t("settings.theme.gallery.contrast_ok") : t("settings.theme.gallery.contrast_low")}
              </div>
              <button className="btn-small" disabled={busyId === l.id || (!!installed && !update)} onClick={() => void onInstall(l)}>
                {update ? t("settings.theme.gallery.update") : installed ? t("settings.theme.gallery.installed") : t("settings.theme.gallery.install")}
              </button>
            </div>
          );
        })}
      </div>

      {total > PAGE_SIZE && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          {page > 1 && <button className="btn-secondary" onClick={() => setPage((p) => p - 1)}>{t("settings.theme.gallery.previous")}</button>}
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t("settings.theme.gallery.page", { page, total: Math.ceil(total / PAGE_SIZE) })}
          </span>
          {page * PAGE_SIZE < total && <button className="btn-secondary" onClick={() => setPage((p) => p + 1)}>{t("settings.theme.gallery.next")}</button>}
        </div>
      )}
    </div>
  );
}
