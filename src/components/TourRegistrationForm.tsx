import { useState } from "react";
import { Tour } from "@/types/visitTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ORANGE = "#ff7a45";

type CompanionInput = { firstName: string; lastName: string };

export function TourRegistrationForm({ tour, placesLeft }: { tour: Tour; placesLeft: number }) {
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
    <form onSubmit={handleSubmit} className="space-y-4">
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
