import React from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { initI18n, resolveLanguage } from "@wavvon/i18n";
import AccountRoot from "./AccountRoot";
import { AdoptScreen } from "./components/handover/AdoptScreen";
import { ChannelBanner } from "./components/ChannelBanner";
import { MULTI_HUB } from "./constants";
import { primeServedHubLanguages, primeServedHubTheme } from "./utils/primeServedHubTheme";
import { ErrorBoundary, HoverTips, registerInstalledLanguages } from "@wavvon/ui";
import "@wavvon/ui/styles.css";

const storedLang = localStorage.getItem('wavvon_language');
const browserLang = navigator.language.slice(0, 2);

// Receiving end of an identity handover (decisions.md 2026-08-25). Branched
// here rather than inside App so it runs without the app booting at all —
// and so the hub build, which is the sender, never carries it.
const isAdopt = MULTI_HUB && window.location.pathname === "/adopt";

// Packs register first (installed ones, and the hub build's own hub's), so a
// stored pack choice resolves and the hub default can apply.
const i18nReady = Promise.all([registerInstalledLanguages(), primeServedHubLanguages()]).then(([, hubDefault]) =>
  initI18n(resolveLanguage(storedLang, browserLang, hubDefault)),
);

void Promise.all([i18nReady, primeServedHubTheme()]).then(([i18n]) =>
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ChannelBanner />
      <HoverTips />
      <ErrorBoundary>
        {isAdopt ? <AdoptScreen /> : <AccountRoot />}
      </ErrorBoundary>
    </I18nextProvider>
  </React.StrictMode>
));
