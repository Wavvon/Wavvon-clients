import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { initI18n, resolveLanguage } from "@wavvon/i18n";
import AccountRoot from "./AccountRoot";
import { ErrorBoundary, HoverTips, registerInstalledLanguages } from "@wavvon/ui";
import "@wavvon/ui/styles.css";

const storedLang = localStorage.getItem('wavvon_language');
const browserLang = navigator.language.slice(0, 2);

// Installed packs register first, so a stored pack choice resolves.
void registerInstalledLanguages().then(() => initI18n(resolveLanguage(storedLang, browserLang))).then((i18n) =>
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <HoverTips />
      <ErrorBoundary>
        <AccountRoot />
      </ErrorBoundary>
    </I18nextProvider>
  </React.StrictMode>
));
