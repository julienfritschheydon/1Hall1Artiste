// Page publique: /reservations — Listing visites guidées + inscription
import { useState, useEffect } from "react";
import { Tour } from "../types/visitTypes";
import { VisitLayout } from "@/components/VisitLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ORANGE = "#ff7a45";

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

  return (
    <VisitLayout
      title="Visites Guidées"
      onBack={selectedTour ? () => setSelectedTour(null) : undefined}
      backTo="/map"
      share={{
        title: "Visites Guidées — Collectif Île Feydeau",
        text: "Découvrez l'Île Feydeau accompagné d'un guide du Collectif.",
      }}
    >
      {loading ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-gray-600">Chargement...</CardContent>
        </Card>
      ) : error ? (
        <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
          <CardContent className="p-6 text-red-600">{error}</CardContent>
        </Card>
      ) : selectedTour ? (
        <TourDetail tour={selectedTour} />
      ) : (
        <>
          <p className="text-center text-gray-600 mb-6">
            Découvrez l'Île Feydeau accompagné d'un guide du Collectif.
          </p>
          {tours.length === 0 ? (
            <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
              <CardContent className="p-6 text-gray-600 text-center">
                Aucune visite disponible pour le moment.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {tours.map((tour) => (
                <TourCard key={tour.id} tour={tour} onClick={() => setSelectedTour(tour)} />
              ))}
            </div>
          )}
          <p className="mt-10 text-xs text-gray-500 text-center">
            <a href="#/reservations/gdpr" className="hover:underline">
              Gérer / supprimer mes données (RGPD)
            </a>
          </p>
        </>
      )}
    </VisitLayout>
  );
}

function TourCard({ tour, onClick }: { tour: Tour; onClick: () => void }) {
  const tourDate = new Date(tour.date);
  const dateStr = tourDate.toLocaleDateString("fr-FR", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = tourDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const placesLeft = tour.placesLeft ?? tour.capacity;

  return (
    <Card
      onClick={onClick}
      className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg cursor-pointer transition hover:-translate-y-0.5 hover:shadow-xl"
    >
      <CardContent className="p-5">
        <h3 className="font-bold text-lg text-[#1a2138] mb-1">{tour.title}</h3>
        <p className="text-sm text-gray-600 capitalize">{dateStr} à {timeStr}</p>
        <p className="text-sm text-gray-600">Durée : {tour.durationMinutes} min</p>
        {(tour.labels?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 my-3">
            {(tour.labels || []).map((label) => (
              <span key={label} className="text-xs bg-[#f1ede2] text-[#5b5340] px-2.5 py-1 rounded-full">
                {label}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <span className="text-sm">
            Places : <b>{placesLeft}/{tour.capacity}</b>
          </span>
          <span className="text-sm font-bold" style={{ color: ORANGE }}>
            S'inscrire ›
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function TourDetail({ tour }: { tour: Tour }) {
  const placesLeft = tour.placesLeft ?? tour.capacity;
  const tourDate = new Date(tour.date);
  const dateStr = tourDate.toLocaleDateString("fr-FR", { weekday: "long", month: "long", day: "numeric" });
  const timeStr = tourDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  return (
    <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg">
      <CardContent className="p-6">
        <h2 className="text-2xl font-bold text-[#1a2138] mb-1">{tour.title}</h2>
        <p className="text-gray-600 mb-4 capitalize">
          {dateStr} à {timeStr} • Durée : {tour.durationMinutes} min
        </p>

        <div className="mb-3 p-3 rounded-lg bg-[#fbf7ec] border border-amber-200 font-semibold text-[#1a2138]">
          Départ : {tour.startLocationName || "Lieu à préciser"}
        </div>
        {(tour.labels?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {(tour.labels || []).map((label) => (
              <span key={label} className="text-xs bg-[#f1ede2] text-[#5b5340] px-2.5 py-1 rounded-full">
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="mb-6 p-3 rounded-lg bg-[#fff6ef] border border-[#ffd9c4] font-bold text-[#e8693a]">
          Places restantes : {placesLeft}/{tour.capacity}
        </div>

        <RegistrationForm tour={tour} placesLeft={placesLeft} />
      </CardContent>
    </Card>
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
      <div
        className={`p-4 rounded-lg ${
          result.status === "waitlist" ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"
        }`}
      >
        <p className="font-semibold text-[#1a2138]">{result.message}</p>
        <button
          onClick={() => {
            setSubmitted(false);
            setEmail("");
            setFirstName("");
            setLastName("");
            setCompanions([]);
          }}
          className="mt-3 text-sm font-semibold hover:underline"
          style={{ color: ORANGE }}
        >
          Faire une autre inscription
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h3 className="font-bold text-lg text-[#1a2138]">S'inscrire</h3>

      {error && <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <Input
        type="email"
        placeholder="Email *"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <div className="grid grid-cols-2 gap-3">
        <Input type="text" placeholder="Prénom *" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        <Input type="text" placeholder="Nom *" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-2">
          Accompagnants (optionnel, {companions.length}/{maxCompanions})
        </p>
        {companions.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
            <Input
              type="text"
              placeholder={`Prénom accompagnant ${i + 1}`}
              value={c.firstName}
              onChange={(e) => updateCompanion(i, "firstName", e.target.value)}
            />
            <Input
              type="text"
              placeholder="Nom"
              value={c.lastName}
              onChange={(e) => updateCompanion(i, "lastName", e.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => removeCompanion(i)} className="text-sm">
              Retirer
            </Button>
          </div>
        ))}
        {companions.length < maxCompanions && (
          <button type="button" onClick={addCompanion} className="text-sm font-semibold hover:underline" style={{ color: ORANGE }}>
            + Ajouter un accompagnant
          </button>
        )}
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="w-full text-white"
        style={{ backgroundColor: ORANGE }}
      >
        {loading ? "..." : placesLeft === 0 ? "Rejoindre la liste d'attente" : "S'inscrire"}
      </Button>

      <p className="text-xs text-gray-600">
        Un email de confirmation sera envoyé. Vous aurez 24h pour valider votre inscription.
      </p>
    </form>
  );
}
