import { useEffect, useRef, useState } from "react";

// Vérifie périodiquement /version.json (jamais mis en cache par le fetch,
// même si la page elle-même vient du cache navigateur) et compare au build
// embarqué dans le bundle actuellement chargé. Détecte donc les onglets
// restés ouverts longtemps ET les pages servies depuis un cache périmé
// dès que le JS s'exécute.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function UpdateAvailableBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const checkingRef = useRef(false);

  useEffect(() => {
    const checkVersion = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.buildId && data.buildId !== __BUILD_ID__) {
          setUpdateAvailable(true);
        }
      } catch {
        // Pas de réseau ou route absente (dev) — on ignore silencieusement.
      } finally {
        checkingRef.current = false;
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] bg-[#ff7a45] text-white text-sm px-4 py-2 flex items-center justify-center gap-3 shadow-md">
      <span>Une nouvelle version du site est disponible.</span>
      <button
        onClick={() => window.location.reload()}
        className="underline font-semibold shrink-0"
      >
        Recharger
      </button>
    </div>
  );
}
