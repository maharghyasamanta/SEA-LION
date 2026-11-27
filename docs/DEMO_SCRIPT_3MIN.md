# S.E.A.-L.I.O.N. — 3-MINUTE LIVE DEMO SCRIPT & JUDGE Q&A DEFENSE
## Techfest IIT Bombay — AWS Campus to Cloud Hackathon

---

## 1. TIMED DEMO SCRIPT (2 MINUTES 45 SECONDS)

### [0:00 – 0:30] — THE BHARAT HOOK: The Invisible Crisis Beneath India's Waters
*(Presenter stands in front of the live S.E.A.-L.I.O.N. interface displaying the "Civic Inspection" tab.)*

> **"Respected Judges, every single day, Indian municipal water boards lose 35% to 45% of our drinking water to underground, submerged reservoir cracks before it reaches citizen taps. In reservoirs like Kolkata's Tallah or sumps in Delhi and Bangalore, millions of liters bleed out silently.**
>
> **At the same time, over 35,000 railway bridge piers face severe monsoon scouring. Yet India has fewer than 250 certified commercial divers to inspect them, and foreign ROVs cost upwards of ₹40 Lakhs.**
>
> **Meet S.E.A.-L.I.O.N.: Submerged Engineering & Aquatic Leak-Inspection Network. We make underwater structural inspection 100% hardware-agnostic, running completely on AWS Free Tier serverless cloud."**

---

### [0:30 – 1:30] — LIVE S3 UPLOAD & REAL CV/HYDRAULIC ANALYSIS
*(Presenter clicks on the "Judge Evaluation Tour: Step 1" pill and selects "Tallah Municipal Water Reservoir — Wall B".)*

> **"Notice this isn't a browser simulation or a mock state generator. Let's trigger a real 1-Click AWS Audit on an authentic underwater crack photo from Kolkata's Tallah reservoir.**
>
> *(Clicks 'Run 1-Click AWS Audit'.)*
>
> **Watch the live pipeline:**
> 1. Our frontend requests an S3 presigned PUT URL from our AWS Lambda function.
> 2. The raw image is streamed directly into our private S3 bucket.
> 3. AWS Lambda fires Python 3.12 with OpenCV: applying CLAHE contrast enhancement, Otsu binarization, and distance-transform skeletonization.
> 4. We apply Torricelli's orifice equation—$Q = C_d \cdot A \cdot \sqrt{2gh}$—at a 4.8-meter water head.
> 5. The annotated visual proof is uploaded back to S3, and the record is stored in Amazon DynamoDB.
>
> **Look at the result: A 1.45 mm crack detected. But we don't just give pixel widths—we translate it to civic reality: 18,450 Liters of treated potable water lost every single day, costing ₹3.36 Lakhs annually, triggering a CRITICAL Pre-Monsoon Risk Index of 82/100 requiring immediate cofferdam grouting."**

---

### [1:30 – 2:15] — DYNAMODB TEMPORAL COMPARISON & LIVE TELEMETRY
*(Presenter clicks 'Step 2: DynamoDB Audit Log' then 'Step 3: Temporal Crack Delta'.)*

> **"All records are permanently logged in Amazon DynamoDB. Now, how do we track structural deterioration over time?**
>
> **Under our 'Temporal Compare' engine, we compare our Pre-Monsoon baseline from October against our Current inspection.**
>
> *(Drags the interactive before/after slider across the screen.)*
>
> **The judge can drag the visual comparison slider to see the crack dilation. Our Lambda comparison engine computes an exact delta: crack aperture expanded by +0.60 mm (+83.3% area expansion), accelerating water loss by +7,500 L/day at a velocity of 0.0194 mm/day—automatically generating an automated escalation verdict to the PWD Chief Engineer.**
>
> *(Switches to 'Step 4: Live Sensor Ingestion'.)*
>
> **For advanced deployments equipped with ROVs, we ingest live depth, hydrostatic pressure, and piezo-acoustic leak hiss packets into DynamoDB at sub-second latency, synchronizing with our 3D hardware digital twin."**

---

### [2:15 – 2:45] — AWS SERVERLESS ARCHITECTURE & MEASURABLE IMPACT
*(Presenter highlights the live header badge showing 'AWS Live (ap-south-1) · 84ms'.)*

> **"Everything you have seen runs 100% on AWS Free Tier serverless architecture:**
> - Private S3 with 30-day lifecycle auto-expiry.
> - CloudFront edge delivery with Origin Access Control.
> - Amazon API Gateway HTTP API v2 with rate throttling.
> - 7 Python 3.12 Lambdas scaling to absolute zero.
> - DynamoDB On-Demand tables with auto-expiring 24-hour telemetry TTL.
>
> **Zero NAT Gateways. Zero EC2. Zero RDS. Zero hourly charges. A solution that can be deployed across all 28 Indian States tomorrow at ₹0.00 cloud overhead.**
>
> **Thank you, and we are ready for your questions!"**

