import React from 'react';
import Volume2 from "lucide-react/dist/esm/icons/volume-2";
import VolumeX from "lucide-react/dist/esm/icons/volume-x";
import { useAmbianceAudio } from "@/hooks/useAmbianceAudio";

interface AudioActivatorProps {
  onAudioEnabled?: () => void;
  onAudioDisabled?: () => void;
  iconOnly?: boolean;
}

/**
 * Composant pour activer ou désactiver le son d'ambiance.
 * La logique audio est dans le hook useAmbianceAudio (état global partagé entre pages).
 */
const AudioActivator: React.FC<AudioActivatorProps> = ({
  onAudioEnabled,
  onAudioDisabled,
  iconOnly = false
}) => {
  const { isActive, toggle } = useAmbianceAudio({ onAudioEnabled, onAudioDisabled });

  if (iconOnly) {
    return (
      <button
        aria-label={isActive ? "Désactiver le son d'ambiance" : "Activer le son d'ambiance"}
        title={isActive ? "Ambiance : activée" : "Ambiance"}
        className={`h-11 w-11 flex items-center justify-center border-2 shadow-md backdrop-blur-sm ${
          isActive
            ? "bg-[#1a2138] text-white border-[#1a2138]"
            : "border-[#1a2138] text-[#1a2138] bg-white/80 hover:bg-[#1a2138] hover:text-white"
        } rounded-full transition-colors`}
        onClick={toggle}
      >
        {isActive ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>
    );
  }

  return (
    <button
      className={`h-12 border-2 ${
        isActive
          ? "bg-[#1a2138] text-white border-[#1a2138]"
          : "border-[#1a2138] text-[#1a2138] bg-transparent hover:bg-[#1a2138] hover:text-white"
      } rounded-full font-medium text-sm transition-colors px-4`}
      onClick={toggle}
    >
      Ambiance
    </button>
  );
};

export default AudioActivator;
