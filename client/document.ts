/** A run of heading text; `code` marks an inline code span. */
export interface HeadingSpan {
  text: string;
  code: boolean;
}

export interface Heading {
  /** Position in `MarkdownDocument.headings`. */
  index: number;
  level: number;
  title: string;
  spans: HeadingSpan[];
  /** Zero-based line in the source file. */
  line: number;
}

/** The Markdown from one heading up to the next; the first section may have no heading. */
export interface Section {
  heading: Heading | null;
  markdown: string;
}

export interface MarkdownDocument {
  frontMatter: [key: string, value: string][];
  headings: Heading[];
  sections: Section[];
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const NOT_PARAGRAPH = /^(?: {0,3}(?:>|[-*+](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$)|<|\|)| {4}|\t)/;
const REFERENCE = /^ {0,3}\[(?!\^)(?:[^\]\\]|\\.)+\]:[ \t]*\S/;
const CODE_SPAN = /(`+)([\s\S]*?[^`])\1(?!`)/g;

/**
 * Splits a Markdown file into sections at its ATX and setext headings, outside fenced code and
 * HTML comments. Relative link and image targets become absolute paths beside `filePath`, because
 * the host renderer resolves them against the workspace root instead of the file's directory.
 */
export function parseMarkdownDocument(source: string, filePath: string): MarkdownDocument {
  const allLines = source.replace(/\r\n?/g, "\n").split("\n");
  const { frontMatter, bodyStart } = readFrontMatter(allLines);
  const directory = parentDirectory(filePath);

  const lines: string[] = [];
  const references: string[] = [];
  const starts: { line: number; heading: Heading | null }[] = [{ line: 0, heading: null }];
  const headings: Heading[] = [];
  let fence: { char: string; length: number } | null = null;
  let inComment = false;
  let paragraphStart = -1;

  const addHeading = (start: number, level: number, raw: string) => {
    const spans = headingSpans(raw);
    const heading: Heading = {
      index: headings.length,
      level,
      title: spans.map((span) => span.text).join(""),
      spans,
      line: start + bodyStart,
    };
    headings.push(heading);
    starts.push({ line: start, heading });
  };

  for (let i = bodyStart; i < allLines.length; i++) {
    const line = allLines[i]!;
    const at = lines.length;

    if (fence) {
      lines.push(line);
      const close = line.match(FENCE);
      if (close && close[1]![0] === fence.char && close[1]!.length >= fence.length && !line.slice(close[0].length).trim()) {
        fence = null;
      }
      continue;
    }
    if (inComment) {
      lines.push(line);
      if (line.includes("-->")) inComment = false;
      continue;
    }

    const open = line.match(FENCE);
    if (open && !(open[1]![0] === "`" && line.slice(open[0].length).includes("`"))) {
      fence = { char: open[1]![0]!, length: open[1]!.length };
      paragraphStart = -1;
      lines.push(line);
      continue;
    }
    const comment = line.indexOf("<!--");
    if (comment >= 0 && !line.includes("-->", comment + 4)) {
      inComment = true;
      paragraphStart = -1;
      lines.push(line);
      continue;
    }

    const atx = line.match(ATX);
    if (atx) {
      const text = (atx[2] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/, "").trim();
      addHeading(at, atx[1]!.length, text);
      paragraphStart = -1;
      lines.push(rewriteLinks(line, directory));
      continue;
    }

    const setext = line.match(SETEXT);
    if (setext && paragraphStart >= 0) {
      const raw = lines.slice(paragraphStart, at).map((text) => text.trim()).join(" ");
      addHeading(paragraphStart, setext[1]![0] === "=" ? 1 : 2, raw);
      paragraphStart = -1;
      lines.push(line);
      continue;
    }

    if (!line.trim()) paragraphStart = -1;
    else if (paragraphStart < 0 && !NOT_PARAGRAPH.test(line)) paragraphStart = at;
    if (REFERENCE.test(line)) {
      const rewritten = rewriteLinks(line, directory);
      references.push(rewritten);
      lines.push(rewritten);
    } else {
      lines.push(rewriteLinks(line, directory));
    }
  }

  // Reference definitions are document-wide; each section is rendered on its own and needs them.
  const tail = references.length > 0 ? `\n\n${references.join("\n")}\n` : "";
  const sections: Section[] = [];
  for (let s = 0; s < starts.length; s++) {
    const end = s + 1 < starts.length ? starts[s + 1]!.line : lines.length;
    const markdown = lines.slice(starts[s]!.line, end).join("\n");
    if (!starts[s]!.heading && !markdown.trim()) continue;
    // An unclosed fence would swallow the appended definitions as code.
    const lastWithOpenFence = fence !== null && s === starts.length - 1;
    sections.push({ heading: starts[s]!.heading, markdown: lastWithOpenFence ? markdown : markdown + tail });
  }
  return { frontMatter, headings, sections };
}

function readFrontMatter(lines: string[]): { frontMatter: [string, string][]; bodyStart: number } {
  if (lines[0]?.trimEnd() !== "---") return { frontMatter: [], bodyStart: 0 };
  const end = lines.findIndex((line, i) => i > 0 && /^(?:---|\.\.\.)\s*$/.test(line));
  if (end < 0) return { frontMatter: [], bodyStart: 0 };
  const rows: [string, string][] = [];
  for (const line of lines.slice(1, end)) {
    const pair = line.match(/^([^\s#:][^:]*):(?:[ \t]+(.*))?$/);
    if (pair) rows.push([pair[1]!.trim(), (pair[2] ?? "").trim()]);
    else if (rows.length > 0 && line.trim()) {
      const last = rows[rows.length - 1]!;
      last[1] = last[1] ? `${last[1]}\n${line.trim()}` : line.trim();
    }
  }
  return { frontMatter: rows, bodyStart: end + 1 };
}

/** Plain heading text, keeping inline code spans apart so the outline can style them. */
export function headingSpans(raw: string): HeadingSpan[] {
  const spans: HeadingSpan[] = [];
  const push = (text: string, code: boolean) => {
    if (!text) return;
    const last = spans[spans.length - 1];
    if (last && last.code === code && !code) last.text += text;
    else spans.push({ text, code });
  };
  forEachCodeSpan(
    raw,
    (text) => push(stripInline(text), false),
    (code) => push(code.length > 2 && code.startsWith(" ") && code.endsWith(" ") ? code.slice(1, -1) : code, true),
  );
  if (spans[0] && !spans[0].code) spans[0].text = spans[0].text.trimStart();
  const last = spans[spans.length - 1];
  if (last && !last.code) last.text = last.text.trimEnd();
  return spans.filter((span) => span.text);
}

function stripInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>\s][^>]*>/g, "")
    .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/gu, "$1$2")
    .replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

function forEachCodeSpan(
  text: string,
  onText: (text: string) => void,
  onCode: (code: string, source: string) => void,
) {
  let last = 0;
  for (const match of text.matchAll(CODE_SPAN)) {
    onText(text.slice(last, match.index));
    onCode(match[2]!, match[0]);
    last = match.index! + match[0].length;
  }
  onText(text.slice(last));
}

/** Rewrites relative `](target)` and reference-definition targets outside inline code. */
export function rewriteLinks(line: string, directory: string | null): string {
  if (!directory || (!line.includes("](") && !line.includes("]:"))) return line;
  const definition = line.match(/^( {0,3}\[(?!\^)(?:[^\]\\]|\\.)+\]:[ \t]*)(<[^>]*>|\S+)/);
  if (definition) {
    return definition[1] + absoluteTarget(definition[2]!, directory) + line.slice(definition[0].length);
  }
  let out = "";
  forEachCodeSpan(
    line,
    (text) => {
      out += text.replace(/\]\((\s*)(<[^>]*>|[^\s)]+)(?=\s*(?:\)|["'(]))/g, (_, space: string, target: string) => `](${space}${absoluteTarget(target, directory)}`);
    },
    (_code, source) => {
      out += source;
    },
  );
  return out;
}

function absoluteTarget(target: string, directory: string): string {
  const bracketed = target.startsWith("<") && target.endsWith(">");
  const raw = bracketed ? target.slice(1, -1) : target;
  if (!raw || /^(?:[a-z][a-z0-9+.-]*:|[#/~\\])/i.test(raw)) return target;
  const suffixAt = raw.search(/[?#]/);
  const path = suffixAt < 0 ? raw : raw.slice(0, suffixAt);
  const suffix = suffixAt < 0 ? "" : raw.slice(suffixAt);
  const joined = joinPath(directory, path) + suffix;
  return bracketed || /[\s()<>]/.test(joined) ? `<${joined}>` : joined;
}

// shortcut: Windows hosts get backslash joins with no drive or UNC handling; upgrade if reported.
function joinPath(directory: string, relative: string): string {
  const windows = directory.includes("\\") && !directory.includes("/");
  const separator = windows ? "\\" : "/";
  const parts = directory.split(/[\\/]/).filter((part, i) => i === 0 || part);
  for (const part of relative.split(/[\\/]/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length > 1) parts.pop();
    } else parts.push(part);
  }
  return parts.join(separator) || separator;
}

function parentDirectory(filePath: string): string | null {
  const cut = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return cut > 0 ? filePath.slice(0, cut) : cut === 0 ? "/" : null;
}
