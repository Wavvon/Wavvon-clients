import React from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@wavvon/i18n";
import App from "./App";
import { ErrorBoundary } from "@components/common/ErrorBoundary";
import "@wavvon/ui/styles.css";

// The mid-switch transition overlay is painted by the inline script in
// index.html (parse time — module code like this runs far too late in dev
// to prevent the white flash). App removes it once the new account renders.

const storedLang = localStorage.getItem('wavvon_language');
const browserLang = navigator.language.slice(0, 2);
const supportedLangs = ['en', 'it', 'es', 'de'];
const lang = supportedLangs.includes(storedLang ?? '') ? storedLang!
           : supportedLangs.includes(browserLang) ? browserLang
           : 'en';
const i18n = initI18n(lang);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nextProvider>
  </React.StrictMode>
);
