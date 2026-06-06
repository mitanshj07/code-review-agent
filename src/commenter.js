import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

export async function postReviewResult(job, result, config, logger) {
  const octokit = await createInstallationClient(config, job.installationId);

  if (!result.findings.length) {
    if (config.commentOnClean) {
      await octokit.rest.issues.createComment({
        owner: job.owner,
        repo: job.repo,
        issue_number: job.prNumber,
        body: `${result.summary}\n\n<!-- code-review-agent:${job.headSha} -->`
      });
    }
    return { posted: false, reason: 'no_findings' };
  }

  const comments = result.findings.map((finding) => ({
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
    `<!-- code-review-agent:${job.headSha} -->`
  ].join('\n');

  try {
    const response = await octokit.rest.pulls.createReview({
      owner: job.owner,
      repo: job.repo,
      pull_number: job.prNumber,
      commit_id: job.headSha,
      event: 'COMMENT',
      body: reviewBody,
      comments
    });

    logger.info({ reviewId: response.data.id, count: comments.length }, 'Posted pull request review.');
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

    return { posted: true, issueCommentId: response.data.id, fallback: true };
  }
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
  const body = [
    `**${finding.severity.toUpperCase()}: ${finding.title}**`,
    '',
    finding.body,
    '',
    `_Source: ${finding.source === 'static' ? 'deterministic check' : 'Groq review'}_`
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
  return Object.prototype.hasOwnProperty.call(finding, 'suggestion') && finding.suggestion !== null && finding.suggestion !== undefined;
}

function sanitizeSuggestion(suggestion) {
  return String(suggestion).replace(/```/g, '` ` `').slice(0, 1600);
}
