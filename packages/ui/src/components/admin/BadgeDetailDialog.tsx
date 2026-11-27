import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime, formatPubkey } from "@wavvon/core";
import type { BadgeAward, BadgeDef, MemberAdminInfo } from "../../types";
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

/** One badge, in place of the catalogue: who holds it at which level, and for
 *  a badge given by hand, granting and removing it. */
export function BadgeDetailDialog({ def, programName, actions, members, onClose, onChanged, onDelete }: Props) {
  const { t } = useTranslation();
  const [awards, setAwards] = useState<BadgeAward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [granting, setGranting] = useState(false);
  const [level, setLevel] = useState(def.levels[0]?.level ?? 1);

  const hand = def.rule === "manual" && !def.program_pubkey;
  const member = (pk: string) => members.find((m) => m.public_key === pk);
  const nameOf = (pk: string) => member(pk)?.display_name || formatPubkey(pk);

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
  const levelName = (n: number) => def.levels.find((l) => l.level === n)?.name ?? String(n);

  return (
    <div className="badge-detail">
      <button type="button" className="link-button badge-detail-back" onClick={onClose}>‹ {t("hub.admin.badges.title")}</button>

      <div className="badge-detail-head">
        <span className="badge-row-icon badge-detail-icon" aria-hidden="true">{def.icon || "🏅"}</span>
        <div className="badge-detail-title">
          <h2>{def.name}</h2>
          <div className="muted"><BadgeRuleText def={def} programName={programName} /></div>
        </div>
        <button type="button" className="btn-secondary btn-small danger" onClick={onDelete}>{t("hub.admin.badges.delete")}</button>
      </div>

      <div className="badge-detail-stats">
        {def.levels.map((l) => (
          <div key={l.level} className="badge-detail-stat">
            <span className="badge-detail-stat-n">{def.holders[String(l.level)] ?? 0}</span>
            <span className="muted">{def.levels.length > 1 ? l.name : t("hub.admin.badges.detail.hold_now")}</span>
          </div>
        ))}
      </div>

      <div className="badge-detail-holders-head">
        <h3>{t("hub.admin.badges.detail.holders")}</h3>
        {hand && (
          <button type="button" className="btn-primary btn-small" aria-expanded={granting} onClick={() => setGranting((v) => !v)}>
            {t("hub.admin.badges.detail.grant")}
          </button>
        )}
      </div>

      {hand && granting && (
        <div className="badge-grant">
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
              className="btn-primary btn-small"
              disabled={picked.size === 0}
              onClick={() =>
                void run(async () => {
                  await actions.grantBadgeDef(def.id, [...picked], def.levels.length > 1 ? level : undefined);
                  setPicked(new Set());
                  setGranting(false);
                })
              }
            >
              {t("hub.admin.badges.detail.grant_n", { count: picked.size })}
            </button>
          </div>
        </div>
      )}

      {awards.length === 0 ? (
        <p className="muted">{t("hub.admin.badges.detail.none")}</p>
      ) : (
        <table className="certs-table">
          <tbody>
            {awards.map((a) => {
              const m = member(a.subject_pubkey);
              return (
                <tr key={a.subject_pubkey}>
                  <td>
                    <span className="certs-person">{m?.display_name || formatPubkey(a.subject_pubkey)}</span>{" "}
                    <span className="member-pk" title={a.subject_pubkey}>{formatPubkey(a.subject_pubkey)}</span>
                  </td>
                  <td>{t("hub.admin.badges.detail.since", { when: formatDateTime(a.awarded_at) })}</td>
                  <td>{def.levels.length > 1 ? levelName(a.level) : ""}</td>
                  <td className="certs-actions">
                    {hand && (
                      <button
                        type="button"
                        className="btn-secondary btn-small"
                        aria-label={t("hub.admin.badges.detail.remove_aria", { name: nameOf(a.subject_pubkey) })}
                        onClick={() => void run(() => actions.revokeBadgeAward(def.id, a.subject_pubkey))}
                      >
                        {t("hub.admin.badges.detail.remove")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}
      <p className="muted badge-detail-foot">{t(hand ? "hub.admin.badges.detail.foot_hand" : "hub.admin.badges.detail.foot_auto")}</p>
    </div>
  );
}
