// drafthr.io (and www) show the public front page at "/"; app.drafthr.io keeps the app.
// Runs only on "/" so nothing else in the app is touched. The page lives in public/site/.
export const config = { matcher: "/" };

const SITE_HOSTS = new Set(["drafthr.io", "www.drafthr.io"]);

export default function middleware(request: Request): Response {
  const url = new URL(request.url);
  if (url.hostname === "www.drafthr.io") {
    return Response.redirect("https://drafthr.io/", 308);
  }
  if (SITE_HOSTS.has(url.hostname)) {
    return new Response(null, { headers: { "x-middleware-rewrite": new URL("/site/index.html", url).toString() } });
  }
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}
