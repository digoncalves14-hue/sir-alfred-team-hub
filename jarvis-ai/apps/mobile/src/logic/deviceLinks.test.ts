import { describe, expect, it } from "vitest";
import { buildLink, normalizePhone, pickContactsByName } from "./deviceLinks";

describe("links do iPhone", () => {
  it("normaliza telefones brasileiros e internacionais", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("011 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalizePhone("0055 21 3333-4444")).toBe("+552133334444");
    expect(normalizePhone("123")).toBeNull();
  });

  it("monta links oficiais com texto codificado", () => {
    expect(buildLink({ canal: "whatsapp", destino: "11 98765-4321", mensagem: "Chego às 10h & ok?" })).toBe(
      "https://wa.me/5511987654321?text=Chego%20%C3%A0s%2010h%20%26%20ok%3F",
    );
    expect(buildLink({ canal: "ligacao", destino: "(11) 3333-4444" })).toBe("tel:+551133334444");
    expect(buildLink({ canal: "sms", destino: "11987654321", mensagem: "Oi" })).toBe("sms:+5511987654321&body=Oi");
    expect(buildLink({ canal: "email", destino: "a@b.com", assunto: "Pedido", mensagem: "Olá" })).toBe("mailto:a@b.com?subject=Pedido&body=Ol%C3%A1");
    expect(buildLink({ canal: "mapa", destino: "Av. Paulista, 1000" })).toBe("https://maps.apple.com/?q=Av.%20Paulista%2C%201000");
  });

  it("recusa destinos inválidos ou inseguros", () => {
    expect(() => buildLink({ canal: "link", destino: "http://x.com" })).toThrow(/https/);
    expect(() => buildLink({ canal: "link", destino: "javascript:alert(1)" })).toThrow();
    expect(() => buildLink({ canal: "email", destino: "nao-e-email" })).toThrow();
    expect(() => buildLink({ canal: "whatsapp", destino: "1234" })).toThrow();
  });

  it("escolhe contatos pelo nome sem acento", () => {
    const list = [{ name: "Rafael Barbeiro" }, { name: "Rafaela Souza" }, { name: "João Fornecedor" }];
    expect(pickContactsByName(list, "joao fornecedor")).toEqual([{ name: "João Fornecedor" }]);
    expect(pickContactsByName(list, "Rafael").map((c) => c.name)).toEqual(["Rafael Barbeiro", "Rafaela Souza"]);
    expect(pickContactsByName(list, "barbeiro").map((c) => c.name)).toEqual(["Rafael Barbeiro"]);
  });
});
