import { Keypair } from "@stellar/stellar-sdk";

export interface StoredKey {
  publicKey: string;
  encryptedSecret: string;
  createdAt: Date;
}

export class KeyManager {
  private keys: Map<string, StoredKey> = new Map();

  generateKeypair(): Keypair {
    return Keypair.random();
  }

  async deriveFromOAuth(
    provider: string,
    token: string,
    salt?: string
  ): Promise<Keypair> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(token),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const data = encoder.encode(`${provider}:${salt ?? "lumen-derivation"}`);
    const signature = await crypto.subtle.sign("HMAC", keyMaterial, data);
    const seed = Buffer.from(new Uint8Array(signature).slice(0, 32));

    return Keypair.fromRawEd25519Seed(seed);
  }

  store(key: Keypair, passphrase: string): StoredKey {
    const secret = key.secret();
    const encrypted = btoa(secret);
    const stored: StoredKey = {
      publicKey: key.publicKey(),
      encryptedSecret: encrypted,
      createdAt: new Date(),
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
