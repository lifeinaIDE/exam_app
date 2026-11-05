import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCavsAFzU77yWfqNM6wdb_WrdjeyYYILPI",
  authDomain: "exam-app-ccc1c.firebaseapp.com",
  projectId: "exam-app-ccc1c",
  storageBucket: "exam-app-ccc1c.firebasestorage.app",
  messagingSenderId: "400532147089",
  appId: "1:400532147089:web:710e323d33977663daa830"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

async function clearExistingData() {
  console.log("Clearing existing questions and domains...");
  const domainsSnap = await getDocs(collection(db, 'domains'));
  for (const doc of domainsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  const questionsSnap = await getDocs(collection(db, 'questions'));
  for (const doc of questionsSnap.docs) {
    await deleteDoc(doc.ref);
  }
  console.log("Existing data cleared.");
}

async function run() {
  await clearExistingData();

  const fileContent = fs.readFileSync('../Questions_Template.csv', 'utf8');
  const lines = fileContent.split(/\r?\n/).filter(l => l.trim().length > 0);

  const optMapping = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 9) continue;

    const qNo = parseInt(cols[0]) || i;
    const text = cols[1];
    const options = [cols[2], cols[3], cols[4], cols[5]];
    const correctOptChar = cols[6].toUpperCase().trim();
    const correctOptIndex = optMapping[correctOptChar] !== undefined ? optMapping[correctOptChar] : 0;
    const correctAnswer = cols[7] || options[correctOptIndex];
    const sourceArticle = cols[8] || '';

    await addDoc(collection(db, 'questions'), {
      qNo,
      text,
      options,
      correctOption: correctOptIndex,
      correctAnswer,
      sourceArticle,
      marks: 1
    });

    count++;
    if (count % 10 === 0) {
      console.log(`Uploaded ${count} questions...`);
    }
  }

  console.log(`Seeding complete! Uploaded ${count} questions to Firebase Firestore.`);
  process.exit(0);
}

run().catch(err => {
  console.error("Error during seeding:", err);
  process.exit(1);
});
