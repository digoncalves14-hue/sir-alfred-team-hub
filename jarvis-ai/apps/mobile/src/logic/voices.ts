/**
 * Vozes em português do Brasil da biblioteca da ElevenLabs (voz do servidor).
 * O ID não é segredo: só identifica a voz. A chave da ElevenLabs fica no servidor.
 */
export interface ServerVoice {
  id: string;
  name: string;
  description: string;
  gender: "m" | "f";
}

export const DEFAULT_SERVER_VOICE = "tgdUjOYNdMYKFLKpkiG6";

export const SERVER_VOICES: ServerVoice[] = [
  { id: "tgdUjOYNdMYKFLKpkiG6", name: "Victor", description: "Calmo e natural (padrão)", gender: "m" },
  { id: "Dps47AVoFamqqkDShRDS", name: "Fabio Oliveira", description: "Grave e maduro, tom executivo", gender: "m" },
  { id: "1DXriIY2zhyCt1cj8onn", name: "Cirilo", description: "Médio-grave, quente, levemente rouco", gender: "m" },
  { id: "a2RTfXZv18BLdBvhWhl2", name: "Fabio Manarin", description: "Encorpado, estilo radialista", gender: "m" },
  { id: "ceOf6Sb1xKhC0ZVxHIzb", name: "Andrey", description: "Articulado, claro e confiável", gender: "m" },
  { id: "blPx0tvsvee8CuFd63lX", name: "Sávio", description: "Calmo e acolhedor, ritmo pausado", gender: "m" },
  { id: "6PhbMr9YjdeOaTNz9y24", name: "Davi Leão", description: "Jovem, caloroso e conversacional", gender: "m" },
  { id: "R3mQ9kzdIW8y3atS1Ec2", name: "Kenn", description: "Amigável e confiante", gender: "m" },
  { id: "8xLytQymTNCxwboEkZ4O", name: "Getta", description: "Aconchegante, aveludada", gender: "m" },
  { id: "lser24BNNkQ9n1qONoiM", name: "Luc Santos", description: "Conversacional e simpático", gender: "m" },
  { id: "TOXnXBKJSHqTwwqoWW0D", name: "Christine", description: "Firme e articulada", gender: "f" },
  { id: "PZMcMFpToj1IIYF0QDwX", name: "Marianne", description: "Jovem, profissional, de assistente", gender: "f" },
  { id: "GDzHdQOi6jjf8zaXhCYD", name: "Raquel", description: "Jovem, simpática e clara", gender: "f" },
  { id: "k5aKjuBz9NhUMZc7SDpl", name: "Marilita", description: "Natural e conversacional", gender: "f" },
  { id: "7iqXtOF3wl3pomwXFY7G", name: "Fernanda", description: "Acolhedora e profissional", gender: "f" },
  { id: "RGymW84CSmfVugnA5tvA", name: "Roberta", description: "Leve e descontraída", gender: "f" },
];

/** Velocidade aceita pela ElevenLabs (0,7 a 1,2). */
export const clampServerSpeed = (rate: number) => Math.min(1.2, Math.max(0.7, Math.round(rate * 100) / 100));
