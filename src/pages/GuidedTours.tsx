// Page publique: /reservations — Listing visites guidées + inscription
import { useState, useEffect } from "react";
import { Tour } from "../types/visitTypes";

export default function GuidedTours() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTours() {
      try {
        const res = await fetch("/api/visit-tours");
        if (!res.ok) throw new Error("Failed to load tours");
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

    fetchTours();
  }, []);

  if (loading) return <div className="container py-8">Chargement...</div>;
  if (error) return <div className="container py-8 text-red-600">Erreur: {error}</div>;

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-8">Visites Guidées</h1>

      {selectedTour ? (
        <TourDetail tour={selectedTour} onBack={() => setSelectedTour(null)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tours.length === 0 ? (
            <p className="text-gray-600">Aucune visite disponible pour le moment</p>
          ) : (
            tours.map((tour) => <TourCard key={tour.id} tour={tour} onClick={() => setSelectedTour(tour)} />)
          )}
        </div>
      )}

      {!selectedTour && (
        <p className="mt-12 text-xs text-gray-400 text-center">
          <a href="#/reservations/gdpr" className="hover:underline">
            Gérer / supprimer mes données (RGPD)
          </a>
        </p>
      )}
    </div>
  );
}

function TourCard({ tour, onClick }: { tour: Tour; onClick: () => void }) {
  const tourDate = new Date(tour.date);
  const dateStr = tourDate.toLocaleDateString("fr-FR", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = tourDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div onClick={onClick} className="border rounded-lg p-4 cursor-pointer hover:shadow-md transition">
      <h3 className="font-bold text-lg mb-2">{tour.title}</h3>
      <p className="text-sm text-gray-600 mb-2">
        {dateStr} à {timeStr}
      </p>
      <p className="text-sm text-gray-600 mb-2">Durée: {tour.durationMinutes} min</p>
      {tour.labels.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tour.labels.map((label) => (
            <span key={label} className="text-xs bg-gray-200 px-2 py-1 rounded">
              {label}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm font-semibold">
        Places restantes: {tour.placesLeft ?? tour.capacity}/{tour.capacity}
      </p>
    </div>
  );
}

function TourDetail({ tour, onBack }: { tour: Tour; onBack: () => void }) {
  const loading = false;
  const placesLeft = tour.placesLeft ?? tour.capacity;
  const tourDate = new Date(tour.date);
  const dateStr = tourDate.toLocaleDateString("fr-FR", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = tourDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-blue-600 hover:underline">
        ← Retour
      </button>

      <h2 className="text-2xl font-bold mb-2">{tour.title}</h2>
      <p className="text-lg text-gray-600 mb-4">
        {dateStr} à {timeStr} • Durée: {tour.durationMinutes} min
      </p>

      <div className="mb-4 p-4 bg-gray-100 rounded">
        <p className="font-semibold">
          📍 Départ : {tour.startLocationName || `${tour.startLocationLat}, ${tour.startLocationLng}`}
        </p>
        {tour.labels.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tour.labels.map((label) => (
              <span key={label} className="text-sm bg-gray-300 px-2 py-1 rounded">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 p-4 bg-blue-50 rounded">
        <p className="font-semibold">
          Places: {loading ? "..." : `${placesLeft}/${tour.capacity}`}
        </p>
      </div>

      <RegistrationForm tour={tour} placesLeft={placesLeft} />
    </div>
  );
}

type CompanionInput = { firstName: string; lastName: string };

function RegistrationForm({ tour, placesLeft }: { tour: Tour; placesLeft: number }) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companions, setCompanions] = useState<CompanionInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  // Max 4 accompagnants (5 places), borné aussi par les places restantes si > 0
  const maxCompanions = Math.min(4, placesLeft > 0 ? placesLeft - 1 : 4);

  function addCompanion() {
    if (companions.length < maxCompanions) {
      setCompanions([...companions, { firstName: "", lastName: "" }]);
    }
  }
  function removeCompanion(i: number) {
    setCompanions(companions.filter((_, idx) => idx !== i));
  }
  function updateCompanion(i: number, field: keyof CompanionInput, value: string) {
    setCompanions(companions.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanCompanions = companions
        .filter((c) => c.firstName.trim())
        .map((c) => ({ firstName: c.firstName.trim(), lastName: c.lastName.trim() || undefined }));
      const res = await fetch("/api/visit-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tourId: tour.id,
          email,
          firstName,
          lastName,
          companions: cleanCompanions,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ status: data.status, message: data.message });
        setSubmitted(true);
      } else {
        setError(data.error || "Erreur lors de l'inscription");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted && result) {
    return (
      <div className={`p-4 rounded ${result.status === "waitlist" ? "bg-yellow-100" : "bg-green-100"}`}>
        <p className="font-semibold">{result.message}</p>
        {result.status === "waitlist" && (
          <p className="text-sm mt-2">Vous recevrez un email si une place se libère.</p>
        )}
        <button
          onClick={() => {
            setSubmitted(false);
            setEmail("");
            setFirstName("");
            setLastName("");
            setCompanions([]);
          }}
          className="mt-2 text-blue-600 hover:underline"
        >
          Faire une autre inscription
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <h3 className="font-bold text-lg">S'inscrire</h3>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      <input
        type="email"
        placeholder="Email *"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full border px-3 py-2 rounded"
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Prénom *"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          className="w-full border px-3 py-2 rounded"
        />
        <input
          type="text"
          placeholder="Nom *"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          className="w-full border px-3 py-2 rounded"
        />
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-1">
          Accompagnants (optionnel, {companions.length}/{maxCompanions})
        </p>
        {companions.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
            <input
              type="text"
              placeholder={`Prénom accompagnant ${i + 1}`}
              value={c.firstName}
              onChange={(e) => updateCompanion(i, "firstName", e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />
            <input
              type="text"
              placeholder="Nom"
              value={c.lastName}
              onChange={(e) => updateCompanion(i, "lastName", e.target.value)}
              className="w-full border px-3 py-2 rounded"
            />
            <button
              type="button"
              onClick={() => removeCompanion(i)}
              className="px-3 bg-gray-200 rounded hover:bg-gray-300"
              aria-label="Retirer"
            >
              ✕
            </button>
          </div>
        ))}
        {companions.length < maxCompanions && (
          <button
            type="button"
            onClick={addCompanion}
            className="text-sm text-blue-600 hover:underline"
          >
            + Ajouter un accompagnant
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={loading || placesLeft === 0}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {loading ? "..." : placesLeft === 0 ? "Complet (liste d'attente)" : "S'inscrire"}
      </button>

      <p className="text-xs text-gray-600">
        Un email de confirmation sera envoyé. Vous aurez 24h pour valider votre inscription.
      </p>
    </form>
  );
}
