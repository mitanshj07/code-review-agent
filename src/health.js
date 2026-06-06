import express from 'express';

export function createHealthRouter() {
  const router = express.Router();

  router.get('/', (_req, res) => {
    res.json({
      name: 'code-review-agent',
      status: 'ok',
      docs: '/health'
    });
  });

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return router;
}
