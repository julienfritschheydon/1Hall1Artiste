// Page guide: /guide — Dashboard pour guides (code accès protégé)
// Fonctions: créer/modifier visite, voir inscrits + file d'attente,
// inscription manuelle sur place, appel présences, export CSV + impression.
import { useState, useEffect, useMemo } from "react";
import { Tour, Registration, placesOf } from "../types/visitTypes";
import GuideCodeLogin from "../components/GuideCodeLogin";
import GuideToursList from "../components/GuideToursList";
import GuideDashboard from "../components/GuideDashboard";
import TourAttendanceSheet from "../components/TourAttendanceSheet";
import { VisitLayout } from "@/components/VisitLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFestivalDates } from "@/utils/festival";
import { computeVisitAggregation, VisitAggregationStats } from "../utils/visitStats";
import {
  exportRegistrationsCsv,
  formatCompanions,
  printAttendanceSheets,
} from "@/utils/guideExport";

const ORANGE = "#ff7a45";
const orangeBtn = { backgroundColor: ORANGE };

const GUIDE_FILTER_KEY = "guideFilter";

// Union sans doublon (casse ignorée), ordre de la première liste conservé.
function mergeNames(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of lists.flat()) {
    const key = n.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n.trim());
  }
  return out;
}

export default function GuidePortal() {
  const [guideCode, setGuideCode] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showDashboard, setShowDashboard] = useState(true);
  const [waitlistCounts, setWaitlistCounts] = useState<Record<string, number>>({});
  // Inscriptions brutes conservées pour pouvoir recalculer les statistiques sur
  // le périmètre du filtre « Animé par » plutôt que sur tout le programme.
  const [registrationsByTour, setRegistrationsByTour] = useState<Record<string, Registration[]>>({});
  const [guideNames, setGuideNames] = useState<string[]>([]);
  // Filtre « Animé par » mémorisé par navigateur : chaque guide retrouve ses visites.
  const [guideFilter, setGuideFilterState] = useState<string>(() => {
    try {
      return localStorage.getItem(GUIDE_FILTER_KEY) || "";
    } catch {
      return "";
    }
  });

  function setGuideFilter(name: string) {
    setGuideFilterState(name);
    try {
      if (name) localStorage.setItem(GUIDE_FILTER_KEY, name);
      else localStorage.removeItem(GUIDE_FILTER_KEY);
    } catch {
      /* stockage indisponible : le filtre reste valable pour la session */
    }
  }

  useEffect(() => {
    const stored = sessionStorage.getItem("guideCode");
    if (stored) {
      setGuideCode(stored);
      setAuthenticated(true);
      fetchTours(stored);
    }
  }, []);

  async function fetchGuideNames(code: string) {
    try {
      const res = await fetch("/api/visit-tours?action=guide-names", { headers: { "x-guide-code": code } });
      if (res.ok) setGuideNames((await res.json()).names || []);
    } catch (e) {
      console.error("Guide names fetch error:", e);
    }
  }

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
      fetchGuideNames(code);
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
    const waitlists: Record<string, number> = {};
    const registrationsByTour: Record<string, Registration[]> = {};
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
            registrationsByTour[result.tourId] = data.registrations || [];
          } else {
            const active = (data.waitlist || []).filter((w: any) => !w.rejectedAt);
            const totalWaitlistPlaces = active.reduce((sum: number, w: any) => sum + (w.places ?? 1), 0);
            waitlists[result.tourId] = totalWaitlistPlaces;
          }
        } catch (e) {
          console.error("Error processing stats for tour", result.tourId, e);
        }
      }
    } catch (e) {
      console.error("Error fetching registration stats:", e);
    }

    setRegistrationsByTour(registrationsByTour);
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
    setRegistrationsByTour({});
    sessionStorage.removeItem("guideCode");
  }

  // Sur tout le programme : sert au nombre de visites suivies par une personne,
  // qui ne doit pas dépendre du filtre affiché.
  const globalAggregation = useMemo(
    () => computeVisitAggregation(tours, registrationsByTour),
    [tours, registrationsByTour]
  );
  const registrationCounts = globalAggregation.registrationCounts;

  // Noms proposés au filtre : liste admin + noms saisis via « Autre » sur les visites.
  const filterNames = mergeNames(guideNames, tours.flatMap((t) => t.guides || []));
  const visibleTours = useMemo(
    () =>
      guideFilter
        ? tours.filter((t) => (t.guides || []).some((g) => g.toLowerCase() === guideFilter.toLowerCase()))
        : tours,
    [tours, guideFilter]
  );

  // Sur les seules visites affichées : sinon « 19 personnes à 2+ visites »
  // parlait de tout le programme sous un tableau filtré sur un seul guide.
  const aggregationStats = useMemo(
    () => computeVisitAggregation(visibleTours, registrationsByTour),
    [visibleTours, registrationsByTour]
  );

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
        userTourCounts={globalAggregation.userTourCounts}
        guideNames={guideNames}
        onGuideNamesLoaded={setGuideNames}
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
          guideNames={guideNames}
          onGuideNamesLoaded={setGuideNames}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            fetchTours(guideCode!);
          }}
        />
      )}

      {!loading && filterNames.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#4a4636]">Animé par :</span>
          <TabBtn active={!guideFilter} onClick={() => setGuideFilter("")}>
            Toutes
          </TabBtn>
          {filterNames.map((n) => (
            <TabBtn
              key={n}
              active={guideFilter.toLowerCase() === n.toLowerCase()}
              onClick={() => setGuideFilter(n)}
            >
              {n}
            </TabBtn>
          ))}
        </div>
      )}

      {loading ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-gray-600">Chargement...</CardContent>
        </Card>
      ) : guideFilter && visibleTours.length === 0 && tours.length > 0 ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-gray-600">Aucune visite animée par {guideFilter}.</CardContent>
        </Card>
      ) : tours.length === 0 ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-gray-600">
            Aucune visite. Créez-en une avec le bouton « + Créer une visite ».
          </CardContent>
        </Card>
      ) : showDashboard ? (
        <GuideDashboard
          tours={visibleTours}
          registrationCounts={registrationCounts}
          waitlistCounts={waitlistCounts}
          aggregationStats={aggregationStats}
          multiVisitTourCounts={globalAggregation.multiVisitTourCounts}
          guideCode={guideCode!}
          onSelectTour={setSelectedTourId}
          onCreateTour={() => setCreating(true)}
          onAuthError={handleLogout}
        />
      ) : (
        <GuideToursList
          tours={visibleTours}
          registrationCounts={registrationCounts}
          onSelectTour={setSelectedTourId}
        />
      )}
    </VisitLayout>
  );
}

