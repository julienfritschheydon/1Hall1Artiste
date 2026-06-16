import React from 'react';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { QRCode } from '@/components/QRCode';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';

const QRCodePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <PageContainer>
      <PageHeader
        title="QR Code 1Hall1Artiste"
        subtitle="Partagez l'adresse facilement"
      />
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 px-4">
        <div className="max-w-md w-full">
          <QRCode
            url="https://www.1hall1artiste.fr"
            title="1hall1artiste"
            size={300}
            level="H"
            includeDownload
          />
        </div>

        <div className="text-center max-w-sm">
          <p className="text-lg font-medium text-[#1a2138] mb-2">
            www.1hall1artiste.fr
          </p>
          <p className="text-sm text-gray-600">
            Scannez ce code QR pour accéder au site
          </p>
        </div>

        <Button
          onClick={() => navigate(-1)}
          variant="outline"
          className="flex items-center gap-2 mt-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>
    </PageContainer>
  );
};

export default QRCodePage;
