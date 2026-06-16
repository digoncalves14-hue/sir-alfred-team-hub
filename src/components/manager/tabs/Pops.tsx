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
  {
    code: "POP 01",
    area: "Barbeiros",
    title: "Abertura da Unidade",
    objective:
      "Garantir que o barbeiro esteja pronto para iniciar o atendimento no horário correto, com aparência adequada, cadeira preparada, bancada organizada e postura profissional.",
    sections: [
      {
        title: "Chegada e postura",
        items: [
          "Chegar com no mínimo 15 minutos de antecedência",
          "Estar com roupa adequada ao padrão da unidade: roupa preta, camiseta ou camisa preta, calça preta e calçado adequado ao ambiente profissional",
          "Usar botton/crachá da Sir Alfred, quando aplicável",
          "Conferir aparência pessoal: cabelo, barba, higiene, hálito e postura",
          "Evitar mau cheiro corporal, suor excessivo sem cuidado e perfume em excesso",
          "Guardar objetos pessoais em local apropriado e evitar uso desnecessário do celular ao chegar",
          "Conferir a agenda do dia",
        ],
      },
      {
        title: "Preparação da cadeira",
        items: [
          "Conferir se a cadeira está limpa visualmente",
          "Manter a cadeira sempre baixada",
          "Manter o encosto sempre no lugar",
          "Manter as capas dobradas e organizadas",
          "Garantir que a cadeira esteja pronta antes do cliente chegar",
        ],
      },
      {
        title: "Preparação da bancada",
        items: [
          "Conferir se as máquinas estão carregadas",
          "Organizar pentes, tesouras, navalhas, escovas e finalizadores",
          "Conferir a água do borrifador",
          "Separar as toalhas necessárias para os atendimentos",
          "Manter a bancada limpa, alinhada e sem excesso de objetos",
        ],
      },
      {
        title: "Quando o barbeiro chegar antes da recepção",
        items: [
          "Abrir a unidade, desligar o alarme e acender as luzes principais",
          "Ligar ar-condicionado ou ventilação",
          "Ligar a TV sempre no esporte",
          "Ligar o som ambiente pela playlist oficial da Sir Alfred no Spotify, preferencialmente rock, em volume agradável",
          "Ligar a máquina de café e o equipamento de toalhas quentes, quando aplicável",
          "Verificar se a loja está visualmente apresentável",
          "Conferir a agenda antes do cliente chegar, observando nome, horário, serviço e profissional responsável",
          "Receber o cliente com cordialidade, sorriso, bom dia/boa tarde/boa noite, chamar pelo nome quando possível e oferecer água ou café",
          "Conduzir o cliente até a cadeira no horário correto",
        ],
      },
      {
        title: "Apoio sem assumir a recepção",
        items: [
          "Não é obrigação principal do barbeiro conferir estoque de café, água, copos ou insumos da recepção, nem conferir caixa ou fazer fechamento financeiro",
          "Na ausência da recepção, o barbeiro pode receber o cliente, oferecer água ou café, direcionar até a cadeira, confirmar o serviço e receber pagamento quando necessário",
          "Apoiar não significa assumir definitivamente a função administrativa da recepção",
        ],
      },
      {
        title: "Limpeza durante o expediente",
        items: [
          "Sempre que possível, varrer os cabelos após cada corte para evitar acúmulo no chão",
          "Manter o espaço ao redor da cadeira apresentável durante todo o expediente",
          "Antes de sair para almoço, pausa ou descanso, deixar a cadeira, bancada e área ao redor organizadas",
          "Nunca sair para almoço ou descanso deixando o local sujo, bagunçado ou fora do padrão",
        ],
      },
    ],
    checklist: [
      "Chegou 15 minutos antes?",
      "Está com roupa preta e botton/crachá?",
      "Conferiu sua agenda?",
      "Cadeira está limpa, baixada e com encosto no lugar?",
      "Bancada está organizada?",
      "Máquinas estão carregadas?",
      "Se chegou antes da recepção, abriu a unidade e ligou os itens básicos?",
      "Cliente foi recebido com sorriso e cordialidade?",
    ],
    motto:
      "O barbeiro deve iniciar o dia pronto para atender, nunca se preparando na frente do cliente.",
  },
  {
    code: "POP 02",
    area: "Barbeiros",
    title: "Recepção do Cliente e Início do Atendimento",
    objective:
      "Garantir que o cliente seja recebido pelo barbeiro com cordialidade, atenção e profissionalismo, iniciando o atendimento de forma organizada e dentro do padrão Sir Alfred.",
    sections: [
      {
        title: "Postura ao receber o cliente",
        items: [
          "Receber o cliente com sorriso no rosto",
          "Cumprimentar dizendo bom dia, boa tarde ou boa noite",
          "Sempre que possível, chamar o cliente pelo nome",
          "Demonstrar atenção, educação e profissionalismo",
          "Evitar iniciar o atendimento de forma apressada ou distraída",
          "Não atender o cliente usando celular ou conversando sobre assuntos paralelos",
        ],
      },
      {
        title: "Condução até a cadeira",
        items: [
          "Receber o cliente quando ele for direcionado pela recepção",
          "Caso a recepção não esteja disponível, o barbeiro pode receber o cliente diretamente",
          "Conduzir o cliente até a cadeira com cordialidade",
          "Garantir que a cadeira esteja pronta antes do cliente sentar",
          "Posicionar a capa com cuidado e atenção",
        ],
      },
      {
        title: "Confirmação do serviço",
        items: [
          "Confirmar com o cliente qual serviço será realizado",
          "Verificar se o serviço está de acordo com o agendamento",
          "Perguntar se o cliente deseja manter o mesmo estilo ou fazer alguma alteração",
          "Ouvir o cliente com atenção antes de iniciar",
          "Evitar começar o serviço sem confirmar o que será feito",
        ],
      },
      {
        title: "Consultoria inicial",
        items: [
          "Avaliar o cabelo, barba ou serviço solicitado antes de iniciar",
          "Orientar o cliente quando perceber algo que possa melhorar o resultado",
          "Explicar de forma simples o que será feito, quando necessário",
          "Respeitar o desejo do cliente",
          "Oferecer sugestão de corte, barba ou finalização quando fizer sentido",
        ],
      },
      {
        title: "Início do atendimento",
        items: [
          "Iniciar o atendimento no horário correto sempre que possível",
          "Conferir se os materiais necessários estão à mão",
          "Evitar interromper o atendimento sem necessidade",
          "Manter o cliente confortável durante o serviço",
          "Evitar conversas paralelas e não deixar o cliente no vácuo",
          "Manter foco no cliente durante todo o tempo reservado para o atendimento",
        ],
      },
      {
        title: "Quando houver atraso",
        items: [
          "Avisar o cliente com educação caso haja atraso",
          "Explicar de forma breve e profissional",
          "Evitar deixar o cliente esperando sem informação",
          "Comunicar a recepção sobre qualquer atraso",
        ],
      },
    ],
    checklist: [
      "Recebeu o cliente com sorriso?",
      "Cumprimentou com bom dia, boa tarde ou boa noite?",
      "Chamou o cliente pelo nome?",
      "Confirmou o serviço antes de iniciar?",
      "Ouviu o cliente com atenção?",
      "Iniciou no horário correto?",
      "Manteve foco total no cliente?",
    ],
    motto:
      "Antes de cortar, o barbeiro deve ouvir, confirmar e acolher. O cliente não paga apenas pelo corte; ele paga pela atenção, dedicação e experiência durante todo o atendimento.",
  },
  {
    code: "POP 03",
    area: "Barbeiros",
    title: "Execução do Serviço",
    objective:
      "Garantir que todo serviço realizado na Sir Alfred siga um padrão de técnica, atenção, cuidado, postura profissional e experiência do cliente.",
    sections: [
      {
        title: "Antes de iniciar o serviço",
        items: [
          "Confirmar novamente o serviço que será realizado",
          "Ouvir o cliente com atenção",
          "Entender se o cliente deseja manter o estilo atual ou fazer alguma alteração",
          "Avaliar cabelo, barba, pele ou serviço solicitado antes de começar",
          "Garantir que os materiais estejam organizados e ao alcance",
        ],
      },
      {
        title: "Postura durante o atendimento",
        items: [
          "Manter postura profissional durante todo o serviço",
          "Evitar conversas paralelas e uso do celular durante o atendimento",
          "Não deixar o cliente no vácuo enquanto conversa com outros profissionais",
          "Manter atenção no cliente e no serviço realizado",
          "Trabalhar com calma, técnica e segurança",
        ],
      },
      {
        title: "Técnica e atenção aos detalhes",
        items: [
          "Executar o serviço com técnica e responsabilidade",
          "Conferir simetria, acabamento e detalhes ao longo do atendimento",
          "Evitar pressa que comprometa o resultado",
          "Revisar o serviço antes de finalizar",
          "Buscar sempre um resultado limpo, bem acabado e alinhado ao padrão Sir Alfred",
        ],
      },
      {
        title: "Conforto do cliente",
        items: [
          "Conferir se o cliente está bem posicionado na cadeira",
          "Ajustar cadeira, encosto ou apoio quando necessário",
          "Evitar movimentos bruscos e excesso de água, produto ou cabelo no rosto do cliente",
          "Perguntar se está tudo certo quando perceber desconforto",
        ],
      },
      {
        title: "Comunicação durante o serviço",
        items: [
          "Manter comunicação clara e educada",
          "Explicar mudanças ou sugestões quando necessário",
          "Respeitar o perfil do cliente: alguns gostam de conversar, outros preferem silêncio",
          "Quando houver dúvida sobre corte, altura, barba ou finalização, confirmar antes de executar",
        ],
      },
      {
        title: "Organização durante o atendimento",
        items: [
          "Manter a bancada organizada durante o serviço",
          "Não deixar ferramentas espalhadas sem necessidade",
          "Separar itens usados dos itens limpos quando aplicável",
          "Manter toalhas e capas bem posicionadas e o chão ao redor apresentável",
        ],
      },
      {
        title: "Finalização do serviço",
        items: [
          "Finalizar com atenção aos detalhes",
          "Limpar excesso de cabelo do rosto, pescoço e roupa do cliente",
          "Aplicar finalizador adequado quando fizer parte do serviço",
          "Mostrar o resultado ao cliente com espelho de mão, quando necessário",
          "Perguntar se ficou tudo certo e realizar pequenos ajustes com cordialidade",
        ],
      },
    ],
    checklist: [
      "Confirmou o serviço antes de iniciar?",
      "Cliente está confortável?",
      "Materiais estão organizados?",
      "Está mantendo foco total no cliente?",
      "Conferiu simetria e acabamento?",
      "Manteve a bancada organizada?",
      "Revisou o resultado antes de finalizar?",
    ],
    motto:
      "Cada atendimento deve ser tratado como único. O cliente sente o padrão Sir Alfred nos detalhes.",
  },
  {
    code: "POP 04",
    area: "Barbeiros",
    title: "Finalização, Pós-atendimento e Recebimento",
    objective:
      "Garantir que o atendimento seja finalizado com atenção, profissionalismo e cuidado, confirmando a satisfação do cliente antes que ele saia da cadeira.",
    sections: [
      {
        title: "Conferência antes de finalizar",
        items: [
          "Revisar o corte, barba ou serviço realizado antes de apresentar o resultado ao cliente",
          "Conferir acabamento, simetria, contornos e detalhes finais",
          "Limpar excesso de cabelo do rosto, pescoço, orelhas e roupa do cliente",
          "Aplicar finalizador adequado quando fizer parte do serviço",
          "Corrigir detalhes necessários antes de mostrar ao cliente",
        ],
      },
      {
        title: "Apresentação do resultado",
        items: [
          "Mostrar o resultado ao cliente com calma e profissionalismo",
          "Usar espelho de mão quando necessário",
          "Perguntar se o cliente gostou do resultado e se deseja algum ajuste",
          "Receber pedidos de ajuste com cordialidade e sem demonstrar incômodo",
        ],
      },
      {
        title: "Orientação ao cliente",
        items: [
          "Orientar o cliente sobre como manter o corte, barba ou finalização em casa, quando fizer sentido",
          "Indicar produto apenas quando houver real necessidade ou benefício para o cliente",
          "Transformar a indicação em orientação, não em venda forçada",
        ],
      },
      {
        title: "Encerramento na cadeira",
        items: [
          "Retirar a capa com cuidado e evitar jogar cabelo sobre a roupa ou rosto do cliente",
          "Ajudar o cliente a sair da cadeira quando necessário",
          "Agradecer pela presença e direcionar o cliente para a recepção quando houver recepcionista",
          "Evitar pegar ou usar o celular antes que o cliente saia completamente da cadeira",
          "Manter atenção no cliente até o último contato",
        ],
      },
      {
        title: "Recebimento quando não houver recepção",
        items: [
          "Informar o valor do serviço com clareza",
          "Receber pagamento em dinheiro, cartão, Pix ou outro meio disponível",
          "Confirmar se o pagamento foi realizado corretamente",
          "Comunicar a recepção ou o responsável sobre o recebimento realizado",
        ],
      },
      {
        title: "Reagendamento e retorno",
        items: [
          "Orientar o cliente sobre o melhor intervalo para retorno, quando fizer sentido",
          "Sugerir novo agendamento de forma natural e profissional",
          "Caso não haja recepção, orientar o cliente sobre como agendar pelo WhatsApp ou sistema da unidade",
        ],
      },
      {
        title: "Despedida",
        items: [
          "Agradecer o cliente pela preferência",
          "Despedir-se com cordialidade",
          "Chamar o cliente pelo nome sempre que possível",
          "Não se distrair com celular ou conversas paralelas antes da saída do cliente",
        ],
      },
      {
        title: "Organização após o atendimento",
        items: [
          "Recolher cabelos, toalhas e materiais usados",
          "Limpar a cadeira visualmente",
          "Reorganizar a bancada e deixar a capa dobrada e organizada",
          "Varrer os cabelos sempre que possível para evitar acúmulo no chão",
          "Deixar o espaço pronto para o próximo cliente",
        ],
      },
    ],
    checklist: [
      "Revisou o serviço antes de mostrar?",
      "Perguntou se ficou tudo certo?",
      "Orientou sobre manutenção ou produto?",
      "Evitou celular antes da saída do cliente?",
      "Agradeceu e se despediu com educação?",
      "Organizou a estação após o atendimento?",
    ],
    motto:
      "Finalizar bem é tão importante quanto começar bem. O cliente deve sair satisfeito, orientado e com vontade de voltar.",
  },
  {
    code: "POP 05",
    area: "Barbeiros",
    title: "Limpeza, Organização e Padrão da Unidade",
    objective:
      "Garantir que a estação de trabalho do barbeiro esteja sempre limpa, organizada e dentro do padrão Sir Alfred durante todo o expediente.",
    sections: [
      {
        title: "Limpeza entre atendimentos",
        items: [
          "Ao finalizar cada atendimento, limpar visualmente a cadeira",
          "Retirar excesso de cabelo da cadeira, encosto, apoio de cabeça e área ao redor",
          "Sempre que possível, varrer os cabelos após cada corte para evitar acúmulo no chão",
          "Não deixar cabelos acumulados para limpar apenas no final do expediente",
        ],
      },
      {
        title: "Organização da cadeira",
        items: [
          "Manter a cadeira sempre baixada quando não estiver em uso",
          "Manter o encosto sempre no lugar",
          "Deixar a capa dobrada e organizada",
          "Conferir se a cadeira está visualmente limpa antes do próximo cliente sentar",
        ],
      },
      {
        title: "Organização da bancada",
        items: [
          "Manter a bancada limpa durante todo o expediente",
          "Guardar pentes, tesouras, navalhas, escovas e finalizadores nos locais corretos",
          "Evitar excesso de objetos sobre a bancada",
          "Conferir a água do borrifador e deixar máquinas e ferramentas alinhadas quando não estiverem em uso",
        ],
      },
      {
        title: "Conservação dos materiais de trabalho",
        items: [
          "Não utilizar pentes quebrados, trincados ou danificados",
          "Não utilizar escovas quebradas, sujas ou em mau estado",
          "Não utilizar tesouras beliscando, sem fio ou com funcionamento ruim",
          "Não utilizar máquinas que estejam puxando cabelo, falhando ou sem cortar corretamente",
          "Comunicar o responsável sempre que algum material precisar de troca, manutenção ou reposição",
        ],
      },
      {
        title: "Organização de toalhas, capas e objetos pessoais",
        items: [
          "Na unidade Birigui: gavetão para toalhas sujas; duas gavetas menores para objetos pessoais; gaveta superior fina somente para capas de corte",
          "Nas demais unidades: guardar toalhas sujas nos cestos disponíveis, objetos pessoais em armários ou locais definidos e capas na gaveta mais fina ou local definido",
          "Separar toalhas brancas sujas das toalhas pretas sujas para evitar manchas",
          "Em serviços com tintura, utilizar somente toalhas pretas",
          "Não misturar materiais limpos com materiais sujos",
        ],
      },
      {
        title: "Copos, xícaras e área do café",
        items: [
          "Copos descartáveis devem ser priorizados para clientes",
          "A equipe deve evitar uso desnecessário de copos descartáveis",
          "Para beber água, cada profissional deve utilizar seu próprio copo ou garrafa",
          "Sempre que houver xícaras disponíveis, a equipe deve utilizá-las para tomar café",
          "Após o uso, cada profissional deve lavar sua própria xícara",
          "Não deixar xícaras, copos ou utensílios sujos acumulados na pia",
        ],
      },
      {
        title: "Antes de pausas e no final do expediente",
        items: [
          "Nunca sair para almoço, pausa ou descanso deixando o local sujo ou bagunçado",
          "Antes de sair, limpar a cadeira, varrer cabelos, organizar a bancada e conferir se não há toalhas, copos, papéis ou materiais fora do lugar",
          "No final do expediente, guardar toalhas sujas, capas e objetos pessoais nos locais definidos e garantir que a unidade esteja preparada para o próximo dia",
        ],
      },
    ],
    checklist: [
      "Cadeira está limpa, baixada e com encosto no lugar?",
      "Bancada está organizada?",
      "Ferramentas estão limpas e em bom estado?",
      "Cabelos foram varridos sempre que possível?",
      "Toalhas sujas estão no local correto?",
      "Toalhas brancas e pretas estão separadas?",
      "Objetos pessoais estão guardados?",
      "A estação está pronta para o próximo cliente?",
    ],
    motto:
      "O padrão Sir Alfred aparece nos detalhes: cadeira limpa, bancada organizada, chão apresentável, toalhas no lugar certo e atendimento pronto para o próximo cliente.",
  },
  {
    code: "POP 06",
    area: "Barbeiros",
    title: "Fechamento da Unidade",
    objective:
      "Garantir que a estação de trabalho do barbeiro seja finalizada de forma limpa, organizada, segura e preparada para o próximo dia de atendimento.",
    sections: [
      {
        title: "Finalização dos atendimentos",
        items: [
          "Conferir se todos os atendimentos do dia foram finalizados corretamente",
          "Verificar se não há cliente aguardando ou atendimento pendente",
          "Comunicar à recepção ou ao responsável caso exista alguma observação importante",
          "Garantir que o último cliente receba a mesma atenção e cordialidade do primeiro",
        ],
      },
      {
        title: "Limpeza da cadeira e organização da bancada",
        items: [
          "Limpar visualmente a cadeira após o último atendimento",
          "Retirar cabelos do assento, encosto, apoio de cabeça, braços e base",
          "Manter a cadeira baixada, o encosto no lugar e a capa dobrada",
          "Guardar pentes, tesouras, navalhas, escovas e finalizadores nos locais corretos",
          "Retirar excesso de cabelo ou sujeira da bancada e manter a bancada limpa, alinhada e sem excesso de objetos",
        ],
      },
      {
        title: "Limpeza do chão e área ao redor",
        items: [
          "Varrer ou retirar cabelos acumulados ao redor da estação",
          "Conferir se não há papel, copos, toalhas ou materiais no chão",
          "Deixar o espaço ao redor da cadeira apresentável",
        ],
      },
      {
        title: "Organização de toalhas, capas e materiais",
        items: [
          "Guardar toalhas sujas no local correto conforme o padrão da unidade",
          "Separar toalhas brancas sujas das toalhas pretas sujas, para evitar manchas",
          "Guardar capas de corte no local definido e não misturar capas limpas com toalhas sujas",
          "Em serviços com tintura, utilizar somente toalhas pretas",
        ],
      },
      {
        title: "Objetos pessoais, copos e área do café",
        items: [
          "Guardar objetos pessoais no local definido pela unidade",
          "Não deixar mochilas, garrafas, roupas, carregadores ou itens pessoais na bancada",
          "Para beber água, usar copo ou garrafa própria",
          "Após usar xícaras, cada profissional deve lavá-las e não deixar utensílios sujos na pia",
        ],
      },
      {
        title: "Conservação dos materiais de trabalho",
        items: [
          "Conferir se pentes, escovas, tesouras, navalhetes, borrifadores, máquinas e demais ferramentas estão limpos e em boas condições",
          "Comunicar o responsável caso algum material precise de troca, manutenção ou reposição",
          "Não deixar para o próximo atendimento a identificação de um problema que já poderia ser comunicado no fechamento",
        ],
      },
      {
        title: "Equipamentos e segurança",
        items: [
          "Conferir se máquinas, secadores ou equipamentos foram desligados ou guardados corretamente",
          "Colocar máquinas para carregar conforme necessidade e padrão da unidade",
          "Guardar ferramentas cortantes com segurança",
          "Evitar deixar fios, carregadores ou extensões expostos de forma desorganizada",
        ],
      },
    ],
    checklist: [
      "Todos os atendimentos foram finalizados?",
      "A cadeira foi limpa visualmente?",
      "A bancada está limpa e organizada?",
      "O chão ao redor foi varrido?",
      "Toalhas e capas estão no local correto?",
      "Objetos pessoais foram guardados?",
      "Utensílios da área do café foram lavados?",
      "Materiais estão limpos e em bom estado?",
      "A estação está pronta para o próximo dia?",
    ],
    motto:
      "O dia termina do mesmo jeito que começa: com organização, cuidado e riqueza nos detalhes.",
  },
  {
    code: "POP 07",
    area: "Barbeiros",
    title: "Serviço de Barba",
    objective:
      "Garantir que o serviço de barba seja realizado com técnica, cuidado, higiene, conforto e padrão de experiência Sir Alfred.",
    sections: [
      {
        title: "Preparação antes do serviço",
        items: [
          "Confirmar com o cliente qual serviço será realizado: barba completa, acabamento, desenho, retirada total ou manutenção",
          "Perguntar se o cliente deseja manter o formato atual ou fazer alguma alteração",
          "Avaliar tipo de barba, pele, falhas, sensibilidade e direção dos fios antes de iniciar",
          "Conferir se os materiais estão prontos: navalhete, lâmina, pente, máquina, toalha quente, produtos de barba e pós-barba",
          "Utilizar lâmina nova e adequada para o atendimento",
        ],
      },
      {
        title: "Preparação do cliente e toalha quente",
        items: [
          "Reclinar a cadeira de forma confortável e segura",
          "Colocar a capa ou proteção de forma adequada",
          "Preparar a pele e os fios antes da navalha",
          "Aplicar toalha quente quando fizer parte do serviço",
          "Verificar a temperatura da toalha antes de aplicar no rosto do cliente e nunca aplicar em temperatura excessiva",
        ],
      },
      {
        title: "Simetria e alinhamento da barba",
        items: [
          "Antes de deitar totalmente a cadeira, fazer a análise da simetria com o cliente sentado normalmente ou apenas apoiado levemente no encosto",
          "Alinhar a barba observando o rosto do cliente de frente, com postura natural",
          "Evitar definir a simetria principal com o cliente totalmente deitado",
          "Após reclinar a cadeira para realizar o trabalho com navalha, manter atenção aos contornos e acabamento",
          "Ao final do serviço, levantar ou reposicionar o cliente para conferir novamente a simetria de frente e fazer pequenos ajustes finais",
        ],
      },
      {
        title: "Execução da barba",
        items: [
          "Trabalhar com calma, técnica e atenção aos detalhes",
          "Utilizar máquina, tesoura, pente ou navalha conforme a necessidade do serviço",
          "Fazer marcações e contornos com precisão",
          "Manter a pele esticada corretamente para mais segurança",
          "Conferir simetria entre os dois lados da barba",
        ],
      },
      {
        title: "Higiene, segurança e conforto",
        items: [
          "Utilizar lâmina nova para cada cliente e descartá-la corretamente ao final",
          "Manter navalhete, máquina, pente e demais materiais limpos",
          "Evitar encostar materiais limpos em superfícies sujas",
          "Perguntar se o cliente está confortável quando necessário",
          "Evitar deixar produto escorrer para boca, nariz, olhos ou roupa",
          "Não deixar o cliente no vácuo durante o serviço",
        ],
      },
      {
        title: "Finalização e orientação",
        items: [
          "Conferir contornos, linhas, simetria e acabamento antes de finalizar",
          "Aplicar produto pós-barba adequado, quando fizer parte do serviço",
          "Mostrar o resultado ao cliente com espelho, quando necessário",
          "Perguntar se ficou tudo certo ou se deseja algum ajuste",
          "Orientar o cliente sobre cuidados com a barba em casa e intervalo ideal para manutenção",
        ],
      },
      {
        title: "Organização após o serviço",
        items: [
          "Descartar a lâmina usada no local correto",
          "Colocar toalhas usadas no local adequado",
          "Limpar a cadeira visualmente",
          "Retirar fios de barba da cadeira, bancada e chão",
          "Organizar navalhete, máquina, pente, escovas e produtos",
        ],
      },
    ],
    checklist: [
      "Confirmou o tipo de barba?",
      "Separou lâmina nova?",
      "Verificou a temperatura da toalha?",
      "Conferiu simetria com o cliente sentado?",
      "Executou navalha com calma e segurança?",
      "Conferiu simetria novamente no final?",
      "Descartou a lâmina corretamente?",
      "Organizou a estação após o serviço?",
    ],
    motto:
      "Barba bem feita é técnica, cuidado e experiência. Na Sir Alfred, cada detalhe do serviço precisa transmitir confiança.",
  },
  {
    code: "POP 08",
    area: "Barbeiros",
    title: "Serviço de Corte de Cabelo",
    objective:
      "Garantir que o serviço de corte de cabelo seja realizado com técnica, atenção, consultoria, conforto, acabamento e padrão de experiência Sir Alfred.",
    sections: [
      {
        title: "Antes de iniciar o corte",
        items: [
          "Confirmar com o cliente qual corte será realizado",
          "Perguntar se deseja manter o estilo atual ou fazer alguma alteração",
          "Ouvir com atenção a expectativa do cliente",
          "Avaliar tipo de cabelo, volume, caimento, crescimento, entradas, redemoinhos e formato do rosto",
          "Orientar de forma profissional caso perceba que algum ajuste pode melhorar o resultado",
        ],
      },
      {
        title: "Preparação do cliente e consultoria inicial",
        items: [
          "Conferir se a cadeira está limpa e pronta",
          "Posicionar o cliente de forma confortável e colocar a capa com cuidado",
          "Confirmar altura da máquina, laterais, topo, franja, acabamento e finalização",
          "Quando houver dúvida, cortar aos poucos e confirmar com o cliente",
        ],
      },
      {
        title: "Experiência com cliente de primeira vez",
        items: [
          "Identificar quando o cliente está vindo pela primeira vez à Sir Alfred",
          "Receber esse cliente com atenção especial e acolhimento",
          "Iniciar uma conversa leve para conhecer melhor o cliente",
          "Fazer perguntas simples sobre estilo, rotina, preferência e como conheceu a barbearia",
          "Evitar silêncio desconfortável no primeiro atendimento",
          "Respeitar o cliente caso ele não queira conversar muito",
          "Lembrete: temos uma única oportunidade de conquistar o cliente pela primeira vez",
        ],
      },
      {
        title: "Execução técnica do corte",
        items: [
          "Trabalhar com calma, técnica e segurança",
          "Fazer divisões, marcações ou referências quando necessário",
          "Executar laterais, topo, transições, acabamento e finalização com atenção",
          "Conferir simetria ao longo do atendimento",
          "Não deixar falhas, marcas ou excesso de peso sem correção",
        ],
      },
      {
        title: "Conforto e foco no cliente",
        items: [
          "Avisar o cliente quando for ajustar cadeira, encosto ou posição da cabeça",
          "Retirar excesso de cabelo do rosto, pescoço e orelhas durante o atendimento, quando necessário",
          "Evitar conversas paralelas com outros barbeiros e uso de celular durante o atendimento",
          "Fazer o cliente perceber que aquele tempo está reservado para ele",
        ],
      },
      {
        title: "Acabamento, finalização e organização após o corte",
        items: [
          "Conferir contornos, nuca, costeletas, laterais e detalhes finais",
          "Limpar excesso de cabelo do rosto, pescoço, orelhas e roupa",
          "Usar espelho de mão para mostrar laterais e nuca, quando necessário",
          "Aplicar finalizador adequado ao tipo de cabelo e estilo do corte, quando fizer sentido",
          "Orientar sobre manutenção, intervalo de retorno ou produto adequado, quando fizer sentido",
          "Retirar cabelos da cadeira, bancada e área ao redor, varrer os cabelos sempre que possível e deixar a estação pronta",
        ],
      },
    ],
    checklist: [
      "Confirmou o corte antes de iniciar?",
      "Avaliou tipo de cabelo e formato do rosto?",
      "Identificou se é cliente de primeira vez?",
      "Criou conexão sem forçar intimidade?",
      "Executou o corte com calma e técnica?",
      "Conferiu simetria e acabamento?",
      "Mostrou o resultado final?",
      "Organizou a estação após o corte?",
    ],
    motto:
      "Cortar cabelo é entregar técnica com atenção. O padrão Sir Alfred aparece no corte, no acabamento e na experiência.",
  },
  {
    code: "POP 09",
    area: "Barbeiros",
    title: "Atendimento Infantil / Sir Alfred Kids",
    objective:
      "Garantir que o atendimento infantil seja realizado com paciência, segurança, acolhimento, técnica e padrão de experiência Sir Alfred Kids.",
    sections: [
      {
        title: "Recepção da criança e comunicação com os responsáveis",
        items: [
          "Receber a criança com sorriso, voz calma e postura acolhedora e cumprimentar os pais ou responsáveis com educação",
          "Sempre que possível, chamar a criança pelo nome",
          "Confirmar com os responsáveis qual corte ou serviço será realizado",
          "Perguntar se a criança já cortou cabelo antes e se costuma ter medo, chorar ou se movimentar muito",
        ],
      },
      {
        title: "Preparação da criança",
        items: [
          "Conduzir a criança com calma até a cadeira",
          "Permitir que ela conheça o ambiente antes de iniciar, quando necessário",
          "Colocar a capa com cuidado, explicando de forma simples",
          "Posicionar a criança de forma confortável e segura",
          "Apresentar máquina, pente ou tesoura de forma tranquila quando a criança demonstrar medo",
        ],
      },
      {
        title: "Durante o atendimento",
        items: [
          "Trabalhar com paciência e atenção redobrada",
          "Manter movimentos seguros e controlados",
          "Evitar pressa, mesmo quando houver agenda cheia",
          "Usar linguagem simples e tranquila",
          "Utilizar distrações quando necessário, como brinquedos, vídeos, personagens ou conversa leve",
          "Não demonstrar irritação, impaciência ou nervosismo",
        ],
      },
      {
        title: "Segurança no atendimento infantil",
        items: [
          "Manter ferramentas sempre sob controle e fora do alcance da criança",
          "Tomar cuidado com máquina, ponta da tesoura e ferramentas de acabamento para evitar pequenos cortes, arranhões ou beliscões",
          "Redobrar atenção quando a criança se movimentar muito",
          "Não forçar procedimentos quando houver risco de machucar a criança",
          "Pedir apoio dos pais ou responsáveis quando necessário e priorizar sempre a segurança antes da velocidade",
        ],
      },
      {
        title: "Crianças neurodivergentes",
        items: [
          "Usar as técnicas aprendidas nos treinamentos da Sir Alfred Kids",
          "Observar sinais de desconforto, medo, irritação, sensibilidade sonora ou sensibilidade ao toque",
          "Evitar movimentos bruscos, barulhos desnecessários e excesso de estímulos",
          "Utilizar, quando possível, ferramentas de apoio disponíveis, como gráficos visuais, recursos de comunicação e materiais para crianças autistas ou com outras necessidades",
          "Permitir pausas durante o atendimento e adaptar a comunicação ao tempo da criança",
        ],
      },
      {
        title: "Finalização e pós-atendimento",
        items: [
          "Revisar o corte com atenção e conferir franja, laterais, nuca e acabamento",
          "Limpar cabelos do rosto, pescoço, orelhas e roupa da criança",
          "Mostrar o resultado aos pais ou responsáveis e perguntar se desejam algum ajuste",
          "Finalizar de forma leve, elogiando a criança",
          "Entregar um pirulito da Sir Alfred Kids ao final para cada criança, quando disponível",
          "Agradecer a criança e os responsáveis e organizar a estação para o próximo atendimento",
        ],
      },
    ],
    checklist: [
      "Recebeu a criança com voz calma e sorriso?",
      "Confirmou o corte com os responsáveis?",
      "Observou medo, agitação ou desconforto?",
      "Ferramentas estão fora do alcance da criança?",
      "Respeitou o tempo da criança?",
      "Usou recursos de apoio quando necessário?",
      "Mostrou o resultado aos responsáveis?",
      "Entregou o pirulito da Sir Alfred Kids?",
    ],
    motto:
      "Na Sir Alfred Kids, a criança não é apenas atendida. Ela é acolhida, respeitada e encantada.",
  },
  {
    code: "POP 10",
    area: "Barbeiros",
    title: "Postura Profissional, Conduta e Cultura Sir Alfred",
    objective:
      "Garantir que todos os barbeiros mantenham postura profissional, boa apresentação pessoal, conduta adequada, higiene, cordialidade e alinhamento com a cultura da Sir Alfred durante todo o expediente.",
    sections: [
      {
        title: "Apresentação pessoal",
        items: [
          "Estar com roupa adequada ao padrão da unidade: roupa preta, camiseta ou camisa preta, calça preta e calçado adequado ao ambiente profissional",
          "Usar botton/crachá da Sir Alfred, quando aplicável",
          "Manter cabelo, barba, higiene pessoal e aparência alinhados",
          "Cuidar da higiene bucal e do hálito durante o expediente",
          "Utilizar desodorante, evitar mau cheiro corporal, suor excessivo sem cuidado e perfume em excesso",
          "Manter roupas limpas, sem odor, manchas ou aparência de uso inadequado",
        ],
      },
      {
        title: "Pontualidade e uso do celular",
        items: [
          "Chegar com no mínimo 15 minutos de antecedência e estar pronto antes do primeiro atendimento",
          "Não utilizar celular durante o atendimento, salvo necessidade profissional",
          "Não responder mensagens pessoais enquanto o cliente estiver na cadeira",
          "Não pegar o celular imediatamente após finalizar o corte se o cliente ainda estiver na cadeira",
        ],
      },
      {
        title: "Conversas paralelas e relacionamento com o cliente",
        items: [
          "Evitar conversas paralelas com outros barbeiros durante o atendimento",
          "Não deixar o cliente no vácuo enquanto conversa com a equipe",
          "Ouvir o cliente antes de iniciar qualquer serviço",
          "Respeitar preferências, limites e expectativas do cliente",
          "Criar conexão sem forçar intimidade e perceber se o cliente gosta de conversar ou prefere silêncio",
        ],
      },
      {
        title: "Cliente de primeira vez",
        items: [
          "Dar atenção especial ao cliente que está vindo pela primeira vez",
          "Fazer perguntas leves para entender estilo, rotina e expectativa",
          "Entregar segurança, acolhimento, atenção e bom resultado",
          "Lembrete: temos uma única oportunidade de conquistar o cliente pela primeira vez",
        ],
      },
      {
        title: "Relacionamento com a equipe e ambiente",
        items: [
          "Tratar colegas, recepção, gestores e demais profissionais com respeito",
          "Evitar brincadeiras ofensivas, discussões ou conflitos na frente dos clientes",
          "Colaborar com a equipe quando necessário",
          "Manter cadeira, bancada e área ao redor organizadas",
          "Não sair para pausa deixando o local sujo ou bagunçado",
          "Guardar objetos pessoais no local correto e evitar deixar copos, xícaras, garrafas, roupas ou carregadores espalhados",
        ],
      },
      {
        title: "Materiais, equipamentos e conduta",
        items: [
          "Manter máquinas, tesouras, pentes, escovas, navalhetes, borrifadores e finalizadores limpos e organizados",
          "Não utilizar materiais quebrados, sujos, desgastados ou em mau estado",
          "Comunicar o responsável quando algum material precisar de troca, manutenção ou reposição",
          "Evitar reclamações, fofocas ou comentários negativos durante o expediente",
          "Não discutir problemas internos na frente de clientes e representar a Sir Alfred em cada atitude",
        ],
      },
      {
        title: "Valores Sir Alfred na prática",
        items: [
          "Cordialidade: educação, sorriso, respeito, atenção e boa comunicação com clientes e equipe",
          "Pontualidade: chegar no horário, respeitar agenda e valorizar o tempo do cliente",
          "Fidelização: entregar uma experiência que faça o cliente confiar, voltar e indicar a barbearia",
          "Colaboração: apoiar a equipe e ajudar a unidade a funcionar melhor",
          "Capacitação: buscar evolução técnica e melhoria constante",
          "Riqueza nos detalhes: cuidar da cadeira, bancada, atendimento, acabamento, limpeza, postura, higiene, comunicação e experiência",
        ],
      },
    ],
    checklist: [
      "Está com roupa preta e calçado adequado?",
      "Higiene pessoal está adequada?",
      "Chegou 15 minutos antes?",
      "Evitou celular durante o atendimento?",
      "Manteve foco no cliente?",
      "Tratou cliente e equipe com cordialidade?",
      "Manteve cadeira e bancada organizadas?",
      "Representou a cultura Sir Alfred durante o expediente?",
    ],
    motto:
      "Ser barbeiro na Sir Alfred é entregar técnica com postura, cordialidade e riqueza nos detalhes.",
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
