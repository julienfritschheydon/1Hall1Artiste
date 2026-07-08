// Page droit à l'oubli (RGPD) — spec §6 Q6, §7
// /reservations/gdpr — l'utilisateur saisit son email pour supprimer toutes ses données.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { VisitLayout } from "@/components/VisitLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ORANGE = "#ff7a45";

export default function VisitGdpr() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/visit-register?action=gdpr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message);
      } else {
        setStatus("error");
        setMessage(data.error || "Suppression impossible.");
      }
    } catch {
      setStatus("error");
      setMessage("Erreur réseau.");
    }
  }

  return (
    <VisitLayout title="Mes données (RGPD)" backTo="/reservations" hideNav>
      <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg max-w-lg mx-auto">
        <CardContent className="p-6">
          <p className="text-gray-600 mb-5 text-sm">
            Saisissez votre email pour supprimer toutes vos inscriptions aux visites guidées et vos entrées en file
            d'attente. Cette action est irréversible.
          </p>

          {status === "success" ? (
            <div className="p-5 bg-green-50 border border-green-200 text-green-800 rounded-lg text-center">
              <p className="font-semibold">{message}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {status === "error" && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{message}</div>
              )}
              <Input
                type="email"
                placeholder="Votre email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" variant="destructive" disabled={status === "loading"} className="w-full">
                {status === "loading" ? "Suppression..." : "Supprimer mes données"}
              </Button>
            </form>
          )}

          <button
            onClick={() => navigate("/reservations")}
            className="inline-block mt-6 text-sm font-semibold hover:underline"
            style={{ color: ORANGE }}
          >
            ← Retour aux visites
          </button>
        </CardContent>
      </Card>
    </VisitLayout>
  );
}
