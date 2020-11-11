import { GitHubUserResponse } from "./github-api";
import { CommitInfo, Release } from "./interfaces";
import { format } from "prettier";

const UNRELEASED_TAG = "___unreleased___";
const COMMIT_FIX_REGEX = /(fix|close|resolve)(e?s|e?d)? [T#](\d+)/i;

interface CategoryInfo {
  name: string | undefined;
  commits: CommitInfo[];
}

interface Options {
  categories: string[];
  baseIssueUrl: string;
  unreleasedName: string;
}

export default class MarkdownRenderer {
  private options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  public renderMarkdown(releases: Release[]) {
    let output = releases
      .sort((a, b) =>
        a.name
          .replace("@ant-design/pro-", "")
          .split("@")[0]
          .localeCompare(b.name.replace("@ant-design/pro-", "").split("@")[0])
      )
      .map((release) => this.renderRelease(release))
      .filter(Boolean)
      .join("\n\n\n");
    return output ? `\n${output}` : "";
  }

  public renderRelease(release: Release): string | undefined {
    // Group commits in release by category
    const categories = this.groupByCategory(release);

    const categoriesWithCommits = categories.filter((category) => {
      return category.commits.length > 0;
    });

    // Skip this iteration if there are no commits available for the release
    if (categoriesWithCommits.length === 0) return "";

    const releaseTitle = release.name === UNRELEASED_TAG ? this.options.unreleasedName : release.name;

    let markdown = `## ${releaseTitle}\n`;
    markdown += `\n`;
    markdown += `\`${release.date}\``;
    markdown += `\n`;

    for (const category of categoriesWithCommits) {
      markdown += `\n`;
      markdown += this.renderContributionList(category.commits);
    }
    markdown += "\n";

    return format(markdown, { parser: "markdown" });
  }

  public renderContributionsByPackage(commits: CommitInfo[]) {
    // Group commits in category by package
    const commitsByPackage: { [id: string]: CommitInfo[] } = {};
    for (const commit of commits) {
      // Array of unique packages.
      const changedPackages = commit.packages || [];

      const packageName = this.renderPackageNames(changedPackages);

      commitsByPackage[packageName] = commitsByPackage[packageName] || [];
      commitsByPackage[packageName].push(commit);
    }

    const packageNames = Object.keys(commitsByPackage);

    return packageNames
      .map((packageName) => {
        const pkgCommits = commitsByPackage[packageName];
        return `- ${packageName}\n${this.renderContributionList(pkgCommits, "  ")}`;
      })
      .join("\n");
  }

  public renderPackageNames(packageNames: string[]) {
    return packageNames.length > 0 ? packageNames.map((pkg) => `\`${pkg}\``).join(", ") : "Other";
  }

  public renderContributionList(commits: CommitInfo[], prefix: string = ""): string {
    return commits
      .map((commit) => this.renderContribution(commit))
      .filter((name) => !!name?.trim())
      .join("\n");
  }

  public renderContribution(commit: CommitInfo): string | undefined {
    const issue = commit.githubIssue;
    if (issue) {
      let markdown = "";
      markdown += `- ${issue.title}`.replace("- feat(", "- 💥 feat(").replace("- fix(", "- 🐛 fix(");

      if (issue.title && issue.title.match(COMMIT_FIX_REGEX)) {
        issue.title = issue.title.replace(COMMIT_FIX_REGEX, `Closes [#$3](${this.options.baseIssueUrl}$3)`);
      }

      if (issue.number && issue.pull_request && issue.pull_request.html_url) {
        const prUrl = issue.pull_request.html_url;
        markdown += `  [#${issue.number}](${prUrl}) `;
      }
      markdown += ` [@${issue.user.login}](${issue.user.html_url})`;
      return markdown;
    }
  }

  public renderContributorList(contributors: GitHubUserResponse[]) {
    const renderedContributors = contributors.map((contributor) => `- ${this.renderContributor(contributor)}`).sort();

    return `#### Committers: ${contributors.length}\n${renderedContributors.join("\n")}`;
  }

  public renderContributor(contributor: GitHubUserResponse): string {
    const userNameAndLink = `[@${contributor.login}](${contributor.html_url})`;
    if (contributor.name) {
      return `${contributor.name} (${userNameAndLink})`;
    } else {
      return userNameAndLink;
    }
  }

  private groupByCategory(release: Release): CategoryInfo[] {
    return ["UI", "fix", "feat"].map((name) => {
      // Keep only the commits that have a matching label with the one
      // provided in the lerna.json config.
      let commits = release.commits.filter((commit) => {
        if (commit.categories && commit.categories.indexOf(name) !== -1) {
          return true;
        }
        const packageName = release.name.replace("@ant-design/pro-", "").split("@")[0];
        if (commit.message.includes(packageName)) {
          if (commit.message.includes(`${name}(`)) {
            return true;
          }
        }
      });
      return { name, commits };
    });
  }
}
