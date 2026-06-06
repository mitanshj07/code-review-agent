import 'dotenv/config';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createHealthRouter } from './health.js';
import { configureQueue, closeQueue, enqueueReview } from './queue.js';
import { createWebhookHandler } from './webhook.js';
import { reviewPullRequest } from './reviewer.js';
import { postReviewResult } from './commenter.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const config = loadConfig();

configureQueue({
  redisUrl: config.upstashRedisRestUrl,
  redisToken: config.upstashRedisRestToken,
  logger,
  worker: async (job) => {
    logger.info({ job }, 'Starting pull request review.');
    const result = await reviewPullRequest(job, config, logger);
    const postResult = await postReviewResult(job, result, config, logger);
    logger.info({ job, result, postResult }, 'Finished pull request review.');
  }
});

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(pinoHttp({ logger }));
app.use(createHealthRouter());
app.post(
  '/webhook',
  express.raw({ type: '*/*', limit: '4mb' }),
  createWebhookHandler({ config, logger, enqueueReview })
);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'Code Review Agent listening.');
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
    commentOnClean: String(process.env.COMMENT_ON_CLEAN || 'false').toLowerCase() === 'true'
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
