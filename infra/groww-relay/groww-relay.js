// groww-relay: minimal static-IP forwarding proxy for the Groww Trading API.
//
// Purpose: Groww (per SEBI's algo-trading rules) requires order-placement API
// calls to originate from a static IP registered against the API key. Supabase
// edge functions don't have one; this VPS does (46.224.118.179). This relay
// sits between the groww-proxy edge function and api.groww.in, forwarding
// every request 1:1 (same path, method, headers, body) so Groww sees this
// server's IP as the source.
//
// Security:
//  - Binds to 127.0.0.1 only — never reachable except via the Cloudflare
//    Tunnel entry for groww-relay.sankalp-tech.com, which terminates TLS.
//  - Requires header X-Relay-Secret to match RELAY_SECRET (env var) on every
//    request, or responds 403. That header is stripped before forwarding
//    upstream so it never reaches Groww.

const RELAY_SECRET = process.env.RELAY_SECRET;
const PORT = process.env.PORT || 8200;
const UPSTREAM = "https://api.groww.in";

if (!RELAY_SECRET) {
  console.error("RELAY_SECRET env var is required");
  process.exit(1);
}

const http = require("http");

const server = http.createServer(async (req, res) => {
  if (req.headers["x-relay-secret"] !== RELAY_SECRET) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden" }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  const forwardHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase();
    if (["host", "x-relay-secret", "content-length", "connection"].includes(k)) continue;
    forwardHeaders[key] = value;
  }

  try {
    const upstreamRes = await fetch(`${UPSTREAM}${req.url}`, {
      method: req.method,
      headers: forwardHeaders,
      body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
    });
    const responseBody = Buffer.from(await upstreamRes.arrayBuffer());
    const headers = {};
    upstreamRes.headers.forEach((value, key) => {
      if (!["content-encoding", "transfer-encoding", "connection"].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    });
    res.writeHead(upstreamRes.status, headers);
    res.end(responseBody);
  } catch (err) {
    console.error("relay error:", err);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "relay upstream fetch failed", detail: String(err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`groww-relay listening on 127.0.0.1:${PORT}`);
});
