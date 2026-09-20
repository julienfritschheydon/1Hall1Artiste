// Modale « Rechercher un inscrit » du dashboard guide.
//
// Le portail n'offrait qu'une entrée PAR VISITE. Quand quelqu'un appelle (« je
// ne retrouve plus mon inscription », « je voudrais annuler »), il fallait
// exporter le CSV et le fouiller — et le CSV omet les inscriptions annulées,
// justement le cas où l'on cherche.
//
// Ici : une recherche par nom ou email (accents et casse indifférents), toutes
// visites et tous statuts confondus, file d'attente comprise, avec les actions
// directement sur le résultat.
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const ORANGE = "#ff7a45";
const MIN_QUERY = 2;

export type SearchTour = {
  id: string;
  title: string;
  date: string;
  startLocationName?: string;
  status?: string;
} | null;

export type SearchRegistration = {
  id: string;
  tourId: string;
  tour: SearchTour;
  status: "confirmé" | "présent" | "absent" | "annulé" | string;
  places: number;
  createdAt: string;
  cancelledAt?: string;
  reminder7dSent: boolean;
  reminder3hSent: boolean;
  validation1dSent: boolean;
};

export type SearchWaitlist = {
  id: string;
  tourId: string;
  tour: SearchTour;
  position: number;
  places: number;
  createdAt: string;
  invitationSentAt?: string;
  invitationExpiresAt?: string;
  rejectedAt?: string;
};

export type SearchPerson = {
  email: string;
  firstName: string;
  lastName: string;
  registrations: SearchRegistration[];
  waitlist: SearchWaitlist[];
};

/** Date lisible en heure de Paris — les fonctions serveur tournent en UTC. */
export function formatTourDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

/** Pastille de statut : la couleur porte l'information au premier coup d'œil. */
export function statusStyle(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case "confirmé":
      return { bg: "#e6f4ea", fg: "#1e7c3a", label: "Confirmé" };
    case "présent":
      return { bg: "#e3f0ff", fg: "#1a5fb4", label: "Présent" };
    case "absent":
      return { bg: "#fdecec", fg: "#b42318", label: "Absent" };
    case "annulé":
      return { bg: "#f1f1f1", fg: "#6b6b6b", label: "Annulé" };
    default:
      return { bg: "#f1f1f1", fg: "#6b6b6b", label: status };
  }
}

/** Une visite déjà commencée ne se pointe plus « à l'avance » ni ne s'annule. */
export function tourHasStarted(tour: SearchTour, now = Date.now()): boolean {
  if (!tour?.date) return false;
  const t = new Date(tour.date).getTime();
  return !isNaN(t) && t <= now;
}

