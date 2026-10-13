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

## Vercel-only Node and Python deployment

This project uses two native Vercel Functions in one project and one domain:

- `api/index.js` exports the existing Express app for game, progress, adaptive,
  reset and health routes. MongoDB connections are reused. No listener runs here.
- `api/predict_shape.py` handles `POST /api/working-memory/predict-shape` through
  the first rewrite in `vercel.json`. Python loads the existing `ml/best (3).pt`
  with Ultralytics, CPU PyTorch, conf=0.40, imgsz=640 and augment=True.
- The catch-all rewrite sends other requests to Express, preserving route paths.

No ML_API_URL or external ML service is needed. Prediction goes directly to Python,
so no Python executable is assumed inside the Node Function. The Express controller
still supports local CLI inference through `npm start`; a guard prevents subprocess
execution on Vercel if routing is misconfigured. `src/server.js` is local only.
The framework setting is null (Other) so file-based Node and Python Functions are
built rather than letting the Express preset consume all routes.

Both functions allow http://localhost:5173, https://localhost:5173, and configured
CLIENT_URLS (or legacy CLIENT_URL) origins. Python handles OPTIONS itself before
loading ML dependencies. Required headers are Content-Type, Authorization, x-user-id.
Uploads use writable temporary files with cleanup and a 4 MB image limit to stay
under Vercel's 4.5 MB total request-body limit. Oversized platform rejections and
hard function timeouts may happen before application CORS headers are produced.

### Feasibility and limits

The standard Python Function bundle limit is 500 MB uncompressed. The actual
Linux x86_64 Python 3.12 CPU torch 2.13.0 wheel was downloaded and measured:
699,419,445 bytes uncompressed (667 MiB), before other dependencies or the
6,250,858-byte model. This exact pinned stack cannot fit the standard limit.

The complete resolved Linux Python 3.12 dependency set was also downloaded:
1,237,548,422 bytes uncompressed, or 1,243,799,280 bytes including the model.
That is below the 5 GB beta limit before application/bytecode/runtime overhead,
with substantial headroom. Transitive dependencies are resolved at build time;
recheck the actual Vercel bundle instead of treating this wheel audit as a build.
Headless OpenCV and the corresponding Ultralytics package avoid GUI system
libraries; the `from ultralytics import YOLO` API and trained weights are unchanged.

Vercel's Large Functions public beta supports Python bundles up to 5 GB with
Fluid Compute and Active CPU enabled. Existing projects opt in with
VERCEL_SUPPORT_LARGE_FUNCTIONS=1. It is unsupported with Secure Compute or Static
IPs. This is a conditional deployment path; project eligibility and successful
Linux function build/import/inference must be verified before claiming success.
Local Windows package size or inference cannot establish Linux runtime success.

Vercel documents Hobby memory at 2 GB and Pro/Enterprise at up to 4 GB. This
configuration requests 120 seconds for Python and 60 for Node. Python's default
soft timeout is 60 seconds. SIGALRM is used only on a Linux main thread; native
Torch execution can delay it, and worker threads rely on the hard Vercel duration
limit. A hard timeout may return a platform 504 without the normal JSON/CORS.
One inference at a time per Python instance bounds memory; concurrent requests to
that instance receive a retryable 503. Model caching avoids repeated warm loads.
Peak deployed memory and cold-start time have not been measured.

