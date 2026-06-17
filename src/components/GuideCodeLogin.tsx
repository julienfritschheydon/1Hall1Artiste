// Composant login code accès guide
import { useState } from "react";

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
      // Validate code by fetching tours
      const res = await fetch("/api/visit-tours", {
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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow max-w-md w-full">
        <h1 className="text-2xl font-bold mb-6 text-center">Espace Guide</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Code d'accès</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Entrez votre code"
              className="w-full border px-3 py-2 rounded"
              required
            />
          </div>

          {error && <div className="p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? "Vérification..." : "Accéder"}
          </button>
        </form>

        <p className="text-xs text-gray-600 mt-4 text-center">
          Code accès annuel. Vous pouvez utiliser le même code pour plusieurs visites.
        </p>
      </div>
    </div>
  );
}
