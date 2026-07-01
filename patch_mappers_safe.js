const fs = require('fs');
const file = 'src/lib/testbook-mappers.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `  const blockedPhrases = [
    "last 12 months report",
    "report and index",
    "practice questions",
    "important government schemes",
    "government schemes",
    "current affairs",
    "editorial",
  ];`;

const replacement = `  const blockedPhrases = [
    "last 12 months report",
    "report and index",
    "practice questions",
    "important government schemes",
    "government schemes",
    "current affairs",
    "editorial",
    "civil services mains",
  ];`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
