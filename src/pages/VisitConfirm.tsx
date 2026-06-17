// Pages de validation email (token 24H) — visites guidées
// Routes gérées (HashRouter):
//   /reservations/confirm?token=...          → valider inscription
//   /reservations/accept-waitlist?token=...  → accepter offre file d'attente
//   /reservations/cancel-waitlist?id=...     → annuler sa place en file d'attente
import { useState, useEffect } from "react";
import { useLocation, Link } from "react-router-dom";

type Mode = "confirm" | "accept-waitlist" | "cancel-waitlist" | "cancel";
type Status = "loading" | "success" | "error" | "form";

function useQuery() {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

export default function VisitConfirm() {
  const location = useLocation();
  const query = useQuery();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");

  // Determine mode from path
  const path = location.pathname;
  const mode: Mode = path.endsWith("/accept-waitlist")
    ? "accept-waitlist"
    : path.endsWith("/cancel-waitlist")
    ? "cancel-waitlist"
    : path.endsWith("/cancel")
    ? "cancel"
    : "confirm";

  // cancel mode: show email-confirmation form first
  const [cancelEmail, setCancelEmail] = useState("");

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
      // cancel mode waits for user email input
      if (mode === "cancel") {
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
        } else {
          // cancel-waitlist
          const id = query.get("id");
          if (!id) {
            setStatus("error");
            setMessage("Lien invalide : identifiant manquant.");
            return;
          }
          const res = await fetch(`/api/visit-waitlist?id=${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
          const data = await res.json();
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
      : "Annulation file d'attente";

  return (
    <div className="container py-12 max-w-lg mx-auto text-center">
      <h1 className="text-2xl font-bold mb-6">{title}</h1>

      {status === "loading" && (
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-gray-600">Traitement en cours...</p>
        </div>
      )}

      {status === "form" && (
        <form onSubmit={submitCancel} className="max-w-sm mx-auto space-y-3 text-left">
          {message && <div className="p-2 bg-red-100 text-red-700 rounded text-sm">{message}</div>}
          <p className="text-gray-600 text-sm">
            Confirmez votre email pour annuler votre inscription.
          </p>
          <input
            type="email"
            placeholder="Votre email"
            value={cancelEmail}
            onChange={(e) => setCancelEmail(e.target.value)}
            required
            className="w-full border px-3 py-2 rounded"
          />
          <button type="submit" className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700">
            Annuler mon inscription
          </button>
        </form>
      )}

      {status === "success" && (
        <div className="p-6 bg-green-100 text-green-800 rounded-lg">
          <p className="font-semibold">{message}</p>
        </div>
      )}

      {status === "error" && (
        <div className="p-6 bg-red-100 text-red-800 rounded-lg">
          <p className="font-semibold">{message}</p>
        </div>
      )}

      <Link to="/reservations" className="inline-block mt-8 text-blue-600 hover:underline">
        ← Retour aux visites
      </Link>
    </div>
  );
}
