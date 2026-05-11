export function GET() {
  return new Response("hello from drafthr (named GET)", {
    headers: { "Content-Type": "text/plain" },
  });
}
