export type ReleaseCommit = {
  sha: string;
  html_url: string;
  author: { login: string } | null;
  commit: { message: string; author?: { name: string } };
};
const escape = (text: string) => text.replace(/[\\`*_{}\[\]<>]/g, '\\$&');
function author(commit: ReleaseCommit) {
  return commit.author?.login
    ? `@${escape(commit.author.login)}`
    : escape(commit.commit.author?.name || 'Unknown author');
}
export function releaseNotes(
  repo: string,
  tag: string,
  previous: string | undefined,
  commits: ReleaseCommit[],
) {
  const unique = [...new Map(commits.map((commit) => [commit.sha, commit])).values()];
  const groups = new Map<string, string[]>();
  const contributors = new Map<string, string[]>();
  const highlights: string[] = [];
  const titles: Record<string, string> = {
    feat: 'New features',
    fix: 'Bug fixes',
    docs: 'Documentation',
    test: 'Tests',
    ci: 'Build and CI',
    chore: 'Maintenance',
    refactor: 'Refactoring',
    perf: 'Performance',
  };
  for (const commit of unique) {
    const message = commit.commit.message.split('\n')[0] || commit.sha;
    const match = message.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s*(.*)$/i);
    const type = match?.[1]?.toLowerCase() || '';
    const group = titles[type] || 'Other changes';
    const title = match ? `${match[2] ? `${match[2]} — ` : ''}${match[3]}` : message;
    const line = `- ${escape(title)} ([${commit.sha.slice(0, 7)}](${commit.html_url}))`;
    groups.set(group, [...(groups.get(group) || []), `${line} by ${author(commit)}`]);
    contributors.set(author(commit), [...(contributors.get(author(commit)) || []), line]);
    if ((type === 'feat' || type === 'fix') && highlights.length < 5)
      highlights.push(`${line} by ${author(commit)}`);
  }
  const count = unique.length;
  const parts = [
    `# ${escape(tag)}`,
    `## Release summary\n\n${escape(tag)} includes **${count} ${count === 1 ? 'commit' : 'commits'}** ${previous ? `since ${escape(previous)}` : 'in this first release'}, from **${contributors.size} ${contributors.size === 1 ? 'contributor' : 'contributors'}**.`,
  ];
  if (highlights.length) parts.push(`## Highlights\n\n${highlights.join('\n')}`);
  for (const group of [...Object.values(titles), 'Other changes']) {
    const changes = groups.get(group);
    if (changes?.length) parts.push(`## ${group}\n\n${changes.join('\n')}`);
  }
  if (contributors.size) {
    parts.push('## Contributors');
    for (const [name, changes] of contributors) parts.push(`### ${name}\n\n${changes.join('\n')}`);
  }
  const url = previous
    ? `https://github.com/${repo}/compare/${encodeURIComponent(previous)}...${encodeURIComponent(tag)}`
    : `https://github.com/${repo}/commits/${encodeURIComponent(tag)}`;
  parts.push(
    `## Compare changes\n\n[View the full changelog](${url}).\n\nThis description was generated from the repository's commit history.`,
  );
  return `${parts.join('\n\n')}\n`;
}
