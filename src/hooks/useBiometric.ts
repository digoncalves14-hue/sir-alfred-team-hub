// Local device biometric gate using WebAuthn (Face ID / Touch ID / fingerprint).
// No backend involved — the credential lives only on this device.
// We use WebAuthn as a "prove the same device+biometric" gate; the app session
// itself is still the Supabase session persisted in localStorage.

const CRED_KEY = (userId: string) => `bio_cred_${userId}`;
const SKIP_KEY = (userId: string) => `bio_skip_${userId}`;
const UNLOCKED_SESSION_KEY = (userId: string) => `bio_unlocked_${userId}`;

function b64urlEncode(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const biometric = {
  async isSupported(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (!window.PublicKeyCredential) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      return false;
    }
  },

  hasCredential(userId: string): boolean {
    return !!localStorage.getItem(CRED_KEY(userId));
  },

  hasSkipped(userId: string): boolean {
    return localStorage.getItem(SKIP_KEY(userId)) === "1";
  },

  markSkipped(userId: string) {
    localStorage.setItem(SKIP_KEY(userId), "1");
  },

  isUnlockedForSession(userId: string): boolean {
    return sessionStorage.getItem(UNLOCKED_SESSION_KEY(userId)) === "1";
  },

  markUnlocked(userId: string) {
    sessionStorage.setItem(UNLOCKED_SESSION_KEY(userId), "1");
  },

  async register(userId: string, userLabel: string): Promise<void> {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBytes = new TextEncoder().encode(userId);

    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Sir Alfred Equipe", id: window.location.hostname },
        user: {
          id: userIdBytes,
          name: userLabel,
          displayName: userLabel,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!cred) throw new Error("Cadastro biométrico cancelado");
    localStorage.setItem(CRED_KEY(userId), b64urlEncode(cred.rawId));
    localStorage.removeItem(SKIP_KEY(userId));
    sessionStorage.setItem(UNLOCKED_SESSION_KEY(userId), "1");
  },

  async verify(userId: string): Promise<boolean> {
    const stored = localStorage.getItem(CRED_KEY(userId));
    if (!stored) return false;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [
            { type: "public-key", id: b64urlDecode(stored).buffer as ArrayBuffer },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (!assertion) return false;
      sessionStorage.setItem(UNLOCKED_SESSION_KEY(userId), "1");
      return true;
    } catch {
      return false;
    }
  },

  clear(userId?: string) {
    if (userId) {
      localStorage.removeItem(CRED_KEY(userId));
      localStorage.removeItem(SKIP_KEY(userId));
      sessionStorage.removeItem(UNLOCKED_SESSION_KEY(userId));
      return;
    }
    // Broad clear for logout when we don't have the id anymore
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("bio_cred_") || k.startsWith("bio_skip_"))) {
        localStorage.removeItem(k);
      }
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("bio_unlocked_")) sessionStorage.removeItem(k);
    }
  },
};
