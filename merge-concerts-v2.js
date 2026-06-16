import fs from 'fs';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

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

// Read and parse CSV
const input = fs.createReadStream('./concerts_sheet_export.csv');
const parser = parse({ columns: true, skip_empty_lines: true });

const rows = [];
parser.on('readable', function() {
  let row;
  while ((row = parser.read()) !== null) {
    rows.push(row);
  }
});

parser.on('error', (err) => {
  console.error('Parser error:', err);
});

parser.on('end', () => {
  const headers = Object.keys(rows[0] || {});

  // Add "Horaires" if missing
  if (!headers.includes('Horaires')) {
    const horaireIdx = Math.max(headers.indexOf('Liens vers une photo'), 0) + 1;
    headers.splice(horaireIdx, 0, 'Horaires');
  }

  // Process rows
  const processedRows = rows.map(row => {
    const groupe = row['Nom du groupe'] || '';
    const slug = slugify(groupe);
    const override = firebaseOverrides[slug];

    // Add Horaires (take first non-empty)
    row['Horaires'] = (row['Horaires Samedi'] || row['Horaires Dimanche'] || '').trim();

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

  // Export CSV with proper escaping
  function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const csvLines = [headers.join(',')];
  for (const row of processedRows) {
    const values = headers.map(h => escapeCSV(row[h]));
    csvLines.push(values.join(','));
  }

  fs.writeFileSync('./concerts2026_raw.csv', csvLines.join('\n'), 'utf-8');

  console.log(`\n✅ Merged CSV saved: concerts2026_raw.csv`);
  console.log(`Rows: ${processedRows.length}`);
  console.log(`Columns: ${headers.length}`);
});

input.pipe(parser);
