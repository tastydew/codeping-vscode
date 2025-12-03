import { strict as assert } from "node:assert";
import { test } from "node:test";
import { installVscodeStub } from "./helpers/vscodeStub";

const restore = installVscodeStub();
const { PullRequestProvider } = require("../../out/pullRequestProvider");

const sampleOpen = [
  {
    id: 1,
    number: 10,
    title: "Fix login",
    url: "https://example.com/1",
    repository: "org/app",
    author: "alice",
    createdAt: "2023-01-01T00:00:00Z",
    updatedAt: "2023-01-02T00:00:00Z",
    reviewers: [],
    assignees: [],
    labels: []
  },
  {
    id: 2,
    number: 11,
    title: "Improve docs",
    url: "https://example.com/2",
    repository: "org/docs",
    author: "bob",
    createdAt: "2023-01-03T00:00:00Z",
    updatedAt: "2023-01-04T00:00:00Z",
    reviewers: ["charlie"],
    assignees: ["dana"],
    labels: ["docs"]
  }
];

const sampleIgnored = [
  {
    id: 3,
    number: 12,
    title: "Legacy cleanup",
    url: "https://example.com/3",
    repository: "org/app",
    author: "erin",
    createdAt: "2023-01-05T00:00:00Z",
    updatedAt: "2023-01-06T00:00:00Z",
    reviewers: ["frank"],
    assignees: [],
    labels: ["maintenance"]
  }
];

test("pull request provider groups open and ignored", async () => {
  const provider = new PullRequestProvider();
  provider.setPullRequests(sampleOpen, sampleIgnored);

  const root = await provider.getChildren();
  assert.equal(root.length, 2);
  assert.equal(root[0].label, "Open Review Requests");
  assert.equal(root[1].label, "Ignored Pull Requests");

  const openRepos = await provider.getChildren(root[0]);
  assert.equal(openRepos.length, 2);
  const ignoredRepos = await provider.getChildren(root[1]);
  assert.equal(ignoredRepos.length, 1);

  const ignoredItems = await provider.getChildren(ignoredRepos[0]);
  assert.equal(ignoredItems[0].contextValue, "codeping.pullRequest.ignored");
});

test("pull request provider includes info children", async () => {
  const provider = new PullRequestProvider();
  provider.setPullRequests(sampleOpen, sampleIgnored);

  const root = await provider.getChildren();
  const openRepos = await provider.getChildren(root[0]);
  const openPrs = await provider.getChildren(openRepos[0]);
  const infoItems = await provider.getChildren(openPrs[0]);

  const labelsItem = infoItems.find((i: any) => i.label === "Labels");
  assert.ok(labelsItem);
  assert.equal(labelsItem.description, "None");
});

restore();
