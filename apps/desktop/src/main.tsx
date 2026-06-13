import React from "react";
import ReactDOM from "react-dom/client";
import { initI18n } from "@voxply/i18n";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "@voxply/ui/styles.css";

const storedLang = localStorage.getItem('voxply_language');
const browserLang = navigator.language.slice(0, 2);
const supportedLangs = ['en', 'it', 'es', 'de'];
const lang = supportedLangs.includes(storedLang ?? '') ? storedLang!
           : supportedLangs.includes(browserLang) ? browserLang
           : 'en';
initI18n(lang);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
