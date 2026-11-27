import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BadgeDefRequest, BadgeRule, RoleInfo } from "../../types";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";
import { ruleUnits, toThreshold, type BadgeUnit } from "../../utils/badgeUnits";
import { FocusTrap } from "../FocusTrap";
import { CloseIcon } from "../Icons";
import type { BadgeCatalogueActions } from "./BadgeCatalogueActions";

const RULES: Exclude<BadgeRule, "manual">[] = ["member_age", "online", "messages", "active_days", "voice", "role_held"];

interface LevelDraft {
  name: string;
  amount: string;
  unit: BadgeUnit;
}

interface Props {
  actions: BadgeCatalogueActions;
  roles: RoleInfo[];
  onClose: () => void;
  onCreated: () => void;
}

export function BadgeCreateDialog({ actions, roles, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  useCloseOnEscape(onClose);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [byRule, setByRule] = useState(false);
  const [rule, setRule] = useState<Exclude<BadgeRule, "manual">>("member_age");
  const [roleId, setRoleId] = useState("");
  const [keepWhile, setKeepWhile] = useState(false);
  const [levels, setLevels] = useState<LevelDraft[]>([{ name: "", amount: "30", unit: "days" }]);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effective: BadgeRule = byRule ? rule : "manual";
  const units = ruleUnits(rule);

  const request = useMemo<BadgeDefRequest | null>(() => {
    if (!name.trim()) return null;
    if (!byRule) {
      return {
        name: name.trim(),
        icon: icon.trim() || undefined,
        rule: "manual",
        levels: levels.map((l, i) => ({ level: i + 1, name: l.name.trim() || name.trim(), threshold: i + 1 })),
      };
    }
    if (rule === "role_held" && !roleId) return null;
    const built = levels.map((l, i) => ({
      level: i + 1,
      name: l.name.trim() || name.trim(),
      threshold: toThreshold(Number(l.amount), l.unit),
    }));
    if (built.some((l, i) => !(l.threshold > 0) || (i > 0 && l.threshold <= built[i - 1].threshold))) return null;
    return {
      name: name.trim(),
      icon: icon.trim() || undefined,
      rule,
      role_id: rule === "role_held" ? roleId : undefined,
      keep_while: keepWhile,
      levels: built,
    };
  }, [name, icon, byRule, rule, roleId, keepWhile, levels]);

  const requestKey = request && byRule ? JSON.stringify(request) : null;
  useEffect(() => {
    setCounts(null);
    if (!request || !byRule) return;
    let live = true;
    const timer = setTimeout(() => {
      actions.previewBadgeDef(request).then((c) => live && setCounts(c)).catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickRule(next: Exclude<BadgeRule, "manual">) {
    const u = ruleUnits(next);
    setRule(next);
    setLevels((ls) => ls.map((l) => (u.includes(l.unit) ? l : { ...l, unit: u[0] })));
  }

  const updateLevel = (i: number, patch: Partial<LevelDraft>) =>
    setLevels((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const awardCount = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  async function submit() {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      await actions.createBadgeDef(request);
      onCreated();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  const unitLabel = (u: BadgeUnit) => t(`hub.admin.badges.unit.${u === "count" ? rule : u}`);

  const top = request?.levels[request.levels.length - 1];
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={t("hub.admin.badges.create.title")}>
      <FocusTrap>
        <div className="modal badge-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="badge-dialog-head">
            <h3>{t("hub.admin.badges.create.title")}</h3>
            <button type="button" className="btn-ghost" onClick={onClose} aria-label={t("modal.close")}><CloseIcon size={13} /></button>
          </div>

          <div className="badge-dialog-cols">
            <div className="badge-dialog-form">
              <div className="badge-dialog-name">
                <input
                  type="text"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="🏅"
                  aria-label={t("hub.admin.certs.badge.icon_aria")}
                  className="badge-icon-input"
                />
                <label className="badge-field">
                  <span>{t("hub.admin.badges.create.name")}</span>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                </label>
              </div>

              <fieldset className="badge-kind">
                <legend>{t("hub.admin.badges.create.kind")}</legend>
                <div className="badge-kind-cards">
                  <label className={!byRule ? "selected" : undefined}>
                    <input type="radio" name="badge-kind" checked={!byRule} onChange={() => setByRule(false)} /> {t("hub.admin.badges.rule.manual")}
                  </label>
                  <label className={byRule ? "selected" : undefined}>
                    <input type="radio" name="badge-kind" checked={byRule} onChange={() => setByRule(true)} /> {t("hub.admin.badges.create.by_rule")}
                  </label>
                </div>
                <p className="muted">{t("hub.admin.badges.create.program_note")}</p>
              </fieldset>

              {byRule && (
                <div className="badge-field-row">
                  <label className="badge-field">
                    <span>{t("hub.admin.badges.create.rule")}</span>
                    <select value={rule} onChange={(e) => pickRule(e.target.value as typeof rule)}>
                      {RULES.map((r) => <option key={r} value={r}>{t(`hub.admin.badges.rule_long.${r}`)}</option>)}
                    </select>
                  </label>
                  {rule === "role_held" && (
                    <label className="badge-field">
                      <span>{t("hub.admin.badges.create.role")}</span>
                      <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                        <option value="">{t("hub.admin.badges.create.role_pick")}</option>
                        {roles.filter((r) => !r.id.startsWith("builtin-")).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}

              <div className="badge-field">
                <span>{t("hub.admin.badges.levels")}</span>
                <ul className="badge-level-editor">
                  {levels.map((l, i) => (
                    <li key={i}>
                      <span className="badge-level-n">{i + 1}</span>
                      <input
                        type="text"
                        value={l.name}
                        onChange={(e) => updateLevel(i, { name: e.target.value })}
                        placeholder={name.trim() || t("hub.admin.badges.create.level_name", { n: i + 1 })}
                        aria-label={t("hub.admin.badges.create.level_name", { n: i + 1 })}
                      />
                      {byRule && (
                        <>
                          <span className="muted">{t("hub.admin.badges.create.after")}</span>
                          <input
                            type="number"
                            min={1}
                            value={l.amount}
                            onChange={(e) => updateLevel(i, { amount: e.target.value })}
                            aria-label={t("hub.admin.badges.create.level_amount", { n: i + 1 })}
                            className="badge-amount"
                          />
                          {units.length > 1 ? (
                            <select
                              aria-label={t("hub.admin.badges.create.level_unit", { n: i + 1 })}
                              value={l.unit}
                              onChange={(e) => updateLevel(i, { unit: e.target.value as BadgeUnit })}
                            >
                              {units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
                            </select>
                          ) : (
                            <span className="muted badge-unit">{unitLabel(units[0])}</span>
                          )}
                        </>
                      )}
                      {levels.length > 1 && (
                        <button
                          type="button"
                          className="btn-ghost"
                          aria-label={t("hub.admin.badges.create.remove_level", { n: i + 1 })}
                          onClick={() => setLevels((ls) => ls.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="badge-add-level"
                  onClick={() => setLevels((ls) => [...ls, { name: "", amount: "", unit: ls[ls.length - 1].unit }])}
                >
                  {t("hub.admin.badges.create.add_level")}
                </button>
              </div>

              {byRule && (
                <fieldset className="badge-kind">
                  <legend>{t("hub.admin.badges.create.once")}</legend>
                  <label><input type="radio" name="badge-keep" checked={!keepWhile} onChange={() => setKeepWhile(false)} /> {t("hub.admin.badges.create.keep_good")}</label>
                  <label><input type="radio" name="badge-keep" checked={keepWhile} onChange={() => setKeepWhile(true)} /> {t("hub.admin.badges.create.keep_while")}</label>
                </fieldset>
              )}
            </div>

            <aside className="badge-dialog-side">
              <div className="badge-preview-card">
                <span className="muted">{t("hub.admin.badges.create.preview")}</span>
                <span className="badge-preview-line">
                  <span className="badge-row-icon" aria-hidden="true">{icon.trim() || "🏅"}</span>
                  <strong>{top?.name || name.trim() || t("hub.admin.certs.badge.name_placeholder")}</strong>
                </span>
              </div>
              {byRule && request && counts !== null && (
                <div className="badge-retro-card" aria-live="polite">
                  <strong>{t("hub.admin.badges.create.retro_title")}</strong>
                  <span>
                    {awardCount === 0
                      ? t("hub.admin.badges.create.retro_none")
                      : t("hub.admin.badges.create.retro", { count: awardCount })}
                  </span>
                  {awardCount > 0 && request.levels.length > 1 && (
                    <span>{request.levels.map((l) => `${l.name}: ${counts[String(l.level)] ?? 0}`).join(" · ")}</span>
                  )}
                </div>
              )}
              {levels.length > 1 && <p className="muted">{t("hub.admin.badges.create.one_at_a_time")}</p>}
            </aside>
          </div>

          {error && <p className="error-text" role="alert">{error}</p>}
          <div className="badge-dialog-foot">
            <button type="button" className="btn-ghost" onClick={onClose}>{t("modal.cancel")}</button>
            <button type="button" className="btn-primary" disabled={!request || busy} onClick={() => void submit()}>
              {effective !== "manual" && awardCount > 0
                ? t("hub.admin.badges.create.confirm_award", { count: awardCount })
                : t("hub.admin.badges.create.confirm")}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
