import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HubBadge, HubSelfTagSettings, PendingBadgeOffer } from "../../types";

export interface ServerTagsSectionActions {
  getDiscoveryTags: () => Promise<HubSelfTagSettings>;
  setDiscoveryTags: (tags: string[], nsfw: boolean) => Promise<void>;
  listBadges: () => Promise<HubBadge[]>;
  listPendingBadges: () => Promise<PendingBadgeOffer[]>;
  acceptBadge: (id: string) => Promise<void>;
  declineBadge: (id: string) => Promise<void>;
  removeBadge: (id: string) => Promise<void>;
  grantBadge: (targetHubUrl: string, label: string) => Promise<void>;
}

interface Props {
  actions: ServerTagsSectionActions;
}

export function ServerTagsSection({ actions }: Props) {
  const { t } = useTranslation();
  const [tagsInput, setTagsInput] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | string>("idle");

  const [badges, setBadges] = useState<HubBadge[]>([]);
  const [pendingBadges, setPendingBadges] = useState<PendingBadgeOffer[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(false);

  const [grantTargetUrl, setGrantTargetUrl] = useState("");
  const [grantLabel, setGrantLabel] = useState("");
  const [grantStatus, setGrantStatus] = useState<"idle" | "sending" | "ok" | string>("idle");

  useEffect(() => {
    void loadTags();
    void loadBadgeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTags() {
    try {
      const s = await actions.getDiscoveryTags();
      setTagsInput(s.self_tags.join(", "));
      setNsfw(s.nsfw);
    } catch { /* first load — ignore */ }
  }

  async function loadBadgeData() {
    setLoadingBadges(true);
    try {
      const [b, p] = await Promise.all([actions.listBadges(), actions.listPendingBadges()]);
      setBadges(b);
      setPendingBadges(p);
    } catch { /* ignore */ } finally {
      setLoadingBadges(false);
    }
  }

  async function handleSaveTags() {
    setSaveStatus("saving");
    try {
      const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
      await actions.setDiscoveryTags(tags, nsfw);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      setSaveStatus(String(e));
    }
  }

  async function handleAccept(id: string) {
    try { await actions.acceptBadge(id); await loadBadgeData(); } catch { /* ignore */ }
  }

  async function handleDecline(id: string) {
    try { await actions.declineBadge(id); await loadBadgeData(); } catch { /* ignore */ }
  }

  async function handleRemoveBadge(id: string) {
    try { await actions.removeBadge(id); await loadBadgeData(); } catch { /* ignore */ }
  }

  async function handleGrantBadge() {
    if (!grantTargetUrl.trim() || !grantLabel.trim()) return;
    setGrantStatus("sending");
    try {
      await actions.grantBadge(grantTargetUrl.trim(), grantLabel.trim());
      setGrantStatus("ok");
      setGrantTargetUrl("");
      setGrantLabel("");
      setTimeout(() => setGrantStatus("idle"), 2000);
    } catch (e) {
      setGrantStatus(String(e));
    }
  }

  return (
    <section>
      <h1>{t("hub.admin.tags.title")}</h1>

      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.tags.self.label")}</label>
        <p className="muted">{t("hub.admin.tags.self.hint")}</p>
        <input
          type="text"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder={t("hub.admin.tags.self.placeholder")}
          style={{ width: "100%" }}
        />
        <label className="checkbox-label" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
          {t("hub.admin.tags.nsfw")}
        </label>
        {saveStatus === "saved" && <p className="muted">{t("hub.admin.tags.saved")}</p>}
        {saveStatus !== "idle" && saveStatus !== "saving" && saveStatus !== "saved" && (
          <p className="error-text">{saveStatus}</p>
        )}
        <button onClick={handleSaveTags} disabled={saveStatus === "saving"}>
          {saveStatus === "saving" ? t("hub.admin.tags.saving") : t("hub.admin.tags.save")}
        </button>
      </div>

      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.tags.badges.label")}</label>
        <p className="muted">{t("hub.admin.tags.badges.hint")}</p>
        {loadingBadges && <p className="muted">{t("hub.admin.tags.badges.loading")}</p>}
        {badges.length === 0 && !loadingBadges && (
          <p className="muted">{t("hub.admin.tags.badges.empty")}</p>
        )}
        {badges.map((b) => (
          <div key={b.id} className="settings-row">
            <div>
              <span className="discover-badge-attestation">🏅 {b.label}</span>
              <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-sm)" }}>
                {t("hub.admin.tags.from", { url: b.issuer_url })}
              </span>
            </div>
            <button className="btn-secondary danger" onClick={() => handleRemoveBadge(b.id)}>{t("hub.admin.tags.badges.remove")}</button>
          </div>
        ))}
      </div>

      {pendingBadges.length > 0 && (
        <div className="settings-section">
          <label className="settings-label">{t("hub.admin.tags.offers.label")}</label>
          {pendingBadges.map((p) => (
            <div key={p.id} className="settings-row">
              <div>
                <span>🏅 {p.label}</span>
                <span className="muted" style={{ marginLeft: 8, fontSize: "var(--text-sm)" }}>
                  {t("hub.admin.tags.from", { url: p.issuer_url })}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleAccept(p.id)}>{t("hub.admin.tags.offers.accept")}</button>
                <button className="btn-secondary" onClick={() => handleDecline(p.id)}>{t("hub.admin.tags.offers.decline")}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="settings-section">
        <label className="settings-label">{t("hub.admin.tags.grant.label")}</label>
        <p className="muted">{t("hub.admin.tags.grant.hint")}</p>
        <div className="settings-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <input
            type="text"
            placeholder={t("hub.admin.tags.grant.target_placeholder")}
            value={grantTargetUrl}
            onChange={(e) => setGrantTargetUrl(e.target.value)}
            style={{ width: "100%" }}
          />
          <input
            type="text"
            placeholder={t("hub.admin.tags.grant.label_placeholder")}
            value={grantLabel}
            onChange={(e) => setGrantLabel(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        {grantStatus === "ok" && <p className="muted">{t("hub.admin.tags.grant.sent")}</p>}
        {grantStatus !== "idle" && grantStatus !== "sending" && grantStatus !== "ok" && (
          <p className="error-text">{grantStatus}</p>
        )}
        <button
          onClick={handleGrantBadge}
          disabled={!grantTargetUrl.trim() || !grantLabel.trim() || grantStatus === "sending"}
        >
          {grantStatus === "sending" ? t("hub.admin.tags.grant.sending") : t("hub.admin.tags.grant.submit")}
        </button>
      </div>
    </section>
  );
}
