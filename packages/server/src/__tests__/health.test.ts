import { describe, it, expect, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { createServer } from "../server.js";
import { EnvSigner } from "../signers/EnvSigner.js";

describe("Health Check Endpoints", () => {
  it("asserts /healthz/ready returns 503 when Horizon or RPC fails", async () => {
    const cosigner = new EnvSigner(Keypair.random().secret());
    const feePayer = new EnvSigner(Keypair.random().secret());
    const { app, client, server } = createServer({
      cosignerSigner: cosigner,
      feePayerSigner: feePayer,
    });

    // Mock horizon to throw error
    vi.spyOn(client.horizon, "fetchBaseFee").mockRejectedValue(
      new Error("Horizon unreachable")
    );

    const req = {} as any;
    let responseStatus = 0;
    let responseBody: any = null;

    const res = {
      status: (code: number) => {
        responseStatus = code;
        return {
          json: (body: any) => {
            responseBody = body;
          },
        };
      },
    } as any;

    const layers = (app as any)._router.stack;
    const readyLayer = layers.find(
      (layer: any) => layer.route && layer.route.path === "/healthz/ready"
    );

    expect(readyLayer).toBeDefined();
    await readyLayer.route.stack[0].handle(req, res);

    expect(responseStatus).toBe(503);
    expect(responseBody.status).toBe("degraded");
    expect(responseBody.checks.horizon.ok).toBe(false);
    expect(responseBody.checks.horizon.error).toBe("Horizon unreachable");

    server.close();
  });
});
