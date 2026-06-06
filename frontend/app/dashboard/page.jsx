'use client';

import { useEffect, useMemo, useState } from 'react';

const repositories = [
  { label: 'All Repositories', value: 'all' },
  { label: 'code-review-agent', value: 'code-review-agent' },
  { label: 'payment-gateway', value: 'payment-gateway' }
];

const fallbackMetrics = {
  all: {
    totalBugsCaught: 284,
    securityFlawsBlocked: 47,
    developerHoursSaved: 392,
    trends: [
      { date: 'May 1', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 5 },
      { date: 'May 8', sqlInjection: 4, hardcodedSecrets: 2, missingAwait: 8 },
      { date: 'May 15', sqlInjection: 3, hardcodedSecrets: 4, missingAwait: 6 },
      { date: 'May 22', sqlInjection: 5, hardcodedSecrets: 3, missingAwait: 9 },
      { date: 'May 29', sqlInjection: 6, hardcodedSecrets: 2, missingAwait: 7 },
      { date: 'Jun 5', sqlInjection: 4, hardcodedSecrets: 5, missingAwait: 10 }
    ]
  },
  'code-review-agent': {
    totalBugsCaught: 132,
    securityFlawsBlocked: 21,
    developerHoursSaved: 186,
    trends: [
      { date: 'May 1', sqlInjection: 1, hardcodedSecrets: 1, missingAwait: 3 },
      { date: 'May 8', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 4 },
      { date: 'May 15', sqlInjection: 1, hardcodedSecrets: 2, missingAwait: 3 },
      { date: 'May 22', sqlInjection: 3, hardcodedSecrets: 1, missingAwait: 5 },
      { date: 'May 29', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 4 },
      { date: 'Jun 5', sqlInjection: 2, hardcodedSecrets: 2, missingAwait: 6 }
    ]
  },
  'payment-gateway': {
    totalBugsCaught: 152,
    securityFlawsBlocked: 26,
    developerHoursSaved: 206,
    trends: [
      { date: 'May 1', sqlInjection: 1, hardcodedSecrets: 0, missingAwait: 2 },
      { date: 'May 8', sqlInjection: 2, hardcodedSecrets: 1, missingAwait: 4 },
      { date: 'May 15', sqlInjection: 2, hardcodedSecrets: 2, missingAwait: 3 },
      { date: 'May 22', sqlInjection: 2, hardcodedSecrets: 2, missingAwait: 4 },
      { date: 'May 29', sqlInjection: 4, hardcodedSecrets: 1, missingAwait: 3 },
      { date: 'Jun 5', sqlInjection: 2, hardcodedSecrets: 3, missingAwait: 4 }
    ]
  }
};

const fallbackScans = [
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

const fallbackLeaderboards = {
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

const dashboardTabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'team-health', label: 'Team Health' }
];

const statusStyles = {
  blocked: 'border-red-200 bg-red-50 text-red-700',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-700',
  passed: 'border-emerald-200 bg-emerald-50 text-emerald-700'
};

