import crypto from 'node:crypto';
import express from 'express';

const DEFAULT_REPOSITORIES = ['code-review-agent', 'payment-gateway'];
const STATE_COOKIE = 'codescope_oauth_state';
const SESSION_COOKIE = 'codescope_session';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const mockMetrics = {
  all: {
    totalBugsCaught: 284,
    securityFlawsBlocked: 47,
    developerHoursSaved: 392,
    trends: [
      { date: '2026-05-01', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 5 },
      { date: '2026-05-08', sqlInjection: 4, hardcodedSecrets: 2, missingAwait: 8 },
      { date: '2026-05-15', sqlInjection: 3, hardcodedSecrets: 4, missingAwait: 6 },
      { date: '2026-05-22', sqlInjection: 5, hardcodedSecrets: 3, missingAwait: 9 },
      { date: '2026-05-29', sqlInjection: 6, hardcodedSecrets: 2, missingAwait: 7 },
      { date: '2026-06-05', sqlInjection: 4, hardcodedSecrets: 5, missingAwait: 10 }
    ]
  },
  'code-review-agent': {
    totalBugsCaught: 132,
    securityFlawsBlocked: 21,
    developerHoursSaved: 186,
    trends: [
      { date: '2026-05-01', sqlInjection: 1, hardcodedSecrets: 1, missingAwait: 3 },
      { date: '2026-05-08', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 4 },
      { date: '2026-05-15', sqlInjection: 1, hardcodedSecrets: 2, missingAwait: 3 },
      { date: '2026-05-22', sqlInjection: 3, hardcodedSecrets: 1, missingAwait: 5 },
      { date: '2026-05-29', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 4 },
      { date: '2026-06-05', sqlInjection: 2, hardcodedSecrets: 2, missingAwait: 6 }
    ]
  },
  'payment-gateway': {
    totalBugsCaught: 152,
    securityFlawsBlocked: 26,
    developerHoursSaved: 206,
    trends: [
      { date: '2026-05-01', sqlInjection: 1, hardcodedSecrets: 0, missingAwait: 2 },
      { date: '2026-05-08', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 4 },
      { date: '2026-05-15', sqlInjection: 2, hardcodedSecrets: 2, missingAwait: 3 },
      { date: '2026-05-22', sqlInjection: 2, hardcodedSecrets: 2, missingAwait: 4 },
      { date: '2026-05-29', sqlInjection: 4, hardcodedSecrets: 1, missingAwait: 3 },
      { date: '2026-06-05', sqlInjection: 2, hardcodedSecrets: 3, missingAwait: 4 }
    ]
  }
};

const mockScans = [
  {
    id: 'scan_001',
    repositoryName: 'code-review-agent',
    pullRequestNumber: 42,
    bugsCaught: 7,
    status: 'blocked',
    timestamp: '2026-06-06T18:58:12.000Z'
  },
  {
    id: 'scan_002',
    repositoryName: 'payment-gateway',
    pullRequestNumber: 319,
    bugsCaught: 4,
    status: 'needs_review',
    timestamp: '2026-06-06T17:44:03.000Z'
  },
  {
    id: 'scan_003',
    repositoryName: 'code-review-agent',
    pullRequestNumber: 41,
    bugsCaught: 0,
    status: 'passed',
    timestamp: '2026-06-06T15:21:49.000Z'
  },
  {
    id: 'scan_004',
    repositoryName: 'payment-gateway',
    pullRequestNumber: 318,
    bugsCaught: 11,
    status: 'blocked',
    timestamp: '2026-06-06T12:08:17.000Z'
  }
];

