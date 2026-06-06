import Groq from 'groq-sdk';
import { redis } from './queue.js';
import { extractChangedFilePaths } from './diffUtils.js';

const LABELS = {
  'size/XS': ['0075ca', 'Tiny PR'],
  'size/S': ['0075ca', 'Small PR'],
  'size/M': ['0075ca', 'Medium PR'],
  'size/L': ['0075ca', 'Large PR'],
  'size/XL': ['0075ca', 'Extra large PR'],
  'has-errors': ['d93f0b', 'CodeScope found blocking errors'],
  'has-warnings': ['e4e669', 'CodeScope found warnings'],
  'security-risk': ['b60205', 'Security-sensitive changes or findings'],
  'exposed-secret': ['b60205', 'Hardcoded secret detected'],
  'needs-tests': ['f9d0c4', 'Tests may be needed'],
  performance: ['fef2c0', 'Performance-related change'],
  documentation: ['0075ca', 'Documentation changes'],
  dependencies: ['0052cc', 'Dependency changes'],
  'ci-cd': ['1d76db', 'CI/CD changes'],
  database: ['5319e7', 'Database changes'],
  frontend: ['006b75', 'Frontend changes'],
  backend: ['006b75', 'Backend changes'],
  config: ['e4e669', 'Configuration changes'],
  tests: ['0e8a16', 'Test changes'],
  'breaking-change': ['b60205', 'Breaking change'],
  'bug-fix': ['d93f0b', 'Bug fix'],
  feature: ['0075ca', 'Feature work'],
  refactor: ['bfd4f2', 'Refactor'],
  hotfix: ['e11d48', 'Hotfix'],
  chore: ['ededed', 'Chore'],
  revert: ['f97316', 'Revert'],
  experiment: ['a855f7', 'Experiment']
};

const AI_CATEGORIES = new Set(['bug-fix', 'feature', 'refactor', 'hotfix', 'chore', 'revert', 'experiment']);

export async function labelPR(octokit, owner, repo, pullNumber, diff, issues, sizeData, options = {}) {
  try {
    const labels = new Set(buildRuleBasedLabels(diff, issues, sizeData));

    if (labels.size < 2) {
      const aiLabel = await classifyWithTinyModel({
        groqApiKey: options.groqApiKey,
        title: options.title,
        diff
      });
      if (aiLabel) {
        labels.add(aiLabel);
      }
    }

    const allLabels = [...labels].filter((label) => LABELS[label]);
    if (!allLabels.length) {
      return { labeled: false, reason: 'no_labels' };
    }

    await ensureLabelsExist(octokit, owner, repo, allLabels, options.logger || console);
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: pullNumber,
      labels: allLabels
    });

    return { labeled: true, labels: allLabels };
  } catch (error) {
    options.logger?.warn?.({ err: error, owner, repo, pullNumber }, 'Auto-labeling failed.');
    return { labeled: false, reason: 'failed' };
  }
}

export function buildRuleBasedLabels(diff, issues = [], sizeData = {}) {
  const labels = new Set();
  const paths = extractChangedFilePaths(diff);
  const lowerDiff = String(diff || '').toLowerCase();

  labels.add(`size/${sizeData.size || 'M'}`);

  if (issues.some((issue) => issue.severity === 'error')) labels.add('has-errors');
  if (issues.some((issue) => issue.severity === 'warning')) labels.add('has-warnings');
  if (issues.some((issue) => issue.category === 'security')) labels.add('security-risk');
  if (issues.some((issue) => /test/i.test(`${issue.title || ''} ${issue.body || ''}`))) labels.add('needs-tests');
  if (issues.some((issue) => issue.category === 'performance')) labels.add('performance');
  if (issues.some((issue) => issue.source === 'secret-scanner')) labels.add('exposed-secret');

  if (paths.some((path) => /\.(md|txt|rst)$/i.test(path))) labels.add('documentation');
  if (paths.some((path) => /(^|\/)(package\.json|requirements\.txt|go\.mod|gemfile|pom\.xml)$/i.test(path))) labels.add('dependencies');
  if (paths.some((path) => /^\.github\/|\.gitlab-ci|(^|\/)Dockerfile$|docker-compose|^[^/]+\.ya?ml$/i.test(path))) labels.add('ci-cd');
  if (paths.some((path) => /migration|schema|\.(sql)$/i.test(path))) labels.add('database');
  if (paths.some((path) => /\.(jsx|tsx|vue|css|scss)$/i.test(path))) labels.add('frontend');
  if (paths.some((path) => /\.(js|ts|py|go|rs|java)$/i.test(path))) labels.add('backend');
  if (paths.some((path) => /\.env|\.config|\.json|\.toml$/i.test(path))) labels.add('config');
  if (paths.some((path) => /\.test\.|\.spec\.|__tests__/i.test(path))) labels.add('tests');
  if (lowerDiff.includes('breaking change')) labels.add('breaking-change');

  return [...labels];
}

async function classifyWithTinyModel({ groqApiKey, title = '', diff = '' }) {
  if (!groqApiKey) {
    return null;
  }

  const groq = new Groq({ apiKey: groqApiKey });
  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    temperature: 0,
    max_tokens: 8,
    messages: [
      {
        role: 'system',
        content: 'Classify this PR into exactly ONE category from this list: [bug-fix, feature, refactor, hotfix, chore, revert, experiment]. Respond with ONLY the category word. Nothing else.'
      },
      {
        role: 'user',
        content: `Title: ${title}\nDiff preview:\n${String(diff || '').slice(0, 500)}`
      }
    ]
  });

  const label = String(completion.choices?.[0]?.message?.content || '').trim().toLowerCase();
  return AI_CATEGORIES.has(label) ? label : null;
}

async function ensureLabelsExist(octokit, owner, repo, labels, logger) {
  const cacheKey = `labels:${owner}/${repo}`;
  const cached = await readCachedLabelSet(cacheKey);
  const existing = cached || await fetchExistingLabels(octokit, owner, repo, cacheKey, logger);

  for (const labelName of labels) {
    if (existing.has(labelName.toLowerCase())) {
      continue;
    }

    const [color, description] = LABELS[labelName];
    try {
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: labelName,
        color,
        description
      });
      existing.add(labelName.toLowerCase());
    } catch (error) {
      if (error.status !== 422) {
        logger.warn({ err: error, labelName }, 'Could not create label.');
      }
    }
  }

  await redis.setex(cacheKey, 3600, JSON.stringify([...existing]));
}

async function readCachedLabelSet(cacheKey) {
  try {
    const cached = await redis.get(cacheKey);
    return cached ? new Set(JSON.parse(cached)) : null;
  } catch {
    return null;
  }
}

async function fetchExistingLabels(octokit, owner, repo, cacheKey, logger) {
  try {
    const labels = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
      owner,
      repo,
      per_page: 100
    });
    const existing = new Set(labels.map((label) => label.name.toLowerCase()));
    await redis.setex(cacheKey, 3600, JSON.stringify([...existing]));
    return existing;
  } catch (error) {
    logger.warn({ err: error, owner, repo }, 'Could not list repo labels.');
    return new Set();
  }
}
