import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createLogger } from "@/utils/logger";
import { adminLogin } from "@/services/adminAuth";
import Lock from 'lucide-react/dist/esm/icons/lock';

// Créer un logger pour le composant AdminLogin
const logger = createLogger('AdminLogin');

// Le mot de passe n'est plus comparé ici : il l'était dans le bundle, donc lisible par
// tout visiteur. La vérification se fait côté serveur (action « admin-login » de
// /api/artist-link, variable ADMIN_PASSWORD) et renvoie un token signé.

interface AdminLoginProps {
  onLogin: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await adminLogin(password);
      logger.info('Connexion administrateur réussie');
      onLogin();
    } catch (err) {
      logger.warn('Tentative de connexion administrateur échouée');
      setError((err as Error).message || 'Mot de passe incorrect');
      setAttempts(attempts + 1);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-[#4a5d94] p-3 rounded-full">
              <Lock className="h-6 w-6 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center text-[#4a5d94]">
            Accès Administrateur
          </CardTitle>
          <CardDescription className="text-center">
            Veuillez entrer le mot de passe pour accéder à l'interface d'administration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  className={error ? "border-red-500" : ""}
                  placeholder="Votre mot de passe"
                />
                {error && (
                  <p className="text-sm text-red-500">
                    {error} {attempts > 1 ? `${attempts} tentatives échouées.` : ''}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full bg-[#4a5d94]" disabled={submitting || !password}>
                {submitting ? 'Vérification…' : 'Se connecter'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

