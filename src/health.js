import express from 'express';
import { redis } from './queue.js';

export function createHealthRouter() {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    res.json({
      name: 'code-review-agent',
      status: 'ok',
      docs: '/health',
      avgReviewTimeMinutes: await getAverageReviewTimeMinutes()
    });
  });

  router.get('/health', async (_req, res) => {
    res.json({
      status: 'ok',
      avgReviewTimeMinutes: await getAverageReviewTimeMinutes()
    });
  });

  router.get('/health/cache', async (_req, res) => {
    res.json({
      status: 'ok',
      totalCacheKeys: await getTotalCacheKeys()
    });
  });

  return router;
}

export async function getAverageReviewTimeMinutes() {
  try {
    const keys = await redis.keys('pr-review-time:*');
    if (!keys.length) {
      return null;
    }

    const values = await redis.mget(keys.slice(0, 100));
    const minutes = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= 0);

    if (!minutes.length) {
      return null;
    }

    return Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length);
  } catch {
    return null;
  }
}

async function getTotalCacheKeys() {
  try {
    return Number(await redis.dbsize()) || 0;
  } catch {
    return 0;
  }
}