// ===== Formulaire création / modification visite =====
function TourForm({
  guideCode,
  guideNames: initialGuideNames,
  onGuideNamesLoaded,
  tour,
  onClose,
  onSaved,
}: {
  guideCode: string;
  guideNames: string[];
  onGuideNamesLoaded?: (names: string[]) => void;
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
  // « Animé par » : cases pour la liste admin, champ libre « Autre » pour le reste.
  const [guideNames, setGuideNames] = useState<string[]>(initialGuideNames);
  const isKnownIn = (names: string[], g: string) => names.some((n) => n.toLowerCase() === g.toLowerCase());
  const [selectedGuides, setSelectedGuides] = useState<string[]>(
    (tour?.guides || []).filter((g) => isKnownIn(initialGuideNames, g))
  );
  const [otherGuides, setOtherGuides] = useState(
    (tour?.guides || []).filter((g) => !isKnownIn(initialGuideNames, g)).join(", ")
  );

  // Recharge la liste admin à chaque ouverture : un portail ouvert avant l'ajout
  // d'un prénom dans /admin n'affichait sinon aucune case à cocher.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/visit-tours?action=guide-names", { headers: { "x-guide-code": guideCode } });
        if (!res.ok || cancelled) return;
        const names: string[] = (await res.json()).names || [];
        if (cancelled) return;
        setGuideNames(names);
        onGuideNamesLoaded?.(names);
        // Redistribue cases / « Autre » selon la liste à jour (à l'ouverture,
        // l'utilisateur n'a pas encore touché au champ).
        const current = tour?.guides || [];
        setSelectedGuides(current.filter((g) => isKnownIn(names, g)));
        setOtherGuides(current.filter((g) => !isKnownIn(names, g)).join(", "));
      } catch (e) {
        console.error("Guide names refresh error:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideCode]);
  const [saving, setSaving] = useState(false);

  function toggleGuide(name: string) {
    setSelectedGuides((prev) =>
      prev.some((g) => g.toLowerCase() === name.toLowerCase())
        ? prev.filter((g) => g.toLowerCase() !== name.toLowerCase())
        : [...prev, name]
    );
  }
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
        guides: mergeNames(selectedGuides, otherGuides.split(",")),
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
          <div>
            <label className={labelCls}>Animé par (interne, non visible du public)</label>
            {guideNames.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                {guideNames.map((n) => (
                  <label key={n} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedGuides.some((g) => g.toLowerCase() === n.toLowerCase())}
                      onChange={() => toggleGuide(n)}
                    />
                    {n}
                  </label>
                ))}
              </div>
            )}
            <Input
              value={otherGuides}
              onChange={(e) => setOtherGuides(e.target.value)}
              placeholder={guideNames.length > 0 ? "Autre (séparés par virgule)" : "Prénoms (séparés par virgule)"}
            />
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
  userTourCounts,
  guideNames,
  onGuideNamesLoaded,
}: {
  tour: Tour;
  guideCode: string;
  guideNames: string[];
  onGuideNamesLoaded?: (names: string[]) => void;
  onBack: () => void;
  onTourChanged: () => void;
  onAuthError: () => void;
  userTourCounts?: Record<string, number>;
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
  // Les onglets affichent des PERSONNES (titulaire + accompagnants), comme les
  // compteurs au-dessus : afficher le nombre de lignes d'inscription donnait un
  // total plus faible que la jauge de places.
  const totalRegisteredPeople = registrations.reduce((s: number, r: any) => s + placesOf(r), 0);
  const totalWaitlistPeople = activeWaitlist.reduce((s: number, w: any) => s + (w.places ?? 1), 0);

  return (
    <VisitLayout
      title={tour.title}
      onBack={onBack}
      headerRight={
        <>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Modifier</Button>
          <Button size="sm" variant="outline" onClick={() => exportRegistrationsCsv(tour, registrations)}>Export CSV</Button>
          <Button size="sm" variant="outline" onClick={() => printAttendanceSheets([{ tour, registrations }])}>Imprimer</Button>
        </>
      }
    >
      {editing && (
        <TourForm
          guideCode={guideCode}
          guideNames={guideNames}
          onGuideNamesLoaded={onGuideNamesLoaded}
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
              {" • "}Durée : {tour.durationMinutes} min • Places libres :{" "}
              <span className={(tour.placesLeft ?? tour.capacity) <= 0 ? "font-bold text-red-600" : undefined}>
                {tour.placesLeft ?? tour.capacity}/{tour.capacity}
              </span>
              {/* placesLeft déduit aussi la file d'attente : sans cette mention,
                  « inscrits + places libres < capacité » passait pour une erreur. */}
              {totalWaitlistPeople > 0 && (
                <span className="text-gray-500"> (file d'attente déduite)</span>
              )}
            </span>
            {(tour.placesLeft ?? tour.capacity) <= 0 && (
              <span className="text-xs px-2 py-1 rounded-full whitespace-nowrap bg-red-100 text-red-700 font-bold uppercase">
                Complet
              </span>
            )}
          </p>
          {tour.guides && tour.guides.length > 0 && (
            <p className="text-sm text-[#7a6f4d] mb-2">Animé par {tour.guides.join(", ")}</p>
          )}
          {tour.description && <p className="text-gray-700 mb-4 whitespace-pre-wrap">{tour.description}</p>}

          {loading ? (
            <p className="text-gray-600">Chargement...</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <>
              {data?.counts && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                  <Stat label="Inscrits" value={data.counts.seatsTaken ?? totalRegisteredPeople} color="bg-[#f3f0e6]" />
                  <Stat label="Présents" value={data.counts.present} color="bg-green-100" />
                  <Stat label="Absents" value={data.counts.absent} color="bg-red-100" />
                  {data.counts.awaitingValidation > 0 && (
                    <Stat label="À confirmer" value={data.counts.awaitingValidation} color="bg-orange-100" />
                  )}
                  <Stat
                    label="File d'attente"
                    value={activeWaitlist.reduce((s: number, w: any) => s + (w.places ?? 1), 0)}
                    color="bg-amber-100"
                    highlight={activeWaitlist.length > 0}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mb-4 -mt-3">Compteurs en nombre de personnes (accompagnants inclus). « À confirmer » = places réservées tant que l'inscrit n'a pas validé son e-mail.</p>

              <div className="mb-4 flex flex-wrap gap-2">
                <TabBtn active={tab === "registrations"} onClick={() => setTab("registrations")}>
                  Inscrits ({totalRegisteredPeople})
                </TabBtn>
                <TabBtn active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
                  File d'attente ({totalWaitlistPeople})
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
                  <RegistrationsList
                    registrations={registrations}
                    userTourCounts={userTourCounts}
                    tourId={tour.id}
                    guideCode={guideCode}
                    onCancelled={refresh}
                    onAuthError={onAuthError}
                  />
                </div>
              )}
              {tab === "waitlist" && <WaitlistList waitlist={waitlist} />}
              {tab === "attendance" && (
                <TourAttendanceSheet
                  tour={tour}
                  registrations={registrations}
                  guideCode={guideCode}
                  onMarked={refresh}
                  userTourCounts={userTourCounts}
                />
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
function tableCls() {
  return "w-full border-collapse text-sm";
}
function thCls() {
  return "text-left bg-[#f4efe2] text-[#5b5340] p-2 text-xs uppercase tracking-wide";
}
function tdCls() {
  return "p-2 border-t border-[#eadfc7]";
}

function RegistrationsList({
  registrations,
  userTourCounts,
  tourId,
  guideCode,
  onCancelled,
  onAuthError,
}: {
  registrations: any[];
  userTourCounts?: Record<string, number>;
  tourId: string;
  guideCode: string;
  onCancelled: () => void;
  onAuthError: () => void;
}) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function cancel(reg: any) {
    const who = `${reg.firstName} ${reg.lastName}`.trim();
    if (!window.confirm(`Annuler l'inscription de ${who} ? Un email d'annulation lui sera envoyé et la place sera proposée à la file d'attente.`)) return;
    setCancellingId(reg.id);
    try {
      const res = await fetch("/api/visit-attendance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-guide-code": guideCode },
        body: JSON.stringify({ registrationId: reg.id, tourId }),
      });
      if (res.status === 401) {
        onAuthError();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Échec de l'annulation");
      }
      onCancelled();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setCancellingId(null);
    }
  }

  if (registrations.length === 0) return <p className="text-gray-600">Aucun inscrit.</p>;
  // Deux chiffres différents sur le même écran sans explication passaient pour un
  // bug : on dit ce que chacun recouvre.
  const totalPlaces = registrations.reduce((s, r) => s + placesOf(r), 0);
  const confirmedPlaces = registrations
    .filter((r) => r.status === "confirmé" || r.status === "présent")
    .reduce((s, r) => s + placesOf(r), 0);
  return (
    <div className="overflow-x-auto">
      <p className="text-sm text-gray-600 mb-2">{totalPlaces} place(s) occupée(s), dont {confirmedPlaces} confirmée(s)</p>
      <table className={tableCls()}>
        <thead>
          <tr>
            <th className={thCls()}>Nom</th>
            <th className={thCls()}>Prénom</th>
            <th className={thCls()}>Email</th>
            <th className={thCls()}>Accompagnants</th>
            <th className={thCls()}>Places</th>
            <th className={thCls()}>Statut</th>
            <th className={thCls()}></th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((reg) => {
            const emailKey = (reg.email || `${reg.firstName}_${reg.lastName}`).trim().toLowerCase();
            const toursCount = userTourCounts ? (userTourCounts[emailKey] ?? 1) : 1;
            return (
              <tr key={reg.id} className="hover:bg-[#faf6ec]">
                <td className={tdCls()}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>{reg.lastName}</span>
                    {toursCount > 1 && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium"
                        title={`Inscrit(e) à ${toursCount} visites`}
                      >
                        👥 {toursCount} visites
                      </span>
                    )}
                  </div>
                </td>
                <td className={tdCls()}>{reg.firstName}</td>
                <td className={`${tdCls()} text-xs`}>{reg.email}</td>
                <td className={tdCls()}>{formatCompanions(reg)}</td>
                <td className={`${tdCls()} text-center`}>{placesOf(reg)}</td>
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
              <td className={tdCls()}>
                {(reg.status === "confirmé" || reg.status === "attente_validation") && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-300 hover:bg-red-50"
                    disabled={cancellingId === reg.id}
                    onClick={() => cancel(reg)}
                  >
                    {cancellingId === reg.id ? "..." : "Annuler"}
                  </Button>
                )}
              </td>
            </tr>
          );
          })}
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

