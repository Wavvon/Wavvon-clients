import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Sticker, StickerPack } from "../../types";
import { isSaved, safeOriginHref, savedEntryFor, stickerErrorKey, stickerSrc } from "../../utils/stickers";
import type { StickerActions } from "./stickerActions";

const BOX = 160;

function fitted(w: number, h: number): { width: number; height: number } {
  if (!w || !h) return { width: BOX, height: BOX };
  const k = Math.min(BOX / w, BOX / h, 1);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

interface Props {
  sticker: Sticker;
  hubUrl: string;
  actions?: StickerActions;
  onError: (msg: string) => void;
}

export function StickerMessage({ sticker, hubUrl, actions, onError }: Props) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const [packs, setPacks] = useState<StickerPack[] | null>(null);
  const [choosingPack, setChoosingPack] = useState(false);
  const [packId, setPackId] = useState("");

  useEffect(() => {
    if (!choosingPack || packs) return;
    actions?.listPacks().then((p) => { setPacks(p); setPackId(p[0]?.id ?? ""); }).catch((e) => onError(t(stickerErrorKey(e, "manage"))));
  }, [choosingPack, packs, actions, onError, t]);

  if (sticker.state !== "ok") {
    return (
      <span className="sticker-tombstone muted">
        {t(sticker.state === "removed" ? "stickers.tombstone.removed" : "stickers.tombstone.evicted")}
      </span>
    );
  }

  const href = safeOriginHref(sticker.origin_hub_url);
  const size = fitted(sticker.width, sticker.height);
  const saved = actions ? isSaved(actions.collection.stickers, sticker.sha256) : false;
  const fromElsewhere = sticker.origin_hub_url !== null;

  async function save() {
    if (!actions) return;
    try {
      await actions.collection.save(savedEntryFor(sticker, { url: actions.hubUrl, name: actions.hubName }));
    } catch (e) {
      onError(t(stickerErrorKey(e, "manage")));
    }
  }

  async function addToPack() {
    if (!actions || !packId) return;
    try {
      await actions.addToPack(packId, sticker.sha256);
      setChoosingPack(false);
    } catch (e) {
      onError(t(stickerErrorKey(e, "manage")));
    }
  }

  return (
    <span className="sticker-message">
      {broken ? (
        <span className="sticker-tombstone muted">{t("stickers.unavailable_now")}</span>
      ) : (
        <img
          className="sticker-message-img"
          src={stickerSrc(hubUrl, sticker.sha256)}
          alt={sticker.name}
          title={sticker.name}
          width={size.width}
          height={size.height}
          onError={() => setBroken(true)}
        />
      )}
      {fromElsewhere && sticker.origin_hub_name && (
        <span className="sticker-origin muted">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {t("stickers.from_hub", { hub: sticker.origin_hub_name })}
            </a>
          ) : (
            t("stickers.from_hub", { hub: sticker.origin_hub_name })
          )}
        </span>
      )}
      {actions && (
        <span className="sticker-actions">
          {actions.collection.editable && (
            saved ? (
              <span className="muted">{t("stickers.saved")}</span>
            ) : (
              <button type="button" className="btn-small btn-secondary" onClick={() => void save()}>
                {t("stickers.save")}
              </button>
            )
          )}
          {actions.canManagePacks && !choosingPack && (
            <button type="button" className="btn-small btn-secondary" onClick={() => setChoosingPack(true)}>
              {t("stickers.add_to_pack")}
            </button>
          )}
          {choosingPack && packs && (
            packs.length === 0 ? (
              <span className="muted">{t("stickers.no_packs")}</span>
            ) : (
              <>
                <select value={packId} onChange={(e) => setPackId(e.target.value)} aria-label={t("stickers.pick_pack")}>
                  {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button type="button" className="btn-small" onClick={() => void addToPack()}>
                  {t("stickers.add")}
                </button>
              </>
            )
          )}
        </span>
      )}
    </span>
  );
}
