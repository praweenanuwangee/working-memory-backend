# Working Memory Backend

Backend service for the Smart Learn working-memory module.

## What This API Handles

- Per-user working-memory progress
- Level completion and unlock tracking
- Adaptive difficulty profile persistence
- Reset actions for one game or all working-memory games
- MongoDB storage with Mongoose

## Tech Stack

- Node.js
- Express
- MongoDB Atlas
- Mongoose

## Setup

1. Copy `.env.example` to `.env`
2. Replace `<db_password>` in `MONGODB_URI`
3. Install dependencies
4. Start the server

## Scripts

- `npm run dev`
- `npm start`

## Main Endpoints

- `GET /api/health`
- `GET /api/working-memory/games`
- `GET /api/working-memory/overview`
- `GET /api/working-memory/progress?userId=USER_ID`
- `GET /api/working-memory/progress/:gameId?userId=USER_ID`
- `POST /api/working-memory/progress/:gameId/initialize`
- `POST /api/working-memory/progress/:gameId/level-progress`
- `POST /api/working-memory/progress/:gameId/complete-level`
- `POST /api/working-memory/progress/:gameId/result`
- `POST /api/working-memory/progress/:gameId/reset-adaptive`
- `POST /api/working-memory/progress/reset-all-adaptive`
- `POST /api/working-memory/progress/reset`
- `POST /api/working-memory/predict-shape` (multipart field `image`)

## Vercel Services deployment

`vercel.json` defines two services in one project:

- `app`: root `.`, Express, entrypoint `app.js`. Public through the catch-all
  rewrite `/(.*)`. Existing `/api/health` and `/api/working-memory/*` paths remain.
- `ml`: root `ml`, Python/Flask, entrypoint `app:app`. Internal only: no public
  rewrite targets it. Its `/predict-shape` route accepts multipart field `image`
  and returns predictions to Express.
- The calling `app` service declares an `app -> ml` binding, injecting
  `ML_SERVICE_URL`. Do not set this variable manually. Vercel resolves it in
  runtime functions, not during builds or routing middleware.

Express receives the public prediction request, saves its upload under
`os.tmpdir()`, and forwards it to the bound internal service. Python uses temporary
storage and the existing `best (3).pt` checkpoint. Both temporary files are removed
on completion or errors. The frontend receives the same
`{ success: true, data: { shape, confidence, confidenceLevel } }` response.
The confidence thresholds, shape filtering, conf=0.40, imgsz=640 and augmentation
remain unchanged. One inference at a time per ML instance bounds memory.

Public CORS and OPTIONS are handled in Express before routes and database access.
Both localhost origins and configured CLIENT_URLS are allowed. The ML service does
not need browser CORS because it is internal. Existing MongoDB services and routes
are preserved. `npm start` remains a Node-only local mode with CLI Python fallback;
on Vercel a missing binding returns 503 instead of spawning Python inside Node.
The old `api/` file-based entrypoints are not used in this Services configuration.

### Dependencies and limits

The ML service installs its own flat `ml/requirements.txt`, including Flask.
Linux selects verified CPU torch 2.13.0 and torchvision 0.28.0 wheel URLs for
CPython 3.12. Non-Linux markers select normal version pins for local development.
`ml/.python-version` selects 3.12. There are no nested requirements includes or pip
index directives. Root requirements.txt is retained from the prior configuration;
it is not the ML service dependency file.

Previously audited Linux YOLO dependencies plus model total approximately 1.24 GB
uncompressed; Flask adds a small framework dependency set not included in that
measurement. This exceeds the standard 500 MB Python Function limit and needs
Large Functions beta with Fluid Compute and Active CPU, plus
VERCEL_SUPPORT_LARGE_FUNCTIONS=1. Verify project eligibility and the actual final
bundle below 5 GB. Secure Compute/Static IP configurations do not support that beta.
Hosted imports, memory consumption, cold starts and production inference remain
unverified. Both service function durations are 120 seconds. Express aborts waiting
for ML after PREDICTION_TIMEOUT_MS (default 60000, maximum 110000); Python may
continue an already running native inference until it completes or the platform
terminates it. The platform's hard timeout can produce a non-JSON response.

