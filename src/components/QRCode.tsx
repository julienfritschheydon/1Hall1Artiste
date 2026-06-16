import React, { useRef } from 'react';
import QRCode as QRCodeReact from 'qrcode.react';
import { Button } from '@/components/ui/button';
import Download from 'lucide-react/dist/esm/icons/download';

export interface QRCodeProps {
  url: string;
  title?: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  includeDownload?: boolean;
  className?: string;
}

export const QRCode: React.FC<QRCodeProps> = ({
  url,
  title = 'QR Code',
  size = 256,
  level = 'M',
  includeDownload = true,
  className = '',
}) => {
  const qrRef = useRef<HTMLDivElement>(null);

  const handleDownload = () => {
    const qrElement = qrRef.current?.querySelector('canvas');
    if (qrElement) {
      const link = document.createElement('a');
      link.href = qrElement.toDataURL('image/png');
      link.download = `${title.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
      link.click();
    }
  };

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      <div
        ref={qrRef}
        className="p-4 bg-white rounded-lg border-2 border-gray-200"
      >
        <QRCodeReact
          value={url}
          size={size}
          level={level}
          includeMargin
          quietZone={10}
        />
      </div>
      {includeDownload && (
        <Button
          onClick={handleDownload}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Télécharger
        </Button>
      )}
    </div>
  );
};

export default QRCode;
