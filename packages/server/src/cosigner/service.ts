import { Keypair, TransactionBuilder, Transaction } from "@stellar/stellar-sdk";
import type { StellarClient } from "@lumen/core";
import { PolicyEngine } from "../policy/engine.js";

export interface CosignerOpts {
  client: StellarClient;
  serverKeypair: Keypair;
  policyEngine: PolicyEngine;
}

export interface CosignRequest {
  xdr: string;
  walletAddress: string;
}

export interface CosignResult {
  signedXdr: string;
  approved: boolean;
  reason?: string;
}

export class CosignerService {
  private client: StellarClient;
  private serverKeypair: Keypair;
  private policyEngine: PolicyEngine;

  constructor(opts: CosignerOpts) {
    this.client = opts.client;
    this.serverKeypair = opts.serverKeypair;
    this.policyEngine = opts.policyEngine;
  }

  async cosign(request: CosignRequest): Promise<CosignResult> {
    const parsed = TransactionBuilder.fromXDR(request.xdr, this.client.networkPassphrase);
    const tx = parsed instanceof Transaction ? parsed : null;

    if (!tx) {
      return { signedXdr: "", approved: false, reason: "Expected a regular transaction, got fee-bump" };
    }

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

    tx.sign(this.serverKeypair);

    return {
      signedXdr: tx.toXDR(),
      approved: true,
    };
  }
}
