export type SuperGroup = {
  id: string;
  title: string;
  description: string;
  targetsCount: number;
};

export type Role = {
  id: string;
  title: string;
  slug: string;
  pypCount: number;
};

export type Paper = {
  id: string;
  title: string;
  year: number;
  examDate: string;
  durationMinutes: number;
};

export type ExportRow = {
  question_number: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  solution_text: string;
  topic_subject: string;
  topic_category: string;
  difficulty: string;
  marks: number | string;
  negative_marks: number | string;
};

export type AnswerByQuestionId = Record<
  string,
  {
    correctOption: string;
    solutionText: string;
    negativeMarks: number | null;
    topicSubject: string;
    topicCategory: string;
  }
>;

type AnyObject = Record<string, unknown>;

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  emsp: " ",
  ensp: " ",
  gt: ">",
  hellip: "…",
  ldquo: '"',
  lsquo: "'",
  lt: "<",
  mdash: "—",
  minus: "−",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: '"',
  rsquo: "'",
  shy: "",
  thinsp: " ",
  times: "×",
  zwj: "",
  zwnj: "",
  // Greek
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε",
  varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", omicron: "ο", pi: "π", varpi: "ϖ", rho: "ρ",
  varrho: "ϱ", sigma: "σ", sigmaf: "ς", tau: "τ", upsilon: "υ",
  phi: "φ", varphi: "ϕ", chi: "χ", psi: "ψ", omega: "ω",
  Alpha: "Α", Beta: "Β", Gamma: "Γ", Delta: "Δ", Epsilon: "Ε",
  Zeta: "Ζ", Eta: "Η", Theta: "Θ", Iota: "Ι", Kappa: "Κ",
  Lambda: "Λ", Mu: "Μ", Nu: "Ν", Xi: "Ξ", Omicron: "Ο",
  Pi: "Π", Rho: "Ρ", Sigma: "Σ", Tau: "Τ", Upsilon: "Υ",
  Phi: "Φ", Chi: "Χ", Psi: "Ψ", Omega: "Ω",
  // Operators / relations
  forall: "∀", exist: "∃", isin: "∈", notin: "∉", ni: "∋",
  empty: "∅", nabla: "∇", part: "∂", prop: "∝", infin: "∞",
  and: "∧", or: "∨", cap: "∩", cup: "∪", int: "∫",
  sum: "∑", prod: "∏", coprod: "∐",
  sim: "∼", cong: "≅", asymp: "≈", ne: "≠", equiv: "≡",
  le: "≤", ge: "≥", sub: "⊂", sup: "⊃", nsub: "⊄",
  sube: "⊆", supe: "⊇", oplus: "⊕", otimes: "⊗", perp: "⊥",
  parallel: "∥", ang: "∠", sdot: "⋅", lowast: "∗", bull: "•",
  // Arrows
  larr: "←", uarr: "↑", rarr: "→", darr: "↓", harr: "↔",
  lArr: "⇐", uArr: "⇑", rArr: "⇒", dArr: "⇓", hArr: "⇔",
  // Misc symbols
  there4: "∴", because: "∵", plusmn: "±", divide: "÷",
  frac12: "½", frac13: "⅓", frac14: "¼", frac23: "⅔", frac34: "¾",
  radic: "√", deg: "°", prime: "′", Prime: "″", micro: "µ",
  middot: "·", lceil: "⌈", rceil: "⌉", lfloor: "⌊", rfloor: "⌋",
  lang: "〈", rang: "〉", fnof: "ƒ", image: "ℑ", real: "ℜ",
  weierp: "℘", alefsym: "ℵ", ocirc: "ô", Oslash: "Ø", oslash: "ø",
  sup1: "¹", sup2: "²", sup3: "³", copy: "©", reg: "®", euro: "€",
};

const SOLUTION_TEXT_KEYS = [
  "en",
  "english",
  "value",
  "text",
  "html",
  "body",
  "content",
  "description",
  "explanation",
  "explanations",
  "solution",
  "solutions",
  "solutionText",
  "steps",
  "children",
];

