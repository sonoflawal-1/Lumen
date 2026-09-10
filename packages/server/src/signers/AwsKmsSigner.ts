/**
 * AwsKmsSigner — production signer backed by AWS KMS (ECC_NIST_P256 or
 * EXTERNAL key material with Ed25519 wrapping via CloudHSM).
 *
 * ─── IMPORTANT NOTE ON STELLAR SIGNATURES ────────────────────────────────────
 * Stellar uses Ed25519 natively.  AWS KMS does not yet expose Ed25519 as a
 * managed key type (as of 2026-07).  Two viable patterns for production:
 *
 *   A) AWS CloudHSM + custom key store
 *      Store the Ed25519 private key inside a CloudHSM cluster and import it
 *      into KMS as an EXTERNAL key so that KMS sign/verify calls never leave
 *      your HSM boundary.  See:
 *      https://docs.aws.amazon.com/kms/latest/developerguide/custom-key-store-overview.html
 *
 *   B) AWS KMS ECDSA_SHA_256 + offline key wrapping (hybrid)
 *      Keep the Ed25519 key encrypted at rest with a KMS data-key (GenerateDataKey).
 *      The plaintext key is decrypted in memory only for the duration of the
 *      sign operation inside an AWS Lambda with no persistent storage.
 *      Combine with Lambda SnapStart disabled and a short TTL.
 *
 *   C) HashiCorp Vault Transit (alternative HSM)
 *      Vault Transit supports Ed25519 natively.  See VaultSigner (not yet
 *      implemented) or https://developer.hashicorp.com/vault/docs/secrets/transit
 *
 * This file is a STUB that shows the integration shape so the rest of the
 * server code compiles and can be tested with EnvSigner without changes.
 * Replace the body of `sign()` with a real KMS SDK call before deploying.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Expected environment variables:
 *   KMS_COSIGNER_KEY_ID    — ARN or alias of the KMS key for the co-signer
 *   KMS_FEE_PAYER_KEY_ID   — ARN or alias of the KMS key for the fee-payer
 *   KMS_REGION             — AWS region (defaults to AWS_REGION if set)
 *
 * Required IAM permissions (least-privilege):
 *   kms:Sign   on the specific key ARN only
 *   kms:GetPublicKey  (one-time, at startup)
 *
 * Installation:
 *   pnpm add @aws-sdk/client-kms
 *
 * @example
 * ```ts
 * import { AwsKmsSigner } from "./signers/AwsKmsSigner.js";
 *
 * const cosigner = await AwsKmsSigner.fromEnv("KMS_COSIGNER_KEY_ID");
 * const feePayer = await AwsKmsSigner.fromEnv("KMS_FEE_PAYER_KEY_ID");
 * ```
 */
import { KMSClient, GetPublicKeyCommand, SignCommand } from "@aws-sdk/client-kms";
import type { Signer } from "@lumen/types";
import { StrKey } from "@stellar/stellar-sdk";

export class AwsKmsSigner implements Signer {
  private readonly keyId: string;
  private readonly region: string;
  private cachedPublicKey: string | null = null;

  constructor(keyId: string, region: string) {
    this.keyId = keyId;
    this.region = region;
  }

  /**
   * Convenience constructor: reads the key ID from the named env var and the
   * region from KMS_REGION (falling back to AWS_REGION).
   */
  static async fromEnv(keyIdEnvVar: string): Promise<AwsKmsSigner> {
    const keyId = process.env[keyIdEnvVar];
    if (!keyId) {
      throw new Error(
        `AwsKmsSigner: environment variable ${keyIdEnvVar} is not set. ` +
          "Set it to the KMS key ARN or alias/ARN."
      );
    }
    const region = process.env.KMS_REGION ?? process.env.AWS_REGION;
    if (!region) {
      throw new Error(
        "AwsKmsSigner: neither KMS_REGION nor AWS_REGION is set."
      );
    }
    const signer = new AwsKmsSigner(keyId, region);
    // Eagerly fetch and cache the public key so startup fails fast if IAM
    // permissions are wrong rather than at the first sign request.
    await signer.publicKey();
    return signer;
  }

  async publicKey(): string {
    if (this.cachedPublicKey) return this.cachedPublicKey;
    const client = new KMSClient({ region: this.region });
    const derPublicKey = await client.send(
      new GetPublicKeyCommand({ KeyId: this.keyId })
    );
    const rawPubkeyBytes = derPublicKey.PublicKey as Buffer;
    return StrKey.encodeEd25519PublicKey(rawPubkeyBytes);
  }

  async sign(payload: Uint8Array): Promise<Uint8Array> {
    const client = new KMSClient({ region: this.region });
    const response = await client.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: payload,
        MessageType: "RAW",
        SigningAlgorithm: "ECDSA_SHA_256",
      })
    );
    const derSignature = response.Signature as Buffer;
    const signatureBytes = new Uint8Array(
      derSignature.buffer,
      derSignature.byteOffset,
      derSignature.byteLength
    );
    return signatureBytes;
  }
}
