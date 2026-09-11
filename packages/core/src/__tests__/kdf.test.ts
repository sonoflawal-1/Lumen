import { describe, it, expect } from "vitest";
import { KeyManager } from "../keys/manager.js";

describe("KeyManager HKDF derivation (#35)", () => {
  const km = new KeyManager();

  it("derives different public keys when salts differ for the same OAuth token", async () => {
    const provider = "google";
    const token = "ya29.a0AfH6SMA-test-oauth-token";

    const kp1 = await km.deriveFromOAuth(provider, token, "salt-alpha-12345");
    const kp2 = await km.deriveFromOAuth(provider, token, "salt-beta-67890");

    expect(kp1.publicKey()).not.toBe(kp2.publicKey());
  });

  it("derives identical public keys when token, salt, and walletId match deterministically", async () => {
    const provider = "github";
    const token = "gho_test_oauth_access_token_abc123";
    const salt = "persistent-random-salt-16b";
    const walletId = "wallet-usr-9876";

    const kp1 = await km.deriveFromOAuth(provider, token, salt, walletId);
    const kp2 = await km.deriveFromOAuth(provider, token, salt, walletId);

    expect(kp1.publicKey()).toBe(kp2.publicKey());
    expect(kp1.secret()).toBe(kp2.secret());
  });
});
