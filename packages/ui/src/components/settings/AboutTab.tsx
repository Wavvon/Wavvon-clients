import { useTranslation } from "react-i18next";

const REPO = "https://github.com/Wavvon";

// Proper names, not translated. The libraries both clients ship; desktop
// passes its native audio stack through `extraCredits`.
const CREDITS = [
  "React",
  "i18next",
  "@noble / @scure",
  "DOMPurify",
  "marked",
  "dnd-kit",
  "MediaPipe",
  "IBM Plex",
];

interface Props {
  version: string;
  extraCredits?: string[];
}

// The AGPL asks a network client to offer its source, so the link lives in
// the UI rather than only in a README.
export function AboutTab({ version, extraCredits = [] }: Props) {
  const { t } = useTranslation();
  const links = [
    { href: `${REPO}/Wavvon-clients`, label: t("settings.about.source") },
    { href: `${REPO}/Wavvon-server`, label: t("settings.about.server") },
    { href: `${REPO}/Wavvon-docs`, label: t("settings.about.docs") },
    { href: `${REPO}/Wavvon-discovery`, label: t("settings.about.discovery") },
  ];
  return (
    <section>
      <h1>{t("settings.about.title")}</h1>
      <p>{t("settings.about.version", { version })}</p>
      <p className="muted">{t("settings.about.license")}</p>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
          </li>
        ))}
      </ul>
      <h2>{t("settings.about.credits")}</h2>
      <p className="muted">{[...CREDITS, ...extraCredits].join(" · ")}</p>
    </section>
  );
}
