import express from "express";
import { createServer as createViteServer } from "vite";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);

/**
 * S.E.A.-L.I.O.N. local development server.
 *
 * This server implements the same HTTP contract as the AWS stack, but it is
 * explicitly a local demo:
 *   - health reports mode "local-demo" and every service "simulated"
 *   - uploads are kept in memory, not in S3
 *   - records are kept in memory, not in DynamoDB
 *   - the measurement itself is real: it shells out to the same OpenCV code
 *     used by the Lambda (backend/analyze/cli.py)
 *
 * Every record is labelled source "local-demo" so the UI cannot mistake it for
 * an AWS deployment.
 */
async function startDevServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(express.raw({ type: ["image/*", "application/octet-stream"], limit: "15mb" }));

  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
  const ASSET_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
  const INSPECTION_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;
  const CLI_PATH = path.resolve(process.cwd(), "backend", "analyze", "cli.py");

  const round = (value: number, digits = 2) => Number(value.toFixed(digits));

  function hydraulicLoss(areaCm2: number, depthM: number) {
    const head = Math.max(0.1, depthM);
    const effectiveAreaM2 = Math.max(0.000001, areaCm2 * 1e-4 * 0.15);
    const velocity = Math.sqrt(2 * 9.81 * head);
    const flowM3s = 0.62 * effectiveAreaM2 * velocity;
    const litersPerDay = flowM3s * 1000 * 86400;
    return {
      litersPerDay: round(litersPerDay, 1),
      annualInr: round(litersPerDay * 365 * 0.05, 2),
    };
  }

  function screeningRisk(p90WidthMm: number, lossLDay: number, areaCm2: number, depthM: number) {
    const widthScore = Math.min(100, (Math.max(0, p90WidthMm) / 2) * 100);
    const lossScore = Math.min(100, (Math.max(0, lossLDay) / 15000) * 100);
    const areaScore = Math.min(100, (Math.max(0, areaCm2) / 40) * 100);
    const headScore = Math.min(100, (Math.max(0, depthM) / 8) * 100);
    const score = Math.max(
      0,
      Math.min(100, Math.round(0.45 * widthScore + 0.25 * lossScore + 0.15 * areaScore + 0.15 * headScore)),
    );
    if (score <= 35) {
      return {
        score,
        tier: "LOW",
        action: "Routine screening. Re-check during the next seasonal inspection.",
      };
    }
    if (score <= 70) {
      return {
        score,
        tier: "MODERATE",
        action: "Schedule a closer engineer review and consider grouting within 30 days.",
      };
    }
    return {
      score,
      tier: "CRITICAL",
      action:
        "Escalate to a qualified structural engineer for immediate verification and repair planning.",
    };
  }

  function demoSeed(input: {
    inspectionId: string;
    assetId: string;
    assetName: string;
    assetType: string;
    depthM: number;
    image: string;
    medianMm: number;
    p90Mm: number;
    lengthCm: number;
    areaCm2: number;
    daysAgo: number;
  }) {
    const { litersPerDay, annualInr } = hydraulicLoss(input.areaCm2, input.depthM);
    const risk = screeningRisk(input.p90Mm, litersPerDay, input.areaCm2, input.depthM);
    const createdAt = new Date(Date.now() - input.daysAgo * 86400000).toISOString();
    return {
      id: input.inspectionId,
      asset_id: input.assetId,
      inspection_id: input.inspectionId,
      asset_name: input.assetName,
      asset_type: input.assetType,
      water_depth_m: input.depthM,
      raw_image_url: input.image,
      annotated_image_url: input.image,
      crack_detected: true,
      status: "COMPLETED",
      measurement_method: "demo_seed",
      confidence: 0,
      crack_median_width_mm: input.medianMm,
      crack_mean_width_mm: input.medianMm,
      crack_max_width_mm: input.p90Mm,
      widthMm: input.p90Mm,
      crack_total_length_cm: input.lengthCm,
      crack_area_cm2: input.areaCm2,
      water_loss_liters_per_day: litersPerDay,
      annual_loss_inr: annualInr,
      structural_risk_index: risk.score,
      risk_tier: risk.tier,
      action_recommendation: risk.action,
      calibration_mm_per_px: 0.2,
      calibration_source: "assumed_demo",
      limitations: [
        "Demo seed record for the local walkthrough; these are illustrative values, not a field measurement.",
        "The UI labels this record source=local-demo. Deploy the SAM stack to create AWS-backed records.",
      ],
      source: "local-demo",
      created_at: createdAt,
      createdAt,
    };
  }

  // In-memory stores. These are NOT S3 or DynamoDB.
  const demoInspections = [
    demoSeed({
      inspectionId: "insp_demo_reservoir_current",
      assetId: "asset-tallah-res",
      assetName: "Illustrative Municipal Reservoir — Wall B (demo seed)",
      assetType: "Municipal Potable Reservoir",
      depthM: 4.8,
      image: "/samples/crack-c03-leak.jpg",
      medianMm: 1.45,
      p90Mm: 2.1,
      lengthCm: 26.5,
      areaCm2: 6.4,
      daysAgo: 14,
    }),
    demoSeed({
      inspectionId: "insp_demo_pier_current",
      assetId: "asset-hooghly-pier",
      assetName: "Illustrative Bridge Pier — Tidal Zone (demo seed)",
      assetType: "Railway Bridge Substructure",
      depthM: 6.2,
      image: "/samples/crack-c02-moderate.jpg",
      medianMm: 0.55,
      p90Mm: 1.7,
      lengthCm: 19.1,
      areaCm2: 4.2,
      daysAgo: 21,
    }),
    demoSeed({
      inspectionId: "insp_demo_sump_current",
      assetId: "asset-kalyani-sump",
      assetName: "Illustrative Overhead Tank Sump — Wall (demo seed)",
      assetType: "Elevated Tank Ground Sump",
      depthM: 2.1,
      image: "/samples/crack-c01-minor.jpg",
      medianMm: 0.28,
      p90Mm: 0.9,
      lengthCm: 8.5,
      areaCm2: 1.8,
      daysAgo: 45,
    }),
    demoSeed({
      inspectionId: "insp_demo_reservoir_baseline",
      assetId: "asset-tallah-res",
      assetName: "Illustrative Municipal Reservoir — Wall B (demo seed)",
      assetType: "Municipal Potable Reservoir",
      depthM: 4.8,
      image: "/samples/crack-c03-leak.jpg",
      medianMm: 0.72,
      p90Mm: 1.2,
      lengthCm: 18.4,
      areaCm2: 3.2,
      daysAgo: 30,
    }),
    demoSeed({
      inspectionId: "insp_demo_gallery_current",
      assetId: "asset-bhakra-toe",
      assetName: "Illustrative Dam Gallery — Spillway Wall (demo seed)",
      assetType: "Hydroelectric Dam Gallery",
      depthM: 8.5,
      image: "/samples/crack-c04-critical.jpg",
      medianMm: 1.8,
      p90Mm: 3.2,
      lengthCm: 34.0,
      areaCm2: 12.0,
      daysAgo: 60,
    }),
  ];

  const uploadedImages = new Map<string, { buffer: Buffer; contentType: string }>();
  const annotatedImages = new Map<string, Buffer>();

  let latestTelemetry = {
    ok: true,
    unit_id: "sealion-rov-01",
    timestamp: new Date().toISOString(),
    depth_m: 1.25,
    pressure_kpa: 113.56,
    acoustic_leak_index: 24,
    battery_pct: 96,
    thruster_rpm: 820,
    source: "local-demo-simulated",
  };

  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    next();
  });

  app.get(["/api/health", "/health"], (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      service: "sea-lion-api",
      stage: "local-demo",
      region: "local",
      mode: "local-demo",
      timestamp: new Date().toISOString(),
      services: {
        lambda: "simulated (local Python OpenCV)",
        s3: "simulated (in-memory uploads)",
        dynamodb_inspections: "simulated (in-memory records)",
        dynamodb_telemetry: "simulated (in-memory packets)",
      },
    });
  });

  // POST /api/uploads/presign & POST /api/upload-url (legacy alias)
  app.post(["/api/uploads/presign", "/api/upload-url"], (req, res) => {
    const rawFilename = String(req.body?.filename || "inspection.jpg");
    const safeFilename = rawFilename.replace(/[^A-Za-z0-9._-]/g, "_").slice(-120) || "inspection.jpg";
    const contentType = String(req.body?.content_type || "image/jpeg").toLowerCase();
    const size = Number(req.body?.file_size_bytes ?? req.body?.size ?? 0);
    const assetId = String(req.body?.asset_id || "asset-demo");

    if (!contentType.startsWith("image/")) {
      res.status(415).json({ error: "Only image uploads are accepted" });
      return;
    }
    if (size > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: `Image must be at most ${MAX_IMAGE_BYTES} bytes` });
      return;
    }
    if (!ASSET_ID_RE.test(assetId)) {
      res.status(400).json({ error: "asset_id has an invalid format" });
      return;
    }

    const objectKey = `uploads/${assetId}/${Date.now()}_${safeFilename}`;
    const uploadUrl = `/api/dev-upload/${encodeURIComponent(objectKey)}`;
    const inspectionId = `insp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    res.json({
      ok: true,
      upload_url: uploadUrl,
      object_key: objectKey,
      asset_id: assetId,
      inspection_id: inspectionId,
      expires_in_seconds: 300,
      uploadUrl,
      inspectionId,
    });
  });

  // PUT /api/dev-upload/:key — stores the image in memory, not S3.
  app.put("/api/dev-upload/:key", (req, res) => {
    const key = String(req.params.key);
    if (!key.startsWith("uploads/") || key.includes("..")) {
      res.status(400).json({ error: "Invalid upload key" });
      return;
    }
    const buffer = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buffer || buffer.length === 0) {
      res.status(415).json({ error: "Expected a raw image body" });
      return;
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: "Image exceeds the maximum allowed size" });
      return;
    }
    const contentType = String(req.headers["content-type"] || "image/jpeg");
    uploadedImages.set(key, { buffer, contentType });
    res.status(200).json({ ok: true, message: "Stored in the local demo image map" });
  });

  // GET /api/dev-image/:key — serves the in-memory image or annotated overlay.
  app.get("/api/dev-image/:key", (req, res) => {
    const key = String(req.params.key);
    const variant = String(req.query.variant || "raw");
    if (variant === "annotated") {
      const annotated = annotatedImages.get(key);
      if (!annotated) {
        res.status(404).json({ error: "Annotated image not found" });
        return;
      }
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      res.send(annotated);
      return;
    }
    const stored = uploadedImages.get(key);
    if (!stored) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    res.setHeader("Content-Type", stored.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.send(stored.buffer);
  });

  async function runLocalMeasurement(
    imagePath: string,
    trace: Array<[number, number]>,
    calibration: number,
    depthM: number,
  ) {
    const args = [
      CLI_PATH,
      "--image",
      imagePath,
      "--trace",
      JSON.stringify(trace),
      "--calibration",
      String(calibration),
      "--depth",
      String(depthM),
    ];
    let lastError: unknown = null;
    for (const python of ["python", "python3"]) {
      try {
        const { stdout } = await execFileAsync(python, args, {
          timeout: 30000,
          maxBuffer: 24 * 1024 * 1024,
          windowsHide: true,
        });
        return JSON.parse(stdout) as Record<string, unknown>;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `Local OpenCV measurement failed. Ensure Python with opencv-python-headless is installed. ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  // POST /api/inspections/analyze
  app.post("/api/inspections/analyze", async (req, res) => {
    const body = req.body ?? {};
    const assetId = String(body.asset_id || "");
    const assetName = String(body.asset_name || "Unnamed asset").slice(0, 120);
    const assetType = String(body.asset_type || "Concrete asset").slice(0, 80);
    const depthM = Number(body.water_depth_m ?? 2.5);
    const calibration = Number(body.calibration_mm_per_px ?? 0.2);
    const calibrationSource = String(body.calibration_source || "assumed_demo");
    const objectKey = String(body.object_key || "");
    const trace = body.trace;
    const requestedId = body.inspection_id ? String(body.inspection_id) : "";

    if (!ASSET_ID_RE.test(assetId)) {
      res.status(400).json({ error: "asset_id has an invalid format" });
      return;
    }
    if (!objectKey.startsWith("uploads/") || objectKey.includes("..")) {
      res.status(400).json({ error: "object_key must be a key created by the presign endpoint" });
      return;
    }
    if (!Number.isFinite(depthM) || depthM < 0.1 || depthM > 30) {
      res.status(400).json({ error: "water_depth_m must be between 0.1 and 30" });
      return;
    }
    if (!Number.isFinite(calibration) || calibration < 0.01 || calibration > 5) {
      res.status(400).json({ error: "calibration_mm_per_px must be between 0.01 and 5" });
      return;
    }
    if (!["field_reference", "assumed_demo", "uncalibrated"].includes(calibrationSource)) {
      res.status(400).json({ error: "calibration_source is invalid" });
      return;
    }
    if (!Array.isArray(trace) || trace.length < 2 || trace.length > 64) {
      res.status(400).json({ error: "trace must contain between 2 and 64 normalized points" });
      return;
    }
    const normalizedTrace: Array<[number, number]> = [];
    for (const point of trace) {
      if (!Array.isArray(point) || point.length !== 2) {
        res.status(400).json({ error: "Each trace point must be an [x, y] pair" });
        return;
      }
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        res.status(400).json({ error: "Trace coordinates must be normalized to 0..1" });
        return;
      }
      normalizedTrace.push([x, y]);
    }
    if (requestedId && !INSPECTION_ID_RE.test(requestedId)) {
      res.status(400).json({ error: "inspection_id has an invalid format" });
      return;
    }

    const stored = uploadedImages.get(objectKey);
    if (!stored) {
      res.status(400).json({ error: "Upload the image through the presign endpoint first" });
      return;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sealion-"));
    const tempImage = path.join(tempDir, "upload.jpg");
    try {
      fs.writeFileSync(tempImage, stored.buffer);
      const measurement = await runLocalMeasurement(
        tempImage,
        normalizedTrace,
        calibration,
        depthM,
      );

      const inspectionId =
        requestedId || `insp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = new Date().toISOString();
      const detected = Boolean(measurement.crack_detected);
      const status = detected ? "COMPLETED" : "REVIEW_REQUIRED";
      const annotatedBase64 = String(measurement.annotated_jpeg_base64 || "");
      if (annotatedBase64) {
        annotatedImages.set(objectKey, Buffer.from(annotatedBase64, "base64"));
      }

      const record = {
        id: inspectionId,
        asset_id: assetId,
        inspection_id: inspectionId,
        asset_name: assetName,
        asset_type: assetType,
        water_depth_m: round(depthM, 1),
        raw_image_url: `/api/dev-image/${encodeURIComponent(objectKey)}`,
        annotated_image_url: annotatedBase64
          ? `/api/dev-image/${encodeURIComponent(objectKey)}?variant=annotated`
          : `/api/dev-image/${encodeURIComponent(objectKey)}`,
        crack_detected: detected,
        status,
        measurement_method: "operator_trace_local",
        confidence: Number(measurement.confidence ?? 0),
        crack_median_width_mm: Number(measurement.crack_median_width_mm ?? 0),
        crack_mean_width_mm: Number(measurement.crack_mean_width_mm ?? 0),
        crack_max_width_mm: Number(measurement.crack_max_width_mm ?? 0),
        widthMm: Number(measurement.crack_max_width_mm ?? 0),
        crack_total_length_cm: Number(measurement.crack_total_length_cm ?? 0),
        crack_area_cm2: Number(measurement.crack_area_cm2 ?? 0),
        water_loss_liters_per_day: Number(measurement.water_loss_liters_per_day ?? 0),
        annual_loss_inr: Number(measurement.annual_loss_inr ?? 0),
        structural_risk_index: Number(measurement.structural_risk_index ?? 0),
        risk_tier: String(measurement.risk_tier ?? "LOW"),
        action_recommendation: String(measurement.action_recommendation ?? ""),
        calibration_mm_per_px: calibration,
        calibration_source: calibrationSource,
        limitations: [
          "Local demo: the same OpenCV measurement code ran, but S3 and DynamoDB are simulated in memory.",
          "Operator-guided crack trace; the system does not claim fully automatic crack detection.",
          "Aperture is an intensity-profile estimate at the supplied scale, not a certified crack gauge reading.",
          "Screening risk bands require confirmation by a qualified structural engineer.",
        ],
        source: "local-demo",
        valid_samples: Number(measurement.valid_samples ?? 0),
        total_samples: Number(measurement.total_samples ?? 0),
        created_at: createdAt,
        createdAt,
      };

      demoInspections.unshift(record);
      res.json(record);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Local measurement failed",
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // GET /api/inspections
  app.get("/api/inspections", (req, res) => {
    const assetId = req.query.asset_id as string | undefined;
    const filtered = assetId
      ? demoInspections.filter((inspection) => inspection.asset_id === assetId)
      : demoInspections;
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    res.json({ ok: true, count: sorted.length, inspections: sorted });
  });

  // GET /api/inspections/:id
  app.get("/api/inspections/:id", (req, res) => {
    const found = demoInspections.find(
      (inspection) =>
        inspection.id === req.params.id || inspection.inspection_id === req.params.id,
    );
    if (!found) {
      res.status(404).json({ error: `Inspection ${req.params.id} not found` });
      return;
    }
    res.json(found);
  });

  // POST /api/inspections/compare
  app.post("/api/inspections/compare", (req, res) => {
    const { asset_id, baseline_inspection_id, current_inspection_id } = req.body ?? {};
    const baseline = demoInspections.find(
      (inspection) =>
        inspection.id === baseline_inspection_id ||
        inspection.inspection_id === baseline_inspection_id,
    );
    const current = demoInspections.find(
      (inspection) =>
        inspection.id === current_inspection_id ||
        inspection.inspection_id === current_inspection_id,
    );
    if (!baseline || !current) {
      res.status(404).json({ error: "Both inspections must exist" });
      return;
    }
    if (baseline.asset_id !== current.asset_id) {
      res.status(400).json({ error: "Both inspections must belong to the same asset" });
      return;
    }
    if (asset_id && asset_id !== baseline.asset_id) {
      res.status(400).json({ error: "asset_id does not match the selected inspections" });
      return;
    }

    const baselineTime = new Date(baseline.created_at).getTime();
    const currentTime = new Date(current.created_at).getTime();
    if (!Number.isFinite(baselineTime) || !Number.isFinite(currentTime) || currentTime <= baselineTime) {
      res.status(400).json({ error: "The current inspection must be later than the baseline" });
      return;
    }
    const elapsedDays = (currentTime - baselineTime) / 86400000;

    const deltaWidth = round(current.crack_max_width_mm - baseline.crack_max_width_mm);
    const deltaLength = round(current.crack_total_length_cm - baseline.crack_total_length_cm);
    const areaPct =
      baseline.crack_area_cm2 > 0
        ? round(((current.crack_area_cm2 - baseline.crack_area_cm2) / baseline.crack_area_cm2) * 100, 1)
        : 0;
    const deltaLoss = round(
      current.water_loss_liters_per_day - baseline.water_loss_liters_per_day,
      1,
    );
    const velocity = round(deltaWidth / elapsedDays, 4);

    const urgency =
      deltaWidth >= 0.4 || areaPct >= 25
        ? "CRITICAL"
        : deltaWidth > 0.05 || areaPct > 5
          ? "MODERATE"
          : "LOW";
    const verdict =
      urgency === "CRITICAL"
        ? "PROGRESSING — rapid aperture growth"
        : urgency === "MODERATE"
          ? "PROGRESSING — measurable aperture growth"
          : deltaWidth < 0
            ? "IMPROVING OR STABLE — no growth in P90 aperture"
            : "STABLE — no significant aperture growth";

    res.json({
      ok: true,
      asset_id: baseline.asset_id,
      baseline,
      current,
      delta_width_mm: deltaWidth,
      delta_length_cm: deltaLength,
      area_expansion_pct: areaPct,
      delta_water_loss_liters_per_day: deltaLoss,
      elapsed_days: round(elapsedDays, 1),
      deterioration_velocity_mm_per_day: velocity,
      verdict,
      urgency,
      recommendation:
        urgency === "CRITICAL"
          ? "Escalate for engineer review: the measured aperture or affected area grew quickly between inspections."
          : urgency === "MODERATE"
            ? "Schedule an engineer review and consider grouting; continue closer monitoring."
            : "Continue seasonal monitoring. Confirm both scales and traces before drawing conclusions.",
    });
  });

  // POST /api/telemetry/ingest
  app.post("/api/telemetry/ingest", (req, res) => {
    const body = req.body ?? {};
    latestTelemetry = {
      ok: true,
      unit_id: String(body.unit_id || "sealion-rov-01"),
      timestamp: new Date().toISOString(),
      depth_m: Number(body.depth_m) || 0,
      pressure_kpa: Number(body.pressure_kpa) || 101.325,
      acoustic_leak_index: Number(body.acoustic_leak_index) || 0,
      battery_pct: Number(body.battery_pct) || 0,
      thruster_rpm: Number(body.thruster_rpm) || 0,
      source: "local-demo-simulated",
    };
    res.json(latestTelemetry);
  });

  // GET /api/telemetry/latest
  app.get("/api/telemetry/latest", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(latestTelemetry);
  });

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`S.E.A.-L.I.O.N. local demo listening on http://localhost:${PORT}`);
    console.log("Mode: local-demo (in-memory S3/DynamoDB, real local OpenCV measurement)");
  });
}

startDevServer();
