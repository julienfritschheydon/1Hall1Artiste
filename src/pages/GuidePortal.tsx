// Page guide: /guide — Dashboard pour guides (code accès protégé)
// Fonctions: créer/modifier visite, voir inscrits + file d'attente,
// inscription manuelle sur place, appel présences, export CSV + impression.
import { useState, useEffect } from "react";
import { Tour } from "../types/visitTypes";
import GuideCodeLogin from "../components/GuideCodeLogin";
import GuideToursList from "../components/GuideToursList";
import GuideDashboard from "../components/GuideDashboard";
import TourAttendanceSheet from "../components/TourAttendanceSheet";
import { VisitLayout } from "@/components/VisitLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFestivalDates } from "@/utils/festival";
import { escapeCsvCell } from "@/utils/csv";

const ORANGE = "#ff7a45";
const orangeBtn = { backgroundColor: ORANGE };

export default function GuidePortal() {
  const [guideCode, setGuideCode] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [registrationCounts, setRegistrationCounts] = useState<Record<string, number>>({});
  const [waitlistCounts, setWaitlistCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const stored = sessionStorage.getItem("guideCode");
    if (stored) {
      setGuideCode(stored);
      setAuthenticated(true);
      fetchTours(stored);
    }
  }, []);

  async function fetchTours(code: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/visit-tours?guide=1", { headers: { "x-guide-code": code } });
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          sessionStorage.removeItem("guideCode");
          throw new Error("Code invalide");
        }
        throw new Error("Erreur au chargement des visites");
      }
      const toursData = await res.json();
      setTours(toursData);
      await fetchRegistrationStats(toursData, code);
    } catch (e) {
      console.error("Tour fetch error:", e);
      setError("Impossible de charger les visites. Vérifiez que l'API est disponible.");
      setTours([]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchRegistrationStats(toursData: Tour[], code: string) {
    const counts: Record<string, number> = {};
    const waitlists: Record<string, number> = {};
    const headers = { "x-guide-code": code };

    try {
      const results = await Promise.all(
        toursData.flatMap((tour) => [
          fetch(`/api/visit-attendance?tourId=${tour.id}`, { headers }).then((res) => ({
            type: "attendance" as const,
            tourId: tour.id,
            res,
          })),
          fetch(`/api/visit-waitlist?tourId=${tour.id}`, { headers }).then((res) => ({
            type: "waitlist" as const,
            tourId: tour.id,
            res,
          })),
        ])
      );

      for (const result of results) {
        try {
          if (!result.res.ok) continue;
          const data = await result.res.json();
          if (result.type === "attendance") {
            counts[result.tourId] = data.registrations?.length || 0;
          } else {
            const active = (data.waitlist || []).filter((w: any) => !w.rejectedAt);
            waitlists[result.tourId] = active.length;
          }
        } catch (e) {
          console.error("Error processing stats for tour", result.tourId, e);
        }
      }
    } catch (e) {
      console.error("Error fetching registration stats:", e);
    }

    setRegistrationCounts(counts);
    setWaitlistCounts(waitlists);
  }

  function handleCodeSubmit(code: string) {
    setGuideCode(code);
    sessionStorage.setItem("guideCode", code);
    setAuthenticated(true);
    fetchTours(code);
  }

  function handleLogout() {
    setGuideCode(null);
    setAuthenticated(false);
    setTours([]);
    sessionStorage.removeItem("guideCode");
  }

  if (!authenticated) {
    return <GuideCodeLogin onSubmit={handleCodeSubmit} />;
  }

  if (selectedTourId) {
    const tour = tours.find((t) => t.id === selectedTourId);
    if (!tour) {
      return (
        <VisitLayout title="Visite introuvable" onBack={() => setSelectedTourId(null)}>
          <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
            <CardContent className="p-6 text-gray-600">Visite non trouvée.</CardContent>
          </Card>
        </VisitLayout>
      );
    }
    return (
      <TourDetails
        tour={tour}
        guideCode={guideCode!}
        onBack={() => setSelectedTourId(null)}
        onTourChanged={() => fetchTours(guideCode!)}
        onAuthError={handleLogout}
      />
    );
  }

  return (
    <VisitLayout
      title="Tableau de bord guide"
      backTo="/map"
      headerRight={
        <>
          {showDashboard && tours.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setShowDashboard(false)}>
              Vue liste
            </Button>
          )}
          {!showDashboard && (
            <Button size="sm" variant="outline" onClick={() => setShowDashboard(true)}>
              Vue synthétique
            </Button>
          )}
          <Button size="sm" className="text-white" style={orangeBtn} onClick={() => setCreating(true)}>
            + Créer une visite
          </Button>
          <Button size="sm" variant="outline" onClick={handleLogout}>
            Déconnexion
          </Button>
        </>
      }
    >
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg mb-4">{error}</div>
      )}

      {creating && (
        <TourForm
          guideCode={guideCode!}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            fetchTours(guideCode!);
          }}
        />
      )}

      {loading ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-gray-600">Chargement...</CardContent>
        </Card>
      ) : tours.length === 0 ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-gray-600">
            Aucune visite. Créez-en une avec le bouton « + Créer une visite ».
          </CardContent>
        </Card>
      ) : showDashboard ? (
        <GuideDashboard
          tours={tours}
          registrationCounts={registrationCounts}
          waitlistCounts={waitlistCounts}
          onSelectTour={setSelectedTourId}
          onCreateTour={() => setCreating(true)}
        />
      ) : (
        <GuideToursList tours={tours} onSelectTour={setSelectedTourId} />
      )}
    </VisitLayout>
  );
}

