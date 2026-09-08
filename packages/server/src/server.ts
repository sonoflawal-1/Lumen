import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
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
  errorHandler,
  wrapHandler,
} from "./errors.js";
import { AuditLogger, ConsoleAuditLogger } from "./audit/logger.js";
import { corsMiddleware } from "./middleware/cors.js";

export interface ServerResult {
  app: Express;
  server: HttpServer;
  client: StellarClient;
  cosignerService: CosignerService;
  feeSponsorService: FeeSponsorService;
  policyEngine: PolicyEngine;
  auditLogger: AuditLogger;
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
  /**
   * Logger implementation for audit logging.
   * Defaults to ConsoleAuditLogger (JSON lines to stdout).
   */
  auditLogger?: AuditLogger;
  /**
   * Allowed CORS origins (comma-separated list, or *).
   * Defaults to CORS_ORIGINS env var or http://localhost:3001,http://localhost:5173.
   */
  allowedOrigins?: string;
}

async function checkWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<{ ok: boolean; latencyMs: number; data?: T; error?: string }> {
  const start = Date.now();
  try {
    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Check timed out")), timeoutMs);
    });
    const data = await Promise.race([fn(), timeoutPromise]);
    clearTimeout(timer!);
    const latencyMs = Date.now() - start;
    return { ok: true, latencyMs, data };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return { ok: false, latencyMs, error: err?.message || String(err) };
  }
}

