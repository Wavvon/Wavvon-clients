import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BadgeDef } from "../../types";
import { BadgeRuleText } from "./BadgeRuleText";

interface Props {
  def: BadgeDef;
  programName?: string;
  onOpen: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
}

export function BadgeRow({ def, programName, onOpen, onToggleHidden, onDelete }: Props) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const total = Object.values(def.holders).reduce((a, b) => a + b, 0);
  return (
    <li className={`badge-row${def.hidden ? " hidden" : ""}`}>
      <button type="button" className="badge-row-main" onClick={onOpen}>
        <span className="badge-row-icon" aria-hidden="true">{def.icon || "🏅"}</span>
        <span className="badge-row-body">
          <strong>{def.name}</strong>
          {def.hidden && <span className="muted"> · {t("hub.admin.badges.hidden")}</span>}
          <span className="muted badge-row-rule"><BadgeRuleText def={def} programName={programName} /></span>
          <span className="badge-levels" role="list" aria-label={t("hub.admin.badges.levels")}>
            {def.levels.map((l, i) => {
              const n = def.holders[String(l.level)] ?? 0;
              return (
                <Fragment key={l.level}>
                  {i > 0 && <span className="badge-level-sep" aria-hidden="true">›</span>}
                  <span role="listitem" className={`badge-level${n === 0 ? " empty" : ""}`}>{l.name} · {n}</span>
                </Fragment>
              );
            })}
          </span>
        </span>
        <span className="badge-row-total muted">{t("hub.admin.badges.total", { count: total })}</span>
      </button>
      <div className="badge-row-menu">
        <button
          type="button"
          className="btn-icon"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={t("hub.admin.badges.menu", { name: def.name })}
          onClick={() => setMenu((m) => !m)}
        >
          ⋯
        </button>
        {menu && (
          <div className="badge-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onToggleHidden(); }}>
              {t(def.hidden ? "hub.admin.badges.show" : "hub.admin.badges.hide")}
            </button>
            <button type="button" role="menuitem" className="danger" onClick={() => { setMenu(false); onDelete(); }}>
              {t("hub.admin.badges.delete")}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