// ===== Formulaire création / modification visite =====
function TourForm({
  guideCode,
  tour,
  onClose,
  onSaved,
}: {
  guideCode: string;
  tour?: Tour;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(tour);
  const [title, setTitle] = useState(tour?.title || "");
  const [description, setDescription] = useState(tour?.description || "");
  const festivalDates = getFestivalDates();
  const initialLocal = tour ? toLocalInput(tour.date) : "";
  // Conserver la date réelle de la visite : l'ancien code reconstruisait la date
  // depuis le week-end du festival de l'année COURANTE — rouvrir puis enregistrer
  // une visite hors de ce week-end la déplaçait silencieusement.
  const [dateStr, setDateStr] = useState<string>(initialLocal ? initialLocal.slice(0, 10) : festivalDates.samedi);
  const day: "samedi" | "dimanche" | null =
    dateStr === festivalDates.dimanche ? "dimanche" : dateStr === festivalDates.samedi ? "samedi" : null;
  const [time, setTime] = useState(initialLocal ? initialLocal.slice(11, 16) : "10:00");
  const date = `${dateStr}T${time}`;
  const [durationMinutes, setDurationMinutes] = useState(tour?.durationMinutes || 90);
  const [capacity, setCapacity] = useState(tour?.capacity || 15);
  const [labels, setLabels] = useState((tour?.labels || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        title,
        description: description.trim(),
        date: new Date(date).toISOString(),
        durationMinutes: Number(durationMinutes),
        capacity: Number(capacity),
        labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
      };
      const url = isEdit ? `/api/visit-tours?id=${tour!.id}` : "/api/visit-tours";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", "x-guide-code": guideCode },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (data.errors ? data.errors.join(", ") : "Erreur"));
        return;
      }
      if (data.warning) {
        alert(data.warning);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const labelCls = "block text-sm font-medium mb-1 text-[#4a4636]";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto border-2 border-amber-300 shadow-xl">
        <h2 className="text-xl font-bold mb-4 text-[#1a2138]">
          {isEdit ? "Modifier la visite" : "Créer une visite"}
        </h2>
        {error && <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg mb-3">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={labelCls}>Intitulé *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Descriptif</label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Présentation de la visite pour les visiteurs"
            />
          </div>
          <div>
            <label className={labelCls}>Jour *</label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={day === "samedi" ? undefined : "outline"}
                style={day === "samedi" ? orangeBtn : undefined}
                className={day === "samedi" ? "text-white" : ""}
                onClick={() => setDateStr(festivalDates.samedi)}
              >
                Samedi {new Date(festivalDates.samedi).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </Button>
              <Button
                type="button"
                variant={day === "dimanche" ? undefined : "outline"}
                style={day === "dimanche" ? orangeBtn : undefined}
                className={day === "dimanche" ? "text-white" : ""}
                onClick={() => setDateStr(festivalDates.dimanche)}
              >
                Dimanche {new Date(festivalDates.dimanche).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
              </Button>
            </div>
            {day === null && (
              <p className="text-xs text-amber-700 mt-1">
                Date actuelle : {new Date(`${dateStr}T12:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} (hors
                week-end du festival — elle sera conservée telle quelle sauf si vous choisissez un jour ci-dessus).
              </p>
            )}
          </div>
          <div>
            <label className={labelCls}>Heure de départ *</label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Durée (min) *</label>
              <Input type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} required />
            </div>
            <div>
              <label className={labelCls}>Capacité *</label>
              <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} required />
            </div>
          </div>
          <div>
            <label className={labelCls}>Labels (séparés par virgule)</label>
            <Input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="architecture, histoire, enfants" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saving} className="text-white" style={orangeBtn}>
              {saving ? "Enregistrement..." : isEdit ? "Modifier" : "Créer"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ===== Détail visite (onglets) =====
function TourDetails({
  tour,
  guideCode,
  onBack,
  onTourChanged,
  onAuthError,
}: {
  tour: Tour;
  guideCode: string;
  onBack: () => void;
  onTourChanged: () => void;
  onAuthError: () => void;
}) {
  const [tab, setTab] = useState<"registrations" | "waitlist" | "attendance">("registrations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [waitlist, setWaitlist] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [addingManual, setAddingManual] = useState(false);

  async function refresh() {
    setLoading(true);
    // Réinitialiser l'erreur : sans ça, un échec réseau transitoire masquait
    // définitivement le contenu même quand les refreshs suivants réussissaient.
    setError(null);
    try {
      const [attRes, wlRes] = await Promise.all([
        fetch(`/api/visit-attendance?tourId=${tour.id}`, { headers: { "x-guide-code": guideCode } }),
        fetch(`/api/visit-waitlist?tourId=${tour.id}`, { headers: { "x-guide-code": guideCode } }),
      ]);
      // Code expiré en cours de session → retour au login, pas une erreur opaque.
      if (attRes.status === 401 || wlRes.status === 401) {
        onAuthError();
        return;
      }
      if (!attRes.ok) throw new Error("Erreur au chargement");
      setData(await attRes.json());
      if (wlRes.ok) {
        const wl = await wlRes.json();
        setWaitlist(wl.waitlist || []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.id, guideCode]);

  const registrations = data?.registrations || [];
  // Les entrées refusées (offre expirée/déclinée) ont rendu leur rang : les
  // compter gonflait la file affichée au guide de personnes fantômes.
  const activeWaitlist = waitlist.filter((w: any) => !w.rejectedAt);

  return (
    <VisitLayout
      title={tour.title}
      onBack={onBack}
      headerRight={
        <>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Modifier</Button>
          <Button size="sm" variant="outline" onClick={() => exportCSV(tour, registrations)}>Export CSV</Button>
          <Button size="sm" variant="outline" onClick={() => printAttendance(tour, registrations)}>Imprimer</Button>
        </>
      }
    >
      {editing && (
        <TourForm
          guideCode={guideCode}
          tour={tour}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onTourChanged();
          }}
        />
      )}

      <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
        <CardContent className="p-6">
          <p className="text-gray-600 mb-2 flex flex-wrap items-center gap-2">
            <span>
              {new Date(tour.date).toLocaleDateString("fr-FR")} •{" "}
              {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              {" • "}Durée : {tour.durationMinutes} min • Places :{" "}
              <span className={(tour.placesLeft ?? tour.capacity) <= 0 ? "font-bold text-red-600" : undefined}>
                {tour.placesLeft ?? tour.capacity}/{tour.capacity}
              </span>
            </span>
            {(tour.placesLeft ?? tour.capacity) <= 0 && (
              <span className="text-xs px-2 py-1 rounded-full whitespace-nowrap bg-red-100 text-red-700 font-bold uppercase">
                Complet
              </span>
            )}
          </p>
          {tour.description && <p className="text-gray-700 mb-4 whitespace-pre-wrap">{tour.description}</p>}

          {loading ? (
            <p className="text-gray-600">Chargement...</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <>
              {data?.counts && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <Stat label="Confirmés" value={data.counts.confirmed} color="bg-[#f3f0e6]" />
                  <Stat label="Présents" value={data.counts.present} color="bg-green-100" />
                  <Stat label="Absents" value={data.counts.absent} color="bg-red-100" />
                  <Stat
                    label="File d'attente"
                    value={activeWaitlist.reduce((s: number, w: any) => s + (w.places ?? 1), 0)}
                    color="bg-amber-100"
                    highlight={activeWaitlist.length > 0}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mb-4 -mt-3">Compteurs en nombre de personnes (accompagnants inclus).</p>

              <div className="mb-4 flex flex-wrap gap-2">
                <TabBtn active={tab === "registrations"} onClick={() => setTab("registrations")}>
                  Inscrits ({registrations.length})
                </TabBtn>
                <TabBtn active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
                  File d'attente ({activeWaitlist.length})
                </TabBtn>
                <TabBtn active={tab === "attendance"} onClick={() => setTab("attendance")}>
                  Appel
                </TabBtn>
              </div>

              {tab === "registrations" && (
                <div>
                  <Button
                    size="sm"
                    className="text-white mb-3"
                    style={orangeBtn}
                    onClick={() => setAddingManual(true)}
                  >
                    + Inscrire sur place
                  </Button>
                  {addingManual && (
                    <ManualRegistration
                      tour={tour}
                      guideCode={guideCode}
                      onClose={() => setAddingManual(false)}
                      onSaved={() => {
                        setAddingManual(false);
                        refresh();
                      }}
                    />
                  )}
                  <RegistrationsList registrations={registrations} />
                </div>
              )}
              {tab === "waitlist" && <WaitlistList waitlist={waitlist} />}
              {tab === "attendance" && (
                <TourAttendanceSheet tour={tour} registrations={registrations} guideCode={guideCode} onMarked={refresh} />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </VisitLayout>
  );
}

function Stat({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg ${color} ${highlight ? "ring-2 ring-amber-500" : ""}`}>
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-[#1a2138]">{value}</p>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
      style={active ? { backgroundColor: ORANGE, color: "#fff" } : { backgroundColor: "#efe9da", color: "#5b5340" }}
    >
      {children}
    </button>
  );
}

// Formate les accompagnants (array nouveau ou champ legacy) en texte.
function formatCompanions(r: any): string {
  if (Array.isArray(r.companions) && r.companions.length > 0) {
    return r.companions.map((c: any) => `${c.firstName} ${c.lastName || ""}`.trim()).join(", ");
  }
  if (r.companionFirstName) return `${r.companionFirstName} ${r.companionLastName || ""}`.trim();
  return "-";
}

function placesCount(r: any): number {
  if (Array.isArray(r.companions) && r.companions.length > 0) return 1 + r.companions.length;
  if (r.companionFirstName) return 2;
  return 1;
}

function tableCls() {
  return "w-full border-collapse text-sm";
}
function thCls() {
  return "text-left bg-[#f4efe2] text-[#5b5340] p-2 text-xs uppercase tracking-wide";
}
function tdCls() {
  return "p-2 border-t border-[#eadfc7]";
}

function RegistrationsList({ registrations }: { registrations: any[] }) {
  if (registrations.length === 0) return <p className="text-gray-600">Aucun inscrit.</p>;
  const totalPlaces = registrations
    .filter((r) => r.status === "confirmé" || r.status === "présent")
    .reduce((s, r) => s + placesCount(r), 0);
  return (
    <div className="overflow-x-auto">
      <p className="text-sm text-gray-600 mb-2">Total places confirmées : {totalPlaces}</p>
      <table className={tableCls()}>
        <thead>
          <tr>
            <th className={thCls()}>Nom</th>
            <th className={thCls()}>Prénom</th>
            <th className={thCls()}>Email</th>
            <th className={thCls()}>Accompagnants</th>
            <th className={thCls()}>Places</th>
            <th className={thCls()}>Statut</th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((reg) => (
            <tr key={reg.id} className="hover:bg-[#faf6ec]">
              <td className={tdCls()}>{reg.lastName}</td>
              <td className={tdCls()}>{reg.firstName}</td>
              <td className={`${tdCls()} text-xs`}>{reg.email}</td>
              <td className={tdCls()}>{formatCompanions(reg)}</td>
              <td className={`${tdCls()} text-center`}>{placesCount(reg)}</td>
              <td className={tdCls()}>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    reg.status === "présent"
                      ? "bg-green-100 text-green-700"
                      : reg.status === "absent"
                      ? "bg-red-100 text-red-700"
                      : "bg-[#f3f0e6] text-[#7a6f4d]"
                  }`}
                >
                  {reg.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WaitlistList({ waitlist }: { waitlist: any[] }) {
  if (waitlist.length === 0) return <p className="text-gray-600">File d'attente vide.</p>;
  return (
    <div className="overflow-x-auto">
      <table className={tableCls()}>
        <thead>
          <tr>
            <th className={thCls()}>Position</th>
            <th className={thCls()}>Nom</th>
            <th className={thCls()}>Prénom</th>
            <th className={thCls()}>Email</th>
            <th className={thCls()}>Places</th>
            <th className={thCls()}>Offre envoyée</th>
          </tr>
        </thead>
        <tbody>
          {waitlist.map((w) => (
            <tr key={w.id} className="hover:bg-[#faf6ec]">
              <td className={tdCls()}>#{w.position}</td>
              <td className={tdCls()}>{w.lastName}</td>
              <td className={tdCls()}>{w.firstName}</td>
              <td className={`${tdCls()} text-xs`}>{w.email}</td>
              <td className={`${tdCls()} text-center`}>{w.places ?? 1}</td>
              <td className={tdCls()}>{w.rejectedAt ? "Refusée" : w.hasOffer ? "Oui (en attente)" : "Non"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== Inscription manuelle sur place =====
function ManualRegistration({
  tour,
  guideCode,
  onClose,
  onSaved,
}: {
  tour: Tour;
  guideCode: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/visit-register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-guide-code": guideCode },
        body: JSON.stringify({ tourId: tour.id, email, firstName, lastName, manual: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      // Surbooking volontaire : le serveur signale quand la visite était complète.
      if (data.warning) {
        alert(data.warning);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-4 rounded-lg bg-[#fbf7ec] border border-amber-200 max-w-md space-y-2">
      {error && <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Prénom *" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <Input placeholder="Nom *" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
      </div>
      <Input type="email" placeholder="Email *" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving} className="text-white" style={orangeBtn}>
          {saving ? "..." : "Ajouter"}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

// ===== Helpers =====
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function printAttendance(tour: Tour, registrations: any[]) {
  const dateStr = new Date(tour.date).toLocaleString("fr-FR");
  const rows = registrations
    .map(
      (r) => `<tr>
        <td style="border:1px solid #999;padding:6px;width:40px;text-align:center">☐</td>
        <td style="border:1px solid #999;padding:6px">${escapeHtml(r.lastName)}</td>
        <td style="border:1px solid #999;padding:6px">${escapeHtml(r.firstName)}</td>
        <td style="border:1px solid #999;padding:6px">${escapeHtml(
          formatCompanions(r) === "-" ? "" : formatCompanions(r)
        )}</td>
      </tr>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Appel — ${escapeHtml(
    tour.title
  )}</title></head><body style="font-family:sans-serif;padding:20px">
    <h1 style="font-size:18px">Feuille d'appel — ${escapeHtml(tour.title)}</h1>
    <p style="color:#555">${dateStr} • ${registrations.length} inscrit(s)</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr>
        <th style="border:1px solid #999;padding:6px">Présent</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Nom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Prénom</th>
        <th style="border:1px solid #999;padding:6px;text-align:left">Accompagnant</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c)
  );
}

function exportCSV(tour: Tour, registrations: any[]) {
  const rows = [
    ["Nom", "Prénom", "Email", "Accompagnants", "Places", "Statut"],
    ...registrations.map((r) => [
      r.lastName, r.firstName, r.email,
      formatCompanions(r) === "-" ? "" : formatCompanions(r),
      String(placesCount(r)), r.status,
    ]),
  ];
  const csv = rows
    .map((row) => row.map((c) => `"${escapeCsvCell(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inscrits-${tour.title.replace(/[^a-z0-9]/gi, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
