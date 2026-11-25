import assert from "node:assert/strict";
import { test } from "node:test";
import { headingSpans, parseMarkdownDocument, rewriteLinks } from "./document.ts";

const titles = (source: string) =>
  parseMarkdownDocument(source, "/w/docs/a.md").headings.map((h) => `${h.level}:${h.title}`);

test("ATX and setext headings, skipping fences and comments", () => {
  const source = [
    "Intro",
    "# One #",
    "text",
    "```md",
    "# not a heading",
    "```",
    "~~~~",
    "## still code",
    "~~~",
    "~~~~",
    "<!--",
    "# commented",
    "-->",
    "Two",
    "===",
    "Multi",
    "line",
    "---",
    "- item",
    "---",
    "    # indented code",
    "#no-space",
    "####### seven",
    "### Three ###",
  ].join("\n");
  assert.deepEqual(titles(source), ["1:One", "1:Two", "2:Multi line", "3:Three"]);
});

test("sections start at each heading and keep the preamble", () => {
  const doc = parseMarkdownDocument("pre\n\nPara\n---\nbody\n# H\nend", "/w/a.md");
  assert.deepEqual(
    doc.sections.map((s) => [s.heading?.title ?? null, s.markdown]),
    [
      [null, "pre\n"],
      ["Para", "Para\n---\nbody"],
      ["H", "# H\nend"],
    ],
  );
  assert.equal(doc.headings[1]!.line, 5);
});

test("front matter becomes rows and heading lines stay file-relative", () => {
  const doc = parseMarkdownDocument("---\ntitle: X\ntags:\n  - a\n---\n# H", "/w/a.md");
  assert.deepEqual(doc.frontMatter, [
    ["title", "X"],
    ["tags", "- a"],
  ]);
  assert.equal(doc.headings[0]!.line, 5);
});

test("reference definitions reach every section", () => {
  const doc = parseMarkdownDocument("# A\nsee [x]\n# B\n[x]: https://e.com", "/w/a.md");
  assert.ok(doc.sections[0]!.markdown.endsWith("[x]: https://e.com\n"));
});

test("heading spans keep inline code and drop markup", () => {
  assert.deepEqual(headingSpans("在 `/app/submission/` 中要交付的**内容**"), [
    { text: "在 ", code: false },
    { text: "/app/submission/", code: true },
    { text: " 中要交付的内容", code: false },
  ]);
  assert.deepEqual(headingSpans("Atkforward_Pre、Atkforward_Post [link](x.md) \\#"), [
    { text: "Atkforward_Pre、Atkforward_Post link #", code: false },
  ]);
  assert.deepEqual(headingSpans("_em_ and *b*"), [{ text: "em and b", code: false }]);
});

test("relative targets become absolute beside the file", () => {
  assert.equal(rewriteLinks("![a](./img/a.png) [b](../b.md#x)", "/w/docs"), "![a](/w/docs/img/a.png) [b](/w/b.md#x)");
  assert.equal(rewriteLinks("[c](https://x.dev) [d](#top) [e](/abs)", "/w/docs"), "[c](https://x.dev) [d](#top) [e](/abs)");
  assert.equal(rewriteLinks("`[x](y.md)` [z](my file.png)", "/w/my docs"), "`[x](y.md)` [z](my file.png)");
  assert.equal(rewriteLinks("[r]: ./r.png \"t\"", "/w"), "[r]: /w/r.png \"t\"");
  assert.equal(rewriteLinks("[s](<a b.png>)", "/"), "[s](</a b.png>)");
});
