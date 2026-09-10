import type { Request, Response, NextFunction } from "express";

export interface CorsOptions {
  allowedOrigins?: string;
}

export function corsMiddleware(opts?: CorsOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const rawOrigins =
      opts?.allowedOrigins ??
      process.env.CORS_ORIGINS ??
      "http://localhost:3001,http://localhost:5173";
    const originHeader = req.headers.origin;

    // Health endpoints exception (not credentials-bearing, responds to any origin)
    if (req.path === "/health" || req.path.startsWith("/healthz/")) {
      res.setHeader("Access-Control-Allow-Origin", originHeader || "*");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Lumen-Api-Key, X-Request-Id"
      );
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }
      next();
      return;
    }

    if (!originHeader) {
      // Request without Origin header (e.g. server-to-server, curl)
      next();
      return;
    }

    const isWildcard = rawOrigins.trim() === "*";
    const allowedList = rawOrigins.split(",").map((s) => s.trim());
    const isAllowed = isWildcard || allowedList.includes(originHeader);

    if (!isAllowed) {
      res.status(403).json({ error: "CORS origin not allowed" });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", originHeader);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Lumen-Api-Key, X-Request-Id"
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.setHeader("Access-Control-Expose-Headers", "X-Request-Id");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  };
}
