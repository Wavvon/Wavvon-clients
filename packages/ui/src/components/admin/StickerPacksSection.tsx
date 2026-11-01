import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Sticker, StickerPack } from "../../types";
import { stickerErrorKey, stickerSrc } from "../../utils/stickers";
import { ErrorRetry } from "../ErrorRetry";
import { useConfirm } from "../ConfirmDialog";
import { SettingRow } from "../SettingRow";

export interface StickerPacksActions {
  listPacks: () => Promise<StickerPack[]>;
  createPack: (name: string) => Promise<StickerPack>;
  renamePack: (packId: string, name: string) => Promise<void>;
  deletePack: (packId: string) => Promise<void>;
  uploadSticker: (packId: string, name: string, file: File) => Promise<Sticker>;
  removeSticker: (packId: string, stickerId: string) => Promise<void>;
}

interface Props {
  actions: StickerPacksActions;
  hubUrl: string;
}

export function StickerPacksSection({ actions, hubUrl }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [packs, setPacks] = useState<StickerPack[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      setPacks(await actions.listPacks());
    } catch (e) {
      setLoadError(t(stickerErrorKey(e, "manage")));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(t(stickerErrorKey(e, "manage")));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(title: string, label: string, fn: () => Promise<unknown>) {
    if (await confirm({ title, confirmLabel: label, danger: true })) await run(fn);
  }

  return (
    <section>
      {dialog}
      <h1>{t("hub.admin.stickers.title")}</h1>
      <p className="muted">{t("hub.admin.stickers.hint")}</p>
      {error && <p className="error-text">{error}</p>}

      <div className="settings-section">
        <label className="settings-label" htmlFor="sticker-new-pack">{t("hub.admin.stickers.new_pack")}</label>
        <div className="settings-row">
          <input
            id="sticker-new-pack"
            type="text"
            maxLength={64}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("hub.admin.stickers.pack_name")}
          />
          <button
            disabled={busy || !newName.trim()}
            onClick={() => void run(async () => { await actions.createPack(newName.trim()); setNewName(""); })}
          >
            {t("hub.admin.stickers.create_pack")}
          </button>
        </div>
      </div>

      {packs === null ? (
        loadError ? <ErrorRetry message={loadError} onRetry={load} /> : <p className="muted">{t("hub.admin.stickers.loading")}</p>
      ) : packs.length === 0 ? (
        <p className="muted">{t("hub.admin.stickers.no_packs")}</p>
      ) : (
        packs.map((pack) => (
          <SettingRow
            key={pack.id}
            title={pack.name}
            state={t("hub.admin.stickers.pack_state", { count: pack.stickers.length })}
            open={open === pack.id}
            onToggle={() => setOpen((cur) => (cur === pack.id ? null : pack.id))}
          >
            <div className="settings-section">
              <div className="settings-row">
                <input
                  type="text"
                  maxLength={64}
                  aria-label={t("hub.admin.stickers.pack_name")}
                  value={renames[pack.id] ?? pack.name}
                  onChange={(e) => setRenames((r) => ({ ...r, [pack.id]: e.target.value }))}
                />
                <button
                  className="btn-small"
                  disabled={busy || !(renames[pack.id] ?? "").trim() || renames[pack.id] === pack.name}
                  onClick={() => void run(() => actions.renamePack(pack.id, renames[pack.id].trim()))}
                >
                  {t("hub.admin.stickers.rename")}
                </button>
                <button
                  className="btn-small danger"
                  disabled={busy}
                  onClick={() => void confirmDelete(
                    t("hub.admin.stickers.delete_pack_confirm", { name: pack.name }),
                    t("hub.admin.stickers.delete_pack"),
                    () => actions.deletePack(pack.id),
                  )}
                >
                  {t("hub.admin.stickers.delete_pack")}
                </button>
              </div>
            </div>

            <div className="settings-section">
              <label className="settings-label" htmlFor={`sticker-file-${pack.id}`}>{t("hub.admin.stickers.add_sticker")}</label>
              <div className="settings-row">
                <input
                  type="text"
                  maxLength={32}
                  aria-label={t("hub.admin.stickers.sticker_name")}
                  placeholder={t("hub.admin.stickers.sticker_name")}
                  value={fileNames[pack.id] ?? ""}
                  onChange={(e) => setFileNames((n) => ({ ...n, [pack.id]: e.target.value }))}
                />
                <input
                  id={`sticker-file-${pack.id}`}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const name = (fileNames[pack.id] ?? "").trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 32);
                    void run(async () => {
                      await actions.uploadSticker(pack.id, name, file);
                      setFileNames((n) => ({ ...n, [pack.id]: "" }));
                    });
                  }}
                />
              </div>
            </div>

            <div className="sticker-admin-grid">
              {pack.stickers.map((s) => (
                <span key={s.id} className="sticker-admin-cell">
                  <img src={stickerSrc(hubUrl, s.sha256)} alt={s.name} className="sticker-cell-img" />
                  <span className="muted sticker-admin-name">{s.name}</span>
                  <button
                    className="btn-small danger"
                    disabled={busy}
                    onClick={() => void run(() => actions.removeSticker(pack.id, s.id))}
                  >
                    {t("hub.admin.stickers.remove")}
                  </button>
                </span>
              ))}
            </div>
          </SettingRow>
        ))
      )}
    </section>
  );
}
