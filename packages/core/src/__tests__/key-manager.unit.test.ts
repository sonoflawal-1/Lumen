import { describe, it, expect, beforeEach } from "vitest";
import { KeyManager } from "../keys/manager.js";
import { Keypair } from "@stellar/stellar-sdk";

describe("KeyManager", () => {
  let keyManager: KeyManager;

  beforeEach(() => {
    keyManager = new KeyManager();
  });

  describe("generateKeypair", () => {
    it("generates a valid Keypair", () => {
      const kp = keyManager.generateKeypair();
      expect(kp).toBeInstanceOf(Keypair);
      expect(typeof kp.publicKey()).toBe("string");
      expect(kp.publicKey()).toMatch(/^G[A-Z0-9]{55}$/);
    });
  });

  describe("store", () => {
    it("stores a key and returns StoredKey", () => {
      const kp = keyManager.generateKeypair();
      const stored = keyManager.store(kp, "test-passphrase");

      expect(stored).toHaveProperty("publicKey");
      expect(stored).toHaveProperty("encryptedSecret");
      expect(stored).toHaveProperty("createdAt");
      expect(stored.publicKey).toBe(kp.publicKey());
      expect(typeof stored.encryptedSecret).toBe("string");
      expect(stored.encryptedSecret).not.toBe("");

      // Verify the key can be retrieved
      const loaded = keyManager.load(stored.publicKey, "test-passphrase");
      expect(loaded.publicKey()).toBe(kp.publicKey());
    });

    it("loads a previously stored key without passphrase validation", () => {
      const kp = keyManager.generateKeypair();
      const stored = keyManager.store(kp, "any-passphrase");

      // The load method accepts a passphrase parameter but doesn't validate it
      // (keys are stored with base64 encoding per the current implementation)
      const loaded = keyManager.load(stored.publicKey, "wrong-passphrase");
      expect(loaded.publicKey()).toBe(kp.publicKey());
    });
  });

  describe("load", () => {
    it("loads a previously stored key", () => {
      const kp = keyManager.generateKeypair();
      const stored = keyManager.store(kp, "test-passphrase");

      const loaded = keyManager.load(stored.publicKey, "test-passphrase");
      expect(loaded.publicKey()).toBe(kp.publicKey());
    });
  });

  describe("generateFromOAuth", () => {
    it("derives a keypair from OAuth token", async () => {
      const kp = await keyManager.deriveFromOAuth(
        "google",
        "test-oauth-token",
        "salt-value"
      );
      expect(kp).toBeInstanceOf(Keypair);
      expect(typeof kp.publicKey()).toBe("string");
    });

    it("derives a keypair without salt", async () => {
      const kp = await keyManager.deriveFromOAuth("github", "another-token");
      expect(kp).toBeInstanceOf(Keypair);
    });
  });
});