### Build rejected at the 500 MB limit

The reported Vercel build measured the ML bundle at **1189.34 MB** and enforced
the standard **500 MB** limit. Dependency parsing and the Express build succeeded;
the remaining failure is Python packaging capacity. The ignored `api/` warning is
expected because these Services use `app.js` and `ml/app.py` as entrypoints.

`VERCEL_SUPPORT_LARGE_FUNCTIONS=1` in `.env.example` does not enable the feature:
that file is documentation and is excluded from deployment. Add the variable in
the actual Vercel project's Environment Variables, selecting Production and
Preview as needed. Confirm Fluid Compute with Active CPU is enabled and that the
project does not use Secure Compute or Static IPs. Create a fresh deployment
after changing settings; environment changes do not alter an existing deployment.

If a fresh build still enforces 500 MB, Large Functions has not taken effect for
that build. Confirm the variable's value/scope and project eligibility with
Vercel. Increasing memory or maxDuration does not raise the bundle-size limit.
Splitting routes cannot make this dependency stack fit: its CPU Torch wheel alone
was measured at 699,419,445 bytes unpacked. Do not exclude required Torch libraries
or the trained model simply to bypass packaging validation. The existing native
Python workload requires a supported larger bundle allowance before deployment
can proceed; no hosted inference success is established by these logs.

### Environment and deployment

Set MONGODB_URI, CLIENT_URLS (or legacy CLIENT_URL), NODE_ENV=production,
VERCEL_SUPPORT_LARGE_FUNCTIONS=1, and optionally PREDICTION_TIMEOUT_MS=60000 and
the existing DNS_SERVERS. Leave ML_SERVICE_URL unset: the binding injects it.
No external ML_API_URL is used. PYTHON_EXECUTABLE is only for Node-only local runs.

Push the service configuration, `ml/app.py`, flat ML requirements and model.
Use the repository as the Vercel project root, clear old build/output overrides,
and confirm Services and Large Functions support. Deploy a Preview first and
inspect both service builds, the Python bundle size, model loading, public CORS,
real prediction, MongoDB health and test-user progress/adaptive/reset flows before
promoting. Service settings, including functions and framework, live inside each
service object; only public routing remains at the top level.

### Local tests

With a current Vercel CLI and Python 3.12 available, run both services together:

```powershell
vercel dev
# Or without authenticating with Vercel Cloud:
vercel dev -L
```

Vercel injects the binding automatically in either mode. Do not manually set it.
Request the public dev server (default port 3000):

```powershell
curl.exe -i -X OPTIONS http://localhost:3000/api/working-memory/predict-shape -H "Origin: https://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,Authorization,x-user-id"
curl.exe -i http://localhost:3000/api/working-memory/predict-shape -H "Origin: https://localhost:5173" -F "image=@ml/test-circle.jpeg"
```

Independent checks with Python dependencies installed:

```powershell
npm.cmd run check
npm.cmd test
python -m py_compile ml/app.py ml/predict.py
$env:RUN_ML_TESTS='1'
python -m unittest discover -s test -p test_ml_service.py
```

Node tests simulate an injected binding to validate multipart forwarding, safe
upstream errors/timeouts, CORS and cleanup. Python tests validate the actual Flask
service and optionally run the trained model. Those checks do not verify Vercel's
binding generation or deployed builds. Keep the frontend URL and paths unchanged.

References: [Services](https://vercel.com/docs/services),
[bindings](https://vercel.com/docs/services/bindings),
[configuration](https://vercel.com/docs/services/config-reference),
[function limits](https://vercel.com/docs/functions/limitations).

## Example Body

```json
{
	"userId": "student-001",
	"level": 1,
	"percent": 75,
	"stats": {
		"accuracy": 75,
		"mistakes": 2,
		"total": 8
	},
	"metrics": {
		"accuracy": 75,
		"mistakes": 2,
		"total": 8,
		"averageResponseMs": 2800,
		"targetResponseMs": 3000
	}
}
```
