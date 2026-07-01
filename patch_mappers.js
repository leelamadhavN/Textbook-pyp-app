const fs = require('fs');
const file = 'src/lib/testbook-mappers.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `function isNonPreviousYearTitle(title: string): boolean {
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
}`;

const replacement = `function isNonPreviousYearTitle(title: string): boolean {
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
    "civil services mains",
  ];

  return blockedPhrases.some((phrase) => normalized.includes(phrase));
}`;

if (code.includes('normalizeCorrectOption(raw: unknown): string')) {
  // It was removed entirely! We need to add it back.
  if (!code.includes('isNonPreviousYearTitle')) {
      code = code.replace('function normalizeCorrectOption', replacement + '\n\nfunction normalizeCorrectOption');
  } else {
      code = code.replace(target, replacement);
  }
}
fs.writeFileSync(file, code);
