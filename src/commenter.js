import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import { redis } from './queue.js';
import { isReviewLineFinding } from './diffUtils.js';
import { redactedSecretTable } from './secretScanner.js';

export async function postReviewResult(job, result, config, logger) {
  const octokit = await createInstallationClient(config, job.installationId);
  const extraSections = result.extraReviewSections || [];
  const hasReviewContent = result.findings.length || extraSections.length;

  if (!hasReviewContent) {
    if (config.commentOnClean) {
      await octokit.rest.issues.createComment({
        owner: job.owner,
        repo: job.repo,
        issue_number: job.prNumber,
        body: `${result.summary}\n\n<!-- code-review-agent:${job.headSha} -->`
      });
    }
    await recordReviewTime(job, logger);
    return { posted: false, reason: 'no_findings' };
  }

  const comments = result.findings
    .filter(isReviewLineFinding)
    .map((finding) => ({
      path: finding.path,
      line: finding.line,
      side: 'RIGHT',
      body: formatFinding(finding)
    }));

  const reviewBody = [
    result.summary,
    '',
    'I reviewed only the changed lines and prioritized actionable security, correctness, async, and reliability issues.',
    '',
    ...extraSections,
    '',
    `<!-- code-review-agent:${job.headSha} -->`
  ].join('\n');

  try {
    const response = await octokit.rest.pulls.createReview({
      owner: job.owner,
      repo: job.repo,
      pull_number: job.prNumber,
      commit_id: job.headSha,
      event: result.requestChanges ? 'REQUEST_CHANGES' : 'COMMENT',
      body: reviewBody,
      comments
    });

    logger.info({ reviewId: response.data.id, count: comments.length }, 'Posted pull request review.');
    await recordReviewTime(job, logger);
    return { posted: true, reviewId: response.data.id, commentCount: comments.length };
  } catch (error) {
    logger.warn({ err: error }, 'Inline review failed; posting issue comment fallback.');

    const fallback = [
      reviewBody,
      '',
      ...result.findings.map((finding) => `- \`${finding.path}:${finding.line}\` **${finding.severity.toUpperCase()}** ${finding.title}: ${finding.body}`)
    ].join('\n');

    const response = await octokit.rest.issues.createComment({
      owner: job.owner,
      repo: job.repo,
      issue_number: job.prNumber,
      body: fallback
    });

    await recordReviewTime(job, logger);
    return { posted: true, issueCommentId: response.data.id, fallback: true };
  }
}

export async function postIssueComment(octokit, job, body) {
  const response = await octokit.rest.issues.createComment({
    owner: job.owner,
    repo: job.repo,
    issue_number: job.prNumber,
    body
  });

  return response.data;
}

export async function postSecretAlertComment(octokit, job, secretFindings) {
  const rows = redactedSecretTable(secretFindings)
    .map((finding) => `| ${finding.type} | \`${finding.location}\` | \`${finding.match}\` |`)
    .join('\n');

  return postIssueComment(octokit, job, [
    '## CRITICAL: Secrets Detected',
    '',
    '**This PR contains what appears to be hardcoded credentials.**',
    'These must be removed before this PR can be merged.',
    '',
    '| Type | Location | Match |',
    '|---|---|---|',
    rows,
    '',
    '**Immediately rotate these credentials** - assume they are compromised from the moment they appear in a git diff.',
    'Use environment variables instead.'
  ].join('\n'));
}

export async function postBranchNameWarning(octokit, job, branchName) {
  return postIssueComment(octokit, job, [
    "## Branch name doesn't follow conventions",
    '',
    `Your branch \`${branchName}\` doesn't follow the team naming convention.`,
    '',
    '**Expected format:** `type/description`',
    '',
    '**Valid types:** `feat`, `fix`, `hotfix`, `chore`, `refactor`, `docs`, `test`, `ci`',
    '',
    '**Examples:**',
    '- `feat/add-user-auth`',
    '- `fix/login-redirect-bug`',
    '- `hotfix/payment-crash`',
    '',
    'Please rename your branch before requesting review.'
  ].join('\n'));
}

export async function postConversationalReply(job, markdownReply, config, logger) {
  const octokit = await createInstallationClient(config, job.installationId);
  const cleanReply = sanitizeMarkdownReply(markdownReply);
  const target = job.sender && job.sender !== 'unknown' ? `@${job.sender}` : 'Developer';

  const response = await octokit.rest.issues.createComment({
    owner: job.owner,
    repo: job.repo,
    issue_number: job.prNumber,
    body: `${target} [AI Response]:\n\n${cleanReply}`
  });

  logger.info({ commentId: response.data.id, prNumber: job.prNumber, repository: job.fullName }, 'Posted conversational PR reply.');
  return { posted: true, issueCommentId: response.data.id };
}

async function createInstallationClient(config, installationId) {
  const auth = createAppAuth({
    appId: config.githubAppId,
    privateKey: config.githubPrivateKey,
    installationId
  });

  const installationAuth = await auth({ type: 'installation' });
  return new Octokit({ auth: installationAuth.token });
}

function formatFinding(finding) {
  const sourceLabel = sourceForFinding(finding);
  const body = [
    `**${finding.severity.toUpperCase()}: ${finding.title}**`,
    '',
    finding.body,
    '',
    `_Source: ${sourceLabel}_`
  ];

  if (hasSuggestion(finding)) {
    body.push('', '```suggestion', sanitizeSuggestion(finding.suggestion), '```');
  }

  return body.join('\n');
}

function sanitizeMarkdownReply(markdownReply) {
  const reply = String(markdownReply || '').trim();
  if (!reply) {
    return 'I could not generate a useful response for this thread. Please clarify what you want me to review.';
  }

  return reply.slice(0, 6000);
}

function hasSuggestion(finding) {
  return Object.prototype.hasOwnProperty.call(finding, 'suggestion') &&
    finding.suggestion !== null &&
    finding.suggestion !== undefined &&
    String(finding.suggestion).trim().length > 0;
}

function sanitizeSuggestion(suggestion) {
  return String(suggestion).replace(/```/g, '` ` `').slice(0, 1600);
}

function sourceForFinding(finding) {
  if (finding.source === 'static') return 'deterministic check';
  if (finding.source === 'secret-scanner') return 'secret scanner';
  if (finding.source === 'file-size-guard') return 'file size guard';
  return 'Groq review';
}

async function recordReviewTime(job, logger) {
  try {
    const openedKey = `pr-opened:${job.owner}/${job.repo}/${job.prNumber}`;
    const openedAt = await redis.get(openedKey);
    if (!openedAt) {
      return;
    }

    const elapsedMinutes = Math.max(0, Math.round((Date.now() - Number(openedAt)) / 60000));
    await redis.setex(`pr-review-time:${job.owner}/${job.repo}/${job.prNumber}`, 30 * 24 * 60 * 60, String(elapsedMinutes));
    logger.info({ prNumber: job.prNumber, elapsedMinutes }, 'Recorded PR review time.');
  } catch (error) {
    logger.warn({ err: error, prNumber: job.prNumber }, 'Could not record PR review time.');
  }
}