const mockLeaderboard = {
  all: [
    {
      rank: 1,
      githubLogin: 'sana-dev',
      displayName: 'Sana Patel',
      primaryRepository: 'payment-gateway',
      prsReviewed: 34,
      bugsFlagged: 3,
      criticalBlocked: 0,
      cleanPrRate: 94,
      hoursSaved: 48,
      score: 98
    },
    {
      rank: 2,
      githubLogin: 'mitanshj07',
      displayName: 'Mitansh Jain',
      primaryRepository: 'code-review-agent',
      prsReviewed: 29,
      bugsFlagged: 5,
      criticalBlocked: 1,
      cleanPrRate: 88,
      hoursSaved: 41,
      score: 91
    },
    {
      rank: 3,
      githubLogin: 'alex-api',
      displayName: 'Alex Rivera',
      primaryRepository: 'payment-gateway',
      prsReviewed: 26,
      bugsFlagged: 8,
      criticalBlocked: 2,
      cleanPrRate: 79,
      hoursSaved: 35,
      score: 82
    },
    {
      rank: 4,
      githubLogin: 'nora-platform',
      displayName: 'Nora Chen',
      primaryRepository: 'code-review-agent',
      prsReviewed: 21,
      bugsFlagged: 10,
      criticalBlocked: 3,
      cleanPrRate: 71,
      hoursSaved: 28,
      score: 74
    }
  ],
  'code-review-agent': [
    {
      rank: 1,
      githubLogin: 'mitanshj07',
      displayName: 'Mitansh Jain',
      primaryRepository: 'code-review-agent',
      prsReviewed: 29,
      bugsFlagged: 5,
      criticalBlocked: 1,
      cleanPrRate: 88,
      hoursSaved: 41,
      score: 91
    },
    {
      rank: 2,
      githubLogin: 'nora-platform',
      displayName: 'Nora Chen',
      primaryRepository: 'code-review-agent',
      prsReviewed: 21,
      bugsFlagged: 10,
      criticalBlocked: 3,
      cleanPrRate: 71,
      hoursSaved: 28,
      score: 74
    }
  ],
  'payment-gateway': [
    {
      rank: 1,
      githubLogin: 'sana-dev',
      displayName: 'Sana Patel',
      primaryRepository: 'payment-gateway',
      prsReviewed: 34,
      bugsFlagged: 3,
      criticalBlocked: 0,
      cleanPrRate: 94,
      hoursSaved: 48,
      score: 98
    },
    {
      rank: 2,
      githubLogin: 'alex-api',
      displayName: 'Alex Rivera',
      primaryRepository: 'payment-gateway',
      prsReviewed: 26,
      bugsFlagged: 8,
      criticalBlocked: 2,
      cleanPrRate: 79,
      hoursSaved: 35,
      score: 82
    }
  ]
};

