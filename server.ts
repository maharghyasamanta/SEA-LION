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
      mode: "SAMPLE",  // matches Lambda's "mode" key; value distinguishes local vs AWS
      timestamp: new Date().toISOString(),
    });
  });

  app.post("/api/upload-url", (_req, res) => {
    res.status(501).json({
      error: "Stage 2 analysis API (/upload-url) is not deployed in this Stage 1 environment.",
      stage: "stage-1-hello-world",
    });
  });

  app.get("/api/inspections/:id", (req, res) => {
    res.status(501).json({
      error: `Stage 2 inspection polling (/inspections/${req.params.id}) is not deployed in this Stage 1 environment.`,
      stage: "stage-1-hello-world",
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
