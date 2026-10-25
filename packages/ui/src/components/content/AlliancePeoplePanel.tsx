import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AllianceMember, AlliancePerson } from "../../types";
import {
  appendPeoplePage,
  classifyPeopleError,
  EMPTY_PEOPLE,
  PEOPLE_PAGE_SIZE,
  type PeopleErrorKind,
  type PeopleState,
} from "../../utils/alliancePeople";
import { Avatar } from "../Avatar";
import { formatPubkey } from "@wavvon/core";

export interface AlliancePeopleActions {
  getAllianceMembers: (allianceId: string) => Promise<AllianceMember[]>;
  listAlliancePeople: (
    allianceId: string,
    hubPublicKey: string,
    opts: { q: string; cursor: string | null; limit: number },
  ) => Promise<AlliancePerson[]>;
}

interface Props {
  allianceId: string;
  ownHubId: string | null;
  actions: AlliancePeopleActions;
  onMessage: (person: AlliancePerson, hubUrl: string) => void;
}

function PeopleList({ allianceId, hub, actions, onMessage }: {
  allianceId: string;
  hub: AllianceMember;
  actions: AlliancePeopleActions;
  onMessage: Props["onMessage"];
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [state, setState] = useState<PeopleState>(EMPTY_PEOPLE);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PeopleErrorKind | null>(null);
  // Guards against a slow page for a previous hub/search landing on the new one.
  const generation = useRef(0);

  async function fetchPage(q: string, cursor: string | null, base: PeopleState) {
    const gen = generation.current;
    setLoading(true);
    setError(null);
    try {
      const page = await actions.listAlliancePeople(allianceId, hub.hub_public_key, {
        q, cursor, limit: PEOPLE_PAGE_SIZE,
      });
      if (gen !== generation.current) return;
      setState(appendPeoplePage(base, page));
      setLoaded(true);
    } catch (e) {
      if (gen !== generation.current) return;
      setError(classifyPeopleError(e));
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }

  useEffect(() => {
    generation.current += 1;
    setState(EMPTY_PEOPLE);
    setLoaded(false);
    setQuery("");
    setApplied("");
    void fetchPage("", null, EMPTY_PEOPLE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allianceId, hub.hub_public_key]);

  function search() {
    const q = query.trim();
    generation.current += 1;
    setApplied(q);
    setState(EMPTY_PEOPLE);
    setLoaded(false);
    void fetchPage(q, null, EMPTY_PEOPLE);
  }

  return (
    <div style={{ paddingLeft: "var(--space-3)" }}>
      <div className="settings-row" style={{ gap: "var(--space-2)" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") search(); }}
          placeholder={t("alliance.people.search_placeholder")}
          aria-label={t("alliance.people.search_placeholder")}
        />
        <button className="btn-small btn-secondary" onClick={search} disabled={loading}>
          {t("alliance.people.search")}
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">{t(`alliance.people.error.${error}`)}</p>
      )}
      {loaded && state.people.length === 0 && !error && (
        <p className="muted">{applied ? t("alliance.people.no_match") : t("alliance.people.empty")}</p>
      )}
      {state.people.map((p) => {
        const label = p.display_name || formatPubkey(p.public_key);
        return (
          <div key={p.public_key} className="settings-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <Avatar src={p.avatar} name={label} size={28} />
              {label}
            </span>
            <button className="btn-small" onClick={() => onMessage(p, hub.hub_url)}>
              {t("alliance.people.message")}
            </button>
          </div>
        );
      })}
      {loading && <p className="muted">{t("alliances.loading")}</p>}
      {state.cursor && !loading && (
        <button className="btn-small btn-secondary" onClick={() => void fetchPage(applied, state.cursor, state)}>
          {t("alliance.people.load_more")}
        </button>
      )}
    </div>
  );
}

export function AlliancePeoplePanel({ allianceId, ownHubId, actions, onMessage }: Props) {
  const { t } = useTranslation();
  const [hubs, setHubs] = useState<AllianceMember[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHubs(null);
    setFailed(false);
    setOpen(null);
    actions.getAllianceMembers(allianceId)
      .then((m) => { if (!cancelled) setHubs(m.filter((h) => h.hub_public_key !== ownHubId)); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allianceId]);

  return (
    <div className="messages alliance-people">
      <p className="muted" style={{ padding: "var(--space-2) var(--space-3)" }}>{t("alliance.people.hint")}</p>
      {failed && <p className="error-text" style={{ padding: "0 var(--space-3)" }}>{t("alliance.people.error.other")}</p>}
      {hubs === null && !failed && <p className="muted" style={{ padding: "0 var(--space-3)" }}>{t("alliances.loading")}</p>}
      {hubs?.length === 0 && <p className="muted" style={{ padding: "0 var(--space-3)" }}>{t("alliance.people.no_hubs")}</p>}
      {hubs?.map((h) => (
        <div key={h.hub_public_key} className="settings-section" style={{ padding: "0 var(--space-3)" }}>
          <button
            className="btn-ghost"
            style={{ fontWeight: 600 }}
            aria-expanded={open === h.hub_public_key}
            onClick={() => setOpen((cur) => (cur === h.hub_public_key ? null : h.hub_public_key))}
          >
            {open === h.hub_public_key ? "▾" : "▸"} {h.hub_name}
          </button>
          {open === h.hub_public_key && (
            <PeopleList allianceId={allianceId} hub={h} actions={actions} onMessage={onMessage} />
          )}
        </div>
      ))}
    </div>
  );
}
