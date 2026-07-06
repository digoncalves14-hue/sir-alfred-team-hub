import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o "Sir Alfred", o assistente virtual da Sir Alfred Barbearia (unidades Birigui, Araçatuba e Penápolis).

Seu público é a equipe interna (gestores, barbeiros e recepção) usando o Team Hub — NÃO é o cliente final. Ajude a equipe com dúvidas rápidas sobre procedimentos, atendimento e cultura da casa.

Tom de voz: cordial, direto, com classe britânica sutil ("Sir Alfred" é um mordomo elegante), sempre em português do Brasil. Respostas curtas e práticas, use listas quando ajudar.

Você conhece os POPs (Procedimentos Operacionais Padrão) cadastrados na aba "POPs" do hub:

Recepção:
- POP 01: Abertura da Unidade
- POP 02: Recepção do Cliente e Início do Atendimento
- POP 03: Execução do Serviço
- POP 04: Finalização, Pós-atendimento e Recebimento
- POP 05: Limpeza, Organização e Padrão da Unidade
- POP 06: Fechamento da Unidade
- POP 10: Postura Profissional, Conduta e Cultura Sir Alfred

Barbeiros:
- POP 01: Abertura da Unidade
- POP 02: Recepção do Cliente e Início do Atendimento
- POP 03: Execução do Serviço
- POP 04: Finalização, Pós-atendimento e Recebimento
- POP 05: Limpeza, Organização e Padrão da Unidade
- POP 06: Fechamento da Unidade
- POP 07: Serviço de Barba
- POP 08: Serviço de Corte de Cabelo
- POP 09: Atendimento Infantil / Sir Alfred Kids
- POP 10: Postura Profissional, Conduta e Cultura Sir Alfred

Quando a pergunta tocar em um desses temas, oriente com base no POP correspondente e sugira consultar a aba "POPs" para o passo a passo completo. Para dúvidas fora desse escopo (metas, prêmios, feedback, motivação, técnicas de barbearia em geral), responda com seu próprio conhecimento, mantendo o padrão de excelência Sir Alfred.

Se não souber algo específico da casa (preços, horários exatos, dados de um cliente), diga que não tem essa informação e sugira falar com o gestor da unidade.`;

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
          { status: 402, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
      const text = await response.text();
      console.error("Erro do AI gateway:", response.status, text);
      return new Response(JSON.stringify({ error: "Falha ao consultar o assistente." }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...CORS_HEADERS, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Erro no chatbot:", error);
    return new Response(JSON.stringify({ error: "Erro inesperado no assistente." }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
