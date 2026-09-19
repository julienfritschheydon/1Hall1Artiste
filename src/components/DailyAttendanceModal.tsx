// Modale « Appels du jour » du dashboard guide : imprimer les feuilles d'appel
// de toutes les visites d'une journée d'un coup, sans ouvrir chaque visite.
//
// Pas d'endpoint dédié : une journée compte au plus quelques visites, on
// réutilise les GET par visite déjà en place (même pattern que
// GuidePortal.refresh). Un endpoint « par date » ne se justifierait qu'au-delà
// d'une dizaine de visites quotidiennes.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tour, placesOf } from "../types/visitTypes";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AttendanceSheet, printAttendanceSheets } from "@/utils/guideExport";

const ORANGE = "#ff7a45";

/** Clé de jour locale (YYYY-MM-DD) — pas toISOString, qui décale en UTC. */
export function localDayKey(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${day}`;
}

export function toursOnDay(tours: Tour[], dayKey: string): Tour[] {
  return tours
    .filter((t) => !t.deletedAt && localDayKey(t.date) === dayKey)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

export default function DailyAttendanceModal({
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
  const [dayKey, setDayKey] = useState(() => localDayKey(new Date()));
  const [sheets, setSheets] = useState<AttendanceSheet[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayTours = useMemo(() => toursOnDay(tours, dayKey), [tours, dayKey]);

  const load = useCallback(async () => {
    if (dayTours.length === 0) {
      setSheets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = { "x-guide-code": guideCode };
      const results = await Promise.all(
        dayTours.map(async (tour) => {
          const [attRes, wlRes] = await Promise.all([
            fetch(`/api/visit-attendance?tourId=${tour.id}`, { headers }),
            fetch(`/api/visit-waitlist?tourId=${tour.id}`, { headers }),
          ]);
          if (attRes.status === 401 || wlRes.status === 401) throw new Error("401");
          if (!attRes.ok) throw new Error("Erreur au chargement");
          const att = await attRes.json();
          const registrations = att.registrations || [];
          const seatsTaken =
            att.counts?.seatsTaken ?? registrations.reduce((s: number, r: any) => s + placesOf(r), 0);
          // La file d'attente est un bonus : son échec ne doit pas priver le
          // guide de sa feuille d'appel.
          let waitlistWithOffer: AttendanceSheet["waitlistWithOffer"] = [];
          if (wlRes.ok) {
            const wl = await wlRes.json();
            waitlistWithOffer = (wl.waitlist || [])
              .filter((w: any) => w.hasOffer && !w.rejectedAt)
              .map((w: any) => ({ firstName: w.firstName, lastName: w.lastName, places: w.places }));
          }
          return {
            tour,
            registrations,
            placesLeft: Math.max(0, tour.capacity - seatsTaken),
            waitlistWithOffer,
          } satisfies AttendanceSheet;
        })
      );
      setSheets(results);
    } catch (e) {
      if ((e as Error).message === "401") {
        onAuthError?.();
        return;
      }
      setError((e as Error).message);
      setSheets(null);
    } finally {
      setLoading(false);
    }
  }, [dayTours, guideCode, onAuthError]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  const dayLabel = new Date(`${dayKey}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  function sheetFor(tourId: string): AttendanceSheet | undefined {
    return sheets?.find((s) => s.tour.id === tourId);
  }

  const ready = !loading && !error && (sheets?.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#1a2138] flex items-center gap-2">
            <span>📋</span>
            <span>Appels du jour</span>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-xs text-gray-500">
          Imprimez les feuilles d'appel des visites d'une journée. Les personnes en file d'attente
          avec une offre en cours figurent en bas de chaque feuille.
        </DialogDescription>

        <div className="flex flex-wrap items-center gap-3 mt-2">
          <label className="text-xs text-gray-600">
            Jour&nbsp;
            <input
              type="date"
              aria-label="Jour"
              value={dayKey}
              onChange={(e) => setDayKey(e.target.value)}
              className="border border-amber-200 rounded px-2 py-1 text-xs"
            />
          </label>
          <Button
            size="sm"
            className="text-white"
            style={{ backgroundColor: ORANGE }}
            disabled={!ready}
            onClick={() => sheets && printAttendanceSheets(sheets, `Appels du jour — ${dayLabel}`)}
          >
            🖨️ Tout imprimer
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-2 mt-3 pr-1">
          {loading && <p className="text-xs text-gray-500">Chargement…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {!loading && !error && dayTours.length === 0 && (
            <p className="text-xs text-gray-600">Aucune visite prévue le {dayLabel}.</p>
          )}
          {!loading &&
            !error &&
            dayTours.map((tour) => {
              const sheet = sheetFor(tour.id);
              const people = sheet
                ? sheet.registrations.reduce((s: number, r: any) => s + placesOf(r), 0)
                : 0;
              return (
                <div
                  key={tour.id}
                  className="p-3 bg-[#fdfbf7] border border-amber-200 rounded-lg flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-[#1a2138] truncate">{tour.title}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(tour.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      {tour.guides && tour.guides.length > 0 ? ` • ${tour.guides.join(", ")}` : ""}
                      {sheet ? ` • ${people} personne${people > 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!sheet}
                    onClick={() => sheet && printAttendanceSheets([sheet])}
                  >
                    Imprimer
                  </Button>
                </div>
              );
            })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
