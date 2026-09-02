import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { StellarClient } from "@lumen/core";
import type { Signer } from "@lumen/types";
import { CosignerService } from "./cosigner/service.js";
import { FeeSponsorService } from "./fee-sponsor/service.js";
import { PolicyEngine } from "./policy/engine.js";
import {
  CosignRequestSchema,
  FeeBumpRequestSchema,
  PolicyRequestSchema,
} from "./validation.js";
import {
  ValidationError,
  PolicyError,
  StellarError,
  errorHandler,
  wrapHandler,
} from "./errors.js";

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
  /**
   * Signer used by the co-signer service.
   * Dev/testnet → EnvSigner.  Production → AwsKmsSigner or equivalent.
   */
  cosignerSigner: Signer;
  /**
   * Signer used by the fee-sponsor service.
   * Dev/testnet → EnvSigner.  Production → AwsKmsSigner or equivalent.
   */
  feePayerSigner: Signer;
}

export function createServer(opts: ServerOpts): ServerResult {
  const port = opts.port ?? 3000;

  const client = new StellarClient({
    network: opts.network,
    horizonUrl: opts.horizonUrl,
    rpcUrl: opts.rpcUrl,
  });

  const policyEngine = new PolicyEngine();

  const cosignerService = new CosignerService({
    client,
    signer: opts.cosignerSigner,
    policyEngine,
  });

  const feeSponsorService = new FeeSponsorService({
    client,
    signer: opts.feePayerSigner,
  });

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", network: client.config.network });
  });

  app.post("/cosign", wrapHandler(async (req: Request, res: Response) => {
    const parsed = CosignRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const result = await cosignerService.cosign(parsed.data);

    if (!result.approved) {
      throw new PolicyError(result.reason ?? "Transaction denied by policy");
    }

    res.json({ signedXdr: result.signedXdr });
  }));

  app.post("/fee-bump", wrapHandler(async (req: Request, res: Response) => {
    const parsed = FeeBumpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const feeBumpXdr = await feeSponsorService.wrapFeeBump(parsed.data.xdr);
    res.json({ feeBumpXdr });
  }));

  app.post("/fee-bump/submit", wrapHandler(async (req: Request, res: Response) => {
    const parsed = FeeBumpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const result = await feeSponsorService.submit(parsed.data.xdr);
    res.json(result);
  }));

  app.get("/policy/:walletId", (req: Request, res: Response) => {
    const policy = policyEngine.getPolicy(req.params.walletId);
    if (!policy) {
      throw new PolicyError("No policy found", 404);
    }
    res.json(policy);
  });

  app.post("/policy", wrapHandler(async (req: Request, res: Response) => {
    const parsed = PolicyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const policy = {
      id: crypto.randomUUID(),
      walletId: parsed.data.walletId,
      rules: parsed.data.rules,
      createdAt: new Date(),
    };

    policyEngine.addPolicy(policy);
    res.json(policy);
  }));

  app.post("/wallet/create", wrapHandler(async (req: Request, res: Response) => {
    const { Wallet } = await import("@lumen/core");

    const sponsorKeypair = Keypair.fromPublicKey(
      opts.cosignerSigner.publicKey()
    );
    const wallet = new Wallet({
      client,
      sponsorKeypair,
      serverPublicKey: opts.cosignerSigner.publicKey(),
    });

    const result = await wallet.create();
    res.json({ address: result.address, publicKey: result.publicKey });
  }));

  app.use(errorHandler);

  app.listen(port, () => {
    console.log(`Lumen server listening on port ${port}`);
    console.log(`Network: ${client.config.network}`);
    console.log(`Cosigner: ${opts.cosignerSigner.publicKey()}`);
    console.log(`Fee payer: ${opts.feePayerSigner.publicKey()}`);
  });

  return { app, client, cosignerService, feeSponsorService, policyEngine };
}