import { Buffer } from "buffer";
// opusscript's pure-JS build (voice encode/decode) needs Node's Buffer,
// which browsers don't provide.
if (!(globalThis as { Buffer?: unknown }).Buffer) {
  (globalThis as { Buffer?: unknown }).Buffer = Buffer;
}

import React from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@wavvon/i18n";
import AccountRoot from "./AccountRoot";
import { AdoptScreen } from "./components/handover/AdoptScreen";
import { MULTI_HUB } from "./constants";
import { ErrorBoundary } from "@wavvon/ui";
import "@wavvon/ui/styles.css";

const storedLang = localStorage.getItem('wavvon_language');
const browserLang = navigator.language.slice(0, 2);
const supportedLangs = ['en', 'it', 'es', 'de'];
const lang = supportedLangs.includes(storedLang ?? '') ? storedLang!
           : supportedLangs.includes(browserLang) ? browserLang
           : 'en';
const i18n = initI18n(lang);

// Receiving end of an identity handover (decisions.md 2026-08-25). Branched
// here rather than inside App so it runs without the app booting at all —
// and so the hub build, which is the sender, never carries it.
const isAdopt = MULTI_HUB && window.location.pathname === "/adopt";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <ErrorBoundary>
        {isAdopt ? <AdoptScreen /> : <AccountRoot />}
      </ErrorBoundary>
    </I18nextProvider>
  </React.StrictMode>
);
