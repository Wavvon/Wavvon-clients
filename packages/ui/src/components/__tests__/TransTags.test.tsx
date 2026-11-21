import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18n, { initI18n, resolveLanguage, setLanguage } from "../../../../i18n/i18n";
import { AddHubModal } from "../hubs/AddHubModal";

(globalThis as { React?: typeof React }).React = React;

describe("translated markup", () => {
  it("renders catalogue tags as elements from the code, not as HTML", async () => {
    await initI18n("en");
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <AddHubModal
          hubUrl=""
          onHubUrlChange={() => {}}
          hubPreview={{ state: "idle" } as never}
          loading={false}
          error={null}
          onAdd={() => {}}
          onClose={() => {}}
        />
      </I18nextProvider>,
    );
    expect(html).toContain("<code>wavvon://</code>");
  });

  it("resolves a language from the stored choice, then the browser, then English", () => {
    expect(resolveLanguage("it", "de")).toBe("it");
    expect(resolveLanguage(null, "de-DE")).toBe("de");
    expect(resolveLanguage("xx", "fr")).toBe("en");
  });

  it("loads a catalogue on demand", async () => {
    await setLanguage("it");
    expect(i18n.t("hub.add_modal.title")).not.toBe(i18n.getFixedT("en")("hub.add_modal.title"));
  });
});
