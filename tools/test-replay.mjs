#!/usr/bin/env node
// Real exported runs establish parity; explicitly synthetic fixtures cover rare branches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { selectToken, defaultThresholds, attributedStopIndex, ATTRIBUTION_TOLERANCE } from '../app/selection.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const dataText = read('app/experiment-data.json');
const data = JSON.parse(dataText);
const policyText = read('app/category-policy.json');
const policy = JSON.parse(policyText);
const reference = JSON.parse(read('experiments/replay-checks.json'));
const sha256 = text => createHash('sha256').update(text).digest('hex');
assert.equal(reference.dataSha256, sha256(dataText), 'Reference decisions must match this exact data export.');
assert.equal(reference.policySha256, sha256(policyText), 'Policy changed; rerun the local exporter.');
assert.equal(data.metadata.attributionTolerance, ATTRIBUTION_TOLERANCE);
assert.equal(data.metadata.studyType, 'exploratory');
assert.equal(data.metadata.lockedTestSet, false);
assert.equal(data.schemaVersion, 1);
assert.deepEqual(data.metadata.baselines, ['zero', 'mean', 'space']);
assert.ok(!/\/Users\/|\/home\/|[A-Z]:\\Users\\/.test(dataText), 'Export must not disclose private local paths.');

const comparable = result => ({
  selectedId: result.selected.id, status: result.status,
  sourceIndex: result.sourceIndex, groupId: result.groupId,
});
const cases = new Map(data.cases.map(example => [example.id, example]));
assert.equal(cases.size, data.cases.length);
for (const example of data.cases) {
  const candidates = new Map(example.candidates.map(candidate => [candidate.id, candidate]));
  assert.equal(candidates.size, example.candidates.length);
  for (const candidate of example.candidates) {
    assert.ok(Number.isFinite(candidate.p) && candidate.p >= 0 && candidate.p <= example.original.p);
  }
  assert.ok(example.candidates.reduce((sum, candidate) => sum + candidate.p, 0) <= 1 + 1e-12);
  assert.deepEqual(candidates.get(example.original.id), example.original);
  for (const candidate of example.top) assert.deepEqual(candidates.get(candidate.id), candidate);
  for (const group of policy.groups) {
    assert.ok(Array.isArray(example.categoryMembers[group.id]));
    assert.equal(new Set(example.categoryMembers[group.id]).size, example.categoryMembers[group.id].length);
    for (const id of example.categoryMembers[group.id]) assert.ok(candidates.has(id));
  }
  for (const input of example.inputs) {
    assert.equal(input.originalDrops.length, 3);
    assert.ok(input.originalDrops.every(Number.isFinite));
    for (const id of input.supportedIds) assert.ok(candidates.has(id));
  }
  assert.ok(Math.abs(example.inputs.reduce((sum, input) => sum + input.attention, 0) - 1) < 1e-6);
  assert.equal(example.attributionPasses, 3 * example.inputs.length);
  assert.equal(attributedStopIndex(example), example.stopIndex);
  assert.deepEqual(comparable(selectToken(example, policy)), example.recorded, `${example.id}: default selection`);
}
for (const check of reference.checks) {
  const example = cases.get(check.caseId);
  assert.ok(example, `Unknown case ${check.caseId}`);
  assert.equal(check.stochastic, false, 'Real-data parity fixture contains a random tie; compare its possible branches explicitly.');
  const result = selectToken(example, policy, check.thresholds);
  const label = `${check.caseId} ${JSON.stringify(check.thresholds)}`;
  assert.deepEqual(comparable(result), check.expected, label);
  assert.deepEqual(result.trace.map(step => ({ sourceIndex: step.sourceIndex,
    primaryGroupId: step.primaryGroupId, status: step.status })), check.trace, `${label}: full traversal`);
}
assert.equal(JSON.stringify(data), JSON.stringify(JSON.parse(dataText)), 'Replay must not mutate recorded data.');

