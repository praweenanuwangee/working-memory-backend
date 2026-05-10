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

- `GET /api/v1/health`
- `GET /api/v1/working-memory/games`
- `GET /api/v1/working-memory/progress?userId=USER_ID`
- `GET /api/v1/working-memory/progress/:gameId?userId=USER_ID`
- `POST /api/v1/working-memory/progress/:gameId/initialize`
- `POST /api/v1/working-memory/progress/:gameId/level-progress`
- `POST /api/v1/working-memory/progress/:gameId/complete-level`
- `POST /api/v1/working-memory/progress/:gameId/result`
- `POST /api/v1/working-memory/progress/:gameId/reset-adaptive`
- `POST /api/v1/working-memory/progress/reset-all-adaptive`
- `POST /api/v1/working-memory/progress/reset`

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