import { GitHubUserResponse } from "./github-api";
import { CommitInfo, Release } from "./interfaces";
import { writeFileSync } from "fs";
import { join } from "path";
import { cwd } from "process";

const prettier = require("prettier");

const UNRELEASED_TAG = "___unreleased___";
const COMMIT_FIX_REGEX = /(fix|close|resolve)(e?s|e?d)? [T#](\d+)/i;

interface CategoryInfo {
  name: string | undefined;
  commits: CommitInfo[];
}

interface Options {
  categories: string[];
  baseIssueUrl: string;
  repoUrl: string;
  unreleasedName: string;
  logPath?: string;
}

export default class MarkdownRenderer {
  private options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  public renderMarkdown(releases: Release[]) {
    const group: {
      [key: string]: Release[];
    } = {};

    releases.forEach((releases) => {
      const names = releases.name.split("@");
      names.pop();
      if (group[names.join("").replace("ant-design/", "")]) {
        group[names.join("").replace("ant-design/", "")].push(releases);
      } else {
        group[names.join("").replace("ant-design/", "")] = [releases];
      }
      return releases;
    });

    Object.keys(group).forEach((key) => {
      console.log(`${key}.changelog.md`);
      const output = group[key]
        .map((release) => this.renderRelease(release))
        .filter(Boolean)
        .join("\n\n");

      writeFileSync(
        join(process.cwd(), `${key}.changelog.md`),
        prettier.format(
          `
---
title: ${key}
nav:
  title: Change Log
  path: /changelog
group:
  path: /
---

# Change Log
        \n${output}`,
          {
            printWidth: 80,
            parser: "markdown",
          }
        )
      );
    });
    return "";
    // return output ? `\n${output}` : "";
  }

  public renderRelease(release: Release): string | undefined {
    // Group commits in release by category
    const categories = release.commits;

    // Skip this iteration if there are no commits available for the release
    if (categories.length === 0) return "";

    const releaseTitle = release.name === UNRELEASED_TAG ? this.options.unreleasedName : release.name;

    let markdown = `## ${releaseTitle}\n\n \`${release.date}\` \n\n`;

    markdown += this.renderContributionList(release.commits);

    return markdown;
  }

  public renderPackageNames(packageNames: string[]) {
    return packageNames.length > 0 ? packageNames.map((pkg) => `\`${pkg}\``).join(", ") : "Other";
  }

  public renderContributionList(commits: CommitInfo[], prefix: string = ""): string {
    return commits
      .map((commit) => this.renderContribution(commit))
      .filter(Boolean)
      .map((rendered) => `${prefix}- ${rendered}`)
      .join("\n");
  }

  public renderContribution(commit: CommitInfo): string | undefined {
    const issue = commit.githubIssue;
    if (issue) {
      let markdown = "";

      if (issue.title && issue.title.match(COMMIT_FIX_REGEX)) {
        issue.title = issue.title.replace(COMMIT_FIX_REGEX, `Closes [#$3](${this.options.baseIssueUrl}$3)`);
      }

      markdown += `${issue.title} ([@${issue.user.login}](${issue.user.html_url}))`;

      if (issue.number && issue.pull_request && issue.pull_request.html_url) {
        const prUrl = issue.pull_request.html_url;
        markdown += `[#${issue.number}](${prUrl}) `;
      }
      markdown += "\n";
      return markdown;
    }
    if (!commit.message.includes("chore(release)")) {
      // commitSHA: '8bab9e51',
      // message: '🔥 clean: remove unuse code',
      // tags: undefined,
      // issueNumber: null,
      // date: '2020-08-04',
      // categories: [],
      let markdown = "";
      markdown += `${commit.message} [#${commit.commitSHA}](${this.options.repoUrl}/commit/${commit.commitSHA}) `;
      return markdown;
    }
  }

  public renderContributorList(contributors: GitHubUserResponse[]) {
    return "";
  }

  public renderContributor(contributor: GitHubUserResponse): string {
    const userNameAndLink = `[@${contributor.login}](${contributor.html_url})`;
    if (contributor.name) {
      return `${contributor.name} (${userNameAndLink})`;
    } else {
      return userNameAndLink;
    }
  }

  private hasPackages(commits: CommitInfo[]) {
    return commits.some((commit) => commit.packages !== undefined && commit.packages.length > 0);
  }
}
