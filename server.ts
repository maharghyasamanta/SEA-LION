import express from "express";
import { createServer as createViteServer } from "vite";

/**
 * Development-only Express server mirroring the AWS HTTP API contract.
 * Production builds served from S3 + CloudFront never use this file;
 * they call the real AWS HTTP API via VITE_API_BASE_URL.
 */
async function startDevServer() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      service: "sea-lion-api",
      stage: "stage-1-hello-world",
      region: "local-dev-mock",
      mode: "SAMPLE",
      timestamp: new Date().toISOString(),
    });
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sea Lion dev server listening on http://localhost:${PORT}`);
  });
}

startDevServer();
