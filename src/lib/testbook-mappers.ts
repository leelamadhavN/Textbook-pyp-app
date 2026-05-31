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
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|tr|td|th|h[1-6]|ul|ol|table)>/gi, " ")
    .replace(/<\/?[a-z][^>]*>/gi, " ");
}

function stripUnsafeHtml(input: string): string {
  return input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
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
  return normalizePlainText(stripUnsafeHtml(decodeRepeatedHtmlEntities(input)));
}

function stripHtml(input: string): string {
  const text = normalizeHtmlContent(input);
  return normalizePlainText(stripTags(text));
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
      const options = (en.options ?? []) as AnyObject[];
      const questionId = getString(question._id);
      const answerInfo = answersLookup[questionId];

      const optA = getString((options[0] ?? {}).value);
      const optB = getString((options[1] ?? {}).value);
      const optC = getString((options[2] ?? {}).value);
      const optD = getString((options[3] ?? {}).value);

      const marks = getNumber(question.posMarks);
      const negMarksRaw =
        getFiniteNumber(question.negMarks) ??
        getFiniteNumber(question.negativeMarks) ??
        getFiniteNumber(question.minusMarks) ??
        answerInfo?.negativeMarks ??
        null;

      rows.push({
        question_number: index,
        question_text: extractQuestionText(en),
        option_a: stripHtml(optA),
        option_b: stripHtml(optB),
        option_c: stripHtml(optC),
        option_d: stripHtml(optD),
        correct_option:
          answerInfo?.correctOption || extractCorrectOption(question),
        solution_text: answerInfo?.solutionText || "",
        topic_subject: answerInfo?.topicSubject || "",
        topic_category: answerInfo?.topicCategory || "",
        difficulty: "",
        marks,
        negative_marks: negMarksRaw ?? "",
      });

      index += 1;
    }
  }

  return rows;
}
