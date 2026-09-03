import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useData } from "@/hooks/useData";
import { Artist } from "@/data/artists";
import { ARTIST_EDITABLE_FIELDS } from "@/services/artistPortal";

export function ArtistAdmin() {
  const { artists: allArtists } = useData();
  const [editingArtist, setEditingArtist] = useState<Artist | null>(null);
  const [filter, setFilter] = useState<"all" | "exposition" | "concert">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const artists = allArtists.filter((a) => filter === "all" || a.type === filter);

  async function handleSave(artist: Artist) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Sauvegarde dans Firebase overrides (seuls les champs éditables du portail artiste sont persistés)
      const fields: Record<string, string> = {};
      for (const field of ARTIST_EDITABLE_FIELDS) {
        fields[field] = artist[field] || "";
      }

      const res = await fetch("/api/artist-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId: artist.id,
          fields,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur sauvegarde");
        return;
      }

      setSuccess(`${artist.name} modifié avec succès`);
      setEditingArtist(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (editingArtist) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Éditer {editingArtist.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-gray-500">
            Nom, type, titre, email, téléphone et YouTube proviennent du programme (Google Sheet)
            et ne sont pas modifiables ici.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nom</Label>
              <Input value={editingArtist.name} disabled />
            </div>
            <div>
              <Label>Type</Label>
              <Input value={editingArtist.type} disabled />
            </div>
          </div>

          <div>
            <Label>Titre</Label>
            <Input value={editingArtist.title} disabled />
          </div>

          <div>
            <Label>Présentation</Label>
            <textarea
              value={editingArtist.presentation || ""}
              onChange={(e) => setEditingArtist({ ...editingArtist, presentation: e.target.value })}
              className="border rounded px-3 py-2 w-full h-24"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Instagram</Label>
              <Input
                value={editingArtist.instagram || ""}
                onChange={(e) => setEditingArtist({ ...editingArtist, instagram: e.target.value })}
                placeholder="@username"
              />
            </div>
            <div>
              <Label>Facebook</Label>
              <Input
                value={editingArtist.facebook || ""}
                onChange={(e) => setEditingArtist({ ...editingArtist, facebook: e.target.value })}
                placeholder="URL"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Website</Label>
              <Input
                value={editingArtist.website || ""}
                onChange={(e) => setEditingArtist({ ...editingArtist, website: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label>YouTube</Label>
              <Input value={editingArtist.youtube || ""} disabled />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input value={editingArtist.email || ""} disabled type="email" />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input value={editingArtist.phone || ""} disabled />
            </div>
          </div>

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 rounded">{success}</div>
          )}

          <div className="flex gap-2">
            <Button onClick={() => handleSave(editingArtist)} disabled={saving} className="bg-orange-500">
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
            <Button variant="outline" onClick={() => setEditingArtist(null)}>
              Annuler
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Filtrer par type</Label>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="border rounded px-3 py-2">
          <option value="all">Tous</option>
          <option value="exposition">Expositions</option>
          <option value="concert">Concerts</option>
        </select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Artistes ({artists.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2">Nom</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {artists.map((artist) => (
                  <tr key={artist.id} className="border-t hover:bg-gray-50">
                    <td className="p-2">{artist.name}</td>
                    <td className="p-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          artist.type === "exposition"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {artist.type}
                      </span>
                    </td>
                    <td className="p-2 text-xs">{artist.email || "-"}</td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingArtist(artist)}>
                        Éditer
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
