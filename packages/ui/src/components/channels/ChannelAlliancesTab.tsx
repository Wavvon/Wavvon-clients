import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Alliance, SharedChannel } from "../../types";

export interface ChannelAlliancesTabActions {
  listAlliances: () => Promise<Alliance[]>;
  listAllianceSharedChannels: (allianceId: string) => Promise<SharedChannel[]>;
  shareChannelWithAlliance: (
    allianceId: string,
    channelId: string,
    includeDescendants?: boolean,
  ) => Promise<void>;
  unshareChannelFromAlliance: (allianceId: string, channelId: string) => Promise<void>;
}

interface Props {
  channelId: string;
  isCategory: boolean;
  actions: ChannelAlliancesTabActions;
}

interface Row {
  alliance: Alliance;
  shared: boolean;
  /** A category can be shared alone or with everything beneath it. */
  includeDescendants: boolean;
  busy: boolean;
}

/** Which alliances this one channel is shared into, edited from the channel
 *  itself rather than from the hub admin panel's alliance list.
 *
 *  Both directions of the same fact, and which one is convenient depends on
 *  the question being asked: "what does this alliance carry" is the panel's
 *  list, "who can see this channel" is this tab. The hub stores one row per
 *  (alliance, channel) either way.
 *
 *  Only an admin sees it, because sharing is an admin action on the hub — a
 *  toggle that answers 403 would be a worse tab than no tab. */
export function ChannelAlliancesTab({ channelId, isCategory, actions }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    void (async () => {
      try {
        const alliances = await actions.listAlliances();
        // One read per alliance: the hub answers "what does this alliance
        // share", and there is no route asking the question the other way
        // round. A hub is in a handful of alliances, so the handful is fine.
        const loaded = await Promise.all(
          alliances.map(async (alliance) => {
            const shared = await actions.listAllianceSharedChannels(alliance.id).catch(() => []);
            const entry = shared.find((s) => s.channel_id === channelId);
            return {
              alliance,
              shared: Boolean(entry),
              includeDescendants: false,
              busy: false,
            } satisfies Row;
          }),
        );
        if (!cancelled) setRows(loaded);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev?.map((r) => (r.alliance.id === id ? { ...r, ...patch } : r)) ?? prev);

  async function toggle(row: Row, next: boolean) {
    update(row.alliance.id, { busy: true });
    setError(null);
    try {
      if (next) {
        await actions.shareChannelWithAlliance(
          row.alliance.id,
          channelId,
          isCategory ? row.includeDescendants : undefined,
        );
      } else {
        await actions.unshareChannelFromAlliance(row.alliance.id, channelId);
      }
      update(row.alliance.id, { shared: next, busy: false });
    } catch (e) {
      // Left unchanged rather than optimistically flipped: a share that did
      // not happen must not look like one that did.
      update(row.alliance.id, { busy: false });
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (error && !rows) return <p className="error-text">{error}</p>;
  if (!rows) return <p className="muted">{t("common.loading")}</p>;
  if (rows.length === 0) return <p className="muted">{t("channel.alliances.none")}</p>;

  return (
    <div className="settings-section">
      <p className="muted" style={{ marginBottom: "var(--space-3)" }}>
        {t("channel.alliances.hint")}
      </p>

      {error && <p className="error-text">{error}</p>}

      {rows.map((row) => (
        <div key={row.alliance.id} style={{ marginBottom: "var(--space-3)" }}>
          <label className="checkbox-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={row.shared}
              disabled={row.busy}
              onChange={(e) => void toggle(row, e.target.checked)}
            />
            <strong>{row.alliance.name}</strong>
          </label>

          {isCategory && !row.shared && (
            <label
              className="checkbox-label"
              style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 24 }}
            >
              <input
                type="checkbox"
                checked={row.includeDescendants}
                disabled={row.busy}
                onChange={(e) => update(row.alliance.id, { includeDescendants: e.target.checked })}
              />
              {t("channel.alliances.include_descendants")}
            </label>
          )}
        </div>
      ))}
    </div>
  );
}
