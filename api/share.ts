export const config = {
  runtime: 'edge',
};

// Fonction simple pour échapper le HTML et éviter les failles XSS
function escapeHtml(unsafe: string) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const title = url.searchParams.get("title");
  const desc = url.searchParams.get("desc");
  const img = url.searchParams.get("img");
  const redirect = url.searchParams.get("redirect");

  const safeTitle = escapeHtml(title || "Collectif Feydeau");
  const safeDesc = escapeHtml(desc || "Événements culturels sur l'Île Feydeau, Nantes");
  const safeImg = escapeHtml(img || "https://www.1hall1artiste.fr/Logo.png");
  
  // Validation et sécurisation de la redirection
  let safeRedirect = "/#/";
  if (typeof redirect === "string" && redirect.startsWith("/")) {
    safeRedirect = "/#" + redirect;
  }

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImg}" />
  <meta property="og:type" content="website" />
  
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImg}" />
  
  <title>${safeTitle}</title>
  
  <script>
    // Redirection automatique vers l'application SPA
    window.location.replace(${JSON.stringify(safeRedirect)});
  </script>
</head>
<body>
  <p>Redirection en cours vers l'événement...</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600'
    }
  });
}
