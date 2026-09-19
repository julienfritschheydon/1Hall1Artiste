import { useState } from "react";
import { Tour } from "../types/visitTypes";
import { VisitAggregationStats } from "../utils/visitStats";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ORANGE = "#ff7a45";

interface GuideDashboardStats {
  totalTours: number;
  totalRegistrations: number;
  averageFillRate: number;
  totalWaitlist: number;
  atRiskCount: number;
  emptyToursCount: number;
  uniqueAttendeesCount: number;
  multiVisitAttendeesCount: number;
}

function calcStats(
  tours: Tour[],
  registrationCounts: Record<string, number>,
  waitlistCounts: Record<string, number>,
  aggregationStats?: VisitAggregationStats | null
): GuideDashboardStats {
  const totalTours = tours.length;
  // Les compteurs sont indexés par visite et couvrent tout le programme, alors
  // que `tours` peut être filtré (bouton « Animé par »). Sommer les Object.values
  // mélangeait les inscrits de toutes les visites avec la capacité des seules
  // visites affichées — d'où un remplissage supérieur à 100 %.
  const totalRegistrations = tours.reduce((s, t) => s + (registrationCounts[t.id] || 0), 0);
  const totalCapacity = tours.reduce((s, t) => s + t.capacity, 0);
  const averageFillRate = totalCapacity > 0 ? Math.round((totalRegistrations / totalCapacity) * 100) : 0;
  const totalWaitlist = tours.reduce((s, t) => s + (waitlistCounts[t.id] || 0), 0);
  const atRiskCount = tours.filter((t) => {
    const filled = registrationCounts[t.id] || 0;
    const remaining = t.capacity - filled;
    return remaining <= 1 && filled > 0;
  }).length;
  const emptyToursCount = tours.filter((t) => (registrationCounts[t.id] || 0) === 0).length;
  const uniqueAttendeesCount = aggregationStats?.uniqueAttendeesCount ?? 0;
  const multiVisitAttendeesCount = aggregationStats?.multiVisitAttendeesCount ?? 0;

  return {
    totalTours,
    totalRegistrations,
    averageFillRate,
    totalWaitlist,
    atRiskCount,
    emptyToursCount,
    uniqueAttendeesCount,
    multiVisitAttendeesCount,
  };
}

