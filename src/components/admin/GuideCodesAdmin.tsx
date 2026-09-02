import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function GuideCodesAdmin() {
  const [newCode, setNewCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [createdCode, setCreatedCode] = useState("");

  async function handleCreateCode(e: React.FormEvent) {
    e.preventDefault();
    if (!newCode.trim()) {
      setMessage({ type: "error", text: "Entrez un code" });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/guide-code-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Erreur création code" });
        return;
      }

      setCreatedCode(newCode.trim());
      setMessage({ type: "success", text: "Code guide créé avec succès !" });
      setShowResult(true);
      setNewCode("");
    } catch (e) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-2 border-amber-300 shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg text-[#1a2138]">Gérer les codes guides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Créer un nouveau code d'accès pour les guides. Les guides l'utiliseront pour se connecter à leur tableau de bord.
        </p>

        <form onSubmit={handleCreateCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newCode">Nouveau code d'accès</Label>
            <Input
              id="newCode"
              type="text"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Ex: @bF454#$ ou CODE123"
              disabled={loading}
            />
            <p className="text-xs text-gray-500">
              Le code peut contenir lettres, chiffres et caractères spéciaux
            </p>
          </div>

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

          {showResult && createdCode && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-semibold text-amber-900 mb-2">Code créé:</p>
              <div
                style={{
                  backgroundColor: "#fff",
                  border: "2px dashed #ff7a45",
                  padding: "12px",
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: "16px",
                  textAlign: "center",
                  letterSpacing: "2px",
                  fontWeight: "bold",
                  color: "#ff7a45",
                }}
              >
                {createdCode}
              </div>
              <p className="text-xs text-amber-700 mt-3">
                ✓ Ce code est maintenant valide et prêt à être utilisé par les guides.
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !newCode.trim()}
            className="w-full text-white"
            style={{ backgroundColor: "#ff7a45" }}
          >
            {loading ? "Création..." : "Créer le code"}
          </Button>
        </form>

        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-semibold text-[#1a2138] mb-2">Instructions:</h4>
          <ol className="text-xs text-gray-600 space-y-1 list-decimal list-inside">
            <li>Entrez le nouveau code d'accès</li>
            <li>Cliquez sur "Créer le code"</li>
            <li>Le code s'affichera et sera immédiatement actif</li>
            <li>Partagez le code avec les guides</li>
            <li>Les guides peuvent le saisir à /guide</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
