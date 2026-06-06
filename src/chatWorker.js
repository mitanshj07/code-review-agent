import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import Groq from 'groq-sdk';
import { postConversationalReply } from './commenter.js';

const SYSTEM_PROMPT = 'You are an elite automated code reviewer. A developer is responding to your previous comment. Analyze their inquiry and provide corrected code blocks using standard markdown formatting ONLY when requested. Be concise.';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

export async function handleConversationalReply(job, config, logger) {
  const octokit = await createInstallationClient(config, job.installationId);
  const threadHistory = await loadThreadHistory(octokit, job);
  const replyMarkdown = await generateConversationalReply({
    job,
    threadHistory,
    config,
    logger
  });

  return postConversationalReply(job, replyMarkdown, config, logger);
}

async function loadThreadHistory(octokit, job) {
  const [issueComments, reviewComments] = await Promise.all([
    octokit.paginate(octokit.rest.issues.listComments, {
      owner: job.owner,
      repo: job.repo,
      issue_number: job.prNumber,
      per_page: 100
    }),
    octokit.paginate(octokit.rest.pulls.listReviewComments, {
      owner: job.owner,
      repo: job.repo,
      pull_number: job.prNumber,
      per_page: 100
    })
  ]);

  return [...issueComments, ...reviewComments]
    .map((comment) => ({
      id: comment.id,
      author: comment.user?.login || 'unknown',
      authorType: comment.user?.type || 'User',
      body: comment.body || '',
      createdAt: comment.created_at,
      path: comment.path,
      line: comment.line
    }))
    .filter((comment) => comment.body.trim())
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-30);
}

async function generateConversationalReply({ job, threadHistory, config, logger }) {
  if (!config.groqApiKey) {
    throw new Error('Missing GROQ_API_KEY for conversational reply generation.');
  }

  const groq = new Groq({ apiKey: config.groqApiKey });
  const primaryModel = config.groqModel || 'llama-3.3-70b-versatile';
  const messages = buildMessages(job, threadHistory);

  try {
    return await requestGroqReply(groq, primaryModel, messages);
  } catch (error) {
    if (!isRateLimitError(error)) {
      throw error;
    }

    logger.warn({ err: error, primaryModel, fallbackModel: FALLBACK_MODEL }, 'Primary LLM rate limit hit. Switching automatically to fallback backup model.');
    return requestGroqReply(groq, FALLBACK_MODEL, messages);
  }
}

function buildMessages(job, threadHistory) {
  const formattedHistory = threadHistory
    .map((comment) => {
      const location = comment.path ? ` (${comment.path}:${comment.line || 'unknown line'})` : '';
      return `- ${comment.author}${location} at ${comment.createdAt}:\n${comment.body}`;
    })
    .join('\n\n');

  return [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    {
      role: 'user',
      content: [
        `Repository: ${job.fullName}`,
        `Pull request: #${job.prNumber}`,
        `Developer: @${job.sender}`,
        `Mention comment id: ${job.commentId}`,
        '',
        'Thread history:',
        formattedHistory || '(No prior comments available.)',
        '',
        'Latest developer mention:',
        job.body
      ].join('\n')
    }
  ];
}

async function requestGroqReply(groq, model, messages) {
  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 900,
    messages
  });

  const reply = completion.choices?.[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error(`Groq returned an empty conversational reply from ${model}.`);
  }

  return reply;
}

function isRateLimitError(error) {
  const message = `${error?.message || ''} ${error?.error?.message || ''}`;
  return error?.status === 429 || /rate_limit_exceeded|rate limit|429/i.test(message);
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
