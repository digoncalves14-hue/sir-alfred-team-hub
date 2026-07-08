import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Atendimento from "./Atendimento";

describe("Atendimento", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the welcome message and suggestions", () => {
    render(<Atendimento />);
    expect(screen.getByText(/Sou o assistente da Sir Alfred Barbearia/)).toBeInTheDocument();
    expect(screen.getByText("Quais serviços vocês oferecem?")).toBeInTheDocument();
  });

  it("sends a question and shows the assistant reply", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ reply: "Funcionamos de segunda a sábado." }), { status: 200 }),
    );

    render(<Atendimento />);
    const input = screen.getByPlaceholderText("Escreva sua pergunta...");
    fireEvent.change(input, { target: { value: "Qual o horário?" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Funcionamos de segunda a sábado.")).toBeInTheDocument());

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/functions/v1/customer-chat"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an error message when the request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), { status: 402 }),
    );

    render(<Atendimento />);
    const input = screen.getByPlaceholderText("Escreva sua pergunta...");
    fireEvent.change(input, { target: { value: "Oi" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Créditos de IA esgotados.")).toBeInTheDocument());
  });
});
