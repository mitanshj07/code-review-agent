const SECURITY_KEYWORDS = [
  'sql injection',
  'hardcoded secret',
  'hardcoded api key',
  'api key',
  'secret detected',
  'xss',
  'cross-site scripting'
];

const SEVERITY_RANK = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};

export async function sendSecurityAlertsForReview(job, result, config, logger = console) {
  const findings = collectSecurityFindings(result.findings || [], config.securityAlertMinSeverity);
  if (findings.length === 0) {
    return { sent: false, reason: 'no_security_findings' };
  }

  if (!config.securityAlertWebhookUrl) {
    logger.info({ repository: job.fullName, prNumber: job.prNumber, count: findings.length }, 'Security findings detected; alert webhook not configured.');
    return { sent: false, reason: 'webhook_not_configured', count: findings.length };
  }

  const provider = inferProvider(config.securityAlertProvider, config.securityAlertWebhookUrl);
  const payload = provider === 'discord'
    ? buildDiscordPayload(job, result, findings)
    : buildSlackPayload(job, result, findings);

  try {
    const response = await fetch(config.securityAlertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Security alert webhook failed with ${response.status}: ${body.slice(0, 500)}`);
    }

    logger.info({ provider, repository: job.fullName, prNumber: job.prNumber, count: findings.length }, 'Sent security alert webhook.');
    return { sent: true, provider, count: findings.length };
  } catch (error) {
    logger.warn({ err: error, provider, repository: job.fullName, prNumber: job.prNumber }, 'Security alert webhook failed.');
    return { sent: false, reason: 'webhook_failed', count: findings.length };
  }
}

function collectSecurityFindings(findings, minSeverity = 'high') {
  const threshold = SEVERITY_RANK[minSeverity] ?? SEVERITY_RANK.high;

  return findings
    .filter((finding) => {
      const severity = SEVERITY_RANK[finding.severity] ?? SEVERITY_RANK.medium;
      const text = `${finding.title || ''} ${finding.body || ''}`.toLowerCase();
      return severity <= threshold && SECURITY_KEYWORDS.some((keyword) => text.includes(keyword));
    })
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
    .slice(0, 5);
}

function inferProvider(provider, webhookUrl) {
  const normalized = String(provider || '').toLowerCase();
  if (normalized === 'discord' || normalized === 'slack') {
    return normalized;
  }

  return /discord(?:app)?\.com\/api\/webhooks/i.test(webhookUrl) ? 'discord' : 'slack';
}

function buildSlackPayload(job, result, findings) {
  const headline = buildHeadline(job, findings[0]);
  const fields = findings.map(formatFindingLine).join('\n');

  return {
    text: headline,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${headline}*\n${result.summary || ''}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: fields
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `<${job.htmlUrl}|Open PR> | ${job.fullName}`
          }
        ]
      }
    ]
  };
}

function buildDiscordPayload(job, result, findings) {
  const headline = buildHeadline(job, findings[0]);

  return {
    content: headline,
    embeds: [
      {
        title: 'CodeScope Security Alert',
        url: job.htmlUrl,
        description: result.summary || headline,
        color: 15158332,
        fields: findings.map((finding) => ({
          name: `${String(finding.severity || 'high').toUpperCase()}: ${finding.title}`,
          value: `\`${finding.path}:${finding.line}\`\n${finding.body}`.slice(0, 1024),
          inline: false
        })),
        footer: {
          text: `${job.fullName} | PR #${job.prNumber}`
        },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function buildHeadline(job, finding) {
  const severity = String(finding.severity || 'high').toUpperCase();
  const actor = job.sender && job.sender !== 'unknown' ? ` by @${job.sender}` : '';
  return `${severity}: ${finding.title} blocked in PR #${job.prNumber}${actor}.`;
}

function formatFindingLine(finding) {
  return `*${String(finding.severity || 'high').toUpperCase()}* \`${finding.path}:${finding.line}\` ${finding.title}`;
}
