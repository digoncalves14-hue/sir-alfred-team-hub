import { useMemo, useState } from "react";
import { SectionTitle } from "@/components/ui-kit";
import { ChevronDown, Search, Square } from "lucide-react";

type PopSection = { title: string; items: string[] };
type Pop = {
  code: string;
  area: "Recepção" | "Barbeiros";
  title: string;
  objective: string;
  sections: PopSection[];
  checklist: string[];
  motto: string;
};

const POPS: Pop[] = [
  {
    code: "POP 01",
    area: "Recepção",
    title: "Abertura da Unidade",
    objective:
      "Garantir que a recepção inicie o dia com organização, estrutura pronta, agenda conferida e ambiente preparado para receber bem os clientes.",
    sections: [
      {
        title: "Chegada e preparação inicial",
        items: [
          "Chegar com antecedência e estar pronta para o início do expediente",
          "Desligar o alarme e destravar portas e acessos, quando aplicável",
          "Ligar luzes, ar-condicionado, sistema de som e TV",
          "Verificar funcionamento de computadores, sistema e internet",
        ],
      },
      {
        title: "Agenda, caixa e estrutura de atendimento",
        items: [
          "Conferir agenda do dia e atendimentos agendados",
          "Conferir caixa e troco inicial",
          "Organizar recepção e bancada",
          "Conferir estoque da recepção: água, café, copos, bebidas, produtos, brindes e materiais",
          "Preparar bebidas e café para o início do atendimento",
        ],
      },
      {
        title: "Ambiente pronto para o primeiro cliente",
        items: [
          "Garantir que a unidade esteja pronta, limpa, organizada e acolhedora para o primeiro cliente",
          "Lembrar que a primeira impressão começa na recepção",
          "Manter ambiente organizado para transmitir profissionalismo",
        ],
      },
    ],
    checklist: [
      "A unidade foi aberta e destravada?",
      "Luzes, ar, som e TV foram ligados?",
      "Agenda foi conferida?",
      "Caixa e troco inicial foram conferidos?",
      "Recepção e bancada estão organizadas?",
      "Estoque de água, café e copos foi checado?",
    ],
    motto:
      "Primeira impressão começa na recepção. Comece o dia pronto para receber bem.",
  },
  {
    code: "POP 02",
    area: "Recepção",
    title: "Recepção do Cliente e Início do Atendimento",
    objective:
      "Garantir que o cliente seja recebido com cordialidade, orientação clara e direcionamento correto desde a chegada até o início do atendimento.",
    sections: [
      {
        title: "Recepção do cliente",
        items: [
          "Receber o cliente com sorriso, cordialidade e atenção",
          "Cumprimentar com bom dia, boa tarde ou boa noite",
          "Sempre que possível, chamar o cliente pelo nome",
          "Confirmar horário, serviço e profissional responsável",
          "Nunca deixar o cliente entrar sem ser percebido ou orientado",
        ],
      },
      {
        title: "Acolhimento e conforto",
        items: [
          "Oferecer água ou café ao cliente quando apropriado",
          "Orientar onde aguardar e manter o cliente informado",
          "Acompanhar atrasos e avisar o cliente de forma educada e profissional",
          "Manter a área de espera agradável, limpa e organizada",
        ],
      },
      {
        title: "Direcionamento para o atendimento",
        items: [
          "Avisar o barbeiro sobre a chegada do cliente",
          "Direcionar o cliente ao profissional ou à cadeira no momento correto",
          "Organizar o fluxo para evitar esperas desnecessárias",
          "Transmitir segurança, clareza e organização em cada contato",
        ],
      },
    ],
    checklist: [
      "Recebeu o cliente com sorriso?",
      "Chamou o cliente pelo nome?",
      "Confirmou o agendamento?",
      "Ofereceu água ou café?",
      "Avisou o barbeiro da chegada?",
      "Direcionou corretamente o cliente?",
    ],
    motto:
      "A recepção organiza o início da experiência Sir Alfred: acolhe, orienta e direciona com excelência.",
  },
  {
    code: "POP 03",
    area: "Recepção",
    title: "Execução do Serviço",
    objective:
      "Apoiar o andamento dos atendimentos durante o expediente, mantendo a organização da agenda, o fluxo da unidade e a experiência do cliente sem interferir na execução técnica do barbeiro.",
    sections: [
      {
        title: "Acompanhamento da agenda",
        items: [
          "Acompanhar os horários dos atendimentos do dia",
          "Verificar clientes que já chegaram",
          "Identificar atrasos, encaixes ou alterações na agenda",
          "Avisar o barbeiro sobre o próximo cliente com antecedência",
        ],
      },
      {
        title: "Apoio ao cliente durante a espera",
        items: [
          "Receber o cliente com cordialidade",
          "Oferecer água ou café quando necessário",
          "Informar ao cliente caso haja pequeno atraso",
          "Manter o cliente orientado sobre o atendimento e a área de espera confortável",
        ],
      },
      {
        title: "Comunicação com o barbeiro",
        items: [
          "Avisar o barbeiro quando o cliente chegar",
          "Informar observações importantes do cliente antes do atendimento iniciar",
          "Evitar interromper o barbeiro durante o serviço sem necessidade",
          "Quando precisar falar com o barbeiro durante o atendimento, fazer isso de forma rápida e discreta",
        ],
      },
      {
        title: "Organização da unidade durante os atendimentos",
        items: [
          "Observar se a recepção e a área de espera continuam limpas e alinhadas",
          "Repor água, café e copos quando necessário",
          "Conferir banheiro e áreas comuns ao longo do expediente",
          "Ajudar a manter a unidade visualmente no padrão Sir Alfred",
        ],
      },
    ],
    checklist: [
      "A agenda está sendo acompanhada?",
      "O cliente está orientado enquanto espera?",
      "O barbeiro foi avisado da chegada do cliente?",
      "Houve comunicação discreta quando necessário?",
      "A área de espera está organizada?",
      "Água, café e banheiro foram conferidos?",
    ],
    motto:
      "A recepção organiza o fluxo para que o barbeiro mantenha o foco no cliente.",
  },
  {
    code: "POP 04",
    area: "Recepção",
    title: "Finalização, Pós-atendimento e Recebimento",
    objective:
      "Garantir que a saída do cliente seja organizada, cordial e profissional, encerrando a experiência Sir Alfred com atenção, clareza no recebimento e incentivo ao retorno.",
    sections: [
      {
        title: "Recebimento do cliente após o serviço",
        items: [
          "Receber o cliente na recepção com sorriso e cordialidade",
          "Chamar o cliente pelo nome sempre que possível",
          "Perguntar se deu tudo certo com o atendimento",
          "Demonstrar atenção e interesse genuíno pela experiência do cliente",
        ],
      },
      {
        title: "Confirmação do serviço e pagamento",
        items: [
          "Confirmar o serviço realizado e eventuais adicionais",
          "Conferir valores antes de informar ao cliente",
          "Informar o valor com clareza e educação",
          "Realizar o recebimento conforme a forma de pagamento escolhida",
          "Conferir se o pagamento foi aprovado ou recebido corretamente e registrar no sistema",
        ],
      },
      {
        title: "Reagendamento e produtos",
        items: [
          "Oferecer a possibilidade de remarcar o próximo atendimento, quando fizer sentido",
          "Facilitar o retorno do cliente de forma natural e profissional",
          "Apoiar a venda de produtos quando houver indicação do barbeiro, sem empurrar produto sem necessidade",
        ],
      },
      {
        title: "Despedida e comunicação com a equipe",
        items: [
          "Agradecer pela presença e despedir-se com sorriso e cordialidade",
          "Desejar bom dia, boa tarde ou boa noite e convidar o cliente a retornar de forma natural",
          "Informar à equipe elogios, reclamações ou observações importantes do cliente",
        ],
      },
    ],
    checklist: [
      "Recebeu o cliente com cordialidade após o serviço?",
      "Confirmou serviço e valor?",
      "Recebimento foi registrado corretamente?",
      "Ofereceu possibilidade de reagendamento?",
      "Agradeceu e se despediu com educação?",
      "Alguma observação importante foi comunicada à equipe?",
    ],
    motto:
      "A saída do cliente também faz parte da experiência. Encerrar bem é abrir caminho para o retorno.",
  },
  {
    code: "POP 05",
    area: "Recepção",
    title: "Limpeza, Organização e Padrão da Unidade",
    objective:
      "Garantir que a recepção, área de espera, banheiro, balcão, entrada e áreas comuns estejam sempre organizados, limpos visualmente e dentro do padrão Sir Alfred durante todo o expediente.",
    sections: [
      {
        title: "Organização da recepção",
        items: [
          "Manter o balcão de atendimento limpo e organizado",
          "Evitar excesso de papéis, copos, objetos pessoais ou itens fora do lugar",
          "Manter computador, telefone, máquina de cartão e materiais de trabalho alinhados",
        ],
      },
      {
        title: "Área de espera",
        items: [
          "Conferir se sofá, cadeiras ou poltronas estão alinhados",
          "Retirar copos, papéis, embalagens ou itens deixados pelos clientes",
          "Garantir que o cliente encontre um espaço confortável para aguardar",
        ],
      },
      {
        title: "Água, café e itens de recepção",
        items: [
          "Conferir se há água disponível para os clientes",
          "Conferir café, copos, açúcar, adoçante, mexedores ou itens utilizados pela unidade",
          "Repor itens quando necessário",
          "Manter a máquina de café e área de apoio limpas visualmente",
        ],
      },
      {
        title: "Banheiro, áreas comuns e entrada",
        items: [
          "Conferir o banheiro ao longo do expediente",
          "Verificar se há papel, sabonete, toalha ou itens necessários",
          "Observar corredores, entrada e áreas de circulação",
          "Verificar se porta, fachada, vidro ou área externa próxima estão visualmente limpos",
        ],
      },
      {
        title: "Apoio ao salão e rotina do expediente",
        items: [
          "Observar se as cadeiras estão alinhadas e se as bancadas estão visualmente organizadas",
          "Observar se há acúmulo de cabelo no chão e comunicar o barbeiro quando necessário",
          "Antes de sair para pausa, conferir se a recepção está organizada e que o cliente não ficará sem orientação",
        ],
      },
    ],
    checklist: [
      "Balcão está limpo e organizado?",
      "Área de espera está alinhada?",
      "Água e café foram conferidos?",
      "Banheiro e áreas comuns estão em ordem?",
      "Entrada da unidade está apresentável?",
      "A recepção está pronta para atender bem?",
    ],
    motto:
      "Recepção organizada, ambiente alinhado e cliente bem orientado: esse é o padrão Sir Alfred antes, durante e depois do atendimento.",
  },
  {
    code: "POP 06",
    area: "Recepção",
    title: "Fechamento da Unidade",
    objective:
      "Garantir que a unidade seja encerrada de forma organizada, segura e preparada para a próxima abertura.",
    sections: [
      {
        title: "Conferência dos últimos atendimentos e recebimentos",
        items: [
          "Verificar se todos os clientes do dia foram atendidos e se não há atendimento pendente",
          "Conferir se todos os serviços foram registrados corretamente",
          "Conferir pagamentos em dinheiro, cartão, Pix ou outros meios utilizados",
          "Comunicar qualquer divergência ao responsável e realizar o fechamento do caixa conforme orientação da unidade",
        ],
      },
      {
        title: "Agenda do próximo dia e comunicação com a equipe",
        items: [
          "Conferir a agenda do próximo dia e os primeiros horários agendados",
          "Identificar observações importantes de clientes",
          "Verificar se algum barbeiro possui observação sobre cliente, pagamento, material ou atendimento",
          "Comunicar ao responsável qualquer situação fora do padrão",
        ],
      },
      {
        title: "Organização da recepção e áreas comuns",
        items: [
          "Organizar o balcão de atendimento",
          "Guardar papéis, documentos, canetas, máquina de cartão e materiais de trabalho nos locais corretos",
          "Conferir área de espera, entrada, banheiro e áreas comuns",
          "Retirar copos, papéis e itens deixados pelos clientes",
        ],
      },
      {
        title: "Café, água, copos e pia",
        items: [
          "Conferir se a área do café está limpa e organizada",
          "Não deixar copos, xícaras ou utensílios sujos acumulados na pia",
          "Copos descartáveis devem ser priorizados para clientes",
          "A equipe deve utilizar xícaras para café quando disponíveis e lavar após o uso",
          "Para beber água, cada profissional deve usar seu próprio copo ou garrafa",
        ],
      },
      {
        title: "Apoio na conferência do salão e segurança",
        items: [
          "Observar se as cadeiras estão baixadas, encostos no lugar, capas dobradas e bancadas organizadas",
          "Conferir se TV e som foram desligados no encerramento",
          "Conferir se ar-condicionado ou ventilação foram desligados",
          "Verificar se portas, janelas e acessos estão fechados e ativar o alarme, quando for responsável pelo fechamento",
        ],
      },
    ],
    checklist: [
      "Todos os atendimentos e recebimentos foram conferidos?",
      "Agenda do próximo dia foi verificada?",
      "Balcão e área de espera estão organizados?",
      "Banheiro e áreas comuns estão em ordem?",
      "A área do café está limpa?",
      "TV, som, ar e acessos foram desligados/fechados?",
    ],
    motto:
      "Fechar bem é preparar a próxima abertura. Organização no fim do dia gera excelência no começo do próximo.",
  },
  {
    code: "POP 10",
    area: "Recepção",
    title: "Postura Profissional, Conduta e Cultura Sir Alfred (Recepção)",
    objective:
      "Garantir que a recepção mantenha postura profissional, cordialidade, boa apresentação pessoal, organização e alinhamento com os valores da Sir Alfred durante todo o expediente.",
    sections: [
      {
        title: "Apresentação pessoal",
        items: [
          "Estar com roupa adequada ao padrão da unidade: roupa preta, camiseta ou camisa preta, calça preta e calçado adequado ao ambiente profissional",
          "Usar botton/crachá da Sir Alfred, quando aplicável",
          "Manter cabelo, higiene pessoal e aparência alinhados",
          "Cuidar da higiene bucal e do hálito durante o expediente",
          "Evitar mau cheiro corporal, suor excessivo sem cuidado, odor forte nas roupas e perfume em excesso",
        ],
      },
      {
        title: "Postura na recepção e uso do celular",
        items: [
          "Receber clientes com sorriso no rosto, cordialidade e atenção",
          "Cumprimentar dizendo bom dia, boa tarde ou boa noite",
          "Sempre que possível, chamar o cliente pelo nome",
          "Evitar uso desnecessário do celular durante o expediente",
          "Não atender clientes olhando para o celular e não deixar o cliente esperando enquanto responde mensagens pessoais",
        ],
      },
      {
        title: "Comunicação com clientes e organização do ambiente",
        items: [
          "Manter comunicação clara, educada e objetiva",
          "Confirmar nome, horário, serviço e profissional responsável",
          "Informar atrasos ou mudanças de forma profissional",
          "Manter balcão, área de espera, entrada e banheiro visualmente organizados",
          "Conferir água, café, copos e itens de recepção ao longo do expediente",
        ],
      },
      {
        title: "Relacionamento com a equipe e conduta profissional",
        items: [
          "Tratar barbeiros, gestores e colegas com respeito",
          "Cumprimentar a equipe ao chegar",
          "Evitar discussões, reclamações ou conflitos na frente dos clientes",
          "Evitar fofocas, comentários negativos e conversas inadequadas na recepção",
          "Representar a Sir Alfred em cada atitude",
        ],
      },
      {
        title: "Sigilo e valores Sir Alfred na prática",
        items: [
          "Tratar informações de clientes com discrição",
          "Evitar comentar valores, pagamentos, atrasos, reclamações ou situações particulares em voz alta",
          "Não expor problemas internos para clientes",
          "Cordialidade: receber clientes e equipe com educação, sorriso, respeito e atenção",
          "Pontualidade: respeitar horários, agenda e tempo do cliente",
          "Fidelização: contribuir para que o cliente tenha vontade de voltar",
          "Colaboração: apoiar a equipe e ajudar a operação a fluir",
          "Capacitação: buscar melhoria constante na comunicação, atendimento e rotina da recepção",
          "Riqueza nos detalhes: cuidar do que o cliente vê e sente — recepção, ambiente, atendimento, organização e comunicação",
        ],
      },
    ],
    checklist: [
      "Apresentação pessoal está dentro do padrão?",
      "Recebeu clientes com sorriso e cordialidade?",
      "Uso do celular foi controlado?",
      "Comunicação foi clara e profissional?",
      "Tratou a equipe com respeito?",
      "Manteve discrição com informações de clientes?",
    ],
    motto:
      "Postura, cordialidade e cultura: a recepção é a primeira expressão dos valores Sir Alfred.",
  },
];

