import { Keypair } from "@stellar/stellar-sdk";
import type { Signer } from "@lumen/types";

/**
 * EnvSigner — development / testnet signer.
 *
 * Wraps a raw Stellar Keypair loaded from an environment variable.
 * The private key is kept in process memory for the lifetime of the process.
 *
 * ⚠  NOT SUITABLE FOR PRODUCTION.  Use AwsKmsSigner (or an equivalent HSM
 *    integration) in any environment where these keys protect real user funds.
 */
export class EnvSigner implements Signer {
  private keypair: Keypair;

  constructor(secret: string) {
    this.keypair = Keypair.fromSecret(secret);
  }

  publicKey(): string {
    return this.keypair.publicKey();
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    // The Stellar SDK types Keypair.sign() as accepting Buffer. We normalise
    // the input with Buffer.from() (zero-copy when payload is already a Buffer)
    // and return the result as Uint8Array to satisfy the Signer interface.
    const sig = this.keypair.sign(Buffer.from(payload));
    return new Uint8Array(sig.buffer, sig.byteOffset, sig.byteLength);
  }
}
