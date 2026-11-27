import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BadgeDef, MemberAdminInfo, RoleInfo } from "../../types";
import { useConfirm } from "../ConfirmDialog";
import type { BadgeCatalogueActions } from "./BadgeCatalogueActions";
import { BadgeCreateDialog } from "./BadgeCreateDialog";
import { BadgeDetailDialog } from "./BadgeDetailDialog";
import { BadgeRow } from "./BadgeRow";

const RULES = ["member_age", "online", "messages", "active_days", "voice", "role_held"] as const;
type Sort = "held" | "name" | "new";

interface Props {
  actions: BadgeCatalogueActions;
  members: MemberAdminInfo[];
  listRoles?: () => Promise<RoleInfo[]>;
}

const total = (d: BadgeDef) => Object.values(d.holders).reduce((a, b) => a + b, 0);

export function BadgeCatalogue({ actions, members, listRoles }: Props) {
  const { t } = useTranslation();
  const { confirm, dialog } = useConfirm();
  const [defs, setDefs] = useState<BadgeDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("held");
  const [creating, setCreating] = useState(false);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  async function reload() {
    try {
      setDefs(await actions.listBadgeDefs());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void reload();
    listRoles?.().then(setRoles).catch(() => setRoles([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const programs = useMemo(
    () => [...new Set(defs.map((d) => d.program_pubkey).filter((p): p is string => !!p))],
    [defs],
  );
  const programName = (pk?: string | null) =>
    pk ? members.find((m) => m.public_key === pk)?.display_name || pk.slice(0, 8) : undefined;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = defs.filter((d) => {
      if (q && !d.name.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter.startsWith("program:")) return d.program_pubkey === filter.slice(8);
      return !d.program_pubkey && d.rule === filter;
    });
    // The hub lists the catalogue oldest first, so "newest" is the reverse.
    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "held") list.sort((a, b) => total(b) - total(a));
    else list.reverse();
    return list;
  }, [defs, query, filter, sort]);

  async function run(fn: () => Promise<unknown>) {
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(String(e));
    }
  }

  async function remove(d: BadgeDef) {
    if (!(await confirm({
      title: t("hub.admin.badges.delete_confirm", { name: d.name }),
      body: t("hub.admin.badges.delete_body"),
      confirmLabel: t("hub.admin.badges.delete"),
      danger: true,
    }))) return false;
    await run(() => actions.deleteBadgeDef(d.id));
    return true;
  }

  const open = defs.find((d) => d.id === openId);

  return (
    <div className="badge-catalogue">
      {dialog}
      <div className="badge-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("hub.admin.badges.search")}
          aria-label={t("hub.admin.badges.search")}
        />
        <select aria-label={t("hub.admin.badges.filter")} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">{t("hub.admin.badges.filter.all")}</option>
          <option value="manual">{t("hub.admin.badges.rule.manual")}</option>
          {RULES.map((r) => <option key={r} value={r}>{t(`hub.admin.badges.rule.${r}`)}</option>)}
          {programs.map((p) => (
            <option key={p} value={`program:${p}`}>{t("hub.admin.badges.rule.program", { name: programName(p) })}</option>
          ))}
        </select>
        <select aria-label={t("hub.admin.badges.sort")} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="held">{t("hub.admin.badges.sort.held")}</option>
          <option value="name">{t("hub.admin.badges.sort.name")}</option>
          <option value="new">{t("hub.admin.badges.sort.new")}</option>
        </select>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)}>{t("hub.admin.badges.new")}</button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {shown.length === 0 ? (
        <p className="muted">{t(defs.length === 0 ? "hub.admin.badges.empty" : "hub.admin.badges.empty_filtered")}</p>
      ) : (
        <ul className="badge-list">
          {shown.map((d) => (
            <BadgeRow
              key={d.id}
              def={d}
              programName={programName(d.program_pubkey)}
              onOpen={() => setOpenId(d.id)}
              onToggleHidden={() => void run(() => actions.setBadgeDefHidden(d.id, !d.hidden))}
              onDelete={() => void remove(d)}
            />
          ))}
        </ul>
      )}
      <p className="muted">{t("hub.admin.badges.footnote")}</p>
      {creating && (
        <BadgeCreateDialog
          actions={actions}
          roles={roles}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); void reload(); }}
        />
      )}
      {open && (
        <BadgeDetailDialog
          def={open}
          programName={programName(open.program_pubkey)}
          actions={actions}
          members={members}
          onClose={() => setOpenId(null)}
          onChanged={() => void reload()}
          onDelete={async () => { if (await remove(open)) setOpenId(null); }}
        />
      )}
    </div>
  );
}
