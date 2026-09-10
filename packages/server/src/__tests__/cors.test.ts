import { describe, it, expect, vi } from "vitest";
import { corsMiddleware } from "../middleware/cors.js";

describe("CORS Middleware", () => {
  it("rejects OPTIONS preflight from non-allowlisted origin with 403", () => {
    const middleware = corsMiddleware({
      allowedOrigins: "http://localhost:3001,http://localhost:5173",
    });

    const req = {
      path: "/cosign",
      method: "OPTIONS",
      headers: {
        origin: "http://malicious-site.com",
      },
    } as any;

    let statusCode = 0;
    let jsonBody: any = null;

    const res = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonBody = data;
          },
        };
      },
      setHeader: vi.fn(),
    } as any;

    const next = vi.fn();

    middleware(req, res, next);

    expect(statusCode).toBe(403);
    expect(jsonBody).toEqual({ error: "CORS origin not allowed" });
    expect(next).not.toHaveBeenCalled();
  });

  it("allows OPTIONS preflight from allowlisted origin", () => {
    const middleware = corsMiddleware({
      allowedOrigins: "http://localhost:3001,http://localhost:5173",
    });

    const req = {
      path: "/cosign",
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3001",
      },
    } as any;

    let sendStatusValue = 0;

    const res = {
      setHeader: vi.fn(),
      sendStatus: (code: number) => {
        sendStatusValue = code;
      },
    } as any;

    const next = vi.fn();

    middleware(req, res, next);

    expect(sendStatusValue).toBe(204);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "http://localhost:3001"
    );
  });

  it("bypasses origin check for /health and /healthz/* endpoints", () => {
    const middleware = corsMiddleware({
      allowedOrigins: "http://localhost:3001",
    });

    const req = {
      path: "/healthz/ready",
      method: "GET",
      headers: {
        origin: "http://any-origin.com",
      },
    } as any;

    const res = {
      setHeader: vi.fn(),
    } as any;

    const next = vi.fn();

    middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      "Access-Control-Allow-Origin",
      "http://any-origin.com"
    );
    expect(next).toHaveBeenCalled();
  });
});
