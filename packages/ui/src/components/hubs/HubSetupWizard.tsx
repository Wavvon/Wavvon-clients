import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FocusTrap } from "../FocusTrap";
import { HUB_TEMPLATES, orderPlanSteps, firstTextChannelKey, type HubTemplateChannelSpec, type HubTemplateId } from "./hubTemplates";

export interface HubSetupWizardCreateChannelFields {
  name: string;
  isCategory: boolean;
  /** Omitted for categories — the server ignores channel_type on those. */
  channelType?: "text" | "forum" | "voice";
  parentId: string | null;
}

export interface HubSetupWizardActions {
  onCreateChannel: (fields: HubSetupWizardCreateChannelFields) => Promise<{ id: string }>;
}

interface Props {
  actions: HubSetupWizardActions;
  /** The hub has `channels.voice`: only a `voice` channel can be joined. */
  voiceChannels: boolean;
  /** "Start blank" or the overlay/Escape dismiss — caller persists the
   *  per-hub "don't nag again" flag and closes the modal. */
  onDismiss: () => void;
  /** A template finished creating its channels — caller persists the flag,
   *  closes the modal, and selects the given channel (null if the template
   *  had no text channel, which shouldn't happen but isn't fatal). */
  onComplete: (firstChannelId: string | null) => void;
}

interface RunState {
  templateId: HubTemplateId;
  steps: HubTemplateChannelSpec[];
  index: number;
  createdIds: Record<string, string>;
}

export function channelTypeFor(
  kind: HubTemplateChannelSpec["kind"],
  voiceChannels: boolean,
): HubSetupWizardCreateChannelFields["channelType"] {
  if (kind === "category") return undefined;
  if (kind === "forum") return "forum";
  // A hub older than `channels.voice` has no voice type: any text channel
  // hosts a call there.
  if (kind === "voice" && voiceChannels) return "voice";
  return "text";
}

export function HubSetupWizard({ actions, voiceChannels, onDismiss, onComplete }: Props) {
  const { t } = useTranslation();
  const [run, setRun] = useState<RunState | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  async function runFrom(templateId: HubTemplateId, steps: HubTemplateChannelSpec[], startIndex: number, createdIds: Record<string, string>) {
    setCreating(true);
    setError(null);
    const ids = { ...createdIds };
    for (let i = startIndex; i < steps.length; i++) {
      const step = steps[i];
      setRun({ templateId, steps, index: i, createdIds: ids });
      try {
        const created = await actions.onCreateChannel({
          name: t(`hub_setup.channel_name.${step.key}`),
          isCategory: step.kind === "category",
          channelType: channelTypeFor(step.kind, voiceChannels),
          parentId: step.parentKey ? ids[step.parentKey] ?? null : null,
        });
        ids[step.key] = created.id;
      } catch (e) {
        setRun({ templateId, steps, index: i, createdIds: ids });
        setError(e instanceof Error ? e.message : String(e));
        setCreating(false);
        return;
      }
    }
    setCreating(false);
    const template = HUB_TEMPLATES.find((tp) => tp.id === templateId);
    const textKey = template ? firstTextChannelKey(template) : undefined;
    onComplete(textKey ? ids[textKey] ?? null : null);
  }

  function pickTemplate(id: HubTemplateId) {
    const template = HUB_TEMPLATES.find((tp) => tp.id === id);
    if (!template) return;
    const steps = orderPlanSteps(template.channels);
    void runFrom(id, steps, 0, {});
  }

  function retry() {
    if (!run) return;
    void runFrom(run.templateId, run.steps, run.index, run.createdIds);
  }

  return (
    <div className="modal-overlay" onClick={run ? undefined : onDismiss}>
      <FocusTrap>
        <div
          className="modal"
          style={{ maxWidth: 560, width: "100%" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hub-setup-wizard-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="hub-setup-wizard-title">{t("hub_setup.title")}</h3>

          {!run && (
            <>
              <p className="muted">{t("hub_setup.subtitle")}</p>
              <div className="theme-cards">
                {HUB_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="theme-card"
                    onClick={() => pickTemplate(template.id)}
                  >
                    <div className="theme-card-name">{t(`hub_setup.template.${template.id}.title`)}</div>
                    <p className="theme-card-tagline">{t(`hub_setup.template.${template.id}.description`)}</p>
                  </button>
                ))}
                <button type="button" className="theme-card" onClick={onDismiss}>
                  <div className="theme-card-name">{t("hub_setup.blank.title")}</div>
                  <p className="theme-card-tagline">{t("hub_setup.blank.description")}</p>
                </button>
              </div>
            </>
          )}

          {run && (
            <div className="lobby-progress-card">
              <p className="lobby-progress-label">
                {t("hub_setup.creating_progress", {
                  current: Math.min(run.index + 1, run.steps.length),
                  total: run.steps.length,
                })}
              </p>
              <div className="lobby-progress-bar">
                <div className="lobby-progress-fill" style={{ width: `${(run.index / run.steps.length) * 100}%` }} />
              </div>
              {error && (
                <>
                  <p className="error-text">{error}</p>
                  <div className="modal-actions">
                    <button className="btn-secondary" onClick={onDismiss}>{t("modal.cancel")}</button>
                    <button onClick={retry} disabled={creating}>{t("modal.retry")}</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </FocusTrap>
    </div>
  );
}
