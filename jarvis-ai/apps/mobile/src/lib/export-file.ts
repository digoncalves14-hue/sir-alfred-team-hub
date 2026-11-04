/** Salva/compartilha o JSON exportado (iPhone: folha de compartilhamento). */
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

export async function shareJson(name: string, json: string): Promise<void> {
  const file = new File(Paths.cache, name);
  file.write(json);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: "application/json", UTI: "public.json" });
}
