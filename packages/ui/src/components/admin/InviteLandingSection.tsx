import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImagePicker } from "../ImagePicker";
import { landingBackdrop } from "../layout/OnboardingFrame";

export interface InviteLandingActions {
  /** The current look; `imageUrl` is absolute, so the preview can load it. */
  load: () => Promise<{ imageUrl: string | null; colors: [string, string] | null }>;
  /** A `data:` URL, or "" to remove the image. */
  saveImage: (dataUrl: string) => Promise<void>;
  /** Two `#rrggbb` colours, or null to remove them. */
  saveColors: (colors: [string, string] | null) => Promise<void>;
}

const DEFAULT_COLORS: [string, string] = ["#2f6b2a", "#e8b33c"];
const COLOR_SAVE_DELAY = 600;

/**
 * The hub's identity edited on a preview of its invite landing: the half of
 * the first screen a stranger sees when they open an invite. Name and
 * description are typed on the preview and save with the rest of the page;
 * the background saves on its own, since it is an upload.
 */
export function InviteLandingSection({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  memberCount,
  actions,
}: {
  name: string;
  description: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  memberCount: number;
  actions: InviteLandingActions;
}) {
  const { t } = useTranslation();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [colors, setColors] = useState<[string, string] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const colorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    actions.load().then(
      (l) => {
        if (!live) return;
        setImageUrl(l.imageUrl);
        setColors(l.colors);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [actions]);

  useEffect(() => () => {
    if (colorTimer.current) clearTimeout(colorTimer.current);
  }, []);

  async function run(save: () => Promise<void>) {
    setError(null);
    try {
      await save();
    } catch (e) {
      setError(t("hub.admin.landing.save_failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  function pickImage(dataUrl: string) {
    setImageUrl(dataUrl);
    void run(() => actions.saveImage(dataUrl));
  }

  function clearImage() {
    setImageUrl(null);
    void run(() => actions.saveImage(""));
  }

  // A colour input reports every step of a drag; save once it settles.
  function changeColor(index: 0 | 1, value: string) {
    const next: [string, string] = [...(colors ?? DEFAULT_COLORS)];
    next[index] = value;
    setColors(next);
    if (colorTimer.current) clearTimeout(colorTimer.current);
    colorTimer.current = setTimeout(() => void run(() => actions.saveColors(next)), COLOR_SAVE_DELAY);
  }

  function clearColors() {
    if (colorTimer.current) clearTimeout(colorTimer.current);
    setColors(null);
    void run(() => actions.saveColors(null));
  }

  const shown = colors ?? DEFAULT_COLORS;

  return (
    <div className="settings-section">
      <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 0 }}>{t("hub.admin.landing.hint")}</p>
      <div className="invite-landing-preview" role="group" aria-label={t("hub.admin.landing.preview_aria")}>
        <div className="onboarding-side hub invite-landing-side" style={landingBackdrop(imageUrl, colors)}>
          <button
            type="button"
            className="invite-landing-edit-bg"
            onClick={() => controlsRef.current?.querySelector<HTMLElement>("button, input")?.focus()}
          >
            {t("hub.admin.landing.edit_background")}
          </button>
          <div className="onboarding-side-scrim">
            <p className="onboarding-mark">{t("onboarding.frame.invited")}</p>
            <input
              type="text"
              className="profile-inline-input invite-landing-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              aria-label={t("hub.admin.overview.name")}
              placeholder={t("hub.admin.overview.state.unnamed")}
            />
            <textarea
              className="profile-inline-input invite-landing-description"
              rows={3}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              aria-label={t("hub.admin.overview.description")}
              placeholder={t("hub.admin.overview.description")}
            />
            <p className="onboarding-side-counts">{t("onboarding.frame.members", { count: memberCount })}</p>
          </div>
        </div>
        <div className="invite-landing-next" aria-hidden="true">
          <span className="muted">{t("onboarding.frame.step", { step: 1, total: 3 })}</span>
          <span className="invite-landing-bar" />
          <span className="invite-landing-bar short" />
        </div>
      </div>

      <div ref={controlsRef} className="invite-landing-controls">
        <div>
          <div className="settings-label">{t("hub.admin.landing.background")}</div>
          <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>{t("hub.admin.landing.background_hint")}</p>
        </div>
        <div className="settings-row" style={{ gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
          <ImagePicker
            onPick={pickImage}
            onClear={clearImage}
            hasValue={!!imageUrl}
            buttonLabel={t("hub.admin.landing.image_pick")}
            width={1280}
            height={720}
            quality={0.82}
          />
          <input
            type="color"
            value={shown[0]}
            onChange={(e) => changeColor(0, e.target.value)}
            aria-label={t("hub.admin.landing.color_first")}
          />
          <input
            type="color"
            value={shown[1]}
            onChange={(e) => changeColor(1, e.target.value)}
            aria-label={t("hub.admin.landing.color_second")}
          />
          <button type="button" className="btn-small btn-secondary" onClick={clearColors} disabled={!colors}>
            {t("hub.admin.landing.colors_clear")}
          </button>
        </div>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
