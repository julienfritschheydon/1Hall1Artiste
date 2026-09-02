import { Tour } from "../types/visitTypes";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ORANGE = "#ff7a45";

interface GuideDashboardStats {
  totalTours: number;
  totalRegistrations: number;
  averageFillRate: number;
  totalWaitlist: number;
  atRiskCount: number;
}

function calcStats(tours: Tour[], registrationCounts: Record<string, number>, waitlistCounts: Record<string, number>): GuideDashboardStats {
  const totalTours = tours.length;
  const totalRegistrations = Object.values(registrationCounts).reduce((s, n) => s + n, 0);
  const totalCapacity = tours.reduce((s, t) => s + t.capacity, 0);
  const averageFillRate = totalCapacity > 0 ? Math.round((totalRegistrations / totalCapacity) * 100) : 0;
  const totalWaitlist = Object.values(waitlistCounts).reduce((s, n) => s + n, 0);
  const atRiskCount = tours.filter((t) => {
    const filled = registrationCounts[t.id] || 0;
    const remaining = t.capacity - filled;
    return remaining <= 1 && filled > 0;
  }).length;

  return { totalTours, totalRegistrations, averageFillRate, totalWaitlist, atRiskCount };
}

export default function GuideDashboard({
  tours,
  registrationCounts,
  waitlistCounts,
  onSelectTour,
  onCreateTour,
}: {
  tours: Tour[];
  registrationCounts: Record<string, number>;
  waitlistCounts: Record<string, number>;
  onSelectTour: (tourId: string) => void;
  onCreateTour: () => void;
}) {
  const stats = calcStats(tours, registrationCounts, waitlistCounts);

  const statCards = [
    { label: "Visites", value: stats.totalTours, color: "bg-[#f3f0e6]" },
    { label: "Inscrits", value: stats.totalRegistrations, color: "bg-[#f3f0e6]" },
    { label: "Remplissage", value: `${stats.averageFillRate}%`, color: "bg-[#f3f0e6]" },
    { label: "En attente", value: stats.totalWaitlist, color: "bg-amber-100" },
  ];

  const toursWithStatus = tours.map((tour) => {
    const filled = registrationCounts[tour.id] || 0;
    const remaining = tour.capacity - filled;
    const waitlist = waitlistCounts[tour.id] || 0;
    return { tour, filled, remaining, waitlist };
  });

  const atRiskTours = toursWithStatus.filter((t) => t.remaining <= 1 && t.filled > 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "2rem" }}>
        {statCards.map((card, i) => (
          <Card key={i} className="border-2 border-amber-300 shadow-lg" style={{ backgroundColor: card.color }}>
            <CardContent className="p-4">
              <p style={{ fontSize: "12px", color: "#7a6f4d", marginBottom: "8px", fontWeight: 500 }}>{card.label}</p>
              <p style={{ fontSize: "24px", fontWeight: 500, color: "#1a2138", margin: 0 }}>{card.value}</p>
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
                  {toursWithStatus.map(({ tour, filled, remaining, waitlist }) => (
                    <tr key={tour.id} style={{ borderBottom: "0.5px solid #eadfc7", cursor: "pointer" }} onClick={() => onSelectTour(tour.id)}>
                      <td style={{ padding: "8px", color: "#1a2138" }}>
                        {new Date(tour.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "8px", color: "#1a2138" }}>{tour.title}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: "#1a2138" }}>
                        {filled}/{tour.capacity}
                      </td>
                      <td style={{ padding: "8px", textAlign: "center" }}>
                        {remaining === 0 ? (
                          <span style={{ display: "inline-block", backgroundColor: "#dcfce7", color: "#166534", padding: "3px 8px", borderRadius: "4px", fontSize: "11px" }}>
                            Complet
                          </span>
                        ) : remaining <= 1 ? (
                          <span style={{ display: "inline-block", backgroundColor: "#fecaca", color: "#991b1b", padding: "3px 8px", borderRadius: "4px", fontSize: "11px" }}>
                            Dernier
                          </span>
                        ) : (
                          <span style={{ display: "inline-block", backgroundColor: "#fef3c7", color: "#92400e", padding: "3px 8px", borderRadius: "4px", fontSize: "11px" }}>
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
    </div>
  );
}
