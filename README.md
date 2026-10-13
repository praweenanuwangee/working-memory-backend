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

## Vercel deployment

The root `app.js` is the Vercel Express entrypoint and exports an Express application.
`src/server.js` remains the local listener used by `npm start`.
`vercel.json` selects the Express framework; native Express routing preserves all
paths without rewrites. Python, model weights, and local uploads are excluded
from the Node function. No Python executable is needed by Node.

Configure these variables in Vercel for Production (and Preview when needed):

- `MONGODB_URI`: existing MongoDB connection string; required for persisted game data.
- `ML_API_URL`: reachable FastAPI **base URL**, e.g. `https://ml.example.com`.
  Node appends `/predict-shape`; do not include that endpoint in the value.
- `CLIENT_URLS`: comma-separated exact production frontend origins.
  Overrides the legacy `CLIENT_URL` single-origin setting.
- `NODE_ENV=production`.
- Optional `PREDICTION_TIMEOUT_MS`: positive integer up to 45000; default 30000.
- Optional `DNS_SERVERS`: existing comma-separated DNS override; defaults remain unchanged.

Both `http://localhost:5173` and `https://localhost:5173` are allowed explicitly.
Unlisted browser origins receive 403. OPTIONS is handled before database access.
Temporary uploads use `os.tmpdir()` and are removed after prediction, including
ML errors. JPEG, PNG and WEBP uploads are limited to 4 MB to leave space below
Vercel's 4.5 MB total request-body limit. Larger requests may be rejected by
Vercel before Express runs.

Use this repository as the Vercel project root, Node 22.x, and the Express
framework preset. Clear any old frontend build/output directory overrides.
Redeploy the changed commit after setting environment variables, or use
`vercel --prod` with a current Vercel CLI (47.0.5 or later).

## Verification

On Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm`:

```powershell
npm.cmd run check
npm.cmd test
npm.cmd start
```

The automated integration test uses a local mocked ML API and the Vercel export.
It checks CORS, game listing, multipart forwarding, prediction responses, upload
validation, upstream errors, timeouts, and temporary-file cleanup. It does not
verify real MongoDB persistence, YOLO inference, or a deployed Vercel build.

With the local server running and `.env` configured, run:

```powershell
curl.exe -i -X OPTIONS "http://localhost:4000/api/working-memory/predict-shape" -H "Origin: https://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,Authorization,x-user-id"
curl.exe -i "http://localhost:4000/api/working-memory/predict-shape" -H "Origin: https://localhost:5173" -F "image=@ml/test-circle.jpeg"
```

After deployment, repeat against production:

```powershell
curl.exe -i -X OPTIONS "https://working-memory-backend.vercel.app/api/working-memory/predict-shape" -H "Origin: https://localhost:5173" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: Content-Type,Authorization,x-user-id"
curl.exe -i "https://working-memory-backend.vercel.app/api/working-memory/predict-shape" -H "Origin: https://localhost:5173" -F "image=@ml/test-circle.jpeg"
curl.exe -i "https://working-memory-backend.vercel.app/api/health"
```

Expect OPTIONS 204 with the matching `Access-Control-Allow-Origin` and required
headers; prediction 200 with `{ success: true, data: { shape, confidence,
confidenceLevel } }`; and health 200 with a connected database. Also verify the
configured production frontend origin and exercise progress/level/adaptive/reset
flows using a test user. Inspect Vercel runtime logs for initialization failures
if responses lack CORS headers. A platform-level failure may happen before the
application's CORS middleware executes.

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
