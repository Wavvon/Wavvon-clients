import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadIdentity, masterSeedHex, masterPublicKeyHex, buildHomeHubList } from "@identity/index";
import { getHomeHubDesignation, putHomeHubDesignation } from "@platform";
import { AccountLabelSuffix, PerAccountHint } from "@wavvon/ui";

// Personal-axis home-hub list (a master-signed HomeHubList). This is the
// ordered set of hubs that other users and hubs consult to deliver DMs to you —
// distinct from the local "saved hubs" list. Slot 0 is the preferred target.
interface Props {
  activeHubUrl?: string;
}

export function HomeHubsSection({ activeHubUrl }: Props) {
  const { t } = useTranslation();
  const [hubs, setHubs] = useState<string[]>([]);
  const [sequence, setSequence] = useState(0);
  const [master, setMaster] = useState<{ seedHex: string; pubkey: string } | null>(null);
  const [accountLabel, setAccountLabel] = useState<string | null>(null);
  const [isPairedDevice, setIsPairedDevice] = useState(false);
  const [newHub, setNewHub] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rec = await loadIdentity();
      if (!rec || cancelled) return;
      setAccountLabel(rec.account_label ?? null);
      // A paired device's seed is a *subkey* — deriving a master from it
      // yields a wrong identity. It knows the real master pubkey from its
      // cert (read-only view); only an entropy-holding device may publish.
      const paired = !!rec.subkey_cert;
      setIsPairedDevice(paired);
      const pubkey = paired && rec.master_pubkey ? rec.master_pubkey : masterPublicKeyHex(rec.seed_hex);
      if (!paired) {
        setMaster({ seedHex: masterSeedHex(rec.seed_hex), pubkey });
      }
      try {
        const cur = await getHomeHubDesignation(pubkey);
        if (cancelled) return;
        if (cur) {
          setHubs(cur.hubs);
          setSequence(cur.sequence);
        }
        setStatus("idle");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function addHub() {
    const url = newHub.trim().replace(/\/+$/, "");
    if (!url || hubs.includes(url)) return;
    setHubs([...hubs, url]);
    setNewHub("");
  }

  function removeHub(i: number) {
    setHubs(hubs.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= hubs.length) return;
    const next = [...hubs];
    [next[i], next[j]] = [next[j], next[i]];
    setHubs(next);
  }

  async function publish() {
    if (!master) return;
    setStatus("saving");
    setError(null);
    try {
      const nextSeq = sequence + 1;
      const issuedAt = Math.floor(Date.now() / 1000);
      const list = buildHomeHubList(master.seedHex, master.pubkey, hubs, issuedAt, nextSeq);
      await putHomeHubDesignation(list);
      setSequence(nextSeq);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("idle");
    }
  }

  return (
    <div className="settings-section" style={{ marginTop: 20 }}>
      <label className="settings-label">
        {t("settings.account.home_hubs.label")}
        <AccountLabelSuffix label={accountLabel} />
      </label>
      <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
        {t("settings.account.home_hubs.hint")}
      </p>
      <PerAccountHint label={accountLabel} hintKey="settings.account.home_hubs.per_account_hint" />
      {isPairedDevice && (
        <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
          {t("settings.account.home_hubs.paired_read_only", {
            label: accountLabel ?? t("settings.account.this_account_label"),
          })}
        </p>
      )}

      {status === "loading" ? (
        <p className="muted">{t("modal.loading")}</p>
      ) : hubs.length === 0 ? (
        <p className="muted">{t("settings.account.home_hubs.empty")}</p>
      ) : (
        hubs.map((h, i) => (
          <div
            key={h}
            className="settings-row"
            style={{ alignItems: "center", justifyContent: "space-between", gap: 6 }}
          >
            <span>
              {i === 0 && <span className="muted" style={{ fontSize: "var(--text-xs)" }}>★ </span>}
              {h}
            </span>
            {!isPairedDevice && (
              <span style={{ display: "flex", gap: 4 }}>
                <button className="btn-small btn-secondary" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t("settings.account.home_hubs.move_up_aria")}>↑</button>
                <button className="btn-small btn-secondary" disabled={i === hubs.length - 1} onClick={() => move(i, 1)} aria-label={t("settings.account.home_hubs.move_down_aria")}>↓</button>
                <button className="btn-small btn-secondary danger" onClick={() => removeHub(i)}>{t("settings.account.home_hubs.remove_button")}</button>
              </span>
            )}
          </div>
        ))
      )}

      {!isPairedDevice && (
        <>
          <div className="settings-row" style={{ gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <input
              type="text"
              value={newHub}
              onChange={(e) => setNewHub(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addHub(); }}
              placeholder={activeHubUrl ?? "https://hub.example"}
              aria-label={t("settings.account.home_hubs.url_aria")}
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" onClick={addHub} disabled={!newHub.trim()}>{t("settings.account.home_hubs.add_button")}</button>
            {activeHubUrl && !hubs.includes(activeHubUrl.replace(/\/+$/, "")) && (
              <button className="btn-small btn-secondary" onClick={() => setHubs([...hubs, activeHubUrl.replace(/\/+$/, "")])}>
                {t("settings.account.home_hubs.add_this_hub_button")}
              </button>
            )}
          </div>

          <div style={{ marginTop: "var(--space-2)", display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn-primary" onClick={publish} disabled={status === "saving" || !master}>
              {status === "saving" ? t("settings.account.home_hubs.publishing") : t("settings.account.home_hubs.publish_button")}
            </button>
            {status === "saved" && <span className="muted" style={{ fontSize: "var(--text-sm)" }}>{t("settings.account.home_hubs.published")}</span>}
          </div>
        </>
      )}
      {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
