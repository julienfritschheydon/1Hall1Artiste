import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tour, MAX_COMPANIONS } from "@/types/visitTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ORANGE = "#ff7a45";

type CompanionInput = { firstName: string; lastName: string };

export function TourRegistrationForm({ tour, placesLeft }: { tour: Tour; placesLeft: number }) {
  const queryClient = useQueryClient();
  // Les identifiants doivent être uniques dans la page : plusieurs formulaires
  // de visites différentes peuvent cohabiter dans le DOM.
  const fieldId = (name: string) => `tour-${tour.id}-${name}`;
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [companions, setCompanions] = useState<CompanionInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  // Toujours 4 accompagnants possibles : un groupe plus grand que les places
  // restantes part en file d'attente ENSEMBLE (règle serveur). Borner par
  // placesLeft empêchait un couple de rejoindre la file quand il restait 1 place.
  const maxCompanions = MAX_COMPANIONS;
  const groupSize = 1 + companions.length;
  const willWaitlist = placesLeft === 0 || groupSize > placesLeft;

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

      // Une page d'erreur HTML (504, proxy) ne doit pas afficher
      // « Unexpected token '<' » à l'utilisateur.
      const data = await res.json().catch(() => ({} as Record<string, string>));

      if (res.ok) {
        setResult({ status: data.status, message: data.message });
        setSubmitted(true);
        // Les places restantes viennent de changer — rafraîchir le cache pour
        // que la prochaine inscription (même appareil) parte d'un état à jour.
        queryClient.invalidateQueries({ queryKey: ["tours"] });
      } else {
        setError(data.error || "Erreur lors de l'inscription. Réessayez.");
      }
    } catch {
      setError("Erreur réseau. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted && result) {
    return (
      <div
        role="status"
        aria-live="polite"
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
    <form onSubmit={handleSubmit} className="space-y-4" aria-labelledby={fieldId("legend")}>
      <h3 id={fieldId("legend")} className="font-bold text-lg text-[#1a2138]">
        S'inscrire
      </h3>

      {/* role="alert" : l'erreur doit être annoncée dès son apparition, un
          lecteur d'écran ne « voit » pas le cadre rouge. */}
      {error && (
        <div
          role="alert"
          id={fieldId("error")}
          className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"
        >
          {error}
        </div>
      )}

      {/* Les champs n'avaient qu'un placeholder : il disparaît à la saisie et
          n'est pas un libellé pour les technologies d'assistance. */}
      <div>
        <label htmlFor={fieldId("email")} className="block text-sm font-medium text-[#1a2138] mb-1">
          Email <span aria-hidden="true">*</span>
        </label>
        <Input
          id={fieldId("email")}
          name="email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.fr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-required="true"
          aria-describedby={error ? fieldId("error") : undefined}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={fieldId("firstName")} className="block text-sm font-medium text-[#1a2138] mb-1">
            Prénom <span aria-hidden="true">*</span>
          </label>
          <Input
            id={fieldId("firstName")}
            name="firstName"
            type="text"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            aria-required="true"
            required
          />
        </div>
        <div>
          <label htmlFor={fieldId("lastName")} className="block text-sm font-medium text-[#1a2138] mb-1">
            Nom <span aria-hidden="true">*</span>
          </label>
          <Input
            id={fieldId("lastName")}
            name="lastName"
            type="text"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            aria-required="true"
            required
          />
        </div>
      </div>

      <fieldset className="border-0 p-0 m-0">
        <legend className="text-sm text-gray-500 mb-2">
          Accompagnants (optionnel, {companions.length}/{maxCompanions})
        </legend>
        {companions.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2 items-end">
            <div>
              <label
                htmlFor={fieldId(`companion-${i}-firstName`)}
                className="block text-xs text-gray-600 mb-1"
              >
                Prénom accompagnant {i + 1}
              </label>
              <Input
                id={fieldId(`companion-${i}-firstName`)}
                type="text"
                value={c.firstName}
                onChange={(e) => updateCompanion(i, "firstName", e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor={fieldId(`companion-${i}-lastName`)}
                className="block text-xs text-gray-600 mb-1"
              >
                Nom accompagnant {i + 1}
              </label>
              <Input
                id={fieldId(`companion-${i}-lastName`)}
                type="text"
                value={c.lastName}
                onChange={(e) => updateCompanion(i, "lastName", e.target.value)}
              />
            </div>
            {/* Le libellé visible dit seulement « Retirer » : sans précision,
                une liste de boutons identiques est inexploitable à l'oreille. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => removeCompanion(i)}
              className="text-sm"
              aria-label={`Retirer l'accompagnant ${i + 1}`}
            >
              Retirer
            </Button>
          </div>
        ))}
        {companions.length < maxCompanions && (
          <button type="button" onClick={addCompanion} className="text-sm font-semibold hover:underline" style={{ color: ORANGE }}>
            + Ajouter un accompagnant
          </button>
        )}
      </fieldset>

      {placesLeft <= 0 ? (
        <p className="text-sm p-3 bg-amber-100 border-2 border-amber-400 text-amber-900 rounded-lg font-semibold">
          Cette visite est complète. Inscrivez-vous en liste d'attente : vous serez prévenu(e) par email si une
          place se libère.
        </p>
      ) : (
        willWaitlist && (
          <p className="text-sm p-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
            Votre groupe ({groupSize} personnes) dépasse les places restantes ({placesLeft}) : vous serez placés
            ensemble en liste d'attente.
          </p>
        )
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full text-white"
        style={{ backgroundColor: willWaitlist ? "#b45309" : ORANGE }}
      >
        {loading ? "..." : willWaitlist ? "Rejoindre la liste d'attente" : "S'inscrire"}
      </Button>

      <p className="text-xs text-gray-600">
        Votre inscription est enregistrée immédiatement : un email récapitulatif (horaire, lieu, ajout au
        calendrier) vous est envoyé dans la foulée. Aucun lien à valider.
      </p>
    </form>
  );
}
