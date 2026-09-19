// Liste des visites pour guide
import { useState } from "react";
import { Tour } from "../types/visitTypes";
import { groupToursByStatus, tourStatus, TOUR_STATUS_LABELS } from "@/utils/tourStatus";

// Réexport historique : plusieurs écrans importaient tourStatus ici.
export { tourStatus } from "@/utils/tourStatus";

interface GuideTourListProps {
  tours: Tour[];
  registrationCounts?: Record<string, number>;
  onSelectTour: (tourId: string) => void;
}

export default function GuideToursList({ tours, registrationCounts, onSelectTour }: GuideTourListProps) {
  const now = Date.now();
  // Pendant le festival, l'historique n'est pas ce qu'on vient chercher : la
  // section « Passées » s'ouvre à la demande.
  const [showPast, setShowPast] = useState(false);
  const sections = groupToursByStatus(tours, now);

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.status}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[#5b5340]">
              {section.title} ({section.tours.length})
            </h2>
            {section.status === "completed" && (
              <button
                onClick={() => setShowPast((v) => !v)}
                className="text-xs font-semibold text-[#ff7a45]"
              >
                {showPast ? "Masquer" : "Afficher"}
              </button>
            )}
          </div>
          {section.status === "completed" && !showPast ? null : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {section.tours.map((tour) => {
        const status = tourStatus(tour, now);
        const statusLabel = TOUR_STATUS_LABELS[status];
        const statusColor =
          status === "upcoming" ? "bg-amber-100 text-amber-800" : status === "completed" ? "bg-[#f3f0e6] text-[#7a6f4d]" : "bg-green-100 text-green-700";
        const placesLeft = tour.placesLeft ?? tour.capacity;
        const filled = registrationCounts
          ? (registrationCounts[tour.id] ?? 0)
          : (tour.placesLeft != null ? tour.capacity - tour.placesLeft : 0);
        const isFull = placesLeft <= 0;
        const isEmpty = filled === 0;

        return (
          <div
            key={tour.id}
            onClick={() => onSelectTour(tour.id)}
            className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 rounded-xl p-4 cursor-pointer transition hover:-translate-y-0.5 hover:shadow-xl shadow-lg"
          >
            <div className="flex justify-between items-start mb-2 gap-2">
              <h3 className={`font-bold text-lg ${isFull && status === "upcoming" ? "text-gray-400 line-through" : "text-[#1a2138]"}`}>
                {tour.title}
              </h3>
              <div className="flex flex-col items-end gap-1">
                <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${statusColor}`}>{statusLabel}</span>
                {isEmpty && (
                  <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap bg-slate-100 text-slate-700 border border-slate-300 font-medium">
                    Aucun inscrit
                  </span>
                )}
                {isFull && status === "upcoming" && (
                  <span className="text-xs px-2 py-1 rounded-full whitespace-nowrap bg-red-100 text-red-700 font-bold uppercase">
                    Complet
                  </span>
                )}
              </div>
            </div>

            {tour.guides && tour.guides.length > 0 && (
              <p className="text-xs text-[#7a6f4d] mb-1">Animé par {tour.guides.join(", ")}</p>
            )}
            <p className="text-sm text-gray-600 mb-2">
              {new Date(tour.date).toLocaleDateString("fr-FR")} •{" "}
              {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>

            <p className="text-sm text-gray-600 mb-2">Durée : {tour.durationMinutes} min</p>

            {/* Une visite commencée n'accepte plus personne (l'API refuse) :
                annoncer des places libres induisait le guide en erreur. */}
            {status === "upcoming" ? (
              <>
                <p className={`text-sm font-semibold ${isFull ? "text-red-600" : isEmpty ? "text-slate-600" : "text-[#1a2138]"}`}>
                  Places libres : {placesLeft}/{tour.capacity} {isEmpty && <span className="font-normal text-xs text-slate-500">(aucun inscrit)</span>}
                </p>
                {isFull && (
                  <p className="mt-1 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2 py-1 inline-block">
                    Voir la liste d'attente
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm font-semibold text-[#1a2138]">
                Inscrits : {filled}/{tour.capacity}
              </p>
            )}

            <div className="mt-3 text-xs font-semibold" style={{ color: "#ff7a45" }}>
              Voir les inscrits &amp; faire l'appel ›
            </div>
          </div>
        );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
