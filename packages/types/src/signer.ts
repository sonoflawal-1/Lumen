/**
 * Signer abstracts over how a private key operation is performed.
 *
 * In development / testnet:  EnvSigner  — wraps a raw Stellar Keypair loaded
 *                                         from an environment variable.
 * In production:             AwsKmsSigner, GcpKmsSigner, VaultSigner, etc. —
 *                            the private key never leaves the HSM; only the
 *                            signature bytes are returned.
 *
 * Both CosignerService and FeeSponsorService depend on this interface so that
 * switching from env-based secrets to a KMS/HSM is a wiring change in main.ts,
 * not a service-level change.
 */
export interface Signer {
  /**
   * Returns the Ed25519 public key in Stellar's strkey format (G…).
   */
  publicKey(): string;

  /**
   * Signs the 32-byte transaction hash and returns the 64-byte signature.
   *
   * @param payload - The raw bytes to sign (typically tx.hash()).
   *                  Uses Uint8Array for cross-platform compatibility;
   *                  Node.js Buffer is a Uint8Array subtype and is accepted.
   */
  sign(payload: Uint8Array): Promise<Uint8Array>;
}