const SAFE_HTML_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href", "title"]),
  img: new Set(["alt", "src", "title", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

// Regex to find math delimited regions: \( ... \), $$ ... $$, \[ ... \]
// These must be preserved verbatim during HTML stripping
const MATH_DELIMITED_PATTERN =
  /\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/g;

// LaTeX environment blocks: \begin{...} ... \end{...}
const LATEX_ENV_PATTERN = /\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g;

// Tags that must never survive into exported content (content is dropped too).
// Everything else is preserved so the examprep renderer (DOMPurify) can display it.
const UNSAFE_TAG_NAMES = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input",
  "button", "textarea", "select", "option", "link", "meta", "svg",
  "video", "audio", "canvas", "applet",
]);

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function decodeCodePoint(value: string | number, fallback: string): string {
  const codePoint = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return fallback;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (match, value: string) =>
      decodeCodePoint(Number.parseInt(value, 16), match),
    )
    .replace(/&#(\d+);/g, (match, value: string) => decodeCodePoint(value, match))
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name: string) => {
      const decoded = HTML_ENTITIES[name.toLowerCase()];
      return decoded ?? match;
    });
}

/**
 * Removes only tags that are unsafe to keep in exported content. Allowed tags
 * (p, table, sup, sub, strong, img, br, ...) are preserved so the examprep
 * app renders them like Testbook's own CSV exports do.
 */
function stripDisallowedTags(input: string): string {
  return input.replace(/<\/?([a-z][a-z0-9]*)\b[^<>]*>/gi, (tag, name: string) =>
    UNSAFE_TAG_NAMES.has(name.toLowerCase()) ? "" : tag,
  );
}

/**
 * Converts MathJax-verbose LaTeX into KaTeX-compatible LaTeX.
 * Testbook authors with MathJax-isms that KaTeX rejects:
 *   - \mathop \sum \limits_{...}  →  \sum_{...}
 *   - \mathop {\lim }\limits_{...} →  \lim\limits_{...}
 *   - \begin{array}{*{20}{c}}     →  \begin{array}{cccc...}
 *   - \log_{10}^\;{...}           →  \log_{10}^{...}
 */
function normalizeLatexForKatex(latex: string): string {
  return latex
    // \mathop <cmd> → <cmd> (KaTeX errors on \mathop \sum)
    .replace(/\\mathop\s+(\\[a-zA-Z]+)/g, "$1")
    // \mathop {\cmd} → \cmd
    .replace(/\\mathop\s*\{\s*(\\[a-zA-Z]+)\s*\}/g, "$1")
    // \mathop {<group>} → <group> (safe for non-command groups)
    .replace(/\\mathop\s*\{\s*([^{}]*?)\s*\}/g, "$1")
    // Spurious spacing commands after superscript/subscript: ^\; → ^
    .replace(/(\^|_)\s*\\;/g, "$1")
    // Expand MathJax column spec *{n}{cols} → cols repeated (KaTeX lacks *)
    .replace(/\*\{(\d{1,2})\}\{([^{}]*)\}/g, (_match, n: string, cols: string) =>
      String(cols).repeat(Math.max(1, Math.min(30, parseInt(n, 10)))),
    );
}

/**
 * Strips HTML tags from inside LaTeX content.
 * Math renderers choke on any HTML embedded within \begin{...}\end{...} blocks.
 */
