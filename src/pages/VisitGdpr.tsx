// Page droit à l'oubli (RGPD) — spec §6 Q6, §7
// /reservations/gdpr — l'utilisateur saisit son email pour supprimer toutes ses données.
import { useState } from "react";
import { Link } from "react-router-dom";

export default function VisitGdpr() {
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
    <div className="container py-12 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">Suppression de mes données (RGPD)</h1>
      <p className="text-gray-600 mb-6 text-sm">
        Saisissez votre email pour supprimer toutes vos inscriptions aux visites guidées
        et vos entrées en file d'attente. Cette action est irréversible.
      </p>

      {status === "success" ? (
        <div className="p-6 bg-green-100 text-green-800 rounded-lg text-center">
          <p className="font-semibold">{message}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          {status === "error" && (
            <div className="p-2 bg-red-100 text-red-700 rounded text-sm">{message}</div>
          )}
          <input
            type="email"
            placeholder="Votre email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border px-3 py-2 rounded"
          />
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 disabled:bg-gray-400"
          >
            {status === "loading" ? "Suppression..." : "Supprimer mes données"}
          </button>
        </form>
      )}

      <Link to="/reservations" className="inline-block mt-8 text-blue-600 hover:underline">
        ← Retour aux visites
      </Link>
    </div>
  );
}
