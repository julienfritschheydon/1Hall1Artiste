// Page guide: /guide — Dashboard pour guides (code accès protégé)
import { useState, useEffect } from "react";
import { Tour } from "../types/visitTypes";
import GuideCodeLogin from "../components/GuideCodeLogin";
import GuideToursList from "../components/GuideToursList";

export default function GuidePortal() {
  const [guideCode, setGuideCode] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [tours, setTours] = useState<Tour[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  // Charger code depuis sessionStorage au montage
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
      const res = await fetch("/api/visit-tours", {
        headers: { "x-guide-code": code },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          sessionStorage.removeItem("guideCode");
          throw new Error("Code invalide");
        }
        throw new Error("Erreur au chargement des visites");
      }

      const text = await res.text();
      const data = JSON.parse(text);
      setTours(data);
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
        <div className="container py-8">
          <p>Visite non trouvée</p>
          <button onClick={() => setSelectedTourId(null)} className="text-blue-600 mt-4">
            ← Retour
          </button>
        </div>
      );
    }

    return (
      <TourDetails
        tour={tour}
        guideCode={guideCode!}
        onBack={() => setSelectedTourId(null)}
      />
    );
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Tableau de Bord Guide</h1>
        <button
          onClick={handleLogout}
          className="text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
        >
          Déconnexion
        </button>
      </div>

      {error && <div className="p-4 bg-red-100 text-red-700 rounded mb-4">{error}</div>}

      {loading ? (
        <p>Chargement...</p>
      ) : tours.length === 0 ? (
        <p className="text-gray-600">Aucune visite</p>
      ) : (
        <GuideToursList tours={tours} onSelectTour={setSelectedTourId} />
      )}
    </div>
  );
}

function TourDetails({
  tour,
  guideCode,
  onBack,
}: {
  tour: Tour;
  guideCode: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"registrations" | "attendance">("registrations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    async function fetchAttendance() {
      try {
        const res = await fetch(`/api/visit-attendance?tourId=${tour.id}`, {
          headers: { "x-guide-code": guideCode },
        });

        if (!res.ok) throw new Error("Erreur au chargement");

        const result = await res.json();
        setData(result);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchAttendance();
  }, [tour.id, guideCode]);

  if (loading) return <div>Chargement...</div>;
  if (error)
    return (
      <div>
        <p className="text-red-600">{error}</p>
        <button onClick={onBack} className="text-blue-600 mt-4">
          ← Retour
        </button>
      </div>
    );

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-blue-600 hover:underline">
        ← Retour
      </button>

      <h2 className="text-2xl font-bold mb-4">{tour.title}</h2>
      <p className="text-gray-600 mb-4">
        {new Date(tour.date).toLocaleDateString("fr-FR")} •{" "}
        {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
      </p>

      {data?.counts && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-3 bg-gray-100 rounded">
            <p className="text-xs text-gray-600">Total confirmé</p>
            <p className="text-2xl font-bold">{data.counts.confirmed}</p>
          </div>
          <div className="p-3 bg-green-100 rounded">
            <p className="text-xs text-gray-600">Présent</p>
            <p className="text-2xl font-bold">{data.counts.present}</p>
          </div>
          <div className="p-3 bg-red-100 rounded">
            <p className="text-xs text-gray-600">Absent</p>
            <p className="text-2xl font-bold">{data.counts.absent}</p>
          </div>
          <div className="p-3 bg-yellow-100 rounded">
            <p className="text-xs text-gray-600">Non marqué</p>
            <p className="text-2xl font-bold">{data.counts.unmarked}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("registrations")}
          className={`px-4 py-2 rounded ${
            tab === "registrations"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 hover:bg-gray-300"
          }`}
        >
          Inscrits ({data?.registrations?.length || 0})
        </button>
        <button
          onClick={() => setTab("attendance")}
          className={`px-4 py-2 rounded ${
            tab === "attendance"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 hover:bg-gray-300"
          }`}
        >
          Appel
        </button>
      </div>

      {tab === "registrations" && (
        <RegistrationsList registrations={data?.registrations || []} />
      )}
      {tab === "attendance" && (
        <TourAttendanceSheet
          tour={tour}
          registrations={data?.registrations || []}
          guideCode={guideCode}
        />
      )}
    </div>
  );
}

function RegistrationsList({ registrations }: { registrations: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-2 text-left">Nom</th>
            <th className="border p-2 text-left">Prénom</th>
            <th className="border p-2 text-left">Email</th>
            <th className="border p-2 text-left">Accompagnant</th>
            <th className="border p-2 text-left">Statut</th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((reg) => (
            <tr key={reg.id} className="hover:bg-gray-50">
              <td className="border p-2">{reg.lastName}</td>
              <td className="border p-2">{reg.firstName}</td>
              <td className="border p-2 text-sm">{reg.email}</td>
              <td className="border p-2">
                {reg.companionFirstName ? `${reg.companionFirstName} ${reg.companionLastName}` : "-"}
              </td>
              <td className="border p-2">
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    reg.status === "présent"
                      ? "bg-green-100 text-green-700"
                      : reg.status === "absent"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
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

import TourAttendanceSheet from "../components/TourAttendanceSheet";
