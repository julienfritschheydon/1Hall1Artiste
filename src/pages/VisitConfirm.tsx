// Pages de validation email (token 24H) — visites guidées
// Routes gérées (HashRouter):
//   /reservations/confirm?token=...          → valider inscription
//   /reservations/accept-waitlist?token=...  → accepter offre file d'attente
//   /reservations/cancel-waitlist?id=...     → annuler sa place en file d'attente (avec confirmation)
//   /reservations/gdpr-confirm?token=...     → confirmer la suppression RGPD (avec confirmation)
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { VisitLayout } from "@/components/VisitLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const ORANGE = "#ff7a45";

type Mode = "confirm" | "accept-waitlist" | "cancel-waitlist" | "cancel" | "gdpr-confirm";
type Status = "loading" | "success" | "error" | "form";

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

export default function VisitConfirm() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = useQuery();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  // Determine mode from path
  const path = location.pathname;
  const mode: Mode = path.endsWith("/accept-waitlist")
    ? "accept-waitlist"
    : path.endsWith("/cancel-waitlist")
    ? "cancel-waitlist"
    : path.endsWith("/gdpr-confirm")
    ? "gdpr-confirm"
    : path.endsWith("/cancel")
    ? "cancel"
    : "confirm";

  // cancel mode: show email-confirmation form first
  const [cancelEmail, setCancelEmail] = useState("");

  // cancel-waitlist : action destructive — exiger un clic explicite. Le DELETE
  // partait au simple chargement de la page : un clic accidentel ou un scanner
  // de liens de messagerie retirait irréversiblement la personne de la file.
  async function submitCancelWaitlist() {
    setStatus("loading");
    const id = query.get("id");
    const email = query.get("email");
    if (!id || !email) {
      setStatus("error");
      setMessage("Lien invalide : identifiant manquant.");
      return;
    }
    try {
      const res = await fetch(
        `/api/visit-waitlist?id=${encodeURIComponent(id)}&email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({} as Record<string, string>));
      if (res.ok && data.ok) {
        setStatus("success");
        setMessage("Vous avez été retiré de la file d'attente.");
      } else if (data.error === "already cancelled") {
        setStatus("success");
        setMessage("Vous étiez déjà retiré de la file d'attente.");
      } else {
        setStatus("error");
        setMessage(data.error || "Annulation impossible.");
      }
    } catch {
      setStatus("error");
      setMessage("Erreur réseau. Réessayez plus tard.");
    }
  }

  // gdpr-confirm : même principe — suppression définitive derrière un clic explicite.
  async function submitGdprConfirm() {
    setStatus("loading");
    const token = query.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Lien invalide : token manquant.");
      return;
    }
    try {
      const res = await fetch("/api/visit-register?action=gdpr-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({} as Record<string, string>));
      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message || "Vos données ont été supprimées.");
      } else if (data.error === "token expired") {
        setStatus("error");
        setMessage("Lien expiré (24h dépassées). Refaites une demande de suppression.");
      } else {
        setStatus("error");
        setMessage(data.error || "Suppression impossible.");
      }
    } catch {
      setStatus("error");
      setMessage("Erreur réseau. Réessayez plus tard.");
    }
  }

  async function submitCancel(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const id = query.get("id");
    if (!id) {
      setStatus("error");
      setMessage("Lien invalide : identifiant manquant.");
      return;
    }
    try {
      const res = await fetch("/api/visit-register?action=cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: id, email: cancelEmail }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setStatus("success");
        setMessage("Inscription annulée. Vous recevrez un email de confirmation.");
      } else if (data.error === "email does not match registration") {
        setStatus("form");
        setMessage("Email incorrect. Réessayez.");
      } else {
        setStatus("error");
        setMessage(data.error || "Annulation impossible.");
      }
    } catch {
      setStatus("error");
      setMessage("Erreur réseau.");
    }
  }

  useEffect(() => {
    async function run() {
      // Modes destructifs : attendre une action explicite de l'utilisateur.
      if (mode === "cancel" || mode === "cancel-waitlist" || mode === "gdpr-confirm") {
        setStatus("form");
        return;
      }
      try {
        if (mode === "confirm") {
          const token = query.get("token");
          if (!token) {
            setStatus("error");
            setMessage("Lien invalide : token manquant.");
            return;
          }
          const res = await fetch("/api/visit-register?action=confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            setStatus("success");
            setMessage("Inscription confirmée ! Vous recevrez un rappel avant la visite.");
          } else if (data.error === "token expired") {
            setStatus("error");
            setMessage("Lien expiré. Votre inscription a été annulée. Vous pouvez vous réinscrire.");
          } else {
            setStatus("error");
            setMessage(data.error || "Validation impossible.");
          }
        } else if (mode === "accept-waitlist") {
          const token = query.get("token");
          if (!token) {
            setStatus("error");
            setMessage("Lien invalide : token manquant.");
            return;
          }
          const res = await fetch("/api/visit-waitlist?action=activate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const data = await res.json();
          if (res.ok && data.ok) {
            setStatus("success");
            setMessage("Place confirmée ! Votre inscription est validée.");
          } else if (data.error === "token expired") {
            setStatus("error");
            setMessage("Offre expirée (24H dépassées). La place a été proposée à la personne suivante.");
          } else {
            setStatus("error");
            setMessage(data.error || "Activation impossible.");
          }
        }
      } catch (e) {
        setStatus("error");
        setMessage("Erreur réseau. Réessayez plus tard.");
      }
    }
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const title =
    mode === "confirm"
      ? "Validation de votre inscription"
      : mode === "accept-waitlist"
      ? "Acceptation de votre place"
      : mode === "cancel"
      ? "Annulation de votre inscription"
      : mode === "gdpr-confirm"
      ? "Suppression de mes données"
      : "Annulation file d'attente";

  return (
    <VisitLayout title={title} backTo="/reservations" hideNav>
      <Card className="bg-white/90 backdrop-blur-sm border-2 border-amber-300 shadow-lg max-w-lg mx-auto">
        <CardContent className="p-6 text-center">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-3 py-4">
              <div
                className="w-8 h-8 border-2 border-gray-300 rounded-full animate-spin"
                style={{ borderTopColor: ORANGE }}
              />
              <p className="text-gray-600">Traitement en cours...</p>
            </div>
          )}

          {status === "form" && mode === "cancel" && (
            <form onSubmit={submitCancel} className="space-y-3 text-left">
              {message && (
                <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{message}</div>
              )}
              <p className="text-gray-600 text-sm">Confirmez votre email pour annuler votre inscription.</p>
              <Input
                type="email"
                placeholder="Votre email"
                value={cancelEmail}
                onChange={(e) => setCancelEmail(e.target.value)}
                required
              />
              <Button type="submit" variant="destructive" className="w-full">
                Annuler mon inscription
              </Button>
            </form>
          )}

          {status === "form" && mode === "cancel-waitlist" && (
            <div className="space-y-3">
              <p className="text-gray-600 text-sm">
                Vous êtes sur le point de quitter la file d'attente. Cette action est irréversible : vous perdrez
                votre position.
              </p>
              <Button variant="destructive" className="w-full" onClick={submitCancelWaitlist}>
                Quitter la file d'attente
              </Button>
            </div>
          )}

          {status === "form" && mode === "gdpr-confirm" && (
            <div className="space-y-3">
              <p className="text-gray-600 text-sm">
                Vous êtes sur le point de supprimer définitivement toutes vos inscriptions aux visites guidées et
                vos entrées en file d'attente. Cette action est irréversible.
              </p>
              <Button variant="destructive" className="w-full" onClick={submitGdprConfirm}>
                Supprimer définitivement mes données
              </Button>
            </div>
          )}

          {status === "success" && (
            <div className="p-5 bg-green-50 border border-green-200 text-green-800 rounded-lg">
              <p className="font-semibold">{message}</p>
            </div>
          )}

          {status === "error" && (
            <div className="p-5 bg-red-50 border border-red-200 text-red-800 rounded-lg">
              <p className="font-semibold">{message}</p>
            </div>
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
