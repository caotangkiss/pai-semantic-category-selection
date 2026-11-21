/** Offline replay of the recorded Python selection policy; no model inference. */
export type Candidate = { id: number; text: string; p: number };
export type Thresholds = { minGroupRatio: number; maxRelativeGap: number };
export type Policy = {
  version: number;
  thresholds: { min_group_mass_ratio: number; max_relative_gap: number };
  groups: { id: string; label: string; members: string[] }[];
};
export type RecordedDecision = {
  selectedId: number; status: string; sourceIndex: number | null; groupId: string | null;
};
export type ExperimentCase = {
  id: string;
  prompt: string;
  original: Candidate;
  top: Candidate[];
  candidates: Candidate[];
  categoryMembers: Record<string, number[]>;
  inputs: {
    index: number; text: string; attention: number;
    originalDrops: number[]; supportedIds: number[];
  }[];
  stopIndex: number | null;
  baselineSourceIndices: (number | null)[];
  attributionPasses: number;
  recorded: RecordedDecision;
};
export type GroupEvidence = {
  id: string; label: string; members: Candidate[];
  mass: number; ratio: number; gap: number; best: Candidate | null;
};
export type TraceStep = {
  sourceIndex: number;
  groups: GroupEvidence[];
  primaryGroupId: string | null;
  status: string;
  tieBreaker?: 'best_candidate' | 'random';
  tiedGroupIds?: string[];
};
export type Selection = {
  selected: Candidate;
  changed: boolean;
  status: string;
  sourceIndex: number | null;
  groupId: string | null;
  trace: TraceStep[];
  hasRandomTie: boolean;
};

// Kept equal to the Python algorithm; the exporter and parity test verify this.
export const ATTRIBUTION_TOLERANCE = 1e-6;
const isClose = (a: number, b: number, absolute: number) =>
  Math.abs(a - b) <= Math.max(1e-12 * Math.max(Math.abs(a), Math.abs(b)), absolute);
const atLeast = (value: number, threshold: number) => value >= threshold || isClose(value, threshold, 1e-12);

export function defaultThresholds(policy: Policy): Thresholds {
  return { minGroupRatio: policy.thresholds.min_group_mass_ratio, maxRelativeGap: policy.thresholds.max_relative_gap };
}

export function attributedStopIndex(example: ExperimentCase): number | null {
  if (!example.inputs.length) return null;
  const winners = example.baselineSourceIndices.map((_, baseline) => {
    const largest = Math.max(...example.inputs.map(input => input.originalDrops[baseline]));
    const tied = example.inputs.filter(input => Math.abs(input.originalDrops[baseline] - largest) <= ATTRIBUTION_TOLERANCE);
    return largest > ATTRIBUTION_TOLERANCE && tied.length === 1 ? tied[0].index : null;
  });
  return winners.length === 3 && winners[0] !== null && winners.every(index => index === winners[0]) ? winners[0] : null;
}

export function selectToken(example: ExperimentCase, policy: Policy, thresholds = defaultThresholds(policy)): Selection {
  if (policy.version !== 3) throw new Error('This replay requires category-policy version 3.');
  if (!Number.isFinite(thresholds.minGroupRatio) || thresholds.minGroupRatio <= 1 ||
      !Number.isFinite(thresholds.maxRelativeGap) || thresholds.maxRelativeGap < 0 || thresholds.maxRelativeGap > 1) {
    throw new Error('Require a category ratio above 1 and a relative gap between 0 and 1.');
  }
  const result: Selection = {
    selected: example.original, changed: false, status: '', sourceIndex: null,
    groupId: null, trace: [], hasRandomTie: false,
  };
  const finish = (status: string) => {
    result.status = result.hasRandomTie ? `${status}_random_tie` : status;
    return result;
  };
  if (!/[A-Za-z]/.test(example.prompt.slice(-1))) return finish('unsupported_boundary');
  const stopIndex = attributedStopIndex(example);
  const stop = example.inputs.find(input => input.index === stopIndex);
  if (!stop) return finish('uncertain_source');
  const candidates = new Map(example.candidates.map(candidate => [candidate.id, candidate]));
  const sources = example.inputs.filter(input => input.attention > stop.attention)
    .sort((a, b) => b.attention - a.attention || a.index - b.index);
  for (const source of sources) {
    const supported = new Set(source.supportedIds);
    const groups = policy.groups.map(group => {
      const memberIds = example.categoryMembers[group.id];
      if (!memberIds) throw new Error(`The export has no candidate mapping for category ${group.id}.`);
      const members = [...new Set(memberIds)].filter(id => supported.has(id)).map(id => {
        const candidate = candidates.get(id);
        if (!candidate) throw new Error(`The export is missing candidate ${id}.`);
        return candidate;
      }).sort((a, b) => b.p - a.p || a.id - b.id);
      const mass = members.reduce((sum, candidate) => sum + candidate.p, 0);
      const best = members[0] ?? null;
      return {
        id: group.id, label: group.label, members, mass,
        ratio: mass / example.original.p,
        gap: (example.original.p - (best?.p ?? 0)) / example.original.p, best,
      };
    });
    const step: TraceStep = { sourceIndex: source.index, groups, primaryGroupId: null, status: '' };
    result.trace.push(step);
    const active = groups.filter(group => group.members.length)
      .sort((a, b) => b.mass - a.mass || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!active.length) {
      step.status = 'no_association';
      continue;
    }
    const largest = active.filter(group => isClose(group.mass, active[0].mass, 1e-15));
    let group = largest[0];
    if (largest.length > 1) {
      const bestProbability = Math.max(...largest.map(group => group.best!.p));
      const closest = largest.filter(group => isClose(group.best!.p, bestProbability, 1e-15));
      step.tiedGroupIds = largest.map(group => group.id);
      step.tieBreaker = closest.length > 1 ? 'random' : 'best_candidate';
      group = closest.length > 1 ? closest[Math.floor(Math.random() * closest.length)] : closest[0];
      result.hasRandomTie ||= closest.length > 1;
    }
    step.primaryGroupId = group.id;
    let status: string;
    if (group.best!.id === example.original.id) status = 'original_candidate';
    else if (!atLeast(group.ratio, thresholds.minGroupRatio)) status = 'small_group_mass';
    else if (!atLeast(thresholds.maxRelativeGap, group.gap)) status = 'wide_gap';
    else status = 'changed';
    step.status = step.tieBreaker === 'random' ? `${status}_random_tie` : status;
    if (status === 'changed') {
      result.selected = group.best!;
      result.changed = true;
      result.sourceIndex = source.index;
      result.groupId = group.id;
      return finish(status);
    }
  }
  return finish('accepted_original');
}
