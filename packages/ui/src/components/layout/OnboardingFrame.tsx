import React from "react";
import { useTranslation } from "react-i18next";

/** The inviting hub as its invite preview shows it to someone not yet in. */
export interface InvitingHub {
  name: string;
  description?: string | null;
  memberCount?: number | null;
  onlineCount?: number | null;
  /** Absolute URL of the hub's landing image. */
  imageUrl?: string | null;
  /** Two `#rrggbb` colours, used when there is no image. */
  colors?: [string, string] | null;
}

/**
 * First run, in two halves: the hub you were invited to (or, with no invite,
 * what Wavvon is) on the left, the step on the right with "Step n of N".
 */
export function OnboardingFrame({ hub, step, total, children }: {
  hub?: InvitingHub | null;
  step?: number;
  total?: number;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const backdrop: React.CSSProperties | undefined = hub?.imageUrl
    ? { backgroundImage: `url("${hub.imageUrl}")` }
    : hub?.colors
      ? { backgroundImage: `linear-gradient(135deg, ${hub.colors[0]}, ${hub.colors[1]})` }
      : undefined;
  return (
    <div className="onboarding onboarding--split">
      <aside className={`onboarding-side${hub ? " hub" : ""}`} style={backdrop}>
        <div className="onboarding-side-scrim">
          {hub ? (
            <>
              <p className="onboarding-mark">{t("onboarding.frame.invited")}</p>
              <h2 className="onboarding-side-title">{hub.name}</h2>
              {hub.description && <p className="onboarding-side-text">{hub.description}</p>}
              {hub.memberCount != null && (
                <p className="onboarding-side-counts">
                  {t("onboarding.frame.members", { count: hub.memberCount })}
                  {hub.onlineCount != null && <> · {t("onboarding.frame.online", { count: hub.onlineCount })}</>}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="onboarding-mark">{t("app.title")}</p>
              <dl className="onboarding-explainer">
                <dt>{t("onboarding.frame.identity_title")}</dt>
                <dd>{t("onboarding.frame.identity_text")}</dd>
                <dt>{t("onboarding.frame.hubs_title")}</dt>
                <dd>{t("onboarding.frame.hubs_text")}</dd>
                <dt>{t("onboarding.frame.alliances_title")}</dt>
                <dd>{t("onboarding.frame.alliances_text")}</dd>
              </dl>
            </>
          )}
        </div>
      </aside>
      <main className="onboarding-card">
        {step != null && total != null && (
          <p className="onboarding-step">{t("onboarding.frame.step", { step, total })}</p>
        )}
        {children}
      </main>
    </div>
  );
}
