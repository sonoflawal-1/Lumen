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

  async store(key: Keypair, passphrase: string): Promise<StoredKey> {
    const encoder = new TextEncoder();
    const secret = key.secret();
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      aesKey,
      encoder.encode(secret)
    );

    const encryptedSecret = `${Buffer.from(salt).toString("base64")}.${Buffer.from(iv).toString("base64")}.${Buffer.from(encrypted).toString("base64")}`;

    const stored: StoredKey = {
      publicKey: key.publicKey(),
      encryptedSecret,
      createdAt: new Date(),
    };
    this.keys.set(key.publicKey(), stored);
    return stored;
  }

  async load(publicKey: string, passphrase: string): Promise<Keypair> {
    const stored = this.keys.get(publicKey);
    if (!stored) throw new Error(`Key not found: ${publicKey}`);

    const [saltB64, ivB64, cipherB64] = stored.encryptedSecret.split(".");
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const ciphertext = Buffer.from(cipherB64, "base64");

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    const aesKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt as BufferSource,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      aesKey,
      ciphertext as BufferSource
    );

    const secret = new TextDecoder().decode(decrypted);
    return Keypair.fromSecret(secret);
  }

  list(): StoredKey[] {
    return Array.from(this.keys.values());
  }
}
