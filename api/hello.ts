export default function handler(): Response {
  return new Response("hello from drafthr", {
    headers: { "Content-Type": "text/plain" },
  });
}
