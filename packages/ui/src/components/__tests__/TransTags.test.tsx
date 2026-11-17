import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import i18n, { initI18n } from "../../../../i18n/i18n";
import { AddHubModal } from "../hubs/AddHubModal";

(globalThis as { React?: typeof React }).React = React;

describe("translated markup", () => {
  it("renders catalogue tags as elements from the code, not as HTML", () => {
    initI18n("en");
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
});
