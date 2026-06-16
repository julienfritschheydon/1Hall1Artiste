import fs from 'fs';
import path from 'path';

// Firebase overrides
const firebaseOverrides = {
  "semaphore-omega": {
    facebook: "https://www.facebook.com/semaphoreomega/",
    instagram: "",
    presentation: "Lectures poétiques en musique ;\n\nOlivier Bardoul – Voix, textes\nJean-Yves Redor – Didgeridoo\n\nUn spectacle où la poésie devient souffle, onde, vibration.\nLectures mises en scène et paysage sonore s'entrelacent pour créer une expérience sensible et immersive.\n\nDes textes originaux portés par des vagues musicales, entre intime, engagement et décalage.\nVoix, didgeridoo et rythmes tissent un univers libre, hypnotique et habité.\n\nUn espace de jeu et de partage, où mots, sons et émotions dialoguent dans une énergie vivante et vibrante.",
    thumbnail: "https://res.cloudinary.com/dpatqkgsc/image/upload/v1781600935/ez8k1rqg6v0vhnvua27k.jpg",
  }
};

// Slugify function
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Parse CSV
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // Simple CSV parse (handles quoted fields)
    const row = {};
    let current = '';
    let inQuotes = false;
    let colIndex = 0;

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row[headers[colIndex]] = current.trim().replace(/^"|"$/g, '');
        current = '';
        colIndex++;
      } else {
        current += char;
      }
    }
    if (colIndex < headers.length) {
      row[headers[colIndex]] = current.trim().replace(/^"|"$/g, '');
    }

    rows.push(row);
  }

  return { headers, rows };
}

// Main
const csvPath = './concerts_sheet_export.csv';
const content = fs.readFileSync(csvPath, 'utf-8');
const { headers, rows } = parseCSV(content);

// Add "Horaires" column if not exists
if (!headers.includes('Horaires')) {
  headers.splice(9, 0, 'Horaires'); // Insert after "Liens vers une photo"
}

// Process rows
const newRows = rows.map(row => {
  const groupe = row['Nom du groupe'] || '';
  const slug = slugify(groupe);
  const override = firebaseOverrides[slug];

  // Add Horaires column
  const horaires = (row['Horaires Samedi'] || row['Horaires Dimanche'] || '').trim();
  row['Horaires'] = horaires;

  // Apply Firebase overrides
  if (override) {
    if (override.presentation && override.presentation.trim()) {
      row['Présentation'] = override.presentation;
    }
    if (override.instagram && override.instagram.trim()) {
      row['Compte Instagram'] = override.instagram;
    }
    if (override.facebook && override.facebook.trim()) {
      row['Compte Facebook'] = override.facebook;
    }
    if (override.website && override.website.trim()) {
      row['Site internet'] = override.website;
    }
    if (override.thumbnail && override.thumbnail.trim()) {
      row['Liens vers une photo'] = override.thumbnail;
    }
    console.log(`✅ Applied overrides to: ${groupe}`);
  }

  return row;
});

// Export CSV
function escapeCSV(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

const outputLines = [headers.join(',')];
for (const row of newRows) {
  const values = headers.map(h => escapeCSV(row[h] || ''));
  outputLines.push(values.join(','));
}

const outputPath = './concerts2026_raw.csv';
fs.writeFileSync(outputPath, outputLines.join('\n'), 'utf-8');

console.log(`\n✅ Merged CSV saved: ${outputPath}`);
console.log(`Rows: ${newRows.length}`);
console.log(`Columns: ${headers.length}`);
