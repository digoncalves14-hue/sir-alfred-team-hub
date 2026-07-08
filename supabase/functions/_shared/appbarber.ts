// Cliente para a API do AppBarber, acessada através do relay (VPS com IP fixo
// autorizado pelo AppBarber). A Edge Function nunca fala direto com o AppBarber —
// ela sempre passa pelo relay, que é quem tem o IP liberado.
//
// Endpoints reais (paths) ainda não confirmados pela documentação do AppBarber.
// Assim que a doc chegar, só é preciso preencher os `path` marcados como TODO
// abaixo — o resto (autenticação com o relay, tratamento de erro) já está pronto.

const RELAY_URL = Deno.env.get("APPBARBER_RELAY_URL");
const RELAY_SECRET = Deno.env.get("APPBARBER_RELAY_SECRET");

export class AppBarberNotConfiguredError extends Error {
  constructor(message = "Integração com o AppBarber ainda não está configurada.") {
    super(message);
    this.name = "AppBarberNotConfiguredError";
  }
}

type RelayRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
};

async function callRelay<T>({ method, path, body }: RelayRequest): Promise<T> {
  if (!RELAY_URL || !RELAY_SECRET) {
    throw new AppBarberNotConfiguredError(
      "APPBARBER_RELAY_URL/APPBARBER_RELAY_SECRET não configurados nos secrets da function.",
    );
  }

  const response = await fetch(`${RELAY_URL}/proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RELAY_SECRET}`,
    },
    body: JSON.stringify({ method, path, body }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Relay/AppBarber respondeu ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

export type AppBarberService = {
  id: string;
  nome: string;
  preco: number;
  duracaoMin: number;
};

export type AppBarberSlot = {
  barbeiroId: string;
  barbeiroNome: string;
  inicio: string; // ISO datetime
};

export type AppBarberAppointment = {
  id: string;
  servicoId: string;
  barbeiroId: string;
  inicio: string;
  clienteNome: string;
  clienteTelefone: string;
  status: string;
};

// TODO: confirmar path real na documentação do AppBarber.
export async function listServices(_unidade: string): Promise<AppBarberService[]> {
  return callRelay<AppBarberService[]>({ method: "GET", path: "/TODO-services" });
}

// TODO: confirmar path real na documentação do AppBarber.
export async function checkAvailability(_params: {
  unidade: string;
  servicoId: string;
  data: string; // YYYY-MM-DD
}): Promise<AppBarberSlot[]> {
  return callRelay<AppBarberSlot[]>({ method: "GET", path: "/TODO-availability" });
}

// TODO: confirmar path real na documentação do AppBarber.
export async function createAppointment(_params: {
  unidade: string;
  servicoId: string;
  barbeiroId: string;
  inicio: string;
  clienteNome: string;
  clienteTelefone: string;
}): Promise<AppBarberAppointment> {
  return callRelay<AppBarberAppointment>({ method: "POST", path: "/TODO-appointments" });
}

// TODO: confirmar path real na documentação do AppBarber.
export async function findAppointmentsByPhone(_telefone: string): Promise<AppBarberAppointment[]> {
  return callRelay<AppBarberAppointment[]>({ method: "GET", path: "/TODO-appointments" });
}

// TODO: confirmar path real na documentação do AppBarber.
export async function cancelAppointment(_appointmentId: string): Promise<void> {
  await callRelay<void>({ method: "DELETE", path: `/TODO-appointments/${_appointmentId}` });
}
