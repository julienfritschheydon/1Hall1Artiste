import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { dataService } from "@/services/dataService";
import type { Artist } from "@/data/artists";
import {
  decodeToken,
  uploadThumbnail,
  saveArtistFields,
  requestMagicLink,
  type ArtistFields,
} from "@/services/artistPortal";
import { compressImage, validateImageFile } from "@/utils/imageCompression";

type FormState = Required<Pick<ArtistFields, "presentation" | "instagram" | "facebook" | "website" | "thumbnail">>;

const EMPTY_FORM: FormState = { presentation: "", instagram: "", facebook: "", website: "", thumbnail: "" };

export default function ArtistEdit() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const decoded = useMemo(() => decodeToken(token), [token]);
  const { toast } = useToast();

  const [artist, setArtist] = useState<Artist | undefined>(undefined);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resending, setResending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);

  // Charge l'artiste depuis le programme (abonnement au dataService).
  useEffect(() => {
    if (!decoded || decoded.expired) return;
    const sync = () => {
      const a = dataService.getArtistById(decoded.artistId);
      if (a && !initialized.current) {
        initialized.current = true;
        setArtist(a);
        setForm({
          presentation: a.presentation || "",
          instagram: a.instagram || "",
          facebook: a.facebook || "",
          website: a.website || "",
          thumbnail: a.thumbnail || a.image || "",
        });
      } else if (a) {
        setArtist(a);
      }
    };
    sync();
    const unsub = dataService.subscribe(sync);
    dataService.refreshProgram();
    return unsub;
  }, [decoded]);

  // ── Lien invalide / expiré ────────────────────────────────────────────────
  if (!token || !decoded) {
    return <ExpiredScreen email="" onResend={undefined} />;
  }
  if (decoded.expired) {
    return (
      <ExpiredScreen
        email={decoded.email}
        resending={resending}
        onResend={async () => {
          setResending(true);
          try {
            await requestMagicLink(decoded.email);
            toast({ title: "Lien envoyé", description: "Consultez votre boîte mail." });
          } catch {
            toast({ title: "Erreur", description: "Envoi impossible, réessayez.", variant: "destructive" });
          } finally {
            setResending(false);
          }
        }}
      />
    );
  }

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validateImageFile(file);
    if (!v.valid) {
      toast({ title: "Image invalide", description: v.error, variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const { file: compressed } = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
        format: "jpeg",
        maxSizeKB: 800,
      });
      const url = await uploadThumbnail(compressed);
      setForm((f) => ({ ...f, thumbnail: url }));
    } catch (err) {
      toast({ title: "Échec de l'envoi", description: "L'image n'a pas pu être envoyée.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveArtistFields(token, form);
      setSaved(true);
      toast({ title: "Modifications enregistrées", description: "En ligne d'ici environ 1 minute." });
    } catch (err) {
      toast({ title: "Erreur", description: (err as { message?: string })?.message || "Enregistrement impossible.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold mb-1">Modifier ma fiche</h1>
      {artist && <p className="text-sm text-gray-500 mb-4">{artist.name}</p>}

      <form onSubmit={onSubmit} className="space-y-5">
        {/* Vignette */}
        <div>
          <Label className="mb-2 block">Vignette</Label>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
              {form.thumbnail ? (
                <img src={form.thumbnail} alt="Vignette" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">🖼️</span>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={onPickImage}
              />
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? "Envoi…" : "Choisir une photo"}
              </Button>
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="presentation">Présentation</Label>
          <Textarea id="presentation" rows={5} value={form.presentation} onChange={set("presentation")} />
        </div>
        <div>
          <Label htmlFor="instagram">Instagram</Label>
          <Input id="instagram" value={form.instagram} onChange={set("instagram")} placeholder="https://instagram.com/…" />
        </div>
        <div>
          <Label htmlFor="facebook">Facebook</Label>
          <Input id="facebook" value={form.facebook} onChange={set("facebook")} placeholder="https://facebook.com/…" />
        </div>
        <div>
          <Label htmlFor="website">Site internet</Label>
          <Input id="website" value={form.website} onChange={set("website")} placeholder="https://…" />
        </div>

        <Button type="submit" className="w-full" disabled={saving || uploading}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>

        {saved && (
          <Card className="p-3 bg-green-50 border-green-200 text-sm text-green-800">
            ✓ Enregistré. Vos modifications seront visibles par les visiteurs d'ici environ 1 minute.
          </Card>
        )}
      </form>
    </div>
  );
}

function ExpiredScreen({
  email,
  onResend,
  resending,
}: {
  email: string;
  onResend?: () => void;
  resending?: boolean;
}) {
  const [value, setValue] = useState(email);
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  async function send() {
    if (onResend) return onResend();
    if (!value.includes("@")) {
      toast({ title: "Email invalide", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await requestMagicLink(value);
      toast({ title: "Lien envoyé", description: "Consultez votre boîte mail." });
    } catch {
      toast({ title: "Erreur", description: "Envoi impossible.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10 text-center">
      <h1 className="text-xl font-semibold mb-2">Ce lien a expiré</h1>
      <p className="text-sm text-gray-500 mb-6">Demandez un nouveau lien : il sera envoyé à votre adresse.</p>
      <div className="flex flex-col gap-3">
        <Input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="votre@email.com"
        />
        <Button onClick={send} disabled={sending || resending}>
          {sending || resending ? "Envoi…" : "M'envoyer un nouveau lien"}
        </Button>
      </div>
    </div>
  );
}
