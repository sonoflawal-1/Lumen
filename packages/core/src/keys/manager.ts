import { Keypair } from "@stellar/stellar-sdk";

export interface StoredKey {
  publicKey: string;
  encryptedSecret: string;
  createdAt: Date;
  salt?: string;
  provider?: string;
}

export class KeyManager {
  private keys: Map<string, StoredKey> = new Map();

  generateKeypair(): Keypair {
    return Keypair.random();
  }

  async deriveFromOAuth(
    provider: string,
    token: string,
    salt?: string,
    walletId?: string
  ): Promise<Keypair> {
    const encoder = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(token),
      "HKDF",
      false,
      ["deriveBits"]
    );

    let saltBytes: Uint8Array;
    if (salt) {
      saltBytes = encoder.encode(salt);
    } else {
      const randomBuf = crypto.getRandomValues(new Uint8Array(16));
      saltBytes = randomBuf;
    }

    const infoString = `lumen:ed25519:${provider}:${walletId ?? "default"}`;
    const infoBytes = encoder.encode(infoString);

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: saltBytes,
        info: infoBytes,
      },
      keyMaterial,
      256
    );

    const seed = Buffer.from(new Uint8Array(derivedBits));
    return Keypair.fromRawEd25519Seed(seed);
  }

  store(
    key: Keypair,
    passphrase: string,
    salt?: string,
    provider?: string
  ): StoredKey {
    const secret = key.secret();
    const encrypted = btoa(secret);
    const stored: StoredKey = {
      publicKey: key.publicKey(),
      encryptedSecret: encrypted,
      createdAt: new Date(),
      salt,
      provider,
    };
    this.keys.set(key.publicKey(), stored);
    return stored;
  }

  load(publicKey: string, passphrase: string): Keypair {
    const stored = this.keys.get(publicKey);
    if (!stored) throw new Error(`Key not found: ${publicKey}`);

    const secret = atob(stored.encryptedSecret);
    return Keypair.fromSecret(secret);
  }

  list(): StoredKey[] {
    return Array.from(this.keys.values());
  }
}
