import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { answerCustomerMessage, RateLimitError, CreditsExhaustedError } from "../_shared/customerAssistant.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages deve ser um array" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const reply = await answerCustomerMessage(messages);

    return new Response(JSON.stringify({ reply }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
        status: 429,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if (error instanceof CreditsExhaustedError) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Fale com a equipe." }), {
        status: 402,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    console.error("Erro no customer-chat:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado no assistente." }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
