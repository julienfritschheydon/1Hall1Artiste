// Feuille d'appel pour guide (marquer présent/absent)
import { useState } from "react";
import { Tour, Registration } from "../types/visitTypes";

interface TourAttendanceSheetProps {
  tour: Tour;
  registrations: Registration[];
  guideCode: string;
}

export default function TourAttendanceSheet({
  tour,
  registrations,
  guideCode,
}: TourAttendanceSheetProps) {
  const [checked, setChecked] = useState<Record<string, boolean | null>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle(regId: string, present: boolean | null) {
    setChecked((prev) => ({ ...prev, [regId]: present }));
    setLoading(regId);
    setError(null);

    try {
      const res = await fetch("/api/visit-attendance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-guide-code": guideCode,
        },
        body: JSON.stringify({
          registrationId: regId,
          tourId: tour.id,
          present: present,
        }),
      });

      if (!res.ok) {
        throw new Error("Erreur à la mise à jour");
      }

      // Success
    } catch (e) {
      setError((e as Error).message);
      setChecked((prev) => ({ ...prev, [regId]: null }));
    } finally {
      setLoading(null);
    }
  }

  const sorted = [...registrations].sort((a, b) => {
    const cmp = a.lastName.localeCompare(b.lastName);
    return cmp !== 0 ? cmp : a.firstName.localeCompare(b.firstName);
  });

  return (
    <div>
      {error && <div className="p-3 bg-red-100 text-red-700 rounded mb-4">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="border p-2 text-left">Présent</th>
              <th className="border p-2 text-left">Nom</th>
              <th className="border p-2 text-left">Prénom</th>
              <th className="border p-2 text-left">Email</th>
              <th className="border p-2 text-left">Accompagnant</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((reg) => {
              const isPresent = checked[reg.id] ?? (reg.status === "présent");
              const isAbsent = checked[reg.id] === false;

              return (
                <tr
                  key={reg.id}
                  className={`hover:bg-gray-50 ${
                    isPresent ? "bg-green-50" : isAbsent ? "bg-red-50" : ""
                  }`}
                >
                  <td className="border p-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggle(reg.id, true)}
                        disabled={loading === reg.id}
                        className={`px-3 py-1 rounded text-sm ${
                          isPresent
                            ? "bg-green-600 text-white"
                            : "bg-gray-300 hover:bg-gray-400"
                        }`}
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => handleToggle(reg.id, false)}
                        disabled={loading === reg.id}
                        className={`px-3 py-1 rounded text-sm ${
                          isAbsent
                            ? "bg-red-600 text-white"
                            : "bg-gray-300 hover:bg-gray-400"
                        }`}
                      >
                        ✗
                      </button>
                    </div>
                  </td>
                  <td className="border p-2">{reg.lastName}</td>
                  <td className="border p-2">{reg.firstName}</td>
                  <td className="border p-2 text-sm">{reg.email}</td>
                  <td className="border p-2 text-sm">
                    {reg.companionFirstName ? `${reg.companionFirstName} ${reg.companionLastName}` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600 mt-4">
        Cliquez sur ✓ ou ✗ pour marquer la présence. Les données sont mises à jour instantanément.
      </p>
    </div>
  );
}
