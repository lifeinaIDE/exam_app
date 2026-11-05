import fs from 'fs';
import path from 'path';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

const csvPath = path.resolve('../Questions_Template.csv');
const content = fs.readFileSync(csvPath, 'utf8');
const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
const optMapping = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };

const questions = [];
for (let i = 1; i < lines.length; i++) {
  const cols = parseCSVLine(lines[i]);
  if (cols.length < 9) continue;
  const qNo = parseInt(cols[0]) || i;
  const text = cols[1];
  const options = [cols[2], cols[3], cols[4], cols[5]];
  const correctOptChar = cols[6].toUpperCase().trim();
  const correctOption = optMapping[correctOptChar] !== undefined ? optMapping[correctOptChar] : 0;
  const correctAnswer = cols[7] || options[correctOption];
  const sourceArticle = cols[8] || '';

  questions.push({
    id: 'q_' + qNo,
    qNo,
    text,
    options,
    correctOption,
    correctAnswer,
    sourceArticle,
    marks: 1
  });
}

const outDir = path.resolve('./src/data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
const outPath = path.join(outDir, 'questions.json');
fs.writeFileSync(outPath, JSON.stringify(questions, null, 2), 'utf8');
console.log(`Successfully generated ${questions.length} questions in ${outPath}`);

