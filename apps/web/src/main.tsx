import React from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@wavvon/i18n";
import App from "./App";
import { ErrorBoundary } from "@components/common/ErrorBoundary";
import { showAccountSwitchOverlay } from "./identity/store";
import "@wavvon/ui/styles.css";

// Mid-account-switch: repaint the transition overlay before anything else
// renders so the reload reads as one continuous "Switching account…" instead
// of a flash. App removes it (and the flag) once the new account is up.
try {
  const switchText = sessionStorage.getItem("wavvon:switch_overlay_text");
  if (switchText) showAccountSwitchOverlay(switchText);
} catch {
  // storage unavailable
}

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
