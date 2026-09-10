import { TransactionBuilder, Transaction, Keypair } from "@stellar/stellar-sdk";
import type { Signer } from "@lumen/types";
import type { StellarClient } from "@lumen/core";
import { PolicyEngine } from "../policy/engine.js";

export class UserSignatureMissingError extends Error {
  constructor(message = "User device signature missing on transaction") {
    super(message);
    this.name = "UserSignatureMissingError";
  }
}

export interface CosignerOpts {
  client: StellarClient;
  /** Production: use an AwsKmsSigner. Dev/testnet: use an EnvSigner. */
  signer: Signer;
  policyEngine: PolicyEngine;
}

export interface CosignRequest {
  xdr: string;
  walletAddress: string;
  userPublicKey?: string;
}

export interface CosignResult {
  signedXdr: string;
  approved: boolean;
  reason?: string;
}

export class CosignerService {
  private client: StellarClient;
  private signer: Signer;
  private policyEngine: PolicyEngine;

  constructor(opts: CosignerOpts) {
    this.client = opts.client;
    this.signer = opts.signer;
    this.policyEngine = opts.policyEngine;
  }

  get publicKey(): string {
    return this.signer.publicKey();
  }

  async cosign(request: CosignRequest): Promise<CosignResult> {
    const parsed = TransactionBuilder.fromXDR(
      request.xdr,
      this.client.networkPassphrase
    );
    const tx = parsed instanceof Transaction ? parsed : null;

    if (!tx) {
      return {
        signedXdr: "",
        approved: false,
        reason: "Expected a regular transaction, got fee-bump",
      };
    }

    // 1. Source account verification: Ensure transaction source matches wallet address
    if (tx.source !== request.walletAddress) {
      return {
        signedXdr: "",
        approved: false,
        reason: `Source account mismatch: transaction source (${tx.source}) does not match wallet address (${request.walletAddress})`,
      };
    }

    // 2. User device signature verification
    const txHash = tx.hash();
    if (!tx.signatures || tx.signatures.length === 0) {
      return {
        signedXdr: "",
        approved: false,
        reason: "UserSignatureMissingError: User device signature missing",
      };
    }

    let hasUserSignature = false;
    if (request.userPublicKey) {
      const userKp = Keypair.fromPublicKey(request.userPublicKey);
      hasUserSignature = tx.signatures.some((sig: any) => {
        try {
          const sigBuffer = typeof sig.signature === "function" ? sig.signature() : sig.signature;
          return userKp.verify(txHash, sigBuffer);
        } catch {
          return false;
        }
      });
    } else {
      // Fallback: Verify signature against walletAddress keypair
      try {
        const walletKp = Keypair.fromPublicKey(request.walletAddress);
        hasUserSignature = tx.signatures.some((sig: any) => {
          try {
            const sigBuffer = typeof sig.signature === "function" ? sig.signature() : sig.signature;
            return walletKp.verify(txHash, sigBuffer);
          } catch {
            return false;
          }
        });
      } catch {
        hasUserSignature = false;
      }
    }

    if (!hasUserSignature) {
      return {
        signedXdr: "",
        approved: false,
        reason: "UserSignatureMissingError: Transaction must be signed by user device key before co-signing",
      };
    }

    // 3. Policy evaluation
    const policyResult = this.policyEngine.evaluate({
      walletAddress: request.walletAddress,
      transaction: tx,
    });

    if (!policyResult.approved) {
      return {
        signedXdr: "",
        approved: false,
        reason: policyResult.reason,
      };
    }

    // 4. Sign using the abstracted Signer (KMS or env-keypair)
    const signature = await this.signer.sign(txHash);

    // Attach signature using Stellar hint format (last 4 bytes of public key)
    const rawPublicKey = Keypair.fromPublicKey(
      this.signer.publicKey()
    ).rawPublicKey();
    const hint = rawPublicKey.slice(-4);

    tx.signatures.push({
      hint: () => hint,
      signature: () => signature,
    } as any);

    return {
      signedXdr: tx.toXDR(),
      approved: true,
    };
  }
}
