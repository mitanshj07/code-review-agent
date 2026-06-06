# Code Review Agent

An autonomous GitHub App webhook service that reviews pull requests, posts inline review comments, and uses a Redis-backed queue for idempotent processing.

## What It Does

- Verifies GitHub webhook signatures.
- Handles `pull_request` events for opened, synchronized, reopened, and ready-for-review PRs.
- Authenticates as a GitHub App installation.
- Reviews changed files with Groq.
- Adds deterministic security and correctness checks for high-confidence findings.
- Posts inline review comments on changed lines, with an issue-comment fallback.
- Uses Upstash Redis for duplicate suppression and queueing when configured.
- Exposes `GET /health` for deployment health checks.

## Local Setup

```bash
npm install
npm start
```

The service listens on `PORT` and exposes:

- `GET /health`
- `POST /webhook`

## GitHub App Permissions

The GitHub App should have:

- Pull requests: Read and write
- Contents: Read-only
- Metadata: Read-only

Subscribe the app to:

- Pull request events

## Environment

Copy `.env.example` to `.env` and fill in the real values. Keep `.env` out of git.

For hosted deployments, set `GITHUB_PRIVATE_KEY` to the PEM value with newlines escaped as `\n`, or mount the key file and set `GITHUB_PRIVATE_KEY_PATH`.

## Deployment

Render settings:

- Runtime: Node
- Build command: `npm install`
- Start command: `node src/index.js`
- Health check path: `/health`

After deployment, update the GitHub App webhook URL to:

```text
https://your-render-service.onrender.com/webhook
```
