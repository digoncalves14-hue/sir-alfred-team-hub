/** Rota de retorno do OAuth do Hub (normalmente capturada pela sessão de login; aqui só por segurança). */
import { Redirect } from "expo-router";

export default function HubOAuthReturn() {
  return <Redirect href="/business" />;
}