function Badge({ status }: { status: string }) {
  const s = statusStyle(status);
  return (
    <span
      style={{
        background: s.bg,
        color: s.fg,
        borderRadius: 999,
        padding: "1px 8px",
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export default function RegistrantSearchModal({
  open,
  onOpenChange,
  guideCode,
  onAuthError,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  guideCode: string;
  onAuthError?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPerson[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Une réponse lente ne doit pas écraser le résultat d'une frappe plus récente.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(null);
      setError(null);
      setNotice(null);
      setBusyId(null);
    }
  }, [open]);

  const runSearch = useCallback(
    async (q: string) => {
      const term = q.trim();
      if (term.length < MIN_QUERY) {
        setResults(null);
        setError(null);
        return;
      }
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/visit-register?action=search&q=${encodeURIComponent(term)}`, {
          headers: { "x-guide-code": guideCode },
        });
        if (res.status === 401) {
          onAuthError?.();
          return;
        }
        const data = await res.json();
        if (seq !== requestSeq.current) return; // réponse périmée
        if (!res.ok) {
          setError(data?.error || "Échec de la recherche");
          setResults(null);
          return;
        }
        setResults(data.results || []);
        setTruncated(!!data.truncated);
      } catch {
        if (seq === requestSeq.current) setError("Réseau indisponible — réessayer");
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [guideCode, onAuthError]
  );

  async function act(
    id: string,
    label: string,
    call: () => Promise<Response>
  ) {
    setBusyId(id);
    setNotice(null);
    setError(null);
    try {
      const res = await call();
      if (res.status === 401) {
        onAuthError?.();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || `Échec : ${label}`);
        return;
      }
      setNotice(`${label} — c'est fait.`);
      await runSearch(query); // on relit, pour ne jamais afficher un état deviné
    } catch {
      setError("Réseau indisponible — réessayer");
    } finally {
      setBusyId(null);
    }
  }

  const cancelRegistration = (reg: SearchRegistration, person: SearchPerson) =>
    act(reg.id, "Inscription annulée", () =>
      fetch("/api/visit-register?action=cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-guide-code": guideCode },
        body: JSON.stringify({ registrationId: reg.id, email: person.email }),
      })
    );

  const mark = (reg: SearchRegistration, present: boolean) =>
    act(reg.id, present ? "Marqué présent" : "Marqué absent", () =>
      fetch("/api/visit-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-guide-code": guideCode },
        body: JSON.stringify({ registrationId: reg.id, tourId: reg.tourId, present }),
      })
    );

  const removeFromWaitlist = (w: SearchWaitlist, person: SearchPerson) =>
    act(w.id, "Retiré de la file d'attente", () =>
      fetch(`/api/visit-waitlist?id=${encodeURIComponent(w.id)}&email=${encodeURIComponent(person.email)}`, {
        method: "DELETE",
        headers: { "x-guide-code": guideCode },
      })
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#1a2138] flex items-center gap-2">
            🔎 Rechercher un inscrit
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-xs text-gray-500">
          Par nom ou adresse email. Les accents et la casse n'ont pas d'importance. Les inscriptions
          annulées apparaissent aussi.
        </DialogDescription>

        <form
          className="flex gap-2 mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query);
          }}
        >
          <label htmlFor="registrant-search" className="sr-only">
            Nom ou email
          </label>
          <input
            id="registrant-search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ex. Dupont, ou marie@…"
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <Button type="submit" disabled={loading || query.trim().length < MIN_QUERY} style={{ background: ORANGE }}>
            {loading ? "…" : "Chercher"}
          </Button>
        </form>

        {error && (
          <p role="alert" className="text-xs mt-2" style={{ color: "#b42318" }}>
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-xs mt-2" style={{ color: "#1e7c3a" }}>
            {notice}
          </p>
        )}

        <div className="mt-3 max-h-[55vh] overflow-y-auto space-y-4">
          {results?.length === 0 && (
            <p className="text-xs text-gray-500">
              Aucun inscrit ne correspond à « {query.trim()} ».
            </p>
          )}

          {truncated && (
            <p className="text-xs text-gray-500">
              Beaucoup de résultats : affiner la recherche pour tous les voir.
            </p>
          )}

          {results?.map((person) => (
            <section key={person.email} className="border rounded p-3">
              <header className="mb-2">
                <p className="text-sm font-semibold text-[#1a2138]">
                  {person.firstName} {person.lastName}
                </p>
                <p className="text-xs text-gray-500">{person.email}</p>
              </header>

              {person.registrations.length === 0 && person.waitlist.length === 0 && (
                <p className="text-xs text-gray-500">Aucune inscription.</p>
              )}

              {person.registrations.map((reg) => {
                const started = tourHasStarted(reg.tour);
                const busy = busyId === reg.id;
                const over = reg.status === "annulé";
                return (
                  <div key={reg.id} className="border-t pt-2 mt-2 first:border-t-0 first:pt-0 first:mt-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs">
                        <p className="font-medium text-[#1a2138]">{reg.tour?.title || "Visite supprimée"}</p>
                        <p className="text-gray-500">
                          {formatTourDate(reg.tour?.date)}
                          {reg.tour?.startLocationName ? ` · ${reg.tour.startLocationName}` : ""}
                        </p>
                        <p className="text-gray-500">
                          {reg.places} place{reg.places > 1 ? "s" : ""}
                          {reg.cancelledAt ? ` · annulée le ${formatTourDate(reg.cancelledAt)}` : ""}
                        </p>
                        <p className="text-gray-400">
                          Rappels : J-7 {reg.reminder7dSent ? "✓" : "—"} · J-1{" "}
                          {reg.validation1dSent ? "✓" : "—"} · 3h {reg.reminder3hSent ? "✓" : "—"}
                        </p>
                      </div>
                      <Badge status={reg.status} />
                    </div>

                    <div className="flex flex-wrap gap-2 mt-2">
                      {!over && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => mark(reg, true)}
                          >
                            Présent
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => mark(reg, false)}
                          >
                            Absent
                          </Button>
                          {/* Une visite commencée ne s'annule plus : l'API refuse, autant
                              ne pas proposer le bouton. */}
                          {!started && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => cancelRegistration(reg, person)}
                              style={{ color: "#b42318", borderColor: "#f0c4c0" }}
                            >
                              Annuler l'inscription
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {person.waitlist.map((w) => (
                <div key={w.id} className="border-t pt-2 mt-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs">
                      <p className="font-medium text-[#1a2138]">
                        {w.tour?.title || "Visite supprimée"}
                      </p>
                      <p className="text-gray-500">
                        {formatTourDate(w.tour?.date)} · file d'attente, position {w.position}
                      </p>
                      <p className="text-gray-500">
                        {w.places} place{w.places > 1 ? "s" : ""}
                        {w.invitationSentAt ? " · offre envoyée" : ""}
                        {w.rejectedAt ? " · offre expirée ou refusée" : ""}
                      </p>
                    </div>
                    <span
                      style={{
                        background: "#fff4e6",
                        color: "#b45309",
                        borderRadius: 999,
                        padding: "1px 8px",
                        fontSize: 11,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      File d'attente
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === w.id}
                      onClick={() => removeFromWaitlist(w, person)}
                      style={{ color: "#b42318", borderColor: "#f0c4c0" }}
                    >
                      Retirer de la file
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
