// Composant login code accès guide
import { useState } from "react";
import { IMAGE_PATHS } from "../constants/imagePaths";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface GuideCodeLoginProps {
  onSubmit: (code: string) => void;
}

export default function GuideCodeLogin({ onSubmit }: GuideCodeLoginProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate code by fetching tours. ?guide=1 : URL distincte de la liste
      // publique cachée en edge — sinon un code invalide pouvait être « validé »
      // par une réponse en cache (le serveur renvoie désormais 401 sur code faux).
      const res = await fetch("/api/visit-tours?guide=1", {
        headers: { "x-guide-code": code },
      });

      if (res.status === 401) {
        setError("Code invalide");
        return;
      }

      if (!res.ok) {
        setError("Erreur de connexion");
        return;
      }

      onSubmit(code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundImage: `url('${IMAGE_PATHS.BACKGROUNDS.PARCHMENT}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-white/20 pointer-events-none" />
      <Card className="relative z-10 bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg max-w-md w-full">
        <CardContent className="p-8">
          <h1 className="text-2xl font-bold mb-6 text-center text-[#ff7a45]">Espace Guide</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-[#4a4636]">Code d'accès</label>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Entrez votre code"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            <Button type="submit" disabled={loading} className="w-full text-white" style={{ backgroundColor: "#ff7a45" }}>
              {loading ? "Vérification..." : "Accéder"}
            </Button>
          </form>

          <p className="text-xs text-gray-600 mt-4 text-center">
            Code accès annuel. Vous pouvez utiliser le même code pour plusieurs visites.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
