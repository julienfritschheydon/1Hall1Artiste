// Liste des prénoms de guides proposés dans le formulaire de visite (« Animé par »).
// Interne : ces noms ne sont jamais montrés au public.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminToken } from "@/services/adminAuth";

export function GuideNamesAdmin() {
  const [names, setNames] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/visit-tours?action=guide-names", {
          headers: { Authorization: `Bearer ${getAdminToken()}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur au chargement");
        setNames(data.names || []);
      } catch (e) {
        setMessage({ type: "error", text: (e as Error).message });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save(next: string[]) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/visit-tours?action=guide-names", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAdminToken()}` },
        body: JSON.stringify({ names: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur à l'enregistrement");
      setNames(data.names || []);
      setMessage({ type: "success", text: "Liste enregistrée" });
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) {
      setMessage({ type: "error", text: "Ce nom est déjà dans la liste" });
      return;
    }
    setNewName("");
    save([...names, name]);
  }

  return (
    <Card className="border-2 border-amber-300 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg text-[#1a2138]">Noms des guides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Prénoms proposés dans le champ « Animé par » des visites. Sert uniquement à filtrer le portail guide : le
          public ne les voit pas.
        </p>

        {loading ? (
          <p className="text-sm text-gray-600">Chargement...</p>
        ) : names.length === 0 ? (
          <p className="text-sm text-gray-600">Aucun nom pour l'instant.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {names.map((n) => (
              <li
                key={n}
                className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm"
              >
                {n}
                <button
                  type="button"
                  className="text-gray-500 hover:text-red-600 ml-1"
                  aria-label={`Retirer ${n}`}
                  disabled={saving}
                  onClick={() => save(names.filter((x) => x !== n))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Prénom du guide"
            maxLength={40}
            disabled={saving || loading}
          />
          <Button
            type="submit"
            disabled={saving || loading || !newName.trim()}
            className="text-white"
            style={{ backgroundColor: "#ff7a45" }}
          >
            Ajouter
          </Button>
        </form>

        {message && (
          <div
            className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
