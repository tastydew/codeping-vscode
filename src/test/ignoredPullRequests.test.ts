import { strict as assert } from "node:assert";
import { test } from "node:test";
import { installVscodeStub } from "./helpers/vscodeStub";

// Stub a minimal context with globalState
const makeContext = () => {
  const store: Record<string, any> = {};
  return {
    globalState: {
      get: (key: string, defaultValue?: any) => (key in store ? store[key] : defaultValue),
      update: async (key: string, value: any) => {
        store[key] = value;
      }
    }
  } as any;
};

installVscodeStub();

const samplePrs = [
  { id: 1, number: 101, title: "A", url: "", repository: "org/repo", author: "a", createdAt: "", updatedAt: "", reviewers: [], assignees: [], labels: [] },
  { id: 2, number: 102, title: "B", url: "", repository: "org/repo", author: "b", createdAt: "", updatedAt: "", reviewers: [], assignees: [], labels: [] }
];

const ignored = new Set<number>([2, 3]);

test("splitIgnoredPullRequests separates open and ignored and prunes missing ids", async () => {
  const { splitIgnoredPullRequests } = await import("../extension");
  const { openPrs, ignoredPrs, cleanedIgnored } = splitIgnoredPullRequests(samplePrs as any, ignored);
  assert.equal(openPrs.length, 1);
  assert.equal(openPrs[0].id, 1);
  assert.equal(ignoredPrs.length, 1);
  assert.equal(ignoredPrs[0].id, 2);
  assert.deepEqual(Array.from(cleanedIgnored), [2]);
});

test("load/save ignored pull requests round trips state", async () => {
  const { saveIgnoredPullRequests, loadIgnoredPullRequests } = await import("../extension");
  const context = makeContext();
  await saveIgnoredPullRequests(context as any, new Set([5, 6]));
  const loaded = loadIgnoredPullRequests(context as any);
  assert.deepEqual(new Set([5, 6]), loaded);
});