export function createDashboardRouter({ db, logger = console, config = process.env } = {}) {
  const router = express.Router();
  const dashboardConfig = normalizeConfig(config);

  router.get('/auth/github', (req, res) => {
    assertOAuthConfigured(dashboardConfig);

    const state = crypto.randomBytes(24).toString('hex');
    const signedState = signValue(state, dashboardConfig.sessionSecret);
    const redirectUri = `${dashboardConfig.appBaseUrl}/auth/github/callback`;
    const authUrl = new URL('https://github.com/login/oauth/authorize');

    authUrl.searchParams.set('client_id', dashboardConfig.githubOAuthClientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'read:user user:email');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('allow_signup', 'false');

    setCookie(res, STATE_COOKIE, signedState, {
      maxAge: 10 * 60,
      secure: dashboardConfig.secureCookies
    });

    res.redirect(authUrl.toString());
  });

  router.get('/auth/github/callback', async (req, res, next) => {
    try {
      assertOAuthConfigured(dashboardConfig);

      const { code, state } = req.query;
      const signedState = readCookie(req, STATE_COOKIE);
      const expectedState = signedState ? verifySignedValue(signedState, dashboardConfig.sessionSecret) : null;

      if (!code || !state || !expectedState || expectedState !== state) {
        return res.status(400).json({ error: 'Invalid GitHub OAuth state.' });
      }

      const token = await exchangeGitHubCode({
        code: String(code),
        redirectUri: `${dashboardConfig.appBaseUrl}/auth/github/callback`,
        config: dashboardConfig
      });
      const user = await fetchGitHubUser(token);

      if (!isAllowedUser(user, dashboardConfig)) {
        return res.status(403).json({ error: 'This GitHub account is not allowed to access CodeScope.' });
      }

      const session = signValue(
        JSON.stringify({
          id: user.id,
          login: user.login,
          name: user.name,
          avatarUrl: user.avatar_url,
          createdAt: new Date().toISOString()
        }),
        dashboardConfig.sessionSecret
      );

      clearCookie(res, STATE_COOKIE, { secure: dashboardConfig.secureCookies });
      setCookie(res, SESSION_COOKIE, session, {
        maxAge: COOKIE_MAX_AGE_SECONDS,
        secure: dashboardConfig.secureCookies
      });

      res.redirect(dashboardConfig.dashboardUrl);
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/logout', (_req, res) => {
    clearCookie(res, SESSION_COOKIE, { secure: dashboardConfig.secureCookies });
    res.status(204).end();
  });

  router.get('/api/me', requireSession(dashboardConfig), (req, res) => {
    res.json({ user: req.user });
  });

  router.get('/api/metrics', requireSession(dashboardConfig), async (req, res, next) => {
    try {
      const repository = normalizeRepository(req.query.repository);
      const metrics = db ? await readMetricsFromDatabase(db, repository) : readMockMetrics(repository);
      res.json(metrics);
    } catch (error) {
      logger.error?.({ err: error }, 'Could not load dashboard metrics.');
      next(error);
    }
  });

  router.get('/api/scans', requireSession(dashboardConfig), async (req, res, next) => {
    try {
      const repository = normalizeRepository(req.query.repository);
      const limit = clampNumber(Number(req.query.limit || 25), 1, 100);
      const scans = db ? await readScansFromDatabase(db, repository, limit) : readMockScans(repository, limit);
      res.json({ scans });
    } catch (error) {
      logger.error?.({ err: error }, 'Could not load scan activity.');
      next(error);
    }
  });

  router.get('/api/leaderboard', requireSession(dashboardConfig), async (req, res, next) => {
    try {
      const repository = normalizeRepository(req.query.repository);
      const limit = clampNumber(Number(req.query.limit || 10), 1, 50);
      const leaderboard = db ? await readLeaderboardFromDatabase(db, repository, limit) : readMockLeaderboard(repository, limit);
      res.json({ leaderboard });
    } catch (error) {
      logger.error?.({ err: error }, 'Could not load developer leaderboard.');
      next(error);
    }
  });

  router.use((error, _req, res, _next) => {
    const status = error.statusCode || 500;
    res.status(status).json({
      error: status === 500 ? 'Internal server error.' : error.message
    });
  });

  return router;
}

function normalizeConfig(config) {
  return {
    appBaseUrl: config.APP_BASE_URL || 'http://localhost:3000',
    dashboardUrl: config.DASHBOARD_URL || '/',
    githubOAuthClientId: config.GITHUB_OAUTH_CLIENT_ID || '',
    githubOAuthClientSecret: config.GITHUB_OAUTH_CLIENT_SECRET || '',
    sessionSecret: config.SESSION_SECRET || config.GITHUB_WEBHOOK_SECRET || 'development-only-session-secret',
    allowedGitHubLogins: parseCsv(config.DASHBOARD_ALLOWED_GITHUB_LOGINS),
    secureCookies: String(config.NODE_ENV || 'development') === 'production'
  };
}

function assertOAuthConfigured(config) {
  if (!config.githubOAuthClientId || !config.githubOAuthClientSecret) {
    const error = new Error('GitHub OAuth is not configured.');
    error.statusCode = 500;
    throw error;
  }
}

function requireSession(config) {
  return (req, res, next) => {
    const signedSession = readCookie(req, SESSION_COOKIE);
    const rawSession = signedSession ? verifySignedValue(signedSession, config.sessionSecret) : null;

    if (!rawSession) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
      req.user = JSON.parse(rawSession);
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid session.' });
    }
  };
}

async function exchangeGitHubCode({ code, redirectUri, config }) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'codescope-dashboard'
    },
    body: JSON.stringify({
      client_id: config.githubOAuthClientId,
      client_secret: config.githubOAuthClientSecret,
      code,
      redirect_uri: redirectUri
    })
  });

  const payload = await response.json();
  if (!response.ok || payload.error || !payload.access_token) {
    const error = new Error(payload.error_description || 'Could not exchange GitHub OAuth code.');
    error.statusCode = 502;
    throw error;
  }

  return payload.access_token;
}

async function fetchGitHubUser(accessToken) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'codescope-dashboard'
    }
  });

  if (!response.ok) {
    const error = new Error('Could not load GitHub user.');
    error.statusCode = 502;
    throw error;
  }

  return response.json();
}

function isAllowedUser(user, config) {
  if (config.allowedGitHubLogins.length === 0) {
    return true;
  }

  return config.allowedGitHubLogins.includes(String(user.login || '').toLowerCase());
}

