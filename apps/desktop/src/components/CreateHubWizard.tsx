import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { Hub, FarmPublicInfo, FarmHubQuota, CreatedFarmHub } from "../types";
import { FocusTrap } from "@wavvon/ui";

type Visibility = "public" | "private";

function friendlyJoinError(raw: string): string {
  if (raw.includes("No active session") || raw.includes("timed out") || raw.includes("Connection refused") || raw.includes("error sending request")) return "Could not reach that hub. Check the URL and try again.";
  if (raw.includes("401") || raw.includes("403") || raw.includes("Unauthorized") || raw.includes("Forbidden")) return "This hub requires an invitation or does not allow public joining.";
  if (raw.includes("already") || raw.includes("duplicate")) return "You are already connected to this hub.";
  if (raw.includes("404") || raw.includes("Not Found")) return "No hub found at that URL.";
  return "Could not join hub: " + raw;
}

interface KnownFarm {
  url: string;
  name: string;
}

interface FarmCard {
  url: string;
  name: string;
  description: string;
  ping: number | null;
  hubCount: number;
  quota: FarmHubQuota | null;
  reachable: boolean;
}

interface Props {
  knownFarms: KnownFarm[];
  onHubCreated: (hub: Hub) => void;
  onClose: () => void;
}

function FarmCardView({
  farm,
  selected,
  onSelect,
}: {
  farm: FarmCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const disabled =
    !farm.reachable ||
    (farm.quota !== null && !farm.quota.can_create);

  let statusNote: string | null = null;
  if (!farm.reachable) statusNote = t("hub_wizard.farm.unreachable");
  else if (farm.quota?.reason === "quota_exceeded") statusNote = t("hub_wizard.farm.quota_exceeded");

  return (
    <button
      className={`farm-card ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
      onClick={disabled ? undefined : onSelect}
      disabled={disabled}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "12px 16px",
        marginBottom: 8,
        background: selected
          ? "var(--accent)"
          : "var(--bg-elevated)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--r-md)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{ fontWeight: 600 }}>{farm.name}</div>
      {farm.description && (
        <div className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
          {farm.description}
        </div>
      )}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 6,
          fontSize: "var(--text-sm)",
        }}
      >
        <span className="muted">
          {farm.ping !== null ? `${farm.ping} ms` : "—"}
        </span>
        <span className="muted">{t("hub_wizard.farm.hubs", { count: farm.hubCount })}</span>
        {statusNote && (
          <span style={{ color: "var(--danger)" }}>{statusNote}</span>
        )}
      </div>
    </button>
  );
}

export function CreateHubWizard({ knownFarms, onHubCreated, onClose }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [farms, setFarms] = useState<FarmCard[]>([]);
  const [probing, setProbing] = useState(true);
  const [selectedFarm, setSelectedFarm] = useState<FarmCard | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [probeCustomStatus, setProbeCustomStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [probeCustomError, setProbeCustomError] = useState("");
  const [customFarm, setCustomFarm] = useState<FarmCard | null>(null);

  const [hubName, setHubName] = useState("");
  const [hubDescription, setHubDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdHub, setCreatedHub] = useState<{ name: string; url: string } | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    async function probeAll() {
      setProbing(true);
      const cards: FarmCard[] = await Promise.all(
        knownFarms.map(async (f) => {
          try {
            const [info, quota] = await Promise.allSettled([
              invoke<FarmPublicInfo>("probe_farm", { farmUrl: f.url }),
              invoke<FarmHubQuota>("get_farm_hub_quota", { farmUrl: f.url }),
            ]);
            const publicInfo =
              info.status === "fulfilled" ? info.value : null;
            return {
              url: f.url,
              name: publicInfo?.name ?? f.name,
              description: publicInfo?.description ?? "",
              ping: publicInfo ? await measurePing(f.url) : null,
              hubCount: publicInfo?.hub_count ?? 0,
              quota: quota.status === "fulfilled" ? quota.value : null,
              reachable: info.status === "fulfilled",
            };
          } catch {
            return {
              url: f.url,
              name: f.name,
              description: "",
              ping: null,
              hubCount: 0,
              quota: null,
              reachable: false,
            };
          }
        }),
      );

      const sorted = cards.sort((a, b) => {
        if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
        if (a.ping === null && b.ping === null) return 0;
        if (a.ping === null) return 1;
        if (b.ping === null) return -1;
        return a.ping - b.ping;
      });

      setFarms(sorted);
      setProbing(false);
    }

    void probeAll();
  }, [knownFarms]);

  async function measurePing(farmUrl: string): Promise<number | null> {
    try {
      const start = Date.now();
      await invoke("probe_farm", { farmUrl });
      return Date.now() - start;
    } catch {
      return null;
    }
  }

  async function handleProbeCustom() {
    if (!customUrl.trim()) return;
    setProbeCustomStatus("loading");
    setProbeCustomError("");
    setCustomFarm(null);
    try {
      const url = customUrl.trim().replace(/\/$/, "");
      const [info, ping, quota] = await Promise.allSettled([
        invoke<FarmPublicInfo>("probe_farm", { farmUrl: url }),
        measurePing(url),
        invoke<FarmHubQuota>("get_farm_hub_quota", { farmUrl: url }),
      ]);
      if (info.status !== "fulfilled") {
        throw new Error("Could not reach farm at that URL");
      }
      const card: FarmCard = {
        url,
        name: info.value.name,
        description: info.value.description,
        ping: ping.status === "fulfilled" ? ping.value : null,
        hubCount: info.value.hub_count,
        quota: quota.status === "fulfilled" ? quota.value : null,
        reachable: true,
      };
      setCustomFarm(card);
      setProbeCustomStatus("ok");
    } catch (e) {
      setProbeCustomError(String(e));
      setProbeCustomStatus("error");
    }
  }

  function validateName(name: string): string | null {
    const trimmed = name.trim();
    if (trimmed.length < 1) return t("hub_wizard.validate.name_required");
    if (trimmed.length > 64) return t("hub_wizard.validate.name_too_long");
    if (!/^[a-zA-Z0-9 -]+$/.test(trimmed))
      return t("hub_wizard.validate.name_chars");
    return null;
  }

  async function handleCreate() {
    if (!selectedFarm) return;
    const err = validateName(hubName);
    if (err) { setNameError(err); return; }
    setNameError(null);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await invoke<CreatedFarmHub>("create_hub_on_farm", {
        farmUrl: selectedFarm.url,
        name: hubName.trim(),
        description: hubDescription.trim() || null,
        visibility,
      });
      const newHub = await invoke<Hub>("add_hub_by_url", { hubUrl: result.url });
      setCreatedHub({ name: result.name, url: result.url });
      setStep(3);
      onHubCreated(newHub);
    } catch (e) {
      setSubmitError(friendlyJoinError(String(e)));
    } finally {
      setSubmitting(false);
    }
  }

  const allFarmCards = [
    ...farms,
    ...(customFarm && !farms.some((f) => f.url === customFarm.url)
      ? [customFarm]
      : []),
  ];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <FocusTrap>
      <div
        className="modal"
        style={{ maxWidth: 560, width: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 1 && (
          <>
            <h3>{t("hub_wizard.step1.title")}</h3>
            <p className="muted">
              {t("hub_wizard.step1.hint")}
            </p>

            {probing && (
              <p className="muted" style={{ marginBottom: 12 }}>
                {t("hub_wizard.step1.checking")}
              </p>
            )}

            {allFarmCards.map((farm) => (
              <FarmCardView
                key={farm.url}
                farm={farm}
                selected={selectedFarm?.url === farm.url}
                onSelect={() => setSelectedFarm(farm)}
              />
            ))}

            {allFarmCards.length === 0 && !probing && (
              <p className="muted">{t("hub_wizard.step1.no_farms")}</p>
            )}

            <div className="settings-section" style={{ marginTop: 16 }}>
              <label className="settings-label">{t("hub_wizard.step1.custom_url")}</label>
              <div className="settings-row">
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => {
                    setCustomUrl(e.target.value);
                    setProbeCustomStatus("idle");
                  }}
                  placeholder="https://farm.example.com"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleProbeCustom();
                  }}
                />
                <button
                  className="btn-secondary"
                  onClick={handleProbeCustom}
                  disabled={probeCustomStatus === "loading"}
                >
                  {probeCustomStatus === "loading" ? t("hub_wizard.step1.checking_btn") : t("hub_wizard.step1.check")}
                </button>
              </div>
              {probeCustomStatus === "error" && (
                <p className="error-text">{probeCustomError}</p>
              )}
              {customFarm && probeCustomStatus === "ok" && (
                <FarmCardView
                  farm={customFarm}
                  selected={selectedFarm?.url === customFarm.url}
                  onSelect={() => setSelectedFarm(customFarm)}
                />
              )}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>
                {t("modal.cancel")}
              </button>
              <button
                disabled={!selectedFarm}
                onClick={() => { if (selectedFarm) setStep(2); }}
              >
                {t("modal.next")}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h3>{t("hub_wizard.step2.title", { farm: selectedFarm?.name })}</h3>

            <div className="settings-section">
              <label className="settings-label">{t("hub_wizard.step2.hub_name")}</label>
              <input
                type="text"
                value={hubName}
                onChange={(e) => {
                  setHubName(e.target.value);
                  setNameError(null);
                }}
                placeholder={t("hub_wizard.step2.hub_name_placeholder")}
                maxLength={64}
                autoFocus
              />
              {nameError && (
                <p className="error-text" style={{ marginTop: 4 }}>
                  {nameError}
                </p>
              )}
            </div>

            <div className="settings-section">
              <label className="settings-label">{t("hub_wizard.step2.description")}</label>
              <textarea
                rows={3}
                value={hubDescription}
                onChange={(e) => setHubDescription(e.target.value)}
                placeholder={t("hub_wizard.step2.description_placeholder")}
                maxLength={280}
              />
            </div>

            <div className="settings-section">
              <label className="settings-label">{t("hub_wizard.step2.visibility")}</label>
              <label className="checkbox-label" style={{ display: "block", marginBottom: 4 }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />
                {" "}{t("hub_wizard.step2.visibility.public")}
              </label>
              <label className="checkbox-label" style={{ display: "block" }}>
                <input
                  type="radio"
                  name="visibility"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                {" "}{t("hub_wizard.step2.visibility.private")}
              </label>
            </div>

            {submitError && (
              <p className="error-text" style={{ marginBottom: 8 }}>
                {submitError}
              </p>
            )}

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setStep(1); setSubmitError(null); }}>
                {t("modal.back")}
              </button>
              <button onClick={handleCreate} disabled={submitting}>
                {submitting ? t("hub_wizard.step2.creating") : t("hub_wizard.step2.create")}
              </button>
            </div>
          </>
        )}

        {step === 3 && createdHub && (
          <>
            <h3>{t("hub_wizard.step3.title")}</h3>
            <p style={{ marginBottom: 8 }}>
              <strong>{createdHub.name}</strong> is live and you've been
              connected.
            </p>
            <p className="muted" style={{ marginBottom: 16, fontSize: "var(--text-sm)" }}>
              {createdHub.url}
            </p>
            <div className="modal-actions">
              <button onClick={onClose}>{t("hub_wizard.step3.open")}</button>
            </div>
          </>
        )}
      </div>
      </FocusTrap>
    </div>
  );
}
