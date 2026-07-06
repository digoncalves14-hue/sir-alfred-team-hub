import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AlfredChat from "./AlfredChat";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

function sseResponse(chunks: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("AlfredChat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("opens the panel and shows suggestions", () => {
    render(<AlfredChat />);
    fireEvent.click(screen.getByLabelText("Abrir assistente Sir Alfred"));
    expect(screen.getByText("Sir Alfred")).toBeInTheDocument();
    expect(screen.getByText("Como abrir a unidade corretamente?")).toBeInTheDocument();
  });

  it("sends a question and streams the assistant reply", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(sseResponse(["Olá", ", tudo bem?"]));

    render(<AlfredChat />);
    fireEvent.click(screen.getByLabelText("Abrir assistente Sir Alfred"));

    const input = screen.getByPlaceholderText("Escreva sua pergunta...");
    fireEvent.change(input, { target: { value: "Como abrir a unidade?" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Olá, tudo bem?")).toBeInTheDocument());

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/functions/v1/chatbot"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("shows an error message when the request fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "Limite de requisições atingido." }), { status: 429 }),
    );

    render(<AlfredChat />);
    fireEvent.click(screen.getByLabelText("Abrir assistente Sir Alfred"));

    const input = screen.getByPlaceholderText("Escreva sua pergunta...");
    fireEvent.change(input, { target: { value: "Oi" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Limite de requisições atingido.")).toBeInTheDocument());
  });
});
