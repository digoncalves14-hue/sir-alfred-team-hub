// Relay HTTP minimo: roda na VPS com IP fixo autorizado pelo AppBarber.
// Recebe chamadas autenticadas da Edge Function do Supabase e repassa pro
// AppBarber, anexando a chave de API real (que só existe aqui, nunca no Supabase).
const http = require("node:http");

const PORT = process.env.PORT || 8787;
const RELAY_SECRET = process.env.RELAY_SECRET;
const APPBARBER_BASE_URL = process.env.APPBARBER_BASE_URL;
const APPBARBER_API_KEY = process.env.APPBARBER_API_KEY;
const APPBARBER_AUTH_HEADER = process.env.APPBARBER_AUTH_HEADER || "Authorization";
const APPBARBER_AUTH_SCHEME = process.env.APPBARBER_AUTH_SCHEME ?? "Bearer ";

if (!RELAY_SECRET) {
  console.error("RELAY_SECRET não definido. Configure o .env antes de iniciar (veja .env.example).");
  process.exit(1);
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true });
  }

  if (req.method !== "POST" || req.url !== "/proxy") {
    return send(res, 404, { error: "not found" });
  }

  if (req.headers.authorization !== `Bearer ${RELAY_SECRET}`) {
    return send(res, 401, { error: "unauthorized" });
  }

  if (!APPBARBER_BASE_URL || !APPBARBER_API_KEY) {
    return send(res, 500, { error: "relay não configurado: falta APPBARBER_BASE_URL/APPBARBER_API_KEY no .env" });
  }

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    let parsed;
    try {
      parsed = JSON.parse(raw || "{}");
    } catch {
      return send(res, 400, { error: "corpo inválido, esperado JSON" });
    }

    const { method, path, body } = parsed;
    if (!method || !path) {
      return send(res, 400, { error: "method e path são obrigatórios" });
    }

    try {
      const upstream = await fetch(`${APPBARBER_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          [APPBARBER_AUTH_HEADER]: `${APPBARBER_AUTH_SCHEME}${APPBARBER_API_KEY}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const text = await upstream.text();
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      });
      res.end(text);
    } catch (err) {
      console.error("Erro ao chamar o AppBarber:", err);
      send(res, 502, { error: "falha ao chamar o AppBarber" });
    }
  });
});

server.listen(PORT, () => console.log(`Relay ouvindo na porta ${PORT}`));
