import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import May20RequestedTrafficPage from "./page";

describe("May20RequestedTrafficPage", () => {
  it("links to the Bucheon map from the report hero actions", () => {
    const html = renderToStaticMarkup(createElement(May20RequestedTrafficPage));

    assert.match(html, /href="\/bucheon\/2026-05-20\/maps"/);
    assert.match(html, /부천 지도/);
  });
});