async function readMetricsFromDatabase(db, repository) {
  const params = repository === 'all' ? [] : [repository];
  const repositoryWhere = repository === 'all' ? '' : 'where repository_name = $1';
  const trendRepositoryWhere = repository === 'all' ? '' : 'and repository_name = $1';

  const totals = await db.query(
    `
      select
        coalesce(sum(bugs_caught), 0)::int as "totalBugsCaught",
        coalesce(sum(security_flaws_blocked), 0)::int as "securityFlawsBlocked",
        coalesce(sum(developer_hours_saved), 0)::int as "developerHoursSaved"
      from repository_quality_metrics
      ${repositoryWhere}
    `,
    params
  );

  const trends = await db.query(
    `
      select
        scan_date::text as date,
        coalesce(sum(sql_injection_count), 0)::int as "sqlInjection",
        coalesce(sum(hardcoded_secrets_count), 0)::int as "hardcodedSecrets",
        coalesce(sum(missing_await_count), 0)::int as "missingAwait"
      from vulnerability_trends
      where scan_date >= current_date - interval '60 days'
      ${trendRepositoryWhere}
      group by scan_date
      order by scan_date asc
    `,
    params
  );

  return {
    repository,
    ...firstRow(totals),
    trends: rows(trends)
  };
}

async function readScansFromDatabase(db, repository, limit) {
  const params = repository === 'all' ? [limit] : [repository, limit];
  const repositoryWhere = repository === 'all' ? '' : 'where repository_name = $1';
  const limitParam = repository === 'all' ? '$1' : '$2';

  const result = await db.query(
    `
      select
        id,
        repository_name as "repositoryName",
        pull_request_number as "pullRequestNumber",
        bugs_caught as "bugsCaught",
        status,
        created_at as "timestamp"
      from pr_scan_activity
      ${repositoryWhere}
      order by created_at desc
      limit ${limitParam}
    `,
    params
  );

  return rows(result);
}

async function readLeaderboardFromDatabase(db, repository, limit) {
  const params = repository === 'all' ? [limit] : [repository, limit];
  const repositoryWhere = repository === 'all' ? '' : 'where primary_repository = $1';
  const limitParam = repository === 'all' ? '$1' : '$2';

  const result = await db.query(
    `
      select
        rank,
        github_login as "githubLogin",
        display_name as "displayName",
        primary_repository as "primaryRepository",
        prs_reviewed as "prsReviewed",
        bugs_flagged as "bugsFlagged",
        critical_blocked as "criticalBlocked",
        clean_pr_rate as "cleanPrRate",
        hours_saved as "hoursSaved",
        score
      from developer_quality_leaderboard
      ${repositoryWhere}
      order by score desc, clean_pr_rate desc
      limit ${limitParam}
    `,
    params
  );

  return rows(result);
}

function readMockMetrics(repository) {
  return {
    repository,
    ...(mockMetrics[repository] || mockMetrics.all)
  };
}

function readMockScans(repository, limit) {
  return mockScans
    .filter((scan) => repository === 'all' || scan.repositoryName === repository)
    .slice(0, limit);
}

function readMockLeaderboard(repository, limit) {
  return (mockLeaderboard[repository] || mockLeaderboard.all).slice(0, limit);
}

function normalizeRepository(value) {
  const repository = String(value || 'all');
  if (repository === 'all' || DEFAULT_REPOSITORIES.includes(repository)) {
    return repository;
  }
  return 'all';
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function firstRow(result) {
  return rows(result)[0] || {
    totalBugsCaught: 0,
    securityFlawsBlocked: 0,
    developerHoursSaved: 0
  };
}

function rows(result) {
  return Array.isArray(result) ? result : result?.rows || [];
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function signValue(value, secret) {
  const encoded = Buffer.from(value, 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySignedValue(signedValue, secret) {
  const [encoded, signature] = String(signedValue || '').split('.');
  if (!encoded || !signature) {
    return null;
  }

  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  return Buffer.from(encoded, 'base64url').toString('utf8');
}

function readCookie(req, name) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  return cookies[name] || '';
}

function parseCookieHeader(header) {
  return header.split(';').reduce((memo, part) => {
    const [name, ...valueParts] = part.trim().split('=');
    if (name) {
      memo[name] = decodeURIComponent(valueParts.join('='));
    }
    return memo;
  }, {});
}

function setCookie(res, name, value, { maxAge, secure }) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];

  if (secure) {
    parts.push('Secure');
  }

  appendSetCookie(res, parts.join('; '));
}

function clearCookie(res, name, { secure }) {
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];

  if (secure) {
    parts.push('Secure');
  }

  appendSetCookie(res, parts.join('; '));
}

function appendSetCookie(res, cookie) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }

  res.setHeader('Set-Cookie', Array.isArray(existing) ? [...existing, cookie] : [existing, cookie]);
}
