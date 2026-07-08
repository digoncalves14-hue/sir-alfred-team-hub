import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { answerCustomerMessage, type ChatMessage } from "../_shared/customerAssistant.ts";

// Webhook do WhatsApp Cloud API (Meta). Precisa dos secrets:
// WHATSAPP_VERIFY_TOKEN (escolhido por você, usado só na verificação do webhook)
// WHATSAPP_TOKEN (token de acesso da Meta)
// WHATSAPP_PHONE_NUMBER_ID (ID do número configurado no WhatsApp Business)
// Nenhum desses existe ainda — a function funciona (responde 200) mas não
// envia nada enquanto os secrets não forem configurados.

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

const MAX_HISTORY = 20;

async function sendWhatsAppMessage(to: string, body: string) {
  await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && WHATSAPP_VERIFY_TOKEN && token === WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  // Sempre responde 200 pra Meta não reenviar o mesmo evento em loop —
  // qualquer erro é só logado.
  try {
    const payload = await req.json();
    const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message || message.type !== "text") {
      return new Response("ok", { status: 200 });
    }

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.error("WhatsApp não configurado: falta WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID nos secrets.");
      return new Response("ok", { status: 200 });
    }

    const from = message.from as string;
    const text = message.text.body as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("messages")
      .eq("telefone", from)
      .maybeSingle();

    const history = (conversa?.messages as ChatMessage[] | undefined) ?? [];
    const nextMessages = [...history, { role: "user", content: text }].slice(-MAX_HISTORY);

    const reply = await answerCustomerMessage(nextMessages);
    const updatedMessages = [...nextMessages, { role: "assistant", content: reply }].slice(-MAX_HISTORY);

    await supabase.from("whatsapp_conversas").upsert({
      telefone: from,
      messages: updatedMessages,
      updated_at: new Date().toISOString(),
    });

    await sendWhatsAppMessage(from, reply);

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Erro no whatsapp-webhook:", error);
    return new Response("ok", { status: 200 });
  }
});