export function createServer(opts: ServerOpts): ServerResult {
  const port = opts.port ?? 3000;
  const auditLogger = opts.auditLogger ?? new ConsoleAuditLogger();

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

  // CORS middleware
  app.use(corsMiddleware({ allowedOrigins: opts.allowedOrigins }));

  app.use(express.json());

  // Request ID middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqIdHeader = req.headers["x-request-id"];
    const requestId = typeof reqIdHeader === "string" ? reqIdHeader : crypto.randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  });

  let activeRequests = 0;

  app.use((_req: Request, _res: Response, next: NextFunction) => {
    activeRequests++;
    _res.on("finish", () => {
      activeRequests--;
    });
    next();
  });

  // Legacy health endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", network: client.config.network });
  });

  // Liveness probe (Issue 4)
  app.get("/healthz/live", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  // Readiness probe (Issue 4)
  app.get("/healthz/ready", wrapHandler(async (_req: Request, res: Response) => {
    const timeoutMs = parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS ?? "2000", 10);
    const lowBalanceThreshold = parseFloat(process.env.LOW_BALANCE_ALERT_THRESHOLD ?? "5");

    const horizonResult = await checkWithTimeout(
      () => client.horizon.fetchBaseFee(),
      timeoutMs
    );

    const rpcResult = await checkWithTimeout(
      async () => {
        const health = await client.rpc.getHealth();
        if (health.status !== "healthy") {
          throw new Error(`RPC status is ${health.status}`);
        }
        return health.status;
      },
      timeoutMs
    );

    const feePayerResult = await checkWithTimeout(
      async () => {
        const feePayerAddr = opts.feePayerSigner.publicKey();
        const account = await client.horizon.loadAccount(feePayerAddr);
        const nativeBal = account.balances.find((b: any) => b.asset_type === "native");
        const balance = nativeBal ? parseFloat(nativeBal.balance) : 0;
        if (balance < lowBalanceThreshold) {
          throw new Error(
            `Fee-payer balance (${balance} XLM) below threshold (${lowBalanceThreshold} XLM)`
          );
        }
        return balance.toString();
      },
      timeoutMs
    );

    const signerResult = await checkWithTimeout(
      async () => {
        const cosignerKey = opts.cosignerSigner.publicKey();
        const feePayerKey = opts.feePayerSigner.publicKey();
        if (!cosignerKey || !feePayerKey) {
          throw new Error("Signers not properly initialized");
        }
        return true;
      },
      timeoutMs
    );

    const isHealthy =
      horizonResult.ok && rpcResult.ok && feePayerResult.ok && signerResult.ok;

    const checks = {
      horizon: {
        ok: horizonResult.ok,
        latencyMs: horizonResult.latencyMs,
        ...(horizonResult.error ? { error: horizonResult.error } : {}),
      },
      rpc: {
        ok: rpcResult.ok,
        latencyMs: rpcResult.latencyMs,
        ...(rpcResult.error ? { error: rpcResult.error } : {}),
      },
      feePayer: {
        ok: feePayerResult.ok,
        balanceXlm: feePayerResult.data,
        ...(feePayerResult.error ? { error: feePayerResult.error } : {}),
      },
      signer: {
        ok: signerResult.ok,
        ...(signerResult.error ? { error: signerResult.error } : {}),
      },
    };

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "ok" : "degraded",
      checks,
    });
  }));

  app.post("/cosign", wrapHandler(async (req: Request, res: Response) => {
    const requestId = res.locals.requestId as string;
    const sourceIp = (req.ip || req.socket.remoteAddress || "unknown") as string;

    const parsed = CosignRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const policy = policyEngine.getPolicy(parsed.data.walletAddress);
    const result = await cosignerService.cosign(parsed.data);

    let txHash = "";
    try {
      const parsedTx = TransactionBuilder.fromXDR(
        parsed.data.xdr,
        client.networkPassphrase
      );
      if ("hash" in parsedTx && typeof parsedTx.hash === "function") {
        txHash = parsedTx.hash().toString("hex");
      }
    } catch {
      txHash = "";
    }

    if (!result.approved) {
      auditLogger.log({
        event: "cosign.rejected",
        walletId: parsed.data.walletAddress,
        txHash,
        signerPublicKey: opts.cosignerSigner.publicKey(),
        policyId: policy?.id,
        reason: result.reason ?? "Transaction denied by policy",
        requestId,
        sourceIp,
        timestamp: new Date().toISOString(),
      });
      throw new PolicyError(result.reason ?? "Transaction denied by policy");
    }

    auditLogger.log({
      event: "cosign.approved",
      walletId: parsed.data.walletAddress,
      txHash,
      signerPublicKey: opts.cosignerSigner.publicKey(),
      policyId: policy?.id,
      requestId,
      sourceIp,
      timestamp: new Date().toISOString(),
    });

    res.json({ signedXdr: result.signedXdr });
  }));

  app.post("/fee-bump", wrapHandler(async (req: Request, res: Response) => {
    const requestId = res.locals.requestId as string;

    const parsed = FeeBumpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const feeBumpXdr = await feeSponsorService.wrapFeeBump(parsed.data.xdr);

    let innerHash = "";
    try {
      const parsedTx = TransactionBuilder.fromXDR(
        parsed.data.xdr,
        client.networkPassphrase
      );
      if ("hash" in parsedTx && typeof parsedTx.hash === "function") {
        innerHash = parsedTx.hash().toString("hex");
      }
    } catch {
      innerHash = "";
    }

    auditLogger.log({
      event: "fee_bump.submitted",
      innerHash,
      feeBumpHash: "",
      requestId,
      timestamp: new Date().toISOString(),
    });

    res.json({ feeBumpXdr });
  }));

  app.post("/fee-bump/submit", wrapHandler(async (req: Request, res: Response) => {
    const requestId = res.locals.requestId as string;

    const parsed = FeeBumpRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    let innerHash = "";
    try {
      const parsedTx = TransactionBuilder.fromXDR(
        parsed.data.xdr,
        client.networkPassphrase
      );
      if ("hash" in parsedTx && typeof parsedTx.hash === "function") {
        innerHash = parsedTx.hash().toString("hex");
      }
    } catch {
      innerHash = "";
    }

    try {
      const result = await feeSponsorService.submit(parsed.data.xdr);

      auditLogger.log({
        event: "fee_bump.submitted",
        innerHash,
        feeBumpHash: result.feeBumpHash,
        requestId,
        timestamp: new Date().toISOString(),
      });

      res.json(result);
    } catch (err: any) {
      auditLogger.log({
        event: "fee_bump.failed",
        innerHash,
        requestId,
        error: err?.message || String(err),
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }));

  app.get("/policy/:walletId", (req: Request, res: Response) => {
    const policy = policyEngine.getPolicy(req.params.walletId as string);
    if (!policy) {
      throw new PolicyError("No policy found", 404);
    }
    res.json(policy);
  });

  app.post("/policy", wrapHandler(async (req: Request, res: Response) => {
    const requestId = res.locals.requestId as string;

    const parsed = PolicyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existingPolicy = policyEngine.getPolicy(parsed.data.walletId);
    const policy = {
      id: crypto.randomUUID(),
      walletId: parsed.data.walletId,
      rules: parsed.data.rules,
      createdAt: new Date(),
    };

    policyEngine.addPolicy(policy);

    auditLogger.log({
      event: existingPolicy ? "policy.updated" : "policy.created",
      policyId: policy.id,
      walletId: policy.walletId,
      requestId,
      timestamp: new Date().toISOString(),
    });

    res.json(policy);
  }));

  app.post("/wallet/create", wrapHandler(async (req: Request, res: Response) => {
    const requestId = res.locals.requestId as string;
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

    auditLogger.log({
      event: "wallet.created",
      walletId: result.address,
      address: result.address,
      requestId,
      timestamp: new Date().toISOString(),
    });

    res.json({ address: result.address, publicKey: result.publicKey });
  }));

  app.use(errorHandler);

  const server = createHttpServer(app);

  server.listen(port, () => {
    console.log(`Lumen server listening on port ${port}`);
    console.log(`Network: ${client.config.network}`);
    console.log(`Cosigner: ${opts.cosignerSigner.publicKey()}`);
    console.log(`Fee payer: ${opts.feePayerSigner.publicKey()}`);
  });

  const gracefulShutdown = (signal: string) => {
    console.log(`${signal} received, shutting down gracefully`);

    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });

    const timeout = setTimeout(() => {
      console.error("Forced shutdown after timeout");
      process.exit(1);
    }, 30000);

    const checkInterval = setInterval(() => {
      if (activeRequests === 0) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        server.close(() => {
          console.log("HTTP server closed");
          process.exit(0);
        });
      }
    }, 100);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  return { app, server, client, cosignerService, feeSponsorService, policyEngine, auditLogger };
}