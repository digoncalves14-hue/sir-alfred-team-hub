/**
 * Vozes em português do Brasil da biblioteca da ElevenLabs (voz do servidor).
 * O ID não é segredo: só identifica a voz. A chave da ElevenLabs fica no servidor.
 * O usuário também pode colar o ID de qualquer outra voz da ElevenLabs em Ajustes.
 */
export interface ServerVoice {
  id: string;
  name: string;
  description: string;
}

/** Voz configurada no servidor (ELEVENLABS_VOICE_ID). */
export const DEFAULT_SERVER_VOICE = "tgdUjOYNdMYKFLKpkiG6";

/** Homens maduros / mais velhos — vozes graves e calmas, boas para um assistente. */
export const SERVER_VOICES: ServerVoice[] = [
  { id: "X3j2R63Qu4Gdv6dsU2hB", name: "Moutella — Mentor", description: "Madura, médio-grave, serena e conversacional" },
  { id: "rnJZLKxtlBZt77uIED10", name: "Sergio", description: "Sênior, grave, poderosa e séria" },
  { id: "Hsrdp9vv51A8JfLqfIH8", name: "Jaan", description: "Homem sênior, voz grave de narrador" },
  { id: "zJ72ys7tsUtDi2rbhNPg", name: "Begonsi", description: "Mais velho, calmo, profundo e em paz" },
  { id: "oQL5kq26ctJzupM0mJot", name: "Noah — Veludo", description: "Idoso, grave e aveludado, transmite sabedoria" },
  { id: "4XmhZ74tBbUVCXIYNMMo", name: "Leonardo", description: "Grave, profunda e aveludada, tom de cinema" },
  { id: "bEYEuRWlSrSpweXZIhwF", name: "Mauricio Nocce", description: "Madura, grave e imponente" },
  { id: "96bMRo5cMbvHHsds2Wr0", name: "Narrador Lopes", description: "Madura, cadenciada, passa confiança" },
  { id: "KFngny3CPdDkcmlKEUlK", name: "Nunes Silva", description: "52 anos, executivo, grave e encorpada" },
  { id: "H6CTgG0uZDmiNsMwijeo", name: "Neto", description: "50 anos, grave, estilo locutor" },
  { id: "CPYJeGOY3LvpmBJRlYK9", name: "Adriano Ferreira", description: "50 anos, calmo e educado" },
  { id: "ZJifS0J2hVgU6cVz2sIC", name: "Professor Ulisses", description: "50 anos, autoridade e conhecimento" },
  { id: "F2CrQM2UonBN6qFJbaKN", name: "André Assis", description: "Grave, calma, muita credibilidade" },
  { id: "362PVGN0qz9gh4Hb4qdA", name: "Jairo Moraes", description: "60 anos, sotaque do interior paulista" },
  { id: "zoe2cQFqDDW4DteHDEWI", name: "Manoel Lopes", description: "68 anos, voz de senhor brasileiro" },
];

/** ID de voz da ElevenLabs (letras e números). */
export const isVoiceId = (v: string) => /^[A-Za-z0-9]{10,40}$/.test(v.trim());

/** Velocidade aceita pela ElevenLabs (0,7 a 1,2). */
export const clampServerSpeed = (rate: number) => Math.min(1.2, Math.max(0.7, Math.round(rate * 100) / 100));