Sources: [Python runtime](https://vercel.com/docs/functions/runtimes/python),
[file-based Python Functions](https://vercel.com/docs/functions/runtimes/python/api-directory),
[function limits and Large Functions](https://vercel.com/docs/functions/limitations).

### Required configuration

Set in the Vercel project's Production and Preview environments:

- `MONGODB_URI`: existing MongoDB connection string.
- `CLIENT_URLS`: comma-separated exact production frontend origins (localhost
  origins are explicitly allowed). CLIENT_URL remains a single-origin fallback.
- `NODE_ENV=production`.
- `VERCEL_SUPPORT_LARGE_FUNCTIONS=1`: required for the measured dependency stack.
- Optional `PREDICTION_TIMEOUT_MS=60000`: positive integer up to 110000 for Python.
- Optional `DNS_SERVERS`: existing MongoDB DNS override, unchanged.

Do not set ML_API_URL or PYTHON_EXECUTABLE in Vercel. Python 3.12 is selected in
.python-version. Root requirements.txt requests CPU wheels to avoid CUDA packages.
The model is explicitly included; Node dependencies and development files are
excluded from Python. Vercel does not use a Dockerfile for this deployment.

### Local verification

```powershell
npm.cmd run check
npm.cmd test
python -m py_compile api/predict_shape.py ml/predict.py
python -m unittest discover -s test -p test_python_function.py
# Include actual model inference (requires installed Python ML dependencies):
$env:RUN_ML_TESTS='1'
python -m unittest discover -s test -p test_python_function.py
# Python HTTP endpoint for manual testing:
python api/predict_shape.py
```

From another terminal:

```powershell
curl.exe -i -X OPTIONS http://127.0.0.1:8000/api/working-memory/predict-shape -H "Origin: https://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,Authorization,x-user-id"
curl.exe -i http://127.0.0.1:8000/api/working-memory/predict-shape -H "Origin: https://localhost:5173" -F "image=@ml/test-circle.jpeg"
```

The Python tests check multipart parsing, CORS, thresholds, cleanup and errors.
RUN_ML_TESTS=1 also invokes the real model. Node tests verify the existing Express
upload and response behavior; they do not validate Vercel rewrites or MongoDB
persistence. `npm start` remains available for local Node + CLI Python operation.
For the full Vercel routing locally use a current CLI and `vercel dev`.

To audit the Linux Python bundle without installing it into a Windows interpreter:

```powershell
python -m pip download --only-binary=:all: --platform manylinux_2_28_x86_64 --platform manylinux2014_x86_64 --platform manylinux_2_17_x86_64 --python-version 312 --implementation cp --abi cp312 --abi abi3 --abi none -r requirements.txt --dest .tmp-wheel-audit
python scripts/measure-python-wheels.py .tmp-wheel-audit
```

This measures wheel contents, not the final Vercel bundle. Include application,
model, generated bytecode and runtime overhead when inspecting build output.

### Vercel deployment and verification

1. Push the changes, including the trained model, requirements.txt, api directory
   and vercel.json, to the repository.
2. Use this repository as the Vercel project root; set Framework Preset to Other
   and Node 22.x. Clear old build/output-directory and Docker/Express overrides.
3. Enable Fluid Compute with Active CPU, confirm Large Functions beta is available
   for the project, and set the environment variables above.
4. Deploy a Preview first. Inspect both Python and Node function build logs.
   Confirm dependency resolution, Python bundle size below 5 GB, model inclusion,
   successful CPU Torch/OpenCV imports, and both functions being generated.
5. Test the Preview URL, accounting for Vercel Deployment Protection if enabled.
   OPTIONS must return 204 with the requesting allowed origin; prediction must
   return 200 with shape/confidence/confidenceLevel; health must show MongoDB connected.
6. Exercise progress, completion, adaptive learning and reset using a test user.
   Check runtime memory, cold-start duration and error logs before promoting.
7. Promote the verified deployment, then repeat checks on the production domain.

```powershell
curl.exe -i -X OPTIONS https://working-memory-backend.vercel.app/api/working-memory/predict-shape -H "Origin: https://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,Authorization,x-user-id"
curl.exe -i https://working-memory-backend.vercel.app/api/working-memory/predict-shape -H "Origin: https://localhost:5173" -F "image=@ml/test-circle.jpeg"
curl.exe -i https://working-memory-backend.vercel.app/api/health
```

Keep the frontend backend domain and endpoint unchanged. Set the actual deployed
frontend origin in CLIENT_URLS. Keep multipart field image and allow the browser
to set its boundary. Use a frontend timeout longer than the server inference budget.
No deployed endpoint or account configuration has been verified by these local tests.

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
