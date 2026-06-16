import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.join(__dirname, '../public');
const outputFile = path.join(outputDir, '1hall1artiste-qr.png');

const url = 'https://www.1hall1artiste.fr';

QRCode.toFile(
  outputFile,
  url,
  {
    width: 300,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  },
  (err) => {
    if (err) {
      console.error('❌ Erreur lors de la génération du QR code:', err);
      process.exit(1);
    }
    console.log(`✅ QR code généré: ${outputFile}`);
    console.log(`📱 URL: ${url}`);
  }
);