---

## 2. 10 TOUGH JUDGE Q&A PROMPTS & ACCURATE TECHNICAL DEFENSES

#### Q1: "How do you calibrate pixel-to-millimeter scale without an expensive laser system?"
> **Answer:** "In our hardware-agnostic mode, divers or technicians place a standard 50 mm magnetic or adhesive PWD reference sticker on the concrete face, or use two parallel 50 mm waterproof laser pens mounted to any GoPro cage ($mm/px = 50 / \text{distance\_px}$). This ensures exact sub-millimeter calibration regardless of camera focal length or lens distortion."

#### Q2: "Why did you choose Torricelli's orifice equation ($Q = C_d \cdot A \cdot \sqrt{2gh}$) and what is $C_d$?"
> **Answer:** "Torricelli's law derives from Bernoulli's principle for submerged orifice discharge under hydrostatic pressure head $h$. We use a discharge coefficient $C_d = 0.62$, which is the standard civil engineering empirical value for sharp-edged orifices and jagged concrete fractures. Effective seepage area is calibrated by crack surface area and hydraulic aperture factor."

#### Q3: "How do you guarantee this stack costs ₹0.00 on AWS Free Tier?"
> **Answer:** "We eliminated every service with an hourly baseline cost: no NAT Gateways ($0.045/hr), no VPC endpoints, no EC2, and no provisioned RDS. We use DynamoDB `PAY_PER_REQUEST` (25 GB free forever), Lambda (1M free requests/month), S3 with 30-day object lifecycle expiration, and CloudFront with 1 TB monthly free egress. The entire system scales to absolute zero when not inspecting."

#### Q4: "How does your system handle murky, highly turbid Indian river water?"
> **Answer:** "Standard RGB computer vision fails in turbid water due to green/brown Rayleigh scattering. Our Lambda pipeline applies Contrast Limited Adaptive Histogram Equalization (CLAHE) with a clip limit of 3.0 over an 8x8 tile grid, followed by Gaussian noise filtering and adaptive Otsu binarization. This normalizes local luminance differences before morphological edge detection."

#### Q5: "Why did you use DynamoDB rather than a relational database like PostgreSQL?"
> **Answer:** "Relational databases like Aurora or RDS require continuous provisioned instances or NAT gateways that incur fixed hourly costs even when idle. DynamoDB On-Demand scales instantly to zero cost when idle and easily handles structured JSON inspection records and high-frequency time-series sensor packets, with native Time-To-Live (TTL) automatically purging sensor telemetry after 24 hours."

#### Q6: "What prevents malicious users from spamming the S3 presigned upload endpoint?"
> **Answer:** "Our `PresignUploadFunction` validates file extension, MIME content-type (strictly `image/jpeg`, `image/png`, `image/webp`), and file size ($\le 10\,\text{MB}$) before signing. The presigned URL is restricted to the specific `uploads/{asset_id}/*` S3 key path and expires in exactly 300 seconds (5 minutes). Furthermore, API Gateway enforces 25 req/s rate throttling."

#### Q7: "How is the Pre-Monsoon Structural Risk Index computed?"
> **Answer:** "It is a weighted multi-factor composite index:
> $$\text{Risk} = 0.40 \times \text{Width Severity} + 0.30 \times \text{Water Loss Velocity} + 0.15 \times \text{Spalling Area} + 0.15 \times \text{Head Pressure}$$
> It maps to concrete Indian CPWD action tiers: $\le 35$ for Routine Annual Log, $36\text{--}70$ for Grouting Within 30 Days, and $> 70$ for Critical Emergency Cofferdam Shoring."

#### Q8: "Why not run all the computer vision in the browser using WebAssembly?"
> **Answer:** "Field engineers in rural India frequently inspect structures using low-spec ₹8,000 Android phones or rugged field tablets with limited RAM. Offloading CV processing to AWS Lambda guarantees sub-second execution on dedicated 512MB compute, generates an immutable audit record in DynamoDB, and preserves battery life on the field device."

#### Q9: "Can this system integrate with existing government GIS portals or SCADA systems?"
> **Answer:** "Yes. Every inspection record in DynamoDB carries standard ISO timestamps, asset geographic IDs, and REST endpoints. Any State Water Authority GIS dashboard (like Jal Jeevan Mission MIS or NDSA portals) can query `GET /api/inspections?asset_id=XYZ` via standard JSON webhooks."

#### Q10: "What is your roadmap to transition this Stage 2 build into live field deployment?"
> **Answer:** "Stage 2 has proven the live AWS cloud pipeline. Our immediate next step is partnering with local municipal corporations (like KMC or KDMC) for pilot deployments during the pre-monsoon inspection window (March–May), calibrating optical refraction indices with underwater diver validation."
