import { createServer } from "./server.js";
import { EnvSigner, AwsKmsSigner } from "./signers/index.js";
import type { Signer } from "@lumen/types";

/**
 * SIGNER_PROVIDER controls how private keys are accessed:
 *
 *   env     (default) — raw secrets from COSIGNER_SECRET / FEE_PAYER_SECRET.
 *                       Fine for local development and testnet.
 *                       ⚠  Do NOT use in production with real user funds.
 *
 *   awskms  (recommended for production) — keys live inside AWS KMS / CloudHSM.
 *                       Set KMS_COSIGNER_KEY_ID, KMS_FEE_PAYER_KEY_ID, and
 *                       KMS_REGION.  Requires @aws-sdk/client-kms and IAM
 *                       permissions; see AwsKmsSigner.ts for details.
 *
 * See docs/production-key-management.md for the full production checklist.
 */
const signerProvider = (process.env.SIGNER_PROVIDER ?? "env").toLowerCase();

async function buildSigners(): Promise<{ cosigner: Signer; feePayer: Signer }> {
  if (signerProvider === "awskms") {
    console.log("Using AWS KMS signers (SIGNER_PROVIDER=awskms)");
    const [cosigner, feePayer] = await Promise.all([
      AwsKmsSigner.fromEnv("KMS_COSIGNER_KEY_ID"),
      AwsKmsSigner.fromEnv("KMS_FEE_PAYER_KEY_ID"),
    ]);
    return { cosigner, feePayer };
  }

  // Default: env-based signers (dev / testnet).
  if (signerProvider !== "env") {
    console.warn(
      `Unknown SIGNER_PROVIDER="${signerProvider}", falling back to "env". ` +
        "Valid values: env, awskms."
    );
  }

  const cosignerSecret = process.env.COSIGNER_SECRET;
  const feePayerSecret = process.env.FEE_PAYER_SECRET;

  if (!cosignerSecret || !feePayerSecret) {
    console.error(
      "Missing COSIGNER_SECRET or FEE_PAYER_SECRET.\n" +
        "For production, set SIGNER_PROVIDER=awskms and configure KMS keys.\n" +
        "See docs/production-key-management.md."
    );
    process.exit(1);
  }

  return {
    cosigner: new EnvSigner(cosignerSecret),
    feePayer: new EnvSigner(feePayerSecret),
  };
}

const { cosigner, feePayer } = await buildSigners();

createServer({
  port: parseInt(process.env.PORT ?? "3000"),
  network: (process.env.STELLAR_NETWORK as any) ?? "testnet",
  horizonUrl: process.env.HORIZON_URL,
  rpcUrl: process.env.SOROBAN_RPC_URL,
  cosignerSigner: cosigner,
  feePayerSigner: feePayer,
});