function cleanLatexContent(latex: string): string {
  const withoutTags = latex.replace(/<\/?[a-z][^<>]*>/gi, "");
  const decoded = withoutTags
    // Decode HTML entities that were double-encoded
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  const normalized = normalizeLatexForKatex(decoded);
  // Normalize whitespace but preserve intentional spacing commands
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Strips Microsoft Office namespace tags (<o:p>, etc.) that leak into
 * Testbook content from copy-pasted Word documents.
 */
function stripOfficeTags(input: string): string {
  return input.replace(/<\/?[a-z]:[a-z][^<>]*>/gi, "");
}

/**
 * Fixes protocol-relative URLs (//cdn.testbook.com/...) by prepending https:
 */
function fixProtocolRelativeUrl(src: string): string {
  return src.startsWith("//") ? `https:${src}` : src;
}

/**
 * Decodes HTML entities in raw TeX source extracted from annotations,
 * error spans, or MathJax containers.
 */
function decodeTexSource(tex: string): string {
  return tex
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

/**
 * Wraps raw TeX in delimiters so KaTeX renders it.
 * Display mode for environments, row separators, and \left...\right blocks.
 */
function wrapTexInDelimiters(tex: string): string {
  const trimmed = tex.trim();
  if (!trimmed) return "";
  const isDisplay =
    /\\begin\s*\{/.test(trimmed) ||
    /\\left[\[({]/.test(trimmed) ||
    /(^|[^\\])\\\\/.test(trimmed);
  return isDisplay ? `\\[${trimmed}\\]` : `\\(${trimmed}\\)`;
}

interface TagContainer {
  index: number;
  endIndex: number;
  openTag: string;
  inner: string;
}

function hasClassAttribute(tag: string, classWord: string): boolean {
  return new RegExp(
    `class\\s*=\\s*["'][^"']*\\b${classWord}\\b[^"']*["']`,
    "i",
  ).test(tag);
}

/**
 * Finds the next balanced <tagName>...</tagName> container starting at
 * startFrom, optionally requiring a specific CSS class word on the open tag.
 * Handles nested tags of the same name (e.g. spans inside spans).
 */
function findTagContainer(
  input: string,
  tagName: string,
  classWord: string | null,
  startFrom = 0,
): TagContainer | null {
  const openPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  openPattern.lastIndex = startFrom;

  let match: RegExpExecArray | null;
  while ((match = openPattern.exec(input)) !== null) {
    const openTag = match[0];
    if (classWord && !hasClassAttribute(openTag, classWord)) continue;

    const depthPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
    depthPattern.lastIndex = openPattern.lastIndex;
    let depth = 1;
    let innerEnd = -1;
    let depthMatch: RegExpExecArray | null;

    while ((depthMatch = depthPattern.exec(input)) !== null) {
      if (depthMatch[0].startsWith("</")) depth -= 1;
      else depth += 1;
      if (depth === 0) {
        innerEnd = depthMatch.index;
        break;
      }
    }

    if (innerEnd === -1) return null;

    return {
      index: match.index,
      endIndex: innerEnd + depthMatch![0].length,
      openTag,
      inner: input.slice(openPattern.lastIndex, innerEnd),
    };
  }

  return null;
}

function extractAnnotationTex(markup: string): string {
  const annotation =
    markup.match(
      /<annotation\b[^>]*encoding\s*=\s*["']application\/x-tex["'][^>]*>([\s\S]*?)<\/annotation>/i,
    ) ??
    markup.match(/<tex-math\b[^>]*>([\s\S]*?)<\/tex-math>/i) ??
    markup.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return annotation?.[1] ? decodeTexSource(annotation[1]) : "";
}

function stripAllTags(input: string): string {
  return input.replace(/<\/?[a-z][^<>]*>/gi, "");
}

/**
 * Replaces pre-rendered KaTeX / MathJax / MathML markup with clean,
 * delimiter-wrapped TeX BEFORE any tag stripping happens. This is what
 * prevents the "garbled math" problem: without this step, stripping tags
 * from pre-rendered math leaves raw TeX mixed with rendered glyphs,
 * HTML attribute fragments, and duplicate copies of formulas.
 *
 * Handles:
 *  - <script type="math/tex..."> blocks
 *  - <span class="katex-error" title="..."> spans (title holds raw TeX)
 *  - <span class="katex"> spans (extracts application/x-tex annotation)
 *  - <math> blocks (MathML semantics with application/x-tex annotation)
 *  - <mjx-container> blocks (MathJax CHTML/SVG, data-tex attr or annotation)
 *  - <span class="math-tex"> / <span class="MathJax"> wrappers (unwrap)
 */
function extractPreRenderedMath(input: string): string {
  let text = input;

  // 1) <script type="math/tex..."> blocks — raw TeX source
  text = text.replace(
    /<script\b[^>]*type\s*=\s*["'](?:math\/tex|application\/tex|text\/latex|math\/latex)[^"']*["'][^>]*>([\s\S]*?)<\/script>/gi,
    (_match, tex: string) => wrapTexInDelimiters(decodeTexSource(tex)),
  );

  // 2) katex-error spans — raw TeX in the title attribute (or text content)
  let container: TagContainer | null;
  while ((container = findTagContainer(text, "span", "katex-error")) !== null) {
    const titleMatch = container.openTag.match(/title\s*=\s*["']([\s\S]*?)["']/i);
    let tex = titleMatch?.[1] ? decodeTexSource(titleMatch[1]) : "";
    if (!tex) tex = decodeTexSource(stripAllTags(container.inner));
    text =
      text.slice(0, container.index) +
      wrapTexInDelimiters(tex) +
      text.slice(container.endIndex);
  }

  // 3) katex spans — pre-rendered formulas; use the x-tex annotation
  while ((container = findTagContainer(text, "span", "katex")) !== null) {
    const tex = extractAnnotationTex(container.inner);
    text =
      text.slice(0, container.index) +
      wrapTexInDelimiters(tex) +
      text.slice(container.endIndex);
  }

  // 4) <math> blocks — MathML with an x-tex annotation
  while ((container = findTagContainer(text, "math", null)) !== null) {
    const tex = extractAnnotationTex(container.inner);
    text =
      text.slice(0, container.index) +
      wrapTexInDelimiters(tex) +
      text.slice(container.endIndex);
  }

  // 5) MathJax <mjx-container> blocks
  while ((container = findTagContainer(text, "mjx-container", null)) !== null) {
    const dataTex = container.openTag.match(/data-tex\s*=\s*["']([^"']*)["']/i);
    const tex = dataTex?.[1]
      ? decodeTexSource(dataTex[1])
      : extractAnnotationTex(container.inner);
    text =
      text.slice(0, container.index) +
      wrapTexInDelimiters(tex) +
      text.slice(container.endIndex);
  }

  // 6) math-tex / MathJax wrapper spans — unwrap and ensure delimiters
  for (const classWord of ["math-tex", "MathJax"]) {
    let wrapper: TagContainer | null;
    while ((wrapper = findTagContainer(text, "span", classWord)) !== null) {
      let inner = wrapper.inner.trim();
      // Convert legacy $...$ delimiters (only safe inside a known math wrapper)
      inner = inner.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) =>
        wrapTexInDelimiters(decodeTexSource(tex)),
      );
      inner = inner.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) =>
        wrapTexInDelimiters(decodeTexSource(tex)),
      );
      if (
        !/^\\\([\s\S]*\\\)$/.test(inner) &&
        !/^\\\[[\s\S]*\\\]$/.test(inner) &&
        !/^\$\$[\s\S]*\$\$$/.test(inner) &&
        (/\\[a-zA-Z{[]/.test(inner) || /\^\{|_\s*\{/.test(inner))
      ) {
        inner = wrapTexInDelimiters(inner);
      }
      text = text.slice(0, wrapper.index) + inner + text.slice(wrapper.endIndex);
    }
  }

  return text;
}

/**
 * Processes math regions to clean HTML garbage from inside LaTeX blocks.
 * Finds all \( ... \), $$ ... $$, \[ ... \], and \begin{} ... \end{} regions
 * and strips HTML tags that leaked inside them.
 */
function cleanMathRegions(input: string): string {
  // Clean delimited math regions
  let result = input.replace(MATH_DELIMITED_PATTERN, (match) => {
    // Extract the delimiters and clean the content between them
    if (match.startsWith("\\(") && match.endsWith("\\)")) {
      const inner = match.slice(2, -2);
      return `\\(${cleanLatexContent(inner)}\\)`;
    }
    if (match.startsWith("$$") && match.endsWith("$$")) {
      const inner = match.slice(2, -2);
      return `$$${cleanLatexContent(inner)}$$`;
    }
    if (match.startsWith("\\[") && match.endsWith("\\]")) {
      const inner = match.slice(2, -2);
      return `\\[${cleanLatexContent(inner)}\\]`;
    }
    return match;
  });

  // Clean bare LaTeX environment blocks
  result = result.replace(LATEX_ENV_PATTERN, (match) => cleanLatexContent(match));

  return result;
}

/**
 * Master function for processing HTML content for export.
 * - Extracts TeX from pre-rendered KaTeX/MathJax/MathML markup
 * - Preserves math delimiters and wraps bare \begin..\end environments
 * - Preserves safe HTML (p, table, sup, sub, strong, img, br, ...)
 * - Decodes HTML entities to their Unicode equivalents
 * - Strips remaining unsafe HTML
 */
function processHtmlForExport(input: string): string {
  let text = decodeRepeatedHtmlEntities(input);

  // Strip Office namespace tags early
  text = stripOfficeTags(text);

  // Replace pre-rendered math markup with clean delimited TeX BEFORE
  // anything else so tag processing never sees rendered-math garbage
  text = extractPreRenderedMath(text);

  // Strip unsafe HTML (scripts, styles, comments) — math/tex scripts are kept
  text = stripUnsafeHtml(text);

  // Clean HTML garbage from inside math regions
  text = cleanMathRegions(text);

  // Preserve math-delimited regions as placeholders so tag processing never
  // mangles backslash sequences near angle brackets
  const mathRegions: string[] = [];
  text = text.replace(MATH_DELIMITED_PATTERN, (match) => {
    mathRegions.push(match);
    return `__MATH_PLACEHOLDER_${mathRegions.length - 1}__`;
  });

  // Wrap bare LaTeX environments in display delimiters so they survive
  // transport and render reliably in the target app
  text = text.replace(LATEX_ENV_PATTERN, (match) => {
    mathRegions.push(`\\[${match.trim()}\\]`);
    return `__MATH_PLACEHOLDER_${mathRegions.length - 1}__`;
  });

  // Preserve <img> tags as placeholders
  const imgTags: string[] = [];
  text = text.replace(
    /<img\s[^>]*src\s*=\s*"([^"]*)"[^>]*\/?>/gi,
    (_match, src) => {
      imgTags.push(`<img src="${fixProtocolRelativeUrl(src as string)}"/>`);
      return `__IMG_PLACEHOLDER_${imgTags.length - 1}__`;
    },
  );

  // Simplify HTML markup (strip attributes, lowercase tags, collapse spans)
  text = simplifyHtmlMarkup(text);

  // Remove unsafe tags, keep everything else (p, table, sup, sub, ...)
  text = stripDisallowedTags(text);

  // Normalize whitespace
  text = normalizePlainText(text);

  // Restore math placeholders
  text = text.replace(
    /__MATH_PLACEHOLDER_(\d+)__/g,
    (_, idx) => mathRegions[parseInt(idx as string)] ?? "",
  );

  // Restore img placeholders
  text = text.replace(
    /__IMG_PLACEHOLDER_(\d+)__/g,
    (_, idx) => imgTags[parseInt(idx as string)] ?? "",
  );

  return text;
}

function stripUnsafeHtml(input: string): string {
  return input
    // Keep math/tex script blocks — they are extracted as TeX later
    .replace(
      /<script\b(?![^>]*type\s*=\s*["'](?:math\/tex|application\/tex|text\/latex|math\/latex))[^<>]*>[\s\S]*?<\/script>/gi,
      " ",
    )
    .replace(/<style\b[^<>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function sanitizeAttributeValue(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/\r\n?|\n|\u2028|\u2029/g, " ");
}

function sanitizeHtmlAttributes(tagName: string, rawAttributes: string): string {
  const safeAttributes = SAFE_HTML_ATTRIBUTES[tagName.toLowerCase()];
  if (!safeAttributes || !rawAttributes.trim()) return "";

  const attributes: string[] = [];
  const attributePattern =
    /([a-z_:][a-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

  for (const match of rawAttributes.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    if (!safeAttributes.has(name) || name.startsWith("on")) continue;

    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    const normalizedValue = rawValue.trim();
    if (!normalizedValue) continue;

    if (
      (name === "href" || name === "src") &&
      /^(?:javascript|data:text\/html)/i.test(normalizedValue)
    ) {
      continue;
    }

    attributes.push(`${name}="${sanitizeAttributeValue(normalizedValue)}"`);
  }

  return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
}

function simplifyHtmlMarkup(input: string): string {
  return input
    .replace(/<colgroup\b[^<>]*>[\s\S]*?<\/colgroup>/gi, " ")
    .replace(/<col\b[^<>]*\/?>/gi, " ")
    .replace(/<([a-z][a-z0-9]*)(\s[^<>]*?)(\/?)>/gi, (_match, tagName, rawAttributes, closingSlash) => {
      const attributes = sanitizeHtmlAttributes(tagName, rawAttributes);
      return `<${tagName.toLowerCase()}${attributes}${closingSlash}>`;
    })
    .replace(/<\/([a-z][a-z0-9]*)>/gi, (_match, tagName) => `</${tagName.toLowerCase()}>`)
    .replace(/(?:<span>\s*){2,}/gi, "<span>")
    .replace(/(?:\s*<\/span>){2,}/gi, "</span>")
    .replace(/<p>\s*<\/p>/gi, " ");
}

function normalizePlainText(input: string): string {
  return input
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\r\n?|\n|\u2028|\u2029/g, " ")
    .replace(/[\u00a0\u1680\u180e\u2000-\u200d\u202f\u205f\u3000\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeRepeatedHtmlEntities(input: string): string {
  let text = input;

  for (let i = 0; i < 3; i += 1) {
    const decoded = decodeHtmlEntities(text);
    if (decoded === text) {
      break;
    }
    text = decoded;
  }

  return text;
}

/**
 * Processes question/option text for export: extracts TeX from pre-rendered
 * math markup, preserves math delimiters and safe HTML (tables, sup/sub,
 * images), decodes entities, strips remaining unsafe HTML.
 */
function stripHtml(input: string): string {
  return processHtmlForExport(input);
}

function collectSolutionText(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSolutionText(item, seen));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  const source = value as AnyObject;
  const nestedValues: unknown[] = [];
  if (Object.prototype.hasOwnProperty.call(source, "en")) {
    nestedValues.push(source.en);
  }
  if (Object.prototype.hasOwnProperty.call(source, "english")) {
    nestedValues.push(source.english);
  }

  for (const key of SOLUTION_TEXT_KEYS) {
    if (key === "en" || key === "english") continue;
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      nestedValues.push(source[key]);
    }
  }

  return nestedValues.flatMap((item) => collectSolutionText(item, seen));
}

function combineTextCandidates(candidates: unknown[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];

  for (const candidate of candidates.flatMap((item) => collectSolutionText(item))) {
    const text = processHtmlForExport(candidate);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }

  return parts.join(" ");
}

function extractSolutionText(answerObj: AnyObject): string {
  return (
    combineTextCandidates([
      answerObj.sol,
      answerObj.solution,
      answerObj.solutions,
      answerObj.solutionText,
      answerObj.explanation,
      answerObj.explanations,
      answerObj.explanationText,
    ]) || processHtmlForExport(getString(answerObj.val))
  );
}

function extractQuestionText(en: AnyObject): string {
  const compText =
    getString(en.comp) ||
    getString(en.comprehension) ||
    getString(en.passage) ||
    getString(en.paragraph);
  const questionText = getString(en.value);

  const raw = compText ? `${compText} ${questionText}` : questionText;
  return processHtmlForExport(raw);
}

const DEVANAGARI_START = 0x0900;
const DEVANAGARI_END = 0x097F;

function hasEnglishContent(texts: string[]): boolean {
  for (const text of texts) {
    if (!text) continue;
    let latin = 0;
    let devanagari = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
        latin++;
      } else if (code >= DEVANAGARI_START && code <= DEVANAGARI_END) {
        devanagari++;
      }
    }
    // If text has Devanagari characters but zero Latin letters, it's non-English
    if (devanagari > 0 && latin === 0) return false;
  }
  return true;
}

function isNonPreviousYearTitle(title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return true;

  const blockedPhrases = [
    "last 12 months report",
    "report and index",
    "practice questions",
    "important government schemes",
    "government schemes",
    "current affairs",
    "editorial",
  ];

  return blockedPhrases.some((phrase) => normalized.includes(phrase));
}

function normalizeCorrectOption(raw: unknown): string {
  if (typeof raw === "number") {
    const letters = ["A", "B", "C", "D", "E"];
    return letters[raw - 1] ?? "";
  }

  if (typeof raw === "string") {
    const normalized = raw.trim().toUpperCase();
    if (["A", "B", "C", "D", "E"].includes(normalized)) return normalized;
    if (/^[1-5]$/.test(normalized)) {
      const letters = ["A", "B", "C", "D", "E"];
      return letters[Number(normalized) - 1] ?? "";
    }
  }

  if (raw && typeof raw === "object") {
    const obj = raw as AnyObject;
    return normalizeCorrectOption(obj.prompt ?? obj.value ?? obj.id);
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return normalizeCorrectOption(raw[0]);
  }

  return "";
}

function normalizeMultiCorrectOptions(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length === 0) return "";

  const normalized = raw
    .map((item) => normalizeCorrectOption(item))
    .filter((item) => Boolean(item));

  if (normalized.length === 0) return "";

  return [...new Set(normalized)].join("|");
}

function normalizeRangeAnswer(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";

  const range = raw as AnyObject;
  const start = getString(range.start).trim();
  const end = getString(range.end).trim();

  if (!start && !end) return "";
  if (start && end && start === end) return start;
  if (start && end) return `${start} to ${end}`;
  return start || end;
}

function extractCorrectAnswerValue(source: AnyObject): string {
  return (
    normalizeCorrectOption(
      source.correctOption ??
        source.correctAns ??
        source.correctAnswer ??
        source.answer ??
        source.answers ??
        source.key ??
        source.ans,
    ) ||
    normalizeMultiCorrectOptions(source.multiCorrectOptions) ||
    normalizeRangeAnswer(source.range)
  );
}

function extractTopicInfo(source: AnyObject): {
  topic: string;
  topicSubject: string;
  topicCategory: string;
  topicType: string;
} {
  const tags = Array.isArray(source.tags) ? (source.tags as unknown[]) : [];
  const firstTag = getString(tags[0]).trim();

  const globalConcept = Array.isArray(source.globalConcept)
    ? (source.globalConcept as AnyObject[])
    : [];
  const firstConcept = (globalConcept[0] ?? {}) as AnyObject;

  const subject = getString(((firstConcept.s ?? {}) as AnyObject).title).trim();
  const category = getString(((firstConcept.c ?? {}) as AnyObject).title).trim();
  const type = getString(((firstConcept.t ?? {}) as AnyObject).title).trim();

  return {
    topic: type || firstTag,
    topicSubject: subject,
    topicCategory: category,
    topicType: type,
  };
}

function extractCorrectOption(question: AnyObject): string {
  return extractCorrectAnswerValue(question);
}

export function mapAnswerLookup(payload: AnyObject): AnswerByQuestionId {
  const data = (payload.data ?? {}) as AnyObject;
  const lookup: AnswerByQuestionId = {};

  for (const [questionId, answerValue] of Object.entries(data)) {
    if (!questionId || !answerValue || typeof answerValue !== "object") continue;

    const answerObj = answerValue as AnyObject;
    const topicInfo = extractTopicInfo(answerObj);

    lookup[questionId] = {
      correctOption: extractCorrectAnswerValue(answerObj),
      solutionText: extractSolutionText(answerObj),
      negativeMarks:
        getFiniteNumber(answerObj.negMarks) ??
        getFiniteNumber(answerObj.negativeMarks) ??
        getFiniteNumber(answerObj.minusMarks),
      topicSubject: topicInfo.topicSubject,
      topicCategory: topicInfo.topicCategory,
    };
  }

  return lookup;
}

export function mapSuperGroups(payload: AnyObject): SuperGroup[] {
  const groups = ((payload.data as AnyObject)?.superGroup ?? []) as AnyObject[];
  if (!Array.isArray(groups)) return [];

  return groups.map((group) => {
    const properties = (group.properties ?? {}) as AnyObject;

    return {
      id: getString(group._id),
      title: getString(properties.title),
      description: getString(properties.description),
      targetsCount: getNumber(group.targetsCount),
    };
  });
}

export function mapRoles(payload: AnyObject): Role[] {
  const roles = ((payload.data as AnyObject)?.targets ?? []) as AnyObject[];
  if (!Array.isArray(roles)) return [];

  return roles.map((role) => {
    const properties = (role.properties ?? {}) as AnyObject;
    const stats = (role.stats ?? {}) as AnyObject;
    const pypCount = (stats.pypCount ?? {}) as AnyObject;

    return {
      id: getString(role._id),
      title: getString(properties.title),
      slug: getString(role.slug),
      pypCount: getNumber(pypCount.count),
    };
  });
}

export function mapPapers(payload: AnyObject): Paper[] {
  const yearWiseTests = ((payload.data as AnyObject)?.yearWiseTests ?? []) as AnyObject[];
  if (!Array.isArray(yearWiseTests)) return [];

  const papers: Paper[] = [];

  for (const block of yearWiseTests) {
    const year = getNumber(block.year);
    const tests = (block.tests ?? []) as AnyObject[];
    if (!Array.isArray(tests)) continue;

    for (const test of tests) {
      const title = getString(test.title);
      if (isNonPreviousYearTitle(title)) continue;

      papers.push({
        id: getString(test.id),
        title,
        year,
        examDate: getString(test.examDate),
        durationMinutes: Math.round(getNumber(test.duration) || 0),
      });
    }
  }

  return papers;
}

export function getPaperTitle(payload: AnyObject): string {
  return getString(((payload.data as AnyObject) ?? {}).title) || "question-paper";
}

function findOptionsArray(question: AnyObject, en: AnyObject): AnyObject[] {
  const candidates = [
    en.options,
    question.options,
    question.choices,
    en.choices,
    question.alternatives,
    en.alternatives,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as AnyObject[];
  }
  return [];
}

function extractOptionValue(opt: unknown): string {
  if (typeof opt === "string") return opt;
  if (!opt || typeof opt !== "object") return "";
  const obj = opt as AnyObject;
  const optEn = (obj.en ?? {}) as AnyObject;
  return getString(
    obj.value ??
      obj.text ??
      obj.content ??
      obj.html ??
      obj.label ??
      optEn.value ??
      optEn.text ??
      optEn.content ??
      "",
  );
}

export function mapExportRows(
  payload: AnyObject,
  answersLookup: AnswerByQuestionId = {},
): ExportRow[] {
  const sections = ((payload.data as AnyObject)?.sections ?? []) as AnyObject[];
  if (!Array.isArray(sections)) return [];

  const rows: ExportRow[] = [];
  let index = 1;

  for (const section of sections) {
    const questions = (section.questions ?? []) as AnyObject[];
    if (!Array.isArray(questions)) continue;

    for (const question of questions) {
      const en = (question.en ?? {}) as AnyObject;
      const options = findOptionsArray(question, en);
      const questionId = getString(question._id);
      const answerInfo = answersLookup[questionId];

      const rawOptA = extractOptionValue(options[0]);
      const rawOptB = extractOptionValue(options[1]);
      const rawOptC = extractOptionValue(options[2]);
      const rawOptD = extractOptionValue(options[3]);

      // Skip questions that don't have English content
      // (e.g., Hindi-only questions in bilingual papers like SSC GD)
      if (!hasEnglishContent([getString(en.value), rawOptA, rawOptB, rawOptC, rawOptD])) {
        continue;
      }

      const questionText = extractQuestionText(en);
      const optA = stripHtml(rawOptA);
      const optB = stripHtml(rawOptB);
      const optC = stripHtml(rawOptC);
      const optD = stripHtml(rawOptD);

      const marks = getNumber(question.posMarks);
      const negMarksRaw =
        getFiniteNumber(question.negMarks) ??
        getFiniteNumber(question.negativeMarks) ??
        getFiniteNumber(question.minusMarks) ??
        answerInfo?.negativeMarks ??
        null;

      const questionTopic = extractTopicInfo(question);
      const topicSubject = answerInfo?.topicSubject || questionTopic.topicSubject;
      const topicCategory = answerInfo?.topicCategory || questionTopic.topicCategory;

      rows.push({
        question_number: index,
        question_text: questionText,
        option_a: optA,
        option_b: optB,
        option_c: optC,
        option_d: optD,
        correct_option:
          answerInfo?.correctOption || extractCorrectOption(question),
        solution_text: answerInfo?.solutionText || "",
        topic_subject: topicSubject,
        topic_category: topicCategory,
        difficulty: "",
        marks,
        negative_marks: negMarksRaw ?? "",
      });

      index += 1;
    }
  }

  return rows;
}
