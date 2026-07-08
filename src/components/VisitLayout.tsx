// Layout commun des pages Visites Guidées — aligné au design du site
// (fond parchemin + voile blanc + header BackButton/titre orange + BottomNavigation).
import React from "react";
import { IMAGE_PATHS } from "../constants/imagePaths";
import { BackButton } from "@/components/ui/BackButton";
import { ShareButton } from "@/components/ShareButton";
import { BottomNavigation } from "@/components/BottomNavigation";

interface VisitLayoutProps {
  title: string;
  onBack?: () => void;
  backTo?: string;
  /** Bouton de partage à droite du header (pages publiques) */
  share?: { title: string; text: string };
  /** Contenu personnalisé à droite du header (ex: boutons guide) — remplace share */
  headerRight?: React.ReactNode;
  /** Masquer la barre de navigation basse (ex: pages de validation) */
  hideNav?: boolean;
  children: React.ReactNode;
}

export const VisitLayout: React.FC<VisitLayoutProps> = ({
  title,
  onBack,
  backTo = "/map",
  share,
  headerRight,
  hideNav,
  children,
}) => {
  return (
    <div
      className="min-h-screen pb-24 px-4 pt-4 overflow-x-hidden"
      style={{
        backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.PARCHMENT}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "scroll",
      }}
    >
      <div className="absolute inset-0 bg-white/20 pointer-events-none" />

      <div className="relative z-10 max-w-screen-lg mx-auto">
        <header className="mb-4 flex items-center justify-between gap-2">
          {onBack ? <BackButton onClick={onBack} /> : <BackButton to={backTo} />}
          <h1 className="text-xl md:text-2xl font-bold text-[#ff7a45] text-center flex-1 truncate">
            {title}
          </h1>
          {headerRight ? (
            <div className="flex items-center gap-2">{headerRight}</div>
          ) : share ? (
            <ShareButton title={share.title} text={share.text} />
          ) : (
            <div className="h-10 w-10" />
          )}
        </header>

        {children}
      </div>

      {!hideNav && <BottomNavigation />}
    </div>
  );
};
