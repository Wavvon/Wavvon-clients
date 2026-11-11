import { useTranslation } from "react-i18next";

// Hosted pre-release channels (decisions.md 2026-11-11, interim web hosting).
// Set at build time by the host: VITE_CHANNEL=pilot on Cloudflare Pages,
// VITE_CHANNEL=nightly on the GitHub Pages build of develop. Releases and the
// hub build leave it unset and render nothing. VITE_PILOT_SUCCESSOR is the
// final client's URL, set on the pilot once it exists.
const CHANNEL = import.meta.env.VITE_CHANNEL as string | undefined;
const SUCCESSOR = import.meta.env.VITE_PILOT_SUCCESSOR as string | undefined;

export function ChannelBanner() {
  const { t } = useTranslation();
  if (CHANNEL !== "pilot" && CHANNEL !== "nightly") return null;
  return (
    <div className="channel-banner" role="status">
      {SUCCESSOR && CHANNEL === "pilot" ? (
        <span>
          {t("channel_banner.pilot_moved")}
          <a href={SUCCESSOR}>{SUCCESSOR}</a>
        </span>
      ) : (
        <span>{t(CHANNEL === "pilot" ? "channel_banner.pilot" : "channel_banner.nightly")}</span>
      )}
    </div>
  );
}