const GOLD = "#B8860B";

export default function Pops() {
  const [area, setArea] = useState<"Recepção" | "Barbeiros">("Recepção");
  const [query, setQuery] = useState("");
  const [openCode, setOpenCode] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return POPS.filter((p) => p.area === area).filter((p) => {
      if (!q) return true;
      const haystack = [
        p.title,
        p.objective,
        ...p.sections.flatMap((s) => [s.title, ...s.items]),
        ...p.checklist,
        p.motto,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [area, query]);

  return (
    <div>
      <SectionTitle
        title="POPs Sir Alfred"
        subtitle="Procedimentos Operacionais Padrão"
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["Recepção", "Barbeiros"] as const).map((a) => {
          const active = area === a;
          return (
            <button
              key={a}
              onClick={() => {
                setArea(a);
                setOpenCode(null);
              }}
              className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
              style={{
                backgroundColor: active ? GOLD : "transparent",
                color: active ? "#111" : GOLD,
                border: `1px solid ${GOLD}`,
              }}
            >
              {a}
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2 mb-5"
        style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}
      >
        <Search className="h-4 w-4" style={{ color: GOLD }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título ou conteúdo..."
          aria-label="Buscar POP"
          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/40"
        />
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div
            className="rounded-xl p-6 text-center text-sm text-white/60"
            style={{ backgroundColor: "#1a1a1a", border: "1px solid #2a2a2a" }}
          >
            {area === "Barbeiros"
              ? "POPs de Barbeiros em breve."
              : "Nenhum POP encontrado."}
          </div>
        )}

        {filtered.map((p) => {
          const open = openCode === p.code;
          return (
            <article
              key={p.code}
              className="rounded-xl overflow-hidden transition-all"
              style={{
                backgroundColor: "#1a1a1a",
                border: `1px solid ${open ? GOLD : "#2a2a2a"}`,
              }}
            >
              <button
                onClick={() => setOpenCode(open ? null : p.code)}
                className="w-full flex items-center gap-3 text-left px-4 py-4"
                aria-expanded={open}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-xs font-bold tracking-wider"
                    style={{ color: GOLD }}
                  >
                    {p.code}
                  </p>
                  <p className="font-bold text-white text-base mt-0.5 leading-tight">
                    {p.title}
                  </p>
                  <p className="text-xs text-white/60 mt-1 line-clamp-2">
                    {p.objective}
                  </p>
                </div>
                <ChevronDown
                  className="h-5 w-5 shrink-0 transition-transform"
                  style={{
                    color: GOLD,
                    transform: open ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </button>

              {open && (
                <div className="px-4 pb-5 pt-1 space-y-5">
                  {/* Objetivo */}
                  <div>
                    <p
                      className="text-[11px] font-bold tracking-wider uppercase mb-1"
                      style={{ color: GOLD }}
                    >
                      Objetivo
                    </p>
                    <p className="text-sm text-white/80 leading-relaxed">
                      {p.objective}
                    </p>
                  </div>

                  {/* Seções */}
                  {p.sections.map((s, i) => (
                    <div key={i}>
                      <h3
                        className="text-sm font-bold mb-2"
                        style={{ color: GOLD }}
                      >
                        {i + 1}. {s.title}
                      </h3>
                      <ul className="space-y-1.5">
                        {s.items.map((item, j) => (
                          <li
                            key={j}
                            className="flex gap-2 text-sm text-white/85 leading-relaxed"
                          >
                            <span
                              className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 bg-white"
                              aria-hidden
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {/* Checklist */}
                  <div>
                    <h3
                      className="text-sm font-bold mb-2"
                      style={{ color: GOLD }}
                    >
                      Checklist rápido
                    </h3>
                    <div className="space-y-1.5">
                      {p.checklist.map((c, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-white/85"
                          style={{ backgroundColor: "#222" }}
                        >
                          <Square
                            className="h-4 w-4 mt-0.5 shrink-0"
                            style={{ color: GOLD }}
                          />
                          <span>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Frase padrão */}
                  <div
                    className="rounded-lg p-3 text-sm font-medium text-white"
                    style={{
                      backgroundColor: "#3a2a05",
                      borderLeft: `4px solid ${GOLD}`,
                    }}
                  >
                    {p.motto}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
