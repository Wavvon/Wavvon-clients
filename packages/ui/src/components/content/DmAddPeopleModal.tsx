import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { User } from "../../types";
import { formatPubkey } from "@wavvon/core";
import { FocusTrap } from "../FocusTrap";
import { useCloseOnEscape } from "../../hooks/useCloseOnEscape";

interface Props {
  /** Who can be picked: the hub's members. */
  users: User[];
  /** Already in the conversation, and this user. */
  exclude: string[];
  onConfirm: (pubkeys: string[]) => void;
  onCancel: () => void;
}

const nameOf = (u: User) => u.display_name || formatPubkey(u.public_key);

/** Pick hub members to bring into a DM. In a 1:1 this starts a new group with
 *  them; in a group it adds them. */
export function DmAddPeopleModal({ users, exclude, onConfirm, onCancel }: Props) {
  useCloseOnEscape(onCancel);
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const needle = filter.trim().toLowerCase();
  const candidates = users.filter(
    (u) => !exclude.includes(u.public_key) && (!needle || nameOf(u).toLowerCase().includes(needle)),
  );

  function toggle(key: string) {
    setPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-label={t("dm.add_people.title")}>
      <FocusTrap>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h3>{t("dm.add_people.title")}</h3>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("users.list.filter_placeholder")}
            aria-label={t("users.list.filter_placeholder")}
            autoFocus
          />
          <ul className="dm-add-people-list">
            {candidates.length === 0 && <li className="muted">{t("users.list.no_matches")}</li>}
            {candidates.map((u) => (
              <li key={u.public_key}>
                <label>
                  <input type="checkbox" checked={picked.includes(u.public_key)} onChange={() => toggle(u.public_key)} />
                  {nameOf(u)}
                </label>
              </li>
            ))}
          </ul>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onCancel}>{t("modal.cancel")}</button>
            <button className="btn-primary" disabled={picked.length === 0} onClick={() => onConfirm(picked)}>
              {t("dm.add_people.confirm", { count: picked.length })}
            </button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
