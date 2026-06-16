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

// Read input file
const input = fs.readFileSync('./concerts_sheet_export.csv', 'utf-8');
const lines = input.split('\n');

// Parse headers
const headerLine = lines[0];
const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

// Find column indices
const indices = {
  groupe: headers.indexOf('Nom du groupe'),
  presentation: headers.indexOf('Présentation'),
  instagram: headers.indexOf('Compte Instagram'),
  facebook: headers.indexOf('Compte Facebook'),
  website: headers.indexOf('Site internet'),
  photo: headers.indexOf('Liens vers une photo'),
  samedi: headers.indexOf('Samedi'),
  horairesSamedi: headers.indexOf('Horaires Samedi'),
  dimanche: headers.indexOf('Dimanche'),
  horairesDimanche: headers.indexOf('Horaires Dimanche'),
};

// Add "Horaires" to headers (after Liens vers une photo)
const photoIdx = indices.photo;
headers.splice(photoIdx + 1, 0, 'Horaires');

// Process data rows
const output = [headers.join(',')];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Simple field extraction (assumes no unescaped quotes in values)
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    const nextChar = line[j + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        j++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());

  // Create row object
  const row = {};
  for (let j = 0; j < headers.length - 1; j++) { // -1 because we added Horaires
    const headerName = j < photoIdx + 1 ? headers[j] : headers[j + 1];
    row[headerName] = fields[j] ? fields[j].replace(/^"|"$/g, '') : '';
  }

  // Compute Horaires
  const samedi = row['Samedi'] === 'Oui';
  const dimanche = row['Dimanche'] === 'Oui';
  const horairesSamedi = (row['Horaires Samedi'] || '').trim();
  const horairesDimanche = (row['Horaires Dimanche'] || '').trim();

  row['Horaires'] = samedi ? horairesSamedi : horairesDimanche;

  // Apply Firebase overrides
  const groupe = row['Nom du groupe'] || '';
  const slug = slugify(groupe);
  const override = firebaseOverrides[slug];

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

// Write output
fs.writeFileSync('./concerts2026_raw.csv', output.join('\n'), 'utf-8');

console.log(`\n✅ CSV built: concerts2026_raw.csv`);
console.log(`Rows: ${output.length - 1}`);
console.log(`Columns: ${headers.length}`);
