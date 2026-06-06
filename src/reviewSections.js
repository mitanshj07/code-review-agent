export function buildStaticGuardSection(findings = []) {
  const globalFindings = findings.filter((finding) => finding.global);
  if (!globalFindings.length) {
    return '';
  }

  const rows = globalFindings
    .slice(0, 12)
    .map((finding) => `| ${escapeTable(finding.severity)} | ${escapeTable(finding.title)} | ${escapeTable(finding.body)} |`)
    .join('\n');

  return [
    '<details open>',
    '<summary>Static guard findings</summary>',
    '',
    '| Severity | Finding | Recommendation |',
    '|---|---|---|',
    rows,
    '',
    '</details>'
  ].join('\n');
}

function escapeTable(value) {
  return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
