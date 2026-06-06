import crypto from 'node:crypto';
import { createInstallationClient } from './reviewer.js';
import { buildDiffFromFiles } from './diffUtils.js';
import { scanForSecrets } from './secretScanner.js';
import { postBranchNameWarning, postSecretAlertComment } from './commenter.js';
import { sendSecretExposureAlert } from './securityAlerts.js';
import { redis } from './queue.js';

const REVIEWABLE_ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review']);
const BOT_MENTION = '@codescopeboit';
const BOT_LOGINS = new Set(['codescopeboit[bot]', 'codescopeboit']);
const BRANCH_NAME_PATTERN = /^(feat|fix|hotfix|chore|refactor|docs|test|ci)\/[a-z0-9-]+$/;

export function createWebhookHandler({ config, logger, enqueueReview, enqueueConversationalReply }) {
  return async function webhookHandler(req, res) {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    if (!verifySignature(rawBody, req.get('x-hub-signature-256'), config.githubWebhookSecret)) {
      logger.warn({ delivery: req.get('x-github-delivery') }, 'Rejected webhook with invalid signature.');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    const event = req.get('x-github-event');
    const deliveryId = req.get('x-github-delivery');

    if (event === 'ping') {
      logger.info({ deliveryId }, 'Received GitHub ping.');
      return res.json({ status: 'ok', event: 'ping' });
    }

    if (event === 'issue_comment') {
      return handleIssueComment({
        payload,
        deliveryId,
        logger,
        enqueueConversationalReply,
        res
      });
    }

    if (event !== 'pull_request') {
      return res.status(202).json({ status: 'ignored', reason: `Unsupported event: ${event}` });
    }

    if (!REVIEWABLE_ACTIONS.has(payload.action)) {
      return res.status(202).json({ status: 'ignored', reason: `Unsupported action: ${payload.action}` });
    }

    const pullRequest = payload.pull_request;
    if (!pullRequest) {
      return res.status(400).json({ error: 'Missing pull_request payload' });
    }

    if (pullRequest.draft && payload.action !== 'ready_for_review') {
      return res.status(202).json({ status: 'ignored', reason: 'Draft pull request' });
    }

    if (!payload.installation?.id) {
      return res.status(400).json({ error: 'Missing GitHub App installation id' });
    }

    const octokit = await createInstallationClient(config, payload.installation.id);
    const job = {
      deliveryId,
      action: payload.action,
      installationId: payload.installation.id,
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      fullName: payload.repository.full_name,
      prNumber: pullRequest.number,
      prTitle: pullRequest.title || '',
      htmlUrl: pullRequest.html_url,
      headSha: pullRequest.head.sha,
      baseSha: pullRequest.base.sha,
      branchName: pullRequest.head.ref,
      sender: payload.sender?.login || 'unknown',
      enqueuedAt: new Date().toISOString()
    };

    if (payload.action === 'opened') {
      await trackPROpened(job, logger);
      await enforceBranchName(octokit, job, logger);
    }

    await runImmediateSecretScan(octokit, job, config, logger);

    const queueResult = await enqueueReview(job);
    logger.info({ job, queueResult }, 'Pull request review job accepted.');

    return res.status(202).json({
      status: queueResult.duplicate ? 'duplicate' : 'queued',
      deliveryId,
      repository: job.fullName,
      pullRequest: job.prNumber
    });
  };
}

async function runImmediateSecretScan(octokit, job, config, logger) {
  try {
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner: job.owner,
      repo: job.repo,
      pull_number: job.prNumber,
      per_page: 100
    });
    const diff = buildDiffFromFiles(files);
    const secretFindings = scanForSecrets(diff);
    if (!secretFindings.length) {
      return;
    }

    job.immediateSecretFindings = secretFindings;
    await postSecretAlertComment(octokit, job, secretFindings);
    await sendSecretExposureAlert(job, secretFindings, config, logger);
    logger.warn({ repository: job.fullName, prNumber: job.prNumber, count: secretFindings.length }, 'Immediate secret scan found credentials.');
  } catch (error) {
    logger.warn({ err: error, repository: job.fullName, prNumber: job.prNumber }, 'Immediate secret scan failed; queued review will continue.');
  }
}

async function enforceBranchName(octokit, job, logger) {
  if (BRANCH_NAME_PATTERN.test(job.branchName || '')) {
    return;
  }

  try {
    await postBranchNameWarning(octokit, job, job.branchName || 'unknown');
    logger.info({ repository: job.fullName, prNumber: job.prNumber, branchName: job.branchName }, 'Posted branch naming warning.');
  } catch (error) {
    logger.warn({ err: error, repository: job.fullName, prNumber: job.prNumber }, 'Could not post branch naming warning.');
  }
}

async function trackPROpened(job, logger) {
  try {
    await redis.setex(`pr-opened:${job.owner}/${job.repo}/${job.prNumber}`, 30 * 24 * 60 * 60, String(Date.now()));
  } catch (error) {
    logger.warn({ err: error, repository: job.fullName, prNumber: job.prNumber }, 'Could not track PR opened time.');
  }
}

async function handleIssueComment({ payload, deliveryId, logger, enqueueConversationalReply, res }) {
  if (payload.action !== 'created') {
    return res.status(200).json({ status: 'ignored', reason: `Unsupported action: ${payload.action}` });
  }

  const comment = payload.comment;
  const issue = payload.issue;
  const repository = payload.repository;

  if (!comment || !issue || !repository) {
    return res.status(400).json({ error: 'Missing issue_comment payload fields' });
  }

  const commentAuthorLogin = comment.user?.login || '';
  const commentAuthorType = comment.user?.type || '';

  if (commentAuthorType === 'Bot' || BOT_LOGINS.has(commentAuthorLogin.toLowerCase())) {
    logger.info({ deliveryId, commentId: comment.id, commentAuthorLogin }, 'Ignored bot-authored issue comment.');
    return res.status(200).json({ status: 'ignored', reason: 'bot_comment' });
  }

  const body = comment.body || '';
  if (!body.includes(BOT_MENTION)) {
    return res.status(200).json({ status: 'ignored', reason: 'missing_bot_mention' });
  }

  if (!issue.pull_request) {
    return res.status(200).json({ status: 'ignored', reason: 'not_a_pull_request_comment' });
  }

  if (!payload.installation?.id) {
    return res.status(400).json({ error: 'Missing GitHub App installation id' });
  }

  const job = {
    deliveryId,
    installationId: payload.installation.id,
    owner: repository.owner.login,
    repo: repository.name,
    fullName: repository.full_name,
    prNumber: issue.number,
    body,
    commentId: comment.id,
    sender: commentAuthorLogin || payload.sender?.login || 'unknown',
    enqueuedAt: new Date().toISOString()
  };

  const queueResult = await enqueueConversationalReply(job);
  logger.info({ job, queueResult }, 'Conversational PR reply job accepted.');

  return res.status(202).json({
    status: queueResult.duplicate ? 'duplicate' : 'queued',
    deliveryId,
    repository: job.fullName,
    pullRequest: job.prNumber,
    commentId: job.commentId
  });
}

function verifySignature(body, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
