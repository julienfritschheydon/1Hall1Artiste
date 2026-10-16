import './utils/productionConsole'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './styles/animations.css'
import './styles/responsive.css'
import { initErrorHandlingSystem } from './utils/errorHandling'
import { initFirebaseDebug, sendTestEvent } from './debug/firebaseDebug'
import { initGtagDebug, sendGtagTestEvent } from './debug/gtag-debug'
import './debug/analytics-realtime-test'

// La gestion des logs est maintenant gérée par le système de logging centralisé
// dans utils/logger.ts

// Initialiser le système de gestion des erreurs
initErrorHandlingSystem();

// Après un déploiement, un client avec l'ancien index.html (cache, service worker)
// réclame des chunks dont le hash n'existe plus. On recharge une seule fois pour
// récupérer la nouvelle version (garde en sessionStorage pour éviter une boucle).
window.addEventListener('vite:preloadError', () => {
  const key = 'chunk_reload_at';
  try {
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    // sessionStorage indisponible : on recharge quand même
  }
  window.location.reload();
});

// Initialiser le mode debug Firebase en développement
if (import.meta.env.DEV) {
  // Méthode 1: Firebase Debug
  initFirebaseDebug();
  
  // Méthode 2: Gtag Debug (alternative)
  initGtagDebug();
  
  // Envoyer des événements de test après un court délai
  setTimeout(() => {
    // Tester les deux méthodes
    sendTestEvent();
    sendGtagTestEvent();

    console.log("[Main] Événements de test envoyés depuis main.tsx");
  }, 2000);
}

createRoot(document.getElementById("root")!).render(<App />);

