/**
 * Ajustes da versão web (navegador do iPhone):
 * - Alert.alert do React Native Web não faz nada: usamos alert/confirm/prompt do navegador.
 */
import { Alert, type AlertButton } from "react-native";

Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
  const text = [title, message].filter(Boolean).join("\n\n");
  const list = buttons ?? [];
  setTimeout(() => {
    if (list.length <= 1) {
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }
    const cancel = list.find((b) => b.style === "cancel");
    const actions = list.filter((b) => b !== cancel);
    if (actions.length === 1) {
      if (window.confirm(`${text}\n\n(OK = ${actions[0]!.text ?? "OK"})`)) actions[0]!.onPress?.();
      else cancel?.onPress?.();
      return;
    }
    const menu = actions.map((b, i) => `${i + 1}. ${b.text ?? ""}`).join("\n");
    const answer = window.prompt(`${text}\n\n${menu}\n\nDigite o número:`);
    const idx = answer ? Number.parseInt(answer, 10) - 1 : -1;
    if (idx >= 0 && idx < actions.length) actions[idx]!.onPress?.();
    else cancel?.onPress?.();
  }, 0);
};


// O Safari do iPhone só libera a fala (speechSynthesis) depois de um toque do usuário:
// no primeiro toque, fala um texto vazio e silencioso para "destravar" a voz do Jarvis.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(" ");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* sem voz no navegador */
    }
    window.removeEventListener("touchend", unlock, true);
    window.removeEventListener("click", unlock, true);
  };
  window.addEventListener("touchend", unlock, true);
  window.addEventListener("click", unlock, true);
}
