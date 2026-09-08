import { Keypair } from "@stellar/stellar-sdk";
import { StellarClient, Wallet } from "@lumen/core";
import type { StellarNetwork } from "@lumen/types";

export interface ServerWorkerClientOpts {
  network?: StellarNetwork;
  horizonUrl?: string;
  rpcUrl?: string;
  sponsorSecret: string;
  serverPublicKey: string;
}

/**
 * ServerWorkerClient is intended strictly for backend/server workers
 * that hold sponsor keys for account reserve creation.
 * THIS SHOULD NEVER BE BUNDLED IN BROWSER CODE.
 */
export class ServerWorkerClient {
  private client: StellarClient;
  private sponsorKeypair: Keypair;
  private serverPublicKey: string;

  constructor(opts: ServerWorkerClientOpts) {
    this.client = new StellarClient({
      network: opts.network,
      horizonUrl: opts.horizonUrl,
      rpcUrl: opts.rpcUrl,
    });
    this.sponsorKeypair = Keypair.fromSecret(opts.sponsorSecret);
    this.serverPublicKey = opts.serverPublicKey;
  }

  async createSponsoredWallet(): Promise<{ address: string; publicKey: string }> {
    const wallet = new Wallet({
      client: this.client,
      sponsorKeypair: this.sponsorKeypair,
      serverPublicKey: this.serverPublicKey,
    });

    return wallet.create();
  }
}
