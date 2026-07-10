// Page guide: /guide — Dashboard pour guides (code accès protégé)
// Fonctions: créer/modifier visite, voir inscrits + file d'attente,
// inscription manuelle sur place, appel présences, export CSV + impression.
import { useState, useEffect } from "react";
import { Tour } from "../types/visitTypes";
import { locations as buildingLocations, Location } from "../data/locations";
import GuideCodeLogin from "../components/GuideCodeLogin";
import GuideToursList from "../components/GuideToursList";
import TourAttendanceSheet from "../components/TourAttendanceSheet";
import { VisitLayout } from "@/components/VisitLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      const res = await fetch("/api/visit-tours", { headers: { "x-guide-code": code } });
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          sessionStorage.removeItem("guideCode");
          throw new Error("Code invalide");
        }
        throw new Error("Erreur au chargement des visites");
      }
      const text = await res.text();
      setTours(JSON.parse(text));
    } catch (e) {
      console.error("Tour fetch error:", e);
      setError("Impossible de charger les visites. Vérifiez que l'API est disponible.");
      setTours([]);
    } finally {
      setLoading(false);
    }
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
      />
    );
  }

  return (
    <VisitLayout
      title="Tableau de bord guide"
      backTo="/map"
      headerRight={
        <>
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
  // datetime-local needs "YYYY-MM-DDTHH:mm"
  const [date, setDate] = useState(tour ? toLocalInput(tour.date) : "");
  const [durationMinutes, setDurationMinutes] = useState(tour?.durationMinutes || 90);
  const [capacity, setCapacity] = useState(tour?.capacity || 15);
  const [labels, setLabels] = useState((tour?.labels || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lieux de départ = les vrais bâtiments de la carte (data/locations.ts).
  // Plus de liste RTDB séparée à maintenir à la main ni de fetch : la source
  // est la même que celle utilisée partout ailleurs sur la carte, donc l'id
  // choisi ici correspond forcément au bon point sur la carte.
  const locations: Location[] = buildingLocations;
  const [locationId, setLocationId] = useState<string>(() => tour?.startLocationId || "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const loc = locations.find((l) => l.id === locationId);
    if (!loc) {
      setError("Choisissez un lieu de départ.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title,
        date: new Date(date).toISOString(),
        durationMinutes: Number(durationMinutes),
        startLocationX: loc.x,
        startLocationY: loc.y,
        startLocationName: loc.name,
        startLocationId: loc.id,
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
            <label className={labelCls}>Date & heure de départ *</label>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required />
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
            <label className={labelCls}>Point de départ *</label>
            {locations.length === 0 ? (
              <p className="text-sm text-[#e8693a]">
                Aucun lieu disponible. Demandez à l'administrateur d'ajouter des points de départ.
              </p>
            ) : (
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required
                className="w-full border border-input rounded-md h-10 px-3 bg-white text-sm"
              >
                <option value="">— Choisir un lieu —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
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
}: {
  tour: Tour;
  guideCode: string;
  onBack: () => void;
  onTourChanged: () => void;
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
    try {
      const [attRes, wlRes] = await Promise.all([
        fetch(`/api/visit-attendance?tourId=${tour.id}`, { headers: { "x-guide-code": guideCode } }),
        fetch(`/api/visit-waitlist?tourId=${tour.id}`, { headers: { "x-guide-code": guideCode } }),
      ]);
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
          <p className="text-gray-600 mb-4">
            {new Date(tour.date).toLocaleDateString("fr-FR")} •{" "}
            {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            {" • "}Durée : {tour.durationMinutes} min • Capacité : {tour.capacity}
          </p>

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
                    value={waitlist.reduce((s: number, w: any) => s + (w.places ?? 1), 0)}
                    color="bg-amber-100"
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 mb-4 -mt-3">Compteurs en nombre de personnes (accompagnants inclus).</p>

              <div className="mb-4 flex flex-wrap gap-2">
                <TabBtn active={tab === "registrations"} onClick={() => setTab("registrations")}>
                  Inscrits ({registrations.length})
                </TabBtn>
                <TabBtn active={tab === "waitlist"} onClick={() => setTab("waitlist")}>
                  File d'attente ({waitlist.length})
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

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`p-3 rounded-lg ${color}`}>
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
  const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inscrits-${tour.title.replace(/[^a-z0-9]/gi, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
