import fs from 'fs';

// Firebase overrides
const firebaseOverrides = {
  "semaphore-omega": {
    facebook: "https://www.facebook.com/semaphoreomega/",
    instagram: "",
    presentation: "Lectures poétiques en musique ;\n\nOlivier Bardoul – Voix, textes\nJean-Yves Redor – Didgeridoo\n\nUn spectacle où la poésie devient souffle, onde, vibration.\nLectures mises en scène et paysage sonore s'entrelacent pour créer une expérience sensible et immersive.\n\nDes textes originaux portés par des vagues musicales, entre intime, engagement et décalage.\nVoix, didgeridoo et rythmes tissent un univers libre, hypnotique et habité.\n\nUn espace de jeu et de partage, où mots, sons et émotions dialoguent dans une énergie vivante et vibrante.",
    thumbnail: "https://res.cloudinary.com/dpatqkgsc/image/upload/v1781600935/ez8k1rqg6v0vhnvua27k.jpg",
  }
};

// Slugify
function slugify(str) {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

// Simple but robust CSV parser
function parseCSV(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' && !inQuotes) {
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine) lines.push(currentLine);

  // Parse header and rows
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());

  return values.map(v => v.replace(/^"|"$/g, ''));
}

// Main
const content = fs.readFileSync('./concerts_sheet_export.csv', 'utf-8');
const { headers, rows } = parseCSV(content);

// Ensure Horaires column exists
if (!headers.includes('Horaires')) {
  const idx = headers.indexOf('Liens vers une photo') + 1;
  headers.splice(idx, 0, 'Horaires');
}

// Process rows
const processed = rows.map(row => {
  const groupe = row['Nom du groupe'] || '';
  const slug = slugify(groupe);
  const override = firebaseOverrides[slug];

  // Add Horaires
  row['Horaires'] = (row['Horaires Samedi'] || row['Horaires Dimanche'] || '').trim();

  // Apply overrides
  if (override) {
    if (override.presentation) row['Présentation'] = override.presentation;
    if (override.instagram) row['Compte Instagram'] = override.instagram;
    if (override.facebook) row['Compte Facebook'] = override.facebook;
    if (override.website) row['Site internet'] = override.website;
    if (override.thumbnail) row['Liens vers une photo'] = override.thumbnail;
    console.log(`✅ ${groupe}`);
  }

  return row;
});

// Export CSV
function escapeCSV(val) {
  if (!val) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const output = [headers.join(',')];
for (const row of processed) {
  const values = headers.map(h => escapeCSV(row[h]));
  output.push(values.join(','));
}

fs.writeFileSync('./concerts2026_raw.csv', output.join('\n'), 'utf-8');

console.log(`\n✅ Done: ${processed.length} rows, ${headers.length} cols`);
