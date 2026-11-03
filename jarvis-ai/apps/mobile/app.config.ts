/**
 * Configuração dinâmica: adiciona o esquema de URL do cliente OAuth iOS do Google
 * (necessário para o retorno do login Google ao app). O ID do cliente é público.
 */
import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
  const googleScheme = clientId.endsWith(".apps.googleusercontent.com")
    ? `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, "")}`
    : null;
  const base = Array.isArray(config.scheme) ? config.scheme : config.scheme ? [config.scheme] : [];
  return {
    ...(config as ExpoConfig),
    scheme: googleScheme ? [...base, googleScheme] : base,
  };
};
