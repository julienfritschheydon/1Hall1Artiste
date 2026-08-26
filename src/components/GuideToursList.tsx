// Liste des visites pour guide
import { Tour } from "../types/visitTypes";

interface GuideTourListProps {
  tours: Tour[];
  onSelectTour: (tourId: string) => void;
}

// « En cours » = entre le départ et la fin (départ + durée). L'ancien calcul
// exigeait une égalité à la milliseconde : une visite en train de se dérouler —
// le moment précis où le guide fait l'appel — s'affichait « Terminée ».
export function tourStatus(tour: Tour, now: number): "upcoming" | "ongoing" | "completed" {
  const start = new Date(tour.date).getTime();
  const end = start + (tour.durationMinutes || 0) * 60 * 1000;
  return now < start ? "upcoming" : now <= end ? "ongoing" : "completed";
}

export default function GuideToursList({ tours, onSelectTour }: GuideTourListProps) {
  const now = Date.now();
  // Visites à venir/en cours d'abord (chronologique), les terminées à la fin.
  const sortedTours = [...tours].sort((a, b) => {
    const aDone = tourStatus(a, now) === "completed" ? 1 : 0;
    const bDone = tourStatus(b, now) === "completed" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sortedTours.map((tour) => {
        const status = tourStatus(tour, now);
        const statusLabel =
          status === "upcoming" ? "À venir" : status === "completed" ? "Terminée" : "En cours";
        const statusColor =
          status === "upcoming" ? "bg-amber-100 text-amber-800" : status === "completed" ? "bg-[#f3f0e6] text-[#7a6f4d]" : "bg-green-100 text-green-700";

        return (
          <div
            key={tour.id}
            onClick={() => onSelectTour(tour.id)}
            className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 rounded-xl p-4 cursor-pointer transition hover:-translate-y-0.5 hover:shadow-xl shadow-lg"
          >
            <div className="flex justify-between items-start mb-2 gap-2">
              <h3 className="font-bold text-lg text-[#1a2138]">{tour.title}</h3>
              <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${statusColor}`}>{statusLabel}</span>
            </div>

            <p className="text-sm text-gray-600 mb-2">
              {new Date(tour.date).toLocaleDateString("fr-FR")} •{" "}
              {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>

            <p className="text-sm text-gray-600 mb-2">Durée : {tour.durationMinutes} min</p>

            <p className="text-sm font-semibold text-[#1a2138]">
              Places : {tour.placesLeft ?? tour.capacity}/{tour.capacity}
            </p>

            <div className="mt-3 text-xs font-semibold" style={{ color: "#ff7a45" }}>
              Voir les inscrits &amp; faire l'appel ›
            </div>
          </div>
        );
      })}
    </div>
  );
}
