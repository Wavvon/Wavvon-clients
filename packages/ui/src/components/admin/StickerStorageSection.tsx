import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey, formatRelative } from "@wavvon/core";
import type { AdminSticker, StickerBlockEntry, StickerBudget, StickerUsage } from "../../types";
import { stickerErrorKey, stickerSrc } from "../../utils/stickers";
import { ErrorRetry } from "../ErrorRetry";
import { useConfirm } from "../ConfirmDialog";
import { SettingRow } from "../SettingRow";

const PAGE = 50;

export interface StickerStorageActions {
  listStored: (query: { sort: "created" | "used" | "size"; limit: number; cursor?: string }) => Promise<AdminSticker[]>;
  getUsage: () => Promise<StickerUsage>;
  deleteSticker: (id: string, block: boolean) => Promise<void>;
  listBlocklist: () => Promise<StickerBlockEntry[]>;
  unblock: (sha256: string) => Promise<void>;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kb(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Budget({ label, b }: { label: string; b: StickerBudget }) {
  const pct = b.cap_bytes > 0 ? Math.min(100, Math.round((b.bytes / b.cap_bytes) * 100)) : 0;
  return (
    <div className="settings-section">
      <label className="settings-label">{label}</label>
      <progress value={pct} max={100} aria-label={label} />
      <span className="muted"> {mb(b.bytes)} / {mb(b.cap_bytes)} ({b.count})</span>
    </div>
  );
}

interface Props {
  actions: StickerStorageActions;
  hubUrl: string;
}

export function StickerStorageSection({ actions, hubUrl }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [usage, setUsage] = useState<StickerUsage | null>(null);
  const [rows, setRows] = useState<AdminSticker[] | null>(null);
  const [more, setMore] = useState(false);
  const [blocklist, setBlocklist] = useState<StickerBlockEntry[]>([]);
  const [sort, setSort] = useState<"created" | "used" | "size">("created");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function loadAll(nextSort = sort) {
    setLoadError(null);
    try {
      const [u, list, bl] = await Promise.all([
        actions.getUsage(),
        actions.listStored({ sort: nextSort, limit: PAGE }),
        actions.listBlocklist(),
      ]);
      setUsage(u);
      setRows(list);
      setMore(list.length === PAGE);
      setBlocklist(bl);
    } catch (e) {
      setLoadError(t(stickerErrorKey(e, "manage")));
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (!rows || rows.length === 0) return;
    try {
      const next = await actions.listStored({ sort, limit: PAGE, cursor: rows[rows.length - 1].id });
      setRows([...rows, ...next]);
      setMore(next.length === PAGE);
    } catch (e) {
      setError(t(stickerErrorKey(e, "manage")));
    }
  }

  async function act(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      await loadAll();
    } catch (e) {
      setError(t(stickerErrorKey(e, "manage")));
    }
  }

  async function remove(s: AdminSticker, block: boolean) {
    const ok = await confirm({
      title: t(block ? "hub.admin.sticker_storage.block_confirm" : "hub.admin.sticker_storage.delete_confirm", { name: s.name }),
      confirmLabel: t(block ? "hub.admin.sticker_storage.delete_block" : "hub.admin.sticker_storage.delete"),
      danger: true,
    });
    if (ok) await act(() => actions.deleteSticker(s.id, block));
  }

  if (!usage || !rows) {
    return loadError
      ? <section><ErrorRetry message={loadError} onRetry={() => void loadAll()} /></section>
      : <section><p className="muted">{t("hub.admin.sticker_storage.loading")}</p></section>;
  }

  return (
    <section>
      {dialog}
      <h1>{t("hub.admin.sticker_storage.title")}</h1>
      <p className="muted">{t("hub.admin.sticker_storage.hint")}</p>
      {error && <p className="error-text">{error}</p>}

      <Budget label={t("hub.admin.sticker_storage.packs_budget")} b={usage.packs} />
      {usage.packs_warning && <p className="error-text">{t("hub.admin.sticker_storage.packs_warning")}</p>}
      <Budget label={t("hub.admin.sticker_storage.copies_budget")} b={usage.copies} />
      <p className="muted">{t("hub.admin.sticker_storage.evictions", { count: usage.evictions })}</p>

      <div className="settings-section">
        <label className="settings-label" htmlFor="sticker-sort">{t("hub.admin.sticker_storage.sort")}</label>
        <select
          id="sticker-sort"
          value={sort}
          onChange={(e) => {
            const next = e.target.value as typeof sort;
            setSort(next);
            void loadAll(next);
          }}
        >
          <option value="created">{t("hub.admin.sticker_storage.sort_created")}</option>
          <option value="used">{t("hub.admin.sticker_storage.sort_used")}</option>
          <option value="size">{t("hub.admin.sticker_storage.sort_size")}</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="muted">{t("hub.admin.sticker_storage.empty")}</p>
      ) : (
        rows.map((s) => (
          <SettingRow
            key={s.id}
            title={s.name}
            state={t("hub.admin.sticker_storage.row_state", {
              size: kb(s.size_bytes),
              origin: s.origin_hub_name ?? t("hub.admin.sticker_storage.own_pack"),
              count: s.message_count,
            })}
            meta={s.state === "ok" ? undefined : t(`hub.admin.sticker_storage.state_${s.state}`)}
            open={open === s.id}
            onToggle={() => setOpen((cur) => (cur === s.id ? null : s.id))}
          >
            {s.state === "ok" && <img src={stickerSrc(hubUrl, s.sha256)} alt={s.name} className="sticker-cell-img" />}
            <dl className="sticker-admin-facts">
              <dt>{t("hub.admin.sticker_storage.uploader")}</dt><dd>{formatPubkey(s.uploader)}</dd>
              <dt>{t("hub.admin.sticker_storage.origin")}</dt><dd>{s.origin_hub_url ?? t("hub.admin.sticker_storage.own_pack")}</dd>
              <dt>{t("hub.admin.sticker_storage.last_used")}</dt><dd>{formatRelative(s.last_used_at)}</dd>
              <dt>{t("hub.admin.sticker_storage.references")}</dt><dd>{s.message_count}</dd>
            </dl>
            <div className="settings-row">
              {s.state !== "removed" && (
                <button className="btn-small danger" onClick={() => void remove(s, false)}>
                  {t("hub.admin.sticker_storage.delete")}
                </button>
              )}
              <button className="btn-small danger" onClick={() => void remove(s, true)}>
                {t("hub.admin.sticker_storage.delete_block")}
              </button>
            </div>
          </SettingRow>
        ))
      )}
      {more && (
        <button className="btn-small btn-secondary" onClick={() => void loadMore()}>
          {t("hub.admin.sticker_storage.load_more")}
        </button>
      )}

      <h2>{t("hub.admin.sticker_storage.blocklist")}</h2>
      {blocklist.length === 0 ? (
        <p className="muted">{t("hub.admin.sticker_storage.blocklist_empty")}</p>
      ) : (
        blocklist.map((b) => (
          <div key={b.sha256} className="settings-row">
            <code>{b.sha256.slice(0, 16)}</code>
            <span className="muted">{formatRelative(b.created_at)}</span>
            <button className="btn-small" onClick={() => void act(() => actions.unblock(b.sha256))}>
              {t("hub.admin.sticker_storage.unblock")}
            </button>
          </div>
        ))
      )}
    </section>
  );
}
