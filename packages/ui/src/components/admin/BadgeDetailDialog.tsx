import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatPubkey } from "@wavvon/core";
import type { BadgeAward, BadgeDef, MemberAdminInfo } from "../../types";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";
import { FocusTrap } from "../FocusTrap";
import type { BadgeCatalogueActions } from "./BadgeCatalogueActions";
import { BadgeRuleText } from "./BadgeRuleText";

interface Props {
  def: BadgeDef;
  programName?: string;
  actions: BadgeCatalogueActions;
  members: MemberAdminInfo[];
  onClose: () => void;
  onChanged: () => void;
  onDelete: () => void;
}

export function BadgeDetailDialog({ def, programName, actions, members, onClose, onChanged, onDelete }: Props) {
  const { t } = useTranslation();
  useCloseOnEscape(onClose);
  const [awards, setAwards] = useState<BadgeAward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [level, setLevel] = useState(def.levels[0]?.level ?? 1);

  const hand = def.rule === "manual" && !def.program_pubkey;
  const nameOf = (pk: string) => members.find((m) => m.public_key === pk)?.display_name || formatPubkey(pk);

  async function load() {
    try {
      setAwards(await actions.listBadgeAwards(def.id));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => { void load(); }, [def.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
      await load();
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  const held = new Set(awards.map((a) => a.subject_pubkey));
  const q = filter.trim().toLowerCase();
  const candidates = members.filter(
    (m) => !held.has(m.public_key) && (!q || (m.display_name ?? "").toLowerCase().includes(q) || m.public_key.startsWith(q)),
  );

  const toggle = (pk: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (!next.delete(pk)) next.add(pk);
      return next;
    });

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={def.name}>
      <FocusTrap>
        <div className="modal badge-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="badge-detail-head">
            <span className="badge-row-icon" aria-hidden="true">{def.icon || "🏅"}</span>
            <div>
              <h3>{def.name}</h3>
              <div className="muted"><BadgeRuleText def={def} programName={programName} /></div>
            </div>
          </div>

          <h4>{t("hub.admin.badges.detail.holders")}</h4>
          {awards.length === 0 ? (
            <p className="muted">{t("hub.admin.badges.detail.none")}</p>
          ) : (
            <ul className="badge-holders">
              {awards.map((a) => (
                <li key={a.subject_pubkey} className="settings-row">
                  <span title={a.subject_pubkey}>{nameOf(a.subject_pubkey)}</span>
                  <span className="muted">{def.levels.find((l) => l.level === a.level)?.name ?? a.level}</span>
                  {hand && (
                    <button
                      type="button"
                      className="btn-small danger"
                      aria-label={t("hub.admin.badges.detail.remove_aria", { name: nameOf(a.subject_pubkey) })}
                      onClick={() => void run(() => actions.revokeBadgeAward(def.id, a.subject_pubkey))}
                    >
                      {t("hub.admin.badges.detail.remove")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {hand && (
            <>
              <h4>{t("hub.admin.badges.detail.grant")}</h4>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("hub.admin.badges.detail.grant_filter")}
                aria-label={t("hub.admin.badges.detail.grant_filter")}
              />
              <ul className="badge-candidates">
                {candidates.map((m) => (
                  <li key={m.public_key}>
                    <label>
                      <input type="checkbox" checked={picked.has(m.public_key)} onChange={() => toggle(m.public_key)} />{" "}
                      {m.display_name || formatPubkey(m.public_key)}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="settings-row">
                {def.levels.length > 1 && (
                  <select aria-label={t("hub.admin.badges.detail.level")} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    {def.levels.map((l) => <option key={l.level} value={l.level}>{l.name}</option>)}
                  </select>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  disabled={picked.size === 0}
                  onClick={() =>
                    void run(async () => {
                      await actions.grantBadgeDef(def.id, [...picked], def.levels.length > 1 ? level : undefined);
                      setPicked(new Set());
                    })
                  }
                >
                  {t("hub.admin.badges.detail.grant_n", { count: picked.size })}
                </button>
              </div>
            </>
          )}

          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="confirm-modal-actions">
            <button type="button" className="btn-danger" onClick={onDelete}>{t("hub.admin.badges.delete")}</button>
            <button type="button" className="btn-secondary" onClick={onClose}>{t("modal.close")}</button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
