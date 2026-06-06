import 'dotenv/config';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createHealthRouter } from './health.js';
import { configureQueue, closeQueue, enqueueReview, enqueueConversationalReply } from './queue.js';
import { createWebhookHandler } from './webhook.js';
import { createInstallationClient, fetchPullRequestFiles, reviewPullRequest } from './reviewer.js';
import { postIssueComment, postReviewResult, postSecretAlertComment } from './commenter.js';
import { createDashboardRouter } from './dashboardRouter.js';
import { handleConversationalReply } from './chatWorker.js';
import { sendSecretExposureAlert, sendSecurityAlertsForReview } from './securityAlerts.js';
import { buildDiffFromFiles, extractChangedFilePaths } from './diffUtils.js';
import { scanForSecrets } from './secretScanner.js';
import { analyzePRSize, buildPRSizeCard, buildTooLargePRComment } from './prSizeGuard.js';
import { lintPullRequestCommits, buildCommitLintSection } from './commitLinter.js';
import { labelPR } from './autoLabeler.js';
import { assignReviewers } from './autoAssign.js';
import { startStalePRReminder } from './stalePRReminder.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const config = loadConfig();

configureQueue({
  redisUrl: config.upstashRedisRestUrl,
  redisToken: config.upstashRedisRestToken,
  logger,
  concurrency: 1,
  handlers: {
    pull_request_review: async (job) => {
      logger.info({ job }, 'Starting pull request review.');
      const octokit = await createInstallationClient(config, job.installationId);
      const files = await fetchPullRequestFiles(job, config);
      const diff = buildDiffFromFiles(files);
      const sizeData = analyzePRSize(diff);
      const changedFiles = extractChangedFilePaths(diff);

      if (sizeData.shouldBlock) {
        await postIssueComment(octokit, job, buildTooLargePRComment(sizeData));
        logger.warn({ job, sizeData }, 'Skipped oversized PR to preserve API rate limits.');
        return;
      }

      await postIssueComment(octokit, job, buildPRSizeCard(sizeData));

      const secretFindings = scanForSecrets(diff);
      if (secretFindings.length && !job.immediateSecretFindings?.length) {
        await postSecretAlertComment(octokit, job, secretFindings);
        await sendSecretExposureAlert(job, secretFindings, config, logger);
      }

      const result = await reviewPullRequest({ ...job, files, diff }, config, logger);
      const secretReviewFindings = secretFindings.map((finding) => ({
        ...finding,
        severity: 'error'
      }));
      if (secretReviewFindings.length) {
        result.findings = [...secretReviewFindings, ...result.findings].slice(0, config.maxComments);
        result.requestChanges = true;
        result.summary = `CodeScope found ${secretReviewFindings.length} exposed secret(s) and ${Math.max(0, result.findings.length - secretReviewFindings.length)} additional issue(s).`;
      }

      const commitIssues = await lintPullRequestCommits(octokit, job.owner, job.repo, job.prNumber, logger);
      const commitLintSection = buildCommitLintSection(commitIssues);
      result.extraReviewSections = commitLintSection ? [commitLintSection] : [];

      const labelResult = await labelPR(octokit, job.owner, job.repo, job.prNumber, diff, result.findings, sizeData, {
        groqApiKey: config.groqApiKey,
        title: job.prTitle,
        logger
      });
      const alertResult = await sendSecurityAlertsForReview(job, result, config, logger);
      const postResult = await postReviewResult(job, result, config, logger);
      const assignResult = await assignReviewers(octokit, job.owner, job.repo, job.prNumber, job.sender, changedFiles, logger);
      logger.info({ job, result, labelResult, alertResult, postResult, assignResult }, 'Finished pull request review.');
    },
    conversational_reply: async (job) => {
      logger.info({ job }, 'Starting conversational PR reply.');
      const postResult = await handleConversationalReply(job, config, logger);
      logger.info({ job, postResult }, 'Finished conversational PR reply.');
    }
  }
});

startStalePRReminder(config, logger);

const app = express();
app.disable('x-powered-by');
app.use(createCorsMiddleware(config));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(pinoHttp({ logger }));
app.use(createHealthRouter());
app.use(createDashboardRouter({ logger }));
app.post(
  '/webhook',
  express.raw({ type: '*/*', limit: '4mb' }),
  createWebhookHandler({ config, logger, enqueueReview, enqueueConversationalReply })
);

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info({ host: '0.0.0.0', port: config.port }, 'Code Review Agent listening.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info({ signal }, 'Shutting down.');
    server.close(async () => {
      await closeQueue();
      process.exit(0);
    });
  });
}

export { app, server };

function loadConfig() {
  return {
    port: Number(process.env.PORT || 3000),
    githubAppId: required('GITHUB_APP_ID'),
    githubPrivateKey: loadPrivateKey(),
    githubWebhookSecret: required('GITHUB_WEBHOOK_SECRET'),
    githubOwner: process.env.GITHUB_OWNER || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    upstashRedisRestUrl: process.env.UPSTASH_REDIS_REST_URL || '',
    upstashRedisRestToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    maxFiles: Number(process.env.MAX_FILES || 20),
    maxComments: Number(process.env.MAX_COMMENTS || 12),
    commentOnClean: String(process.env.COMMENT_ON_CLEAN || 'false').toLowerCase() === 'true',
    securityAlertWebhookUrl: process.env.SECURITY_ALERT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || '',
    securityAlertProvider: process.env.SECURITY_ALERT_PROVIDER || '',
    securityAlertMinSeverity: (process.env.SECURITY_ALERT_MIN_SEVERITY || 'high').toLowerCase(),
    dashboardCorsOrigins: parseCsv(process.env.DASHBOARD_CORS_ORIGINS || 'http://localhost:3000')
  };
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadPrivateKey() {
  if (process.env.GITHUB_PRIVATE_KEY) {
    return process.env.GITHUB_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  const keyPath = process.env.GITHUB_PRIVATE_KEY_PATH;
  if (!keyPath) {
    throw new Error('Set GITHUB_PRIVATE_KEY or GITHUB_PRIVATE_KEY_PATH.');
  }

  return fs.readFileSync(keyPath, 'utf8');
}

function createCorsMiddleware(config) {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.dashboardCorsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  };
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}
