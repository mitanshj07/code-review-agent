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

const statusStyles = {
  blocked: 'border-red-200 bg-red-50 text-red-700',
  needs_review: 'border-amber-200 bg-amber-50 text-amber-700',
  passed: 'border-emerald-200 bg-emerald-50 text-emerald-700'
};

export default function CodeScopeDashboardPage() {
  const [repository, setRepository] = useState('all');
  const [metrics, setMetrics] = useState(fallbackMetrics.all);
  const [scans, setScans] = useState(fallbackScans);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardData() {
      setLoading(true);
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        const [metricsResponse, scansResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/metrics?repository=${repository}`, { credentials: 'include' }),
          fetch(`${apiBaseUrl}/api/scans?repository=${repository}&limit=12`, { credentials: 'include' })
        ]);

        if (!metricsResponse.ok || !scansResponse.ok) {
          throw new Error('Dashboard API unavailable');
        }

        const metricsPayload = await metricsResponse.json();
        const scansPayload = await scansResponse.json();

        if (!cancelled) {
          setMetrics(metricsPayload);
          setScans(scansPayload.scans || []);
        }
      } catch {
        if (!cancelled) {
          setMetrics(fallbackMetrics[repository] || fallbackMetrics.all);
          setScans(
            fallbackScans.filter((scan) => repository === 'all' || scan.repositoryName === repository)
          );
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

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">Vulnerability Trends</h2>
                <p className="mt-1 text-sm text-slate-400">SQL Injection, hardcoded secrets, and missing await findings.</p>
              </div>
              {loading ? <span className="text-xs text-slate-500">Refreshing</span> : null}
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
      </div>
    </main>
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
