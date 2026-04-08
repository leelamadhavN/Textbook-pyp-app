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
  difficulty: string;
  marks: number | string;
  negative_marks: number | string;
};

export type AnswerByQuestionId = Record<
  string,
  {
    correctOption: string;
    solutionText: string;
  }
>;

type AnyObject = Record<string, unknown>;

const EXCEL_CELL_CHAR_LIMIT = 32767;

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clampExcelText(input: string): string {
  if (!input) return "";
  if (input.length <= EXCEL_CELL_CHAR_LIMIT) return input;
  return input.slice(0, EXCEL_CELL_CHAR_LIMIT - 3) + "...";
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

function extractCorrectOption(question: AnyObject): string {
  return normalizeCorrectOption(
    question.correctOption ??
      question.correctAns ??
      question.correctAnswer ??
      question.answer ??
      question.answers ??
      question.key ??
      question.ans,
  );
}

export function mapAnswerLookup(payload: AnyObject): AnswerByQuestionId {
  const data = (payload.data ?? {}) as AnyObject;
  const lookup: AnswerByQuestionId = {};

  for (const [questionId, answerValue] of Object.entries(data)) {
    if (!questionId || !answerValue || typeof answerValue !== "object") continue;

    const answerObj = answerValue as AnyObject;
    const solutionObj = (answerObj.sol ?? {}) as AnyObject;
    const solutionEn = (solutionObj.en ?? {}) as AnyObject;
    const valText = stripHtml(getString(answerObj.val));
    const solutionTextFromSol = stripHtml(getString(solutionEn.value));

    lookup[questionId] = {
      correctOption: normalizeCorrectOption(answerObj.correctOption),
      solutionText: clampExcelText(solutionTextFromSol || valText),
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
      const negMarksRaw = getNumber(question.negMarks);

      rows.push({
        question_number: index,
        question_text: clampExcelText(stripHtml(getString(en.value))),
        option_a: clampExcelText(stripHtml(optA)),
        option_b: clampExcelText(stripHtml(optB)),
        option_c: clampExcelText(stripHtml(optC)),
        option_d: clampExcelText(stripHtml(optD)),
        correct_option:
          answerInfo?.correctOption || extractCorrectOption(question),
        solution_text: clampExcelText(answerInfo?.solutionText || ""),
        difficulty: "",
        marks,
        negative_marks: negMarksRaw > 0 ? negMarksRaw : "",
      });

      index += 1;
    }
  }

  return rows;
}
