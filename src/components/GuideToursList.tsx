// Liste des visites pour guide
import { Tour } from "../types/visitTypes";

interface GuideTourListProps {
  tours: Tour[];
  onSelectTour: (tourId: string) => void;
}

export default function GuideToursList({ tours, onSelectTour }: GuideTourListProps) {
  const sortedTours = [...tours].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sortedTours.map((tour) => {
        const status =
          new Date(tour.date) > new Date() ? "upcoming" : new Date(tour.date) < new Date() ? "completed" : "ongoing";
        const statusLabel =
          status === "upcoming" ? "À venir" : status === "completed" ? "Terminée" : "En cours";
        const statusColor =
          status === "upcoming" ? "bg-blue-100" : status === "completed" ? "bg-gray-100" : "bg-green-100";

        return (
          <div
            key={tour.id}
            onClick={() => onSelectTour(tour.id)}
            className="border rounded-lg p-4 cursor-pointer hover:shadow-md transition"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-lg">{tour.title}</h3>
              <span className={`text-xs px-2 py-1 rounded ${statusColor}`}>{statusLabel}</span>
            </div>

            <p className="text-sm text-gray-600 mb-2">
              {new Date(tour.date).toLocaleDateString("fr-FR")} •{" "}
              {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>

            <p className="text-sm text-gray-600 mb-2">Durée: {tour.durationMinutes} min</p>

            <p className="text-sm font-semibold">Capacité: {tour.capacity}</p>

            <div className="mt-3 text-xs text-gray-500">Cliquez pour voir les inscrits et faire l'appel</div>
          </div>
        );
      })}
    </div>
  );
}
