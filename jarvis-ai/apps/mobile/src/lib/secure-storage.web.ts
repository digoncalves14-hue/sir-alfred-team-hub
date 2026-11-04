/**
 * Versão web: a sessão do Supabase fica no localStorage do navegador (padrão do
 * supabase-js na web). Use o Jarvis web apenas no seu próprio iPhone.
 */
export class LargeSecureStore {
  async getItem(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  async setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* modo privado / armazenamento bloqueado: a sessão dura só esta aba */
    }
  }
  async removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
