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
  return [
    `**${finding.severity.toUpperCase()}: ${finding.title}**`,
    '',
    finding.body,
    '',
    `_Source: ${finding.source === 'static' ? 'deterministic check' : 'Groq review'}_`
  ].join('\n');
}
