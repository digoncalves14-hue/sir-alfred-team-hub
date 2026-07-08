import { createClient } from "jsr:@supabase/supabase-js@2";

export class RateLimitError extends Error {}
export class CreditsExhaustedError extends Error {}

const UNIT_HOURS: Record<string, string> = {
  Birigui: "Segunda a sexta, 8h às 20h. Sábado, 8h às 18h. Fechado aos domingos.",
};

const REGISTER_TOOL = {
  type: "function",
  function: {
    name: "registrar_solicitacao_agendamento",
    description:
      "Registra um pedido de agendamento para a equipe confirmar. Só chame depois de já ter coletado nome, telefone, unidade, serviço desejado e preferência de data/horário do cliente.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string" },
        telefone: { type: "string" },
        unidade: { type: "string", enum: ["Birigui", "Aracatuba"] },
        servico: { type: "string" },
        preferencia: { type: "string", description: "Data/horário preferido, em texto livre" },
        observacoes: { type: "string" },
      },
      required: ["nome", "telefone", "unidade", "servico", "preferencia"],
    },
  },
};

function buildSystemPrompt(servicesText: string) {
  return `Você é o assistente de atendimento da Sir Alfred Barbearia, falando diretamente com clientes (não é a equipe interna).

Tom de voz: caloroso, elegante, direto — como um mordomo britânico atencioso. Sempre em português do Brasil. Respostas curtas.

Unidades atendidas por aqui: Birigui e Araçatuba. (Penápolis ainda não está disponível neste canal.)

Horários de funcionamento:
- Birigui: ${UNIT_HOURS.Birigui}
- Araçatuba: ainda não tenho o horário exato cadastrado — se perguntarem, diga que vai confirmar com a equipe e sugira ligar para a unidade.

Catálogo de serviços e preços (Birigui):
${servicesText}

Para Araçatuba ainda não tenho a lista de preços cadastrada — avise o cliente e ofereça registrar o pedido mesmo assim para a equipe confirmar valores.

Quando o cliente quiser agendar um horário:
1. Colete: nome completo, telefone com DDD, unidade, serviço desejado e preferência de data/horário.
2. Confirme os dados com o cliente antes de registrar.
3. Chame a função registrar_solicitacao_agendamento com esses dados.
4. Avise que a equipe vai confirmar o horário exato por telefone/WhatsApp em breve (ainda não confirmamos disponibilidade em tempo real).

Nunca invente disponibilidade de horário, preço fora do catálogo, ou promessas que a equipe não confirmou. Se não souber algo, diga que vai verificar com a equipe.`;
}

function formatServices(services: { nome: string; preco: number; duracao_min: number; categoria: string | null }[]) {
  if (services.length === 0) return "(catálogo ainda não cadastrado)";
  return services
    .map((s) => `- ${s.nome}${s.categoria ? ` (${s.categoria})` : ""}: R$ ${s.preco.toFixed(2)} · ${s.duracao_min}min`)
    .join("\n");
}

async function callGateway(messages: unknown[], tools: unknown[] | undefined, apiKey: string) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      ...(tools ? { tools } : {}),
    }),
  });

  if (response.status === 429) throw new RateLimitError("Limite de requisições atingido.");
  if (response.status === 402) throw new CreditsExhaustedError("Créditos de IA esgotados.");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI gateway respondeu ${response.status}: ${text}`);
  }

  return response.json();
}

export type ChatMessage = { role: string; content: string };

export async function answerCustomerMessage(messages: ChatMessage[]): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: services } = await supabase
    .from("services")
    .select("nome, preco, duracao_min, categoria")
    .eq("unidade", "Birigui")
    .eq("ativo", true)
    .order("categoria");

  const systemPrompt = buildSystemPrompt(formatServices(services ?? []));
  const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

  let payload = await callGateway(fullMessages, [REGISTER_TOOL], LOVABLE_API_KEY);
  let assistantMessage = payload.choices[0].message;
  const toolCall = assistantMessage.tool_calls?.[0];

  if (toolCall?.function?.name === "registrar_solicitacao_agendamento") {
    const args = JSON.parse(toolCall.function.arguments);
    const { error: insertError } = await supabase.from("solicitacoes_agendamento").insert({
      nome: args.nome,
      telefone: args.telefone,
      unidade: args.unidade,
      servico: args.servico,
      preferencia: args.preferencia,
      observacoes: args.observacoes ?? null,
    });

    const toolResultContent = insertError
      ? "Erro ao registrar o pedido. Peça desculpas ao cliente e sugira contato direto com a unidade."
      : "Pedido registrado com sucesso. A equipe vai confirmar em breve.";

    const followUpMessages = [
      ...fullMessages,
      assistantMessage,
      { role: "tool", tool_call_id: toolCall.id, content: toolResultContent },
    ];

    payload = await callGateway(followUpMessages, undefined, LOVABLE_API_KEY);
    assistantMessage = payload.choices[0].message;
  }

  return assistantMessage.content;
}
