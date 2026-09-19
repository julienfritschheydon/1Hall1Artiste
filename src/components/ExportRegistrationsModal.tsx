// Modale « Exporter inscriptions » du dashboard guide : un CSV de toutes les
// inscriptions, toutes visites confondues (bilan de saison, publipostage).
//
// Une modale d'options plutôt qu'un téléchargement immédiat : le périmètre par
// défaut n'a rien d'évident, et sur « toutes les visites » le fan-out mérite
// d'être annoncé.
import { useMemo, useState } from "react";
import { Tour } from "../types/visitTypes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ExportEntry,
  appendFailedToursNote,
  buildFullRegistrationsCsv,
  downloadCsv,
  mapWithLimit,
} from "@/utils/guideExport";

const ORANGE = "#ff7a45";
/** Quelques dizaines de visites : on ne lance pas tout d'un coup. */
const MAX_PARALLEL = 5;

export type ExportScope = "upcoming" | "all" | "one";

export function selectTours(tours: Tour[], scope: ExportScope, tourId: string, now = Date.now()): Tour[] {
  const alive = tours.filter((t) => !t.deletedAt);
  const chosen =
    scope === "one"
      ? alive.filter((t) => t.id === tourId)
      : scope === "upcoming"
      ? alive.filter((t) => new Date(t.date).getTime() >= now)
      : alive;
  return [...chosen].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export function exportFileName(scope: ExportScope, tour: Tour | undefined, today = new Date()): string {
  const slug =
    scope === "one"
      ? // Tirets de bord retirés : « Île Feydeau ! » donnait « -le-Feydeau-- ».
        ((tour?.title || "visite").replace(/[^a-z0-9]/gi, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-") || "visite")
      : scope === "upcoming"
      ? "a-venir"
      : "toutes";
  const day = today.toISOString().slice(0, 10);
  return `inscriptions-${slug}-${day}.csv`;
}

export default function ExportRegistrationsModal({
  open,
  onOpenChange,
  tours,
  guideCode,
  onAuthError,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tours: Tour[];
  guideCode: string;
  onAuthError?: () => void;
}) {
  const [scope, setScope] = useState<ExportScope>("upcoming");
  const [tourId, setTourId] = useState("");
  const [includeWaitlist, setIncludeWaitlist] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedTours = useMemo(
    () => [...tours].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [tours]
  );
  const selected = useMemo(() => selectTours(tours, scope, tourId), [tours, scope, tourId]);
  const busy = progress !== null;

  async function run() {
    if (selected.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: selected.length });
    const failed: string[] = [];

    try {
      const headers = { "x-guide-code": guideCode };
      let expired = false;

      const entries = await mapWithLimit(
        selected,
        MAX_PARALLEL,
        async (tour): Promise<ExportEntry | null> => {
          try {
            const attRes = await fetch(`/api/visit-attendance?tourId=${tour.id}`, { headers });
            if (attRes.status === 401) {
              expired = true;
              return null;
            }
            if (!attRes.ok) throw new Error("attendance");
            const att = await attRes.json();

            let waitlist: any[] = [];
            if (includeWaitlist) {
              const wlRes = await fetch(`/api/visit-waitlist?tourId=${tour.id}`, { headers });
              if (wlRes.status === 401) {
                expired = true;
                return null;
              }
              if (wlRes.ok) waitlist = (await wlRes.json()).waitlist || [];
            }
            return { tour, registrations: att.registrations || [], waitlist };
          } catch {
            // Une visite illisible ne doit pas faire perdre tout l'export :
            // on la signale en fin de fichier et on continue.
            failed.push(tour.title);
            return null;
          }
        },
        (done, total) => setProgress({ done, total })
      );

      if (expired) {
        onAuthError?.();
        return;
      }

      const ok = entries.filter((e): e is ExportEntry => e !== null);
      if (ok.length === 0) {
        setError("Aucune visite n'a pu être chargée.");
        return;
      }

      const csv = appendFailedToursNote(buildFullRegistrationsCsv(ok, { includeWaitlist }), failed);
      downloadCsv(exportFileName(scope, selected[0]), csv);
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#1a2138] flex items-center gap-2">
            <span>📥</span>
            <span>Exporter les inscriptions</span>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-xs text-gray-500">
          Un fichier CSV, une ligne par inscription. Les inscriptions annulées n'y figurent pas :
          elles n'occupent plus de place et ne sont pas renvoyées par l'API.
        </DialogDescription>

        <div className="space-y-3 mt-2 text-xs">
          <fieldset className="space-y-1">
            <legend className="text-gray-600 mb-1">Périmètre</legend>
            {(
              [
                ["upcoming", "Visites à venir"],
                ["all", "Toutes les visites"],
                ["one", "Une visite"],
              ] as [ExportScope, string][]
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                />
                <span>{label}</span>
              </label>
            ))}
            {scope === "one" && (
              <select
                aria-label="Visite à exporter"
                value={tourId}
                onChange={(e) => setTourId(e.target.value)}
                className="border border-amber-200 rounded px-2 py-1 w-full mt-1"
              >
                <option value="">Choisir une visite…</option>
                {sortedTours.map((t) => (
                  <option key={t.id} value={t.id}>
                    {new Date(t.date).toLocaleDateString("fr-FR")} — {t.title}
                  </option>
                ))}
              </select>
            )}
          </fieldset>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeWaitlist}
              onChange={(e) => setIncludeWaitlist(e.target.checked)}
            />
            <span>Inclure la file d'attente</span>
          </label>

          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            Fichier nominatif — à ne pas diffuser hors de l'organisation, à supprimer après usage.
          </p>

          {busy && (
            <p className="text-gray-600">
              Visite {progress!.done}/{progress!.total}…
            </p>
          )}
          {error && <p className="text-red-600">{error}</p>}

          <Button
            size="sm"
            className="text-white w-full"
            style={{ backgroundColor: ORANGE }}
            disabled={busy || selected.length === 0}
            onClick={run}
          >
            Télécharger le CSV
            {selected.length > 0 && !busy ? ` (${selected.length} visite${selected.length > 1 ? "s" : ""})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
