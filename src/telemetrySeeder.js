import { redis } from './queue.js';

const TTL_SECONDS = 60 * 60 * 24 * 14;

export async function seedDemoTelemetry(logger = console) {
  const now = Date.now();
  const leaderboard = [
    { rank: 1, githubLogin: 'sana-dev', displayName: 'Sana Patel', score: 98, cleanPrRate: 96, prsReviewed: 42, bugsFlagged: 3, criticalBlocked: 0, hoursSaved: 58 },
    { rank: 2, githubLogin: 'mitanshj07', displayName: 'Mitansh Jain', score: 94, cleanPrRate: 91, prsReviewed: 39, bugsFlagged: 5, criticalBlocked: 1, hoursSaved: 52 },
    { rank: 3, githubLogin: 'nora-platform', displayName: 'Nora Chen', score: 87, cleanPrRate: 84, prsReviewed: 31, bugsFlagged: 7, criticalBlocked: 2, hoursSaved: 44 },
    { rank: 4, githubLogin: 'alex-api', displayName: 'Alex Rivera', score: 81, cleanPrRate: 79, prsReviewed: 28, bugsFlagged: 9, criticalBlocked: 2, hoursSaved: 38 },
    { rank: 5, githubLogin: 'priya-sec', displayName: 'Priya Shah', score: 76, cleanPrRate: 74, prsReviewed: 24, bugsFlagged: 12, criticalBlocked: 4, hoursSaved: 35 }
  ];

  const prLogs = Array.from({ length: 15 }, (_, index) => ({
    id: `demo-pr-${String(index + 1).padStart(2, '0')}`,
    repositoryName: index % 2 ? 'payment-gateway' : 'code-review-agent',
    pullRequestNumber: 500 + index,
    author: leaderboard[index % leaderboard.length].githubLogin,
    bugsCaught: (index * 3) % 9,
    securityFlawsBlocked: index % 4 === 0 ? 1 : 0,
    status: index % 5 === 0 ? 'blocked' : index % 3 === 0 ? 'needs_review' : 'passed',
    timestamp: new Date(now - index * 6 * 60 * 60 * 1000).toISOString(),
    complexityScore: Math.min(100, 24 + index * 5)
  }));

  const commands = [
    ['SETEX', 'demo:leaderboard', TTL_SECONDS, JSON.stringify(leaderboard)],
    ['SETEX', 'demo:pr-logs', TTL_SECONDS, JSON.stringify(prLogs)],
    ['SETEX', 'demo:seeded-at', TTL_SECONDS, new Date(now).toISOString()]
  ];

  const result = await redis.pipeline(commands);
  logger.info({ commands: commands.length }, 'Seeded demo telemetry data.');
  return {
    status: 'ok',
    leaderboardRows: leaderboard.length,
    prLogRows: prLogs.length,
    redisResponses: Array.isArray(result) ? result.length : 0
  };
}
