import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { requestMagicLink } from "@/services/artistPortal";

export default function ArtistLogin() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setSending(true);
    try {
      await requestMagicLink(email);
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-xl font-semibold mb-2">Modifier ma fiche artiste</h1>
      <p className="text-sm text-gray-500 mb-6">
        Saisissez l'email utilisé lors de votre inscription. Vous recevrez un lien personnel pour
        modifier votre présentation et votre vignette.
      </p>

      {sent ? (
        <Card className="p-4 bg-green-50 border-green-200 text-sm text-green-800">
          Si cet email est inscrit au programme, un lien vient d'être envoyé. Consultez votre boîte mail.
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              required
            />
          </div>
          <Button type="submit" disabled={sending}>
            {sending ? "Envoi…" : "Recevoir mon lien"}
          </Button>
        </form>
      )}
    </div>
  );
}
