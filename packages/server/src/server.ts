import express, { type Express } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { StellarClient } from "@lumen/core";
import { CosignerService } from "./cosigner/service.js";
import { FeeSponsorService } from "./fee-sponsor/service.js";
import { PolicyEngine } from "./policy/engine.js";

export interface ServerResult {
  app: Express;
  client: StellarClient;
  cosignerService: CosignerService;
  feeSponsorService: FeeSponsorService;
  policyEngine: PolicyEngine;
}

export interface ServerOpts {
  port?: number;
  network?: "testnet" | "mainnet" | "local";
  horizonUrl?: string;
  rpcUrl?: string;
  cosignerSecret: string;
  feePayerSecret: string;
}

export function createServer(opts: ServerOpts): ServerResult {
  const port = opts.port ?? 3000;

  const client = new StellarClient({
    network: opts.network,
    horizonUrl: opts.horizonUrl,
    rpcUrl: opts.rpcUrl,
  });

  const cosignerKeypair = Keypair.fromSecret(opts.cosignerSecret);
  const feePayerKeypair = Keypair.fromSecret(opts.feePayerSecret);

  const policyEngine = new PolicyEngine();
  const cosignerService = new CosignerService({
    client,
    serverKeypair: cosignerKeypair,
    policyEngine,
  });
  const feeSponsorService = new FeeSponsorService({
    client,
    feePayerKeypair,
  });

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", network: client.config.network });
  });

  app.post("/cosign", async (req, res) => {
    try {
      const { xdr, walletAddress } = req.body;
      if (!xdr || !walletAddress) {
        res.status(400).json({ error: "Missing xdr or walletAddress" });
        return;
      }

      const result = await cosignerService.cosign({ xdr, walletAddress });

      if (!result.approved) {
        res.status(403).json({ error: result.reason });
        return;
      }

      res.json({ signedXdr: result.signedXdr });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/fee-bump", async (req, res) => {
    try {
      const { xdr } = req.body;
      if (!xdr) {
        res.status(400).json({ error: "Missing xdr" });
        return;
      }

      const feeBumpXdr = await feeSponsorService.wrapFeeBump(xdr);
      res.json({ feeBumpXdr });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/fee-bump/submit", async (req, res) => {
    try {
      const { xdr } = req.body;
      if (!xdr) {
        res.status(400).json({ error: "Missing xdr" });
        return;
      }

      const result = await feeSponsorService.submit(xdr);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/policy/:walletId", (req, res) => {
    const policy = policyEngine.getPolicy(req.params.walletId);
    if (!policy) {
      res.status(404).json({ error: "No policy found" });
      return;
    }
    res.json(policy);
  });

  app.post("/policy", (req, res) => {
    const { walletId, rules } = req.body;
    if (!walletId || !rules) {
      res.status(400).json({ error: "Missing walletId or rules" });
      return;
    }

    const policy = {
      id: crypto.randomUUID(),
      walletId,
      rules,
      createdAt: new Date(),
    };

    policyEngine.addPolicy(policy);
    res.json(policy);
  });

  app.post("/wallet/create", async (req, res) => {
    try {
      const { Wallet } = await import("@lumen/core");

      const sponsorKeypair = Keypair.fromSecret(opts.feePayerSecret);
      const wallet = new Wallet({
        client,
        sponsorKeypair,
        serverPublicKey: cosignerKeypair.publicKey(),
      });

      const result = await wallet.create();
      res.json({ address: result.address, publicKey: result.publicKey });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`Lumen server listening on port ${port}`);
    console.log(`Network: ${client.config.network}`);
    console.log(`Cosigner: ${cosignerKeypair.publicKey()}`);
    console.log(`Fee payer: ${feePayerKeypair.publicKey()}`);
  });

  return { app, client, cosignerService, feeSponsorService, policyEngine };
}
