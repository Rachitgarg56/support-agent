import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnswerContent } from "@/components/answer-content";

describe("answer Markdown", () => {
  it("formats text and links only known citation markers", () => {
    const html = renderToStaticMarkup(createElement(AnswerContent, {
      text: "**Starter** allows 1,000 requests [1], not [9].\n\n- A list item",
      messageId: "answer-1",
      citationIds: ["1"],
    }));
    expect(html).toContain("<strong>Starter</strong>");
    expect(html).toContain("<li>A list item</li>");
    expect(html).toContain('href="#source-answer-1-1"');
    expect(html).toContain('aria-label="View source 1"');
    expect(html).not.toContain('href="#source-answer-1-9"');
  });

  it("does not execute raw HTML or load images supplied by the model", () => {
    const html = renderToStaticMarkup(createElement(AnswerContent, {
      text: "<script>alert(1)</script> ![private](https://example.com/image.png)",
      messageId: "answer-1",
      citationIds: [],
    }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("private");
  });
});