// Synthetic unit fixtures below are not experimental observations or uploaded data.
const makeCandidate = (id, p) => ({ id, text: ` synthetic-${id}`, p });
function syntheticExample() {
  const original = makeCandidate(0, 0.1);
  return {
    id: 'synthetic-only', prompt: 'Synthetic test prompt', original, top: [original],
    candidates: [original, makeCandidate(1, 0.096), makeCandidate(2, 0.06), makeCandidate(3, 0.05)],
    categoryMembers: { food: [1, 2, 3], body: [0] },
    inputs: [
      { index: 0, text: 'higher', attention: 0.6, originalDrops: [0.1, 0.1, 0.1], supportedIds: [1, 2, 3] },
      { index: 1, text: 'stop', attention: 0.2, originalDrops: [2, 2, 2], supportedIds: [0, 1, 2, 3] },
      { index: 2, text: 'equal', attention: 0.2, originalDrops: [0.3, 0.3, 0.3], supportedIds: [1, 2, 3] },
    ], stopIndex: 1, baselineSourceIndices: [1, 1, 1], attributionPasses: 9,
    recorded: { selectedId: 1, status: 'changed', sourceIndex: 0, groupId: 'food' },
  };
}
const syntheticPolicy = {
  version: 3, thresholds: policy.thresholds,
  groups: [{ id: 'food', label: 'Synthetic food', members: ['a'] }, { id: 'body', label: 'Synthetic body', members: ['b'] }],
};
const thresholds = defaultThresholds(syntheticPolicy);
let unitChecks = 0;
function test(label, run) {
  try { run(); unitChecks += 1; } catch (error) { error.message = `${label}: ${error.message}`; throw error; }
}
test('both gates pass', () => assert.equal(selectToken(syntheticExample(), syntheticPolicy, thresholds).selected.id, 1));
test('empty group and strict attention stopping', () => {
  const example = syntheticExample();
  example.inputs[0].supportedIds = [];
  const result = selectToken(example, syntheticPolicy, thresholds);
  assert.equal(result.status, 'accepted_original');
  assert.deepEqual(result.trace.map(step => [step.sourceIndex, step.status]), [[0, 'no_association']]);
});
test('disagreement on original source keeps original', () => {
  const example = syntheticExample(); example.inputs[0].originalDrops[0] = 3;
  assert.equal(selectToken(example, syntheticPolicy, thresholds).status, 'uncertain_source');
});
test('non-unique or tiny original attribution keeps original', () => {
  for (const value of [2, 2 - 5e-7]) {
    const example = syntheticExample(); example.inputs[0].originalDrops = [value, value, value];
    assert.equal(selectToken(example, syntheticPolicy, thresholds).status, 'uncertain_source');
  }
  const example = syntheticExample(); example.inputs.forEach(input => { input.originalDrops = [1e-7, 1e-7, 1e-7]; });
  assert.equal(selectToken(example, syntheticPolicy, thresholds).status, 'uncertain_source');
});
test('mass and candidate gates are distinct', () => {
  const mass = selectToken(syntheticExample(), syntheticPolicy, { ...thresholds, minGroupRatio: 3 });
  const gap = selectToken(syntheticExample(), syntheticPolicy, { ...thresholds, maxRelativeGap: 0.01 });
  assert.equal(mass.trace[0].status, 'small_group_mass');
  assert.equal(gap.trace[0].status, 'wide_gap');
});
test('gate equality is inclusive', () => {
  const example = syntheticExample();
  const group = selectToken(example, syntheticPolicy, thresholds).trace[0].groups[0];
  assert.equal(selectToken(example, syntheticPolicy, { minGroupRatio: group.ratio, maxRelativeGap: group.gap }).changed, true);
});
test('only primary group is tested; best candidate original is skipped', () => {
  const example = syntheticExample();
  example.candidates.push(makeCandidate(4, 0.09), makeCandidate(5, 0.08));
  example.categoryMembers.body = [0, 4, 5];
  example.inputs[0].supportedIds = [0, 1, 2, 3, 4, 5];
  const result = selectToken(example, syntheticPolicy, thresholds);
  assert.equal(result.status, 'accepted_original');
  assert.equal(result.trace[0].status, 'original_candidate');
});
test('failed primary does not fall back to a smaller passing group', () => {
  const example = syntheticExample();
  example.candidates.push(makeCandidate(4, 0.08), makeCandidate(5, 0.08), makeCandidate(6, 0.08));
  example.categoryMembers.body = [4, 5, 6];
  example.inputs[0].supportedIds = [1, 2, 3, 4, 5, 6];
  const result = selectToken(example, syntheticPolicy, thresholds);
  assert.equal(result.trace[0].primaryGroupId, 'body');
  assert.equal(result.trace[0].status, 'wide_gap');
  assert.equal(result.changed, false);
});
test('failed earlier input continues to next higher-attention input', () => {
  const example = syntheticExample(); example.inputs[0].supportedIds = [];
  example.inputs[2].attention = 0.3;
  const result = selectToken(example, syntheticPolicy, thresholds);
  assert.equal(result.sourceIndex, 2);
  assert.deepEqual(result.trace.map(step => step.status), ['no_association', 'changed']);
});
test('group mass ties use the best probability then marked random selection', () => {
  const example = syntheticExample();
  example.candidates.push(makeCandidate(4, 0.08), makeCandidate(5, 0.07), makeCandidate(6, 0.056));
  example.categoryMembers.body = [4, 5, 6]; example.inputs[0].supportedIds = [1, 2, 3, 4, 5, 6];
  let result = selectToken(example, syntheticPolicy, thresholds);
  assert.equal(result.groupId, 'food'); assert.equal(result.trace[0].tieBreaker, 'best_candidate');
  example.candidates.find(candidate => candidate.id === 4).p = 0.096;
  example.candidates.find(candidate => candidate.id === 5).p = 0.06;
  example.candidates.find(candidate => candidate.id === 6).p = 0.05;
  const originalRandom = Math.random;
  try {
    const selectedGroups = [];
    for (const randomValue of [0, 0.999]) {
      Math.random = () => randomValue;
      result = selectToken(example, syntheticPolicy, thresholds);
      assert.equal(result.status, 'changed_random_tie'); assert.equal(result.hasRandomTie, true);
      selectedGroups.push(result.groupId);
    }
    assert.deepEqual(selectedGroups.sort(), ['body', 'food']);
  } finally { Math.random = originalRandom; }
});
test('within-group ties select smaller token ID and duplicate IDs count once', () => {
  const example = syntheticExample(); example.candidates[2].p = 0.096;
  example.categoryMembers.food = [2, 1, 1, 3];
  const result = selectToken(example, syntheticPolicy, thresholds);
  assert.equal(result.selected.id, 1);
  assert.equal(result.trace[0].groups[0].members.length, 3);
});
test('unsupported prompt ending and invalid thresholds', () => {
  const example = syntheticExample(); example.prompt += '\n';
  assert.equal(selectToken(example, syntheticPolicy, thresholds).status, 'unsupported_boundary');
  assert.throws(() => selectToken(syntheticExample(), syntheticPolicy, { minGroupRatio: 1, maxRelativeGap: 0.1 }));
});
console.log(`Passed: ${data.cases.length} real default decisions, ${reference.checks.length} Python reference decisions, ${unitChecks} synthetic branch checks.`);
