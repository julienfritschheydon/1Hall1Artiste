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

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
}

// Robust CSV parser that handles quoted fields with line breaks
function parseCSVRobust(content) {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      current += char;
    } else if (char === '\n' && !inQuotes) {
      lines.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current) lines.push(current);

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Parse data rows
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
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));

  return values;
}

// Main
const content = fs.readFileSync('./concerts_sheet_export.csv', 'utf-8');
const { headers, rows } = parseCSVRobust(content);

console.log(`✅ Parsed: ${rows.length} rows, ${headers.length} headers`);

// Add Horaires column
const photoIdx = headers.indexOf('Liens vers une photo');
headers.splice(photoIdx + 1, 0, 'Horaires');

// Process rows
const output = [headers.join(',')];

for (const row of rows) {
  const groupe = row['Nom du groupe'] || '';
  if (!groupe) continue;

  const slug = slugify(groupe);
  const override = firebaseOverrides[slug];

  // Compute Horaires (Samedi if Samedi=Oui, else Dimanche)
  const samedi = (row['Samedi'] || '').trim() === 'Oui';
  const horairesSamedi = (row['Horaires Samedi'] || '').trim();
  const horairesDimanche = (row['Horaires Dimanche'] || '').trim();
  row['Horaires'] = samedi ? horairesSamedi : horairesDimanche;

  // Apply overrides
  if (override) {
    if (override.presentation) row['Présentation'] = override.presentation;
    if (override.instagram) row['Compte Instagram'] = override.instagram;
    if (override.facebook) row['Compte Facebook'] = override.facebook;
    if (override.website) row['Site internet'] = override.website;
    if (override.thumbnail) row['Liens vers une photo'] = override.thumbnail;
    console.log(`✅ ${groupe}`);
  }

  // Escape and output
  function escapeCSV(val) {
    if (!val) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  const values = headers.map(h => escapeCSV(row[h]));
  output.push(values.join(','));
}

fs.writeFileSync('./concerts2026_raw.csv', output.join('\n'), 'utf-8');

console.log(`\n✅ CSV saved: concerts2026_raw.csv`);
console.log(`Rows: ${output.length - 1}, Columns: ${headers.length}`);
