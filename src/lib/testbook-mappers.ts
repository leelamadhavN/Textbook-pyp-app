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
  hellip: "...",
  ldquo: '"',
  lsquo: "'",
  lt: "<",
  mdash: "-",
  minus: "-",
  nbsp: " ",
  ndash: "-",
  quot: '"',
  rdquo: '"',
  rsquo: "'",
  shy: "",
  thinsp: " ",
  times: "x",
  zwj: "",
  zwnj: "",
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
  img: new Set(["alt", "src", "title"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

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

function stripTags(input: string): string {
  return input
    .replace(/<script\b[^<>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^<>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr|td|th|h[1-6]|ul|ol|table)>/gi, " ")
    .replace(/<\/?[a-z][^<>]*>/gi, " ");
}

function stripUnsafeHtml(input: string): string {
  return input
    .replace(/<script\b[^<>]*>[\s\S]*?<\/script>/gi, " ")
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

function normalizeHtmlContent(input: string): string {
  return normalizePlainText(simplifyHtmlMarkup(stripUnsafeHtml(decodeRepeatedHtmlEntities(input))));
}

function stripHtml(input: string): string {
  const text = normalizeHtmlContent(input);

  // Preserve <img> tags so image-based options render correctly in examprep
  // Replace with placeholders, strip everything else, then restore
  const imgTags: string[] = [];
  const withPlaceholders = text.replace(
    /<img\s[^>]*src\s*=\s*"([^"]*)"[^>]*\/?>/gi,
    (match, src) => {
      // Fix protocol-relative URLs (//cdn.testbook.com/... → https://cdn.testbook.com/...)
      const fixedSrc = (src as string).startsWith("//")
        ? `https:${src}`
        : (src as string);
      imgTags.push(`<img src="${fixedSrc}"/>`);
      return `__IMG_PLACEHOLDER_${imgTags.length - 1}__`;
    },
  );

  const stripped = normalizePlainText(stripTags(withPlaceholders));

  // Restore img tags
  return stripped.replace(
    /__IMG_PLACEHOLDER_(\d+)__/g,
    (_, idx) => imgTags[parseInt(idx as string)] ?? "",
  );
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
    const text = normalizeHtmlContent(candidate);
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
    ]) || normalizeHtmlContent(getString(answerObj.val))
  );
}

function extractQuestionText(en: AnyObject): string {
  const compText =
    getString(en.comp) ||
    getString(en.comprehension) ||
    getString(en.passage) ||
    getString(en.paragraph);
  const questionText = getString(en.value);

  return normalizeHtmlContent(compText ? `${compText} ${questionText}` : questionText);
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

      const rawQuestionText = extractQuestionText(en);
      const rawOptA = extractOptionValue(options[0]);
      const rawOptB = extractOptionValue(options[1]);
      const rawOptC = extractOptionValue(options[2]);
      const rawOptD = extractOptionValue(options[3]);

      // Skip questions that don't have English content
      // (e.g., Hindi-only questions in bilingual papers like SSC GD)
      if (!hasEnglishContent([rawQuestionText, rawOptA, rawOptB, rawOptC, rawOptD])) {
        continue;
      }

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
        question_text: rawQuestionText,
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