export default function CodeScopeDashboardPage() {
  const [repository, setRepository] = useState('all');
  const [activeView, setActiveView] = useState('overview');
  const [metrics, setMetrics] = useState(fallbackMetrics.all);
  const [scans, setScans] = useState(fallbackScans);
  const [leaderboard, setLeaderboard] = useState(fallbackLeaderboards.all);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      setLoading(true);
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        const [metricsResponse, scansResponse, leaderboardResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/metrics?repository=${repository}`, { credentials: 'include' }),
          fetch(`${apiBaseUrl}/api/scans?repository=${repository}&limit=12`, { credentials: 'include' }),
          fetch(`${apiBaseUrl}/api/leaderboard?repository=${repository}&limit=10`, { credentials: 'include' })
        ]);

        if (!metricsResponse.ok || !scansResponse.ok || !leaderboardResponse.ok) {
          throw new Error('Dashboard API unavailable');
        }

        const metricsPayload = await metricsResponse.json();
        const scansPayload = await scansResponse.json();
        const leaderboardPayload = await leaderboardResponse.json();

        if (!cancelled) {
          setMetrics(metricsPayload);
          setScans(scansPayload.scans || []);
          setLeaderboard(leaderboardPayload.leaderboard || []);
        }
      } catch {
        if (!cancelled) {
          setMetrics(fallbackMetrics[repository] || fallbackMetrics.all);
          setScans(
            fallbackScans.filter((scan) => repository === 'all' || scan.repositoryName === repository)
          );
          setLeaderboard(fallbackLeaderboards[repository] || fallbackLeaderboards.all);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      cancelled = true;
    };
  }, [repository]);

  const kpis = useMemo(
    () => [
      {
        label: 'Total Bugs Caught',
        value: metrics.totalBugsCaught,
        detail: 'Across reviewed pull requests'
      },
      {
        label: 'Security Flaws Blocked',
        value: metrics.securityFlawsBlocked,
        detail: 'High-confidence security findings'
      },
      {
        label: 'Developer Hours Saved',
        value: metrics.developerHoursSaved,
        detail: 'Estimated review time recovered'
      }
    ],
    [metrics]
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-300">CodeScope</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white">Engineering Quality Dashboard</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Repository health, blocked vulnerabilities, and recent pull request scans for engineering leadership.
            </p>
          </div>

          <label className="flex w-full flex-col gap-2 text-sm text-slate-300 md:w-72">
            Repository
            <select
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
              className="h-11 rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none ring-cyan-400 transition focus:ring-2"
            >
              {repositories.map((repo) => (
                <option key={repo.value} value={repo.value}>
                  {repo.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {kpis.map((kpi) => (
            <article key={kpi.label} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <p className="text-sm font-medium text-slate-400">{kpi.label}</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <p className="text-4xl font-semibold tracking-normal text-white">{numberFormat(kpi.value)}</p>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-medium text-cyan-200">
                  Live
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-500">{kpi.detail}</p>
            </article>
          ))}
        </section>

        <div className="flex items-center gap-2 border-b border-white/10">
          {dashboardTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveView(tab.id)}
              className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
                activeView === tab.id
                  ? 'border-cyan-300 text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {loading ? <span className="ml-auto text-xs text-slate-500">Refreshing</span> : null}
        </div>

        {activeView === 'overview' ? (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-white">Vulnerability Trends</h2>
                    <p className="mt-1 text-sm text-slate-400">SQL Injection, hardcoded secrets, and missing await findings.</p>
                  </div>
                </div>

                <TrendChart data={metrics.trends || []} />

                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <LegendDot className="bg-red-400" label="SQL Injection" />
                  <LegendDot className="bg-amber-300" label="Hardcoded Secrets" />
                  <LegendDot className="bg-cyan-300" label="Missing Await" />
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-base font-semibold text-white">Repository Coverage</h2>
                <div className="mt-5 space-y-4">
                  {repositories.slice(1).map((repo) => {
                    const repoMetrics = fallbackMetrics[repo.value];
                    const total = Math.max(repoMetrics.totalBugsCaught + repoMetrics.securityFlawsBlocked, 1);
                    const width = Math.min(100, Math.round((repoMetrics.securityFlawsBlocked / total) * 100) + 20);

                    return (
                      <div key={repo.value}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-200">{repo.label}</span>
                          <span className="text-slate-500">{repoMetrics.securityFlawsBlocked} security blocks</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-800">
                          <div className="h-2 rounded-full bg-cyan-300" style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <ScanActivityTable scans={scans} />
          </>
        ) : (
          <TeamHealthPanel leaderboard={leaderboard} />
        )}
      </div>
    </main>
  );
}

function ScanActivityTable({ scans }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04]">
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-white">Recent PR Scan Activity</h2>
          <p className="mt-1 text-sm text-slate-400">Latest repository scans and merge-blocking findings.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Repository Name</th>
              <th className="px-5 py-3 font-medium">PR #</th>
              <th className="px-5 py-3 font-medium">Bugs Caught</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {scans.map((scan) => (
              <tr key={scan.id} className="text-slate-300">
                <td className="px-5 py-4 font-medium text-white">{scan.repositoryName}</td>
                <td className="px-5 py-4">#{scan.pullRequestNumber}</td>
                <td className="px-5 py-4">{scan.bugsCaught}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[scan.status] || statusStyles.needs_review}`}>
                    {formatStatus(scan.status)}
                  </span>
                </td>
                <td className="px-5 py-4 text-slate-400">{formatTimestamp(scan.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeamHealthPanel({ leaderboard }) {
  const topDeveloper = leaderboard[0];
  const totalPrs = leaderboard.reduce((sum, developer) => sum + developer.prsReviewed, 0);
  const totalCriticalBlocked = leaderboard.reduce((sum, developer) => sum + developer.criticalBlocked, 0);
  const averageCleanRate = leaderboard.length
    ? Math.round(leaderboard.reduce((sum, developer) => sum + developer.cleanPrRate, 0) / leaderboard.length)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-3">
        <TeamHealthCard
          label="Most Secure Developer"
          value={topDeveloper?.displayName || 'No data'}
          detail={topDeveloper ? `@${topDeveloper.githubLogin} with a ${topDeveloper.cleanPrRate}% clean PR rate` : 'Waiting for scans'}
        />
        <TeamHealthCard label="Team Clean PR Rate" value={`${averageCleanRate}%`} detail={`${totalPrs} pull requests scored`} />
        <TeamHealthCard label="Critical Issues Blocked" value={totalCriticalBlocked} detail="Prevented before merge" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-base font-semibold text-white">Secure Developer Rankings</h2>
          <p className="mt-1 text-sm text-slate-400">Score combines clean PR rate, critical blocks avoided, and scan volume.</p>

          <div className="mt-5 space-y-4">
            {leaderboard.map((developer) => (
              <div key={developer.githubLogin}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-900 text-xs font-semibold text-cyan-200">
                      {developer.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{developer.displayName}</p>
                      <p className="truncate text-xs text-slate-500">@{developer.githubLogin}</p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-white">{developer.score}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-800">
                  <div className="h-2 rounded-full bg-emerald-300" style={{ width: `${Math.min(100, developer.score)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.04]">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-base font-semibold text-white">Team Health Leaderboard</h2>
            <p className="mt-1 text-sm text-slate-400">Who is writing the cleanest code and where the bot is coaching most.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Developer</th>
                  <th className="px-5 py-3 font-medium">Repository</th>
                  <th className="px-5 py-3 font-medium">PRs Reviewed</th>
                  <th className="px-5 py-3 font-medium">Bugs Flagged</th>
                  <th className="px-5 py-3 font-medium">Clean PR Rate</th>
                  <th className="px-5 py-3 font-medium">Hours Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {leaderboard.map((developer) => (
                  <tr key={developer.githubLogin} className="text-slate-300">
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">{developer.displayName}</div>
                      <div className="text-xs text-slate-500">@{developer.githubLogin}</div>
                    </td>
                    <td className="px-5 py-4">{developer.primaryRepository}</td>
                    <td className="px-5 py-4">{developer.prsReviewed}</td>
                    <td className="px-5 py-4">{developer.bugsFlagged}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-28 rounded-full bg-slate-800">
                          <div className="h-2 rounded-full bg-cyan-300" style={{ width: `${developer.cleanPrRate}%` }} />
                        </div>
                        <span>{developer.cleanPrRate}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">{developer.hoursSaved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function TeamHealthCard({ label, value, detail }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-3 min-h-10 text-2xl font-semibold tracking-normal text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </article>
  );
}

function TrendChart({ data }) {
  const width = 720;
  const height = 260;
  const padding = 28;
  const maxValue = Math.max(1, ...data.flatMap((point) => [point.sqlInjection, point.hardcodedSecrets, point.missingAwait]));

  const lines = [
    { key: 'sqlInjection', color: '#f87171' },
    { key: 'hardcodedSecrets', color: '#fcd34d' },
    { key: 'missingAwait', color: '#67e8f9' }
  ];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-5 h-72 w-full rounded-md bg-slate-950/70">
      {[0, 1, 2, 3].map((line) => {
        const y = padding + ((height - padding * 2) / 3) * line;
        return <line key={line} x1={padding} x2={width - padding} y1={y} y2={y} stroke="rgba(148,163,184,0.16)" />;
      })}

      {lines.map((line) => (
        <polyline
          key={line.key}
          fill="none"
          stroke={line.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
          points={data.map((point, index) => `${xFor(index, data.length, width, padding)},${yFor(point[line.key], maxValue, height, padding)}`).join(' ')}
        />
      ))}

      {data.map((point, index) => (
        <text key={point.date} x={xFor(index, data.length, width, padding)} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
          {point.date}
        </text>
      ))}
    </svg>
  );
}

function LegendDot({ className, label }) {
  return (
    <span className="inline-flex items-center gap-2 text-slate-400">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function xFor(index, length, width, padding) {
  if (length <= 1) {
    return width / 2;
  }

  return padding + (index / (length - 1)) * (width - padding * 2);
}

function yFor(value, maxValue, height, padding) {
  return height - padding - (value / maxValue) * (height - padding * 2);
}

function numberFormat(value) {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function formatStatus(status) {
  return String(status || 'needs_review')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
}
