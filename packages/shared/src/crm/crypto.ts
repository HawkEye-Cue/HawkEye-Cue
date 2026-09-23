// Credential crypto — pure over an injectable backend.
// The Lambda injects a KMS-backed backend; tests inject AES-GCM/local.
// (Requirements 7.2, 7.3, 15.2, 15.4)

export interface CryptoBackend {
  encrypt(plaintext: string): Promise<string>; // returns ciphertext (base64)
  decrypt(ciphertext: string): Promise<string>; // returns plaintext
}

/** Encrypt a credential via the backend. */
export async function encryptCredential(backend: CryptoBackend, plaintext: string): Promise<string> {
  return backend.encrypt(plaintext);
}

/** Decrypt a credential via the backend. */
export async function decryptCredential(backend: CryptoBackend, ciphertext: string): Promise<string> {
  return backend.decrypt(ciphertext);
}

/**
 * Mask a credential for display. Never reveals the real value.
 * (Requirements 7.3, 15.4)
 */
export function maskCredential(_credential?: string | null): string {
  return '••••••';
}

/**
 * Strip raw/ciphertext credentials from a stored connection item, replacing
 * with a masked marker. Used on every read and in exports.
 * (Requirements 7.3, 15.4)
 */
export function sanitizeConnectionForRead<T extends Record<string, any>>(item: T): Omit<T, 'credentialCiphertext'> & { credentialMasked: string } {
  const { credentialCiphertext, ...rest } = item as any;
  const hadCredential = credentialCiphertext != null && credentialCiphertext !== '';
  return {
    ...(rest as Omit<T, 'credentialCiphertext'>),
    credentialMasked: hadCredential ? maskCredential() : '',
  };
}