export default function GuideDashboard({
  tours,
  registrationCounts,
  waitlistCounts,
  aggregationStats,
  onSelectTour,
  onCreateTour,
}: {
  tours: Tour[];
  registrationCounts: Record<string, number>;
  waitlistCounts: Record<string, number>;
  aggregationStats?: VisitAggregationStats | null;
  onSelectTour: (tourId: string) => void;
  onCreateTour: () => void;
}) {
  const [showMultiModal, setShowMultiModal] = useState(false);
  const stats = calcStats(tours, registrationCounts, waitlistCounts, aggregationStats);

  const statCards = [
    {
      label: "Visites",
      value: stats.totalTours,
      subtext: stats.emptyToursCount > 0 ? `${stats.emptyToursCount} sans inscrit` : "Toutes avec inscrits",
      subtextColor: stats.emptyToursCount > 0 ? "#b45309" : "#166534",
      color: "bg-[#f3f0e6]",
    },
    {
      label: "Personnes inscrites",
      value: stats.totalRegistrations,
      subtext: stats.multiVisitAttendeesCount > 0
        ? `dont ${stats.multiVisitAttendeesCount} à 2+ visites`
        : stats.uniqueAttendeesCount > 0
        ? `${stats.uniqueAttendeesCount} inscrit(s) distinct(s)`
        : undefined,
      subtextColor: stats.multiVisitAttendeesCount > 0 ? "#1d4ed8" : "#7a6f4d",
      color: "bg-[#f3f0e6]",
      onClick: stats.multiVisitAttendeesCount > 0 ? () => setShowMultiModal(true) : undefined,
      clickable: stats.multiVisitAttendeesCount > 0,
      buttonLabel: stats.multiVisitAttendeesCount > 0 ? "Voir la liste ›" : undefined,
    },
    {
      label: "Remplissage",
      value: `${stats.averageFillRate}%`,
      subtext: `${tours.reduce((s, t) => s + t.capacity, 0)} places totales`,
      subtextColor: "#7a6f4d",
      color: "bg-[#f3f0e6]",
    },
    {
      label: "En attente",
      value: stats.totalWaitlist,
      subtext: stats.totalWaitlist > 0 ? "Personnes en attente" : undefined,
      subtextColor: "#b45309",
      color: "bg-amber-100",
    },
  ];

  const toursWithStatus = tours.map((tour) => {
    const filled = registrationCounts[tour.id] || 0;
    const remaining = tour.placesLeft ?? (tour.capacity - filled);
    const waitlist = waitlistCounts[tour.id] || 0;
    const multiTourCount = aggregationStats?.multiVisitTourCounts[tour.id] || 0;
    return { tour, filled, remaining, waitlist, multiTourCount };
  });

  const atRiskTours = toursWithStatus.filter((t) => t.remaining <= 1 && t.filled > 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "2rem" }}>
        {statCards.map((card, i) => (
          <Card
            key={i}
            className={`border-2 border-amber-300 shadow-lg ${card.clickable ? "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-xl" : ""}`}
            style={{ backgroundColor: card.color }}
            onClick={card.onClick}
          >
            <CardContent className="p-4">
              <p style={{ fontSize: "12px", color: "#7a6f4d", marginBottom: "6px", fontWeight: 500 }}>{card.label}</p>
              <p style={{ fontSize: "24px", fontWeight: 500, color: "#1a2138", margin: 0 }}>{card.value}</p>
              {card.subtext && (
                <p style={{ fontSize: "11px", color: card.subtextColor || "#7a6f4d", margin: "4px 0 0 0", fontWeight: 500 }}>
                  {card.subtext}
                </p>
              )}
              {card.buttonLabel && (
                <span style={{ fontSize: "10px", color: "#2563eb", textDecoration: "underline", display: "inline-block", marginTop: "2px" }}>
                  {card.buttonLabel}
                </span>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg mb-6">
        <CardContent className="p-6">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 500, margin: 0, color: "#1a2138" }}>Visites programmées</h3>
            <Button size="sm" className="text-white" style={{ backgroundColor: ORANGE }} onClick={onCreateTour}>
              + Créer
            </Button>
          </div>

          {tours.length === 0 ? (
            <p style={{ color: "#888780" }}>Aucune visite. Créez-en une pour commencer.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px", color: "#5b5340", borderBottom: "0.5px solid #eadfc7", fontWeight: 500, fontSize: "11px", backgroundColor: "#f4efe2" }}>
                      Jour/Heure
                    </th>
                    <th style={{ textAlign: "left", padding: "8px", color: "#5b5340", borderBottom: "0.5px solid #eadfc7", fontWeight: 500, fontSize: "11px", backgroundColor: "#f4efe2" }}>
                      Visite
                    </th>
                    <th style={{ textAlign: "center", padding: "8px", color: "#5b5340", borderBottom: "0.5px solid #eadfc7", fontWeight: 500, fontSize: "11px", backgroundColor: "#f4efe2" }}>
                      Inscrits
                    </th>
                    <th style={{ textAlign: "center", padding: "8px", color: "#5b5340", borderBottom: "0.5px solid #eadfc7", fontWeight: 500, fontSize: "11px", backgroundColor: "#f4efe2" }}>
                      Status
                    </th>
                    <th style={{ textAlign: "center", padding: "8px", color: "#5b5340", borderBottom: "0.5px solid #eadfc7", fontWeight: 500, fontSize: "11px", backgroundColor: "#f4efe2" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {toursWithStatus.map(({ tour, filled, remaining, waitlist, multiTourCount }) => (
                    <tr
                      key={tour.id}
                      style={{
                        borderBottom: "0.5px solid #eadfc7",
                        cursor: "pointer",
                        backgroundColor: filled === 0 ? "#faf8f5" : undefined,
                      }}
                      className="hover:bg-amber-50/60 transition-colors"
                      onClick={() => onSelectTour(tour.id)}
                    >
                      <td style={{ padding: "8px", color: "#1a2138" }}>
                        {new Date(tour.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "8px", color: "#1a2138" }}>{tour.title}</td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {filled === 0 ? (
                          <span style={{ color: "#94a3b8", fontWeight: 400 }}>0/{tour.capacity}</span>
                        ) : (
                          <div>
                            <span style={{ color: "#1a2138", fontWeight: 600 }}>{filled}/{tour.capacity}</span>
                            {multiTourCount > 0 && (
                              <div>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    color: "#1d4ed8",
                                    backgroundColor: "#eff6ff",
                                    borderRadius: "9999px",
                                    padding: "1px 6px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "2px",
                                    marginTop: "2px",
                                    border: "1px solid #bfdbfe",
                                    whiteSpace: "nowrap",
                                    fontWeight: 500,
                                  }}
                                  title={`${multiTourCount} participant${multiTourCount > 1 ? "s inscrits" : " inscrit"} à ce créneau participe${multiTourCount > 1 ? "nt" : ""} aussi à au moins une autre visite`}
                                >
                                  👥 {multiTourCount} multi
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {filled === 0 ? (
                          <span
                            style={{
                              display: "inline-block",
                              backgroundColor: "#f1f5f9",
                              color: "#475569",
                              border: "1px solid #cbd5e1",
                              padding: "3px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 500,
                            }}
                            title={`${tour.capacity} places disponibles (aucun inscrit)`}
                          >
                            Aucun inscrit
                          </span>
                        ) : remaining === 0 ? (
                          <span style={{ display: "inline-block", backgroundColor: "#dcfce7", color: "#166534", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                            Complet
                          </span>
                        ) : remaining <= 1 ? (
                          <span style={{ display: "inline-block", backgroundColor: "#fecaca", color: "#991b1b", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                            Dernier
                          </span>
                        ) : (
                          <span style={{ display: "inline-block", backgroundColor: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 500 }}>
                            {remaining} places
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", color: "#888780", fontSize: "12px" }}>
                        {waitlist > 0 && `${waitlist} attente`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6">
            <h4 style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 12px", color: "#1a2138" }}>À risque</h4>
            {atRiskTours.length === 0 ? (
              <p style={{ fontSize: "12px", color: "#888780", margin: 0 }}>✓ Aucune visite critique. Toutes ont au moins 1 place libre.</p>
            ) : (
              <ul style={{ fontSize: "12px", color: "#666", margin: 0, paddingLeft: "20px" }}>
                {atRiskTours.map(({ tour, remaining }) => (
                  <li key={tour.id} style={{ marginBottom: "6px" }}>
                    {tour.title} ({remaining} place{remaining > 1 ? "s" : ""})
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6">
            <h4 style={{ fontSize: "14px", fontWeight: 500, margin: "0 0 12px", color: "#1a2138" }}>Actions rapides</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }}>
              {stats.multiVisitAttendeesCount > 0 && (
                <button
                  onClick={() => setShowMultiModal(true)}
                  style={{ textAlign: "left", background: "transparent", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, textDecoration: "underline", fontWeight: 500 }}
                >
                  👥 Inscrits multi-visites ({stats.multiVisitAttendeesCount})
                </button>
              )}
              <button
                onClick={() => {
                  const dateStr = new Date().toLocaleDateString("fr-FR");
                  alert(`Appel du jour (${dateStr}) - à implémenter`);
                }}
                style={{ textAlign: "left", background: "transparent", border: "none", color: "#ff7a45", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                📋 Voir appels du jour
              </button>
              <button
                onClick={() => alert("Export inscriptions - à implémenter")}
                style={{ textAlign: "left", background: "transparent", border: "none", color: "#ff7a45", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                📥 Exporter inscriptions
              </button>
              <button
                onClick={() => alert("File d'attente - à implémenter")}
                style={{ textAlign: "left", background: "transparent", border: "none", color: "#ff7a45", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                ⏳ Gérer file d'attente
              </button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal participants inscrits à plusieurs visites */}
      <Dialog open={showMultiModal} onOpenChange={setShowMultiModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#1a2138] flex items-center gap-2">
              <span>👥</span>
              <span>Inscrits à plusieurs visites</span>
            </DialogTitle>
          </DialogHeader>
          <DialogDescription className="text-xs text-gray-500">
            {stats.multiVisitAttendeesCount} participant{stats.multiVisitAttendeesCount > 1 ? "s sont inscrits" : " est inscrit"} à au moins 2 visites différentes (sur {stats.uniqueAttendeesCount} inscrit(s) distinct(s)).
          </DialogDescription>
          <div className="max-h-[60vh] overflow-y-auto space-y-3 mt-2 pr-1">
            {aggregationStats?.multiVisitAttendees.map((attendee) => {
              const attendeeTours = attendee.tourIds
                .map((id) => tours.find((t) => t.id === id))
                .filter(Boolean) as Tour[];
              attendeeTours.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

              return (
                <div key={attendee.email} className="p-3 bg-[#fdfbf7] border border-amber-200 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-sm text-[#1a2138]">{attendee.name}</p>
                      <p className="text-xs text-gray-500">{attendee.email}</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                      {attendeeTours.length} visites
                    </span>
                  </div>
                  <div className="space-y-1">
                    {attendeeTours.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setShowMultiModal(false);
                          onSelectTour(t.id);
                        }}
                        className="text-xs flex items-center justify-between text-gray-700 bg-white px-2.5 py-1.5 rounded border border-amber-100 hover:border-amber-400 cursor-pointer transition-colors"
                      >
                        <span className="font-medium text-amber-900">
                          {new Date(t.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} à {new Date(t.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="truncate max-w-[200px] text-gray-600">{t.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

