import React from "react";
import { createRoot } from "react-dom/client";
import { initI18n } from "@wavvon/i18n";
import App from "./App";
import "@wavvon/ui/styles.css";
import "./styles-mobile.css";

const storedLang = localStorage.getItem('wavvon_language');
const browserLang = navigator.language.slice(0, 2);
const supportedLangs = ['en', 'it', 'es', 'de'];
const lang = supportedLangs.includes(storedLang ?? '') ? storedLang!
           : supportedLangs.includes(browserLang) ? browserLang
           : 'en';
initI18n(lang);

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
