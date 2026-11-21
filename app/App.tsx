import { useState } from 'react';
import { selectToken, type Candidate, type ExperimentCase, type Policy } from './selection';
import experimentData from './experiment-data.json';
import categoryPolicy from './category-policy.json';
import './App.css';

const METHOD_NAME = 'Semantic Category-Guided Next-Token Selection';
const cases = experimentData.cases as ExperimentCase[];
const policy = categoryPolicy as Policy;
const defaults = {
  minGroupRatio: policy.thresholds.min_group_mass_ratio,
  maxRelativeGap: policy.thresholds.max_relative_gap,
};
const percent = (value: number, digits = 2) => `${(value * 100).toFixed(digits)}%`;
const word = (value: string) => value.trim() || '␠';
const statusKey = (value: string) => value.replace(/_random_tie$/, '');
const statusLabel = (value: string) => ({
  changed: 'Replacement accepted',
  accepted_original: 'Original retained',
  uncertain_source: 'Source estimates disagree',
  original_candidate: 'Best member is the original',
  small_group_mass: 'Category mass below threshold',
  wide_gap: 'Best candidate too far behind',
  no_association: 'No supported category members',
  raw: 'Raw greedy selection',
  unsupported_boundary: 'Boundary not supported',
} as Record<string, string>)[statusKey(value)] || value.replace(/_/g, ' ');

function Arrow({ className = '' }: { className?: string }) {
  return <svg className={className} width="42" height="24" viewBox="0 0 42 24" fill="none" aria-hidden="true"><path d="M1 12h37M28 2l10 10-10 10" stroke="currentColor" strokeWidth="2" /></svg>;
}

function ProbabilityBars({ candidates, originalId, selectedId }: { candidates: Candidate[]; originalId: number; selectedId: number }) {
  const maximum = Math.max(0.05, Math.ceil(Math.max(...candidates.map(candidate => candidate.p)) * 20) / 20);
  return <div className="bar-chart" role="group" aria-label="Top eight next-token candidates. Original model probability in percent; all bars start at zero.">
    <div className="bar-axis" aria-hidden="true"><span>0%</span><span>{percent(maximum, 0)}</span></div>
    <ol className="bars">
      {candidates.map(candidate => <li className="bar-row" key={candidate.id}>
        <span className="bar-label"><code>{word(candidate.text)}</code>{candidate.id === originalId && <span className="sr-only">, original winner</span>}{candidate.id === selectedId && <span className="sr-only">, selected</span>}</span>
        <span className="bar-track"><span className={`bar-fill ${candidate.id === selectedId ? 'is-selected' : candidate.id === originalId ? 'is-original' : ''}`} style={{ width: `${candidate.p / maximum * 100}%` }} /></span>
        <span className="bar-value">{percent(candidate.p)}</span>
      </li>)}
    </ol>
    <p className="chart-note"><span className="legend-dot teal" /> Current selection {originalId !== selectedId && <><span className="legend-dot navy" /> Original winner</>}</p>
  </div>;
}

function AttentionBars({ experiment }: { experiment: ExperimentCase }) {
  const sorted = [...experiment.inputs].sort((a, b) => b.attention - a.attention || a.index - b.index);
  return <div className="bar-chart attention-chart" role="group" aria-label="Input attention, averaged over layers and heads. Percent; all bars start at zero.">
    <div className="bar-axis" aria-hidden="true"><span>0%</span><span>100%</span></div>
    <ol className="bars">
      {sorted.map(input => <li className={`bar-row ${input.index === experiment.stopIndex ? 'stop-row' : ''}`} key={input.index}>
        <span className="bar-label"><code>{word(input.text)}</code><span className="input-index">[{input.index}]</span>{input.index === experiment.stopIndex && <span className="sr-only">, stopping source</span>}</span>
        <span className="bar-track"><span className={`bar-fill ${input.index === experiment.stopIndex ? 'is-stop' : 'is-attention'}`} style={{ width: `${input.attention * 100}%` }} /></span>
        <span className="bar-value">{percent(input.attention)}</span>
      </li>)}
    </ol>
    <p className="chart-note"><span className="legend-dot gold" /> Estimated stopping source. Brackets show input positions.</p>
  </div>;
}

export default function App() {
  const [caseId, setCaseId] = useState(cases[0].id);
  const [parameters, setParameters] = useState(defaults);
  const [inspectedInput, setInspectedInput] = useState<number | null>(null);
  const [inspectedGroup, setInspectedGroup] = useState<string | null>(null);
  const experiment = cases.find(item => item.id === caseId) || cases[0];
  const result = selectToken(experiment, policy, parameters);
  const allResults = cases.map(item => ({ experiment: item, result: selectToken(item, policy, parameters) }));
  const changedCount = allResults.filter(item => item.result.changed).length;
  const stoppingInput = experiment.inputs.find(input => input.index === experiment.stopIndex);
  const activeStep = result.trace.find(step => step.sourceIndex === inspectedInput)
    || result.trace.find(step => step.sourceIndex === result.sourceIndex) || result.trace[0];
  const activeInput = experiment.inputs.find(input => input.index === activeStep?.sourceIndex);
  const activeGroup = activeStep?.groups.find(group => group.id === inspectedGroup)
    || activeStep?.groups.find(group => group.id === activeStep.primaryGroupId);
  const largestMass = Math.max(0.05, Math.ceil(Math.max(0, ...(activeStep?.groups.map(group => group.mass) || [])) * 20) / 20);
  const initial = selectToken(cases[0], policy, defaults);
  const isDefault = parameters.minGroupRatio === defaults.minGroupRatio && parameters.maxRelativeGap === defaults.maxRelativeGap;

  function chooseCase(id: string) {
    setCaseId(id);
    setInspectedInput(null);
    setInspectedGroup(null);
  }

  function changeParameter(name: keyof typeof defaults, value: number) {
    setParameters(current => ({ ...current, [name]: value }));
    setInspectedInput(null);
    setInspectedGroup(null);
  }

  return <div className="site-shell">
    <a className="skip-link" href="#experiment">Skip to the interactive experiment</a>
    <header className="site-header">
      <a className="wordmark" href="#top"><span className="mark" aria-hidden="true"><i /><i /><i /></span>Probability for AI</a>
      <nav aria-label="Main navigation"><a href="#experiment">Experiment</a><a href="#model">Method</a><a href="#findings">Findings</a></nav>
    </header>

    <main id="top">
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="small-dot" /> An exploratory final project</p>
          <h1 id="page-title">Beyond the<br /><em>top token.</em></h1>
          <p className="hero-subtitle">{METHOD_NAME}</p>
          <p className="hero-description">A model may spread its probability across many related words. Can their combined probability help us choose a better continuation?</p>
          <a className="primary-link" href="#experiment">Explore the experiment <span aria-hidden="true">↗</span></a>
        </div>
        <div className="hero-demonstration" aria-label="Default example: I put ketchup on my. The original winner is face; the selection rule chooses salad.">
          <p className="eyebrow">One prompt. Two decisions.</p>
          <p className="hero-prompt">I put ketchup{' '}<br />on my <span className="prompt-cursor" aria-hidden="true" /></p>
          <div className="hero-transition">
            <div><span className="token-caption">Greedy choice</span><span className="hero-token">{word(cases[0].original.text)}</span><span className="token-probability">{percent(cases[0].original.p)} probability</span></div>
            <Arrow className="hero-arrow" />
            <div className="accent"><span className="token-caption">With the rule</span><span className="hero-token">{word(initial.selected.text)}</span><span className="token-probability">{percent(initial.selected.p)} probability</span></div>
          </div>
          <p className="hero-footnote">The decision changes. The model probabilities do not.</p>
        </div>
      </section>

      <div className="project-strip"><span><strong>GPT-2 Small</strong> pretrained model</span><span><strong>{cases.length} prompts</strong> recorded observations</span><span><strong>0 weight updates</strong> inference-time selection</span></div>

      <section className="intro-section section-grid" aria-labelledby="question-heading">
        <p className="section-kicker">01 / The question</p>
        <div><h2 id="question-heading">What if the probability<br className="desktop-break" /> is there, but spread out?</h2>
          <p className="lead">In “I put ketchup on my”, <code>face</code> is the most probable next token. Yet <code>salad</code>, <code>burger</code>, and <code>sandwich</code> are natural alternatives in an ordinary food context.</p>
          <p>The hypothesis: a high-attention input might support several members of the same semantic category. Each member may lose to a concentrated single winner, even when their combined probability is substantial. This project tests a rule for recognizing that pattern.</p>
          <p className="quiet-note">The initial guess focused on <code>ketchup</code>. In the recorded correction, the rule actually passes while examining <code>I</code>, with <code>my</code> as the estimated stopping source.</p>
        </div>
      </section>

      <section id="experiment" className="experiment-section" aria-labelledby="experiment-heading">
        <div className="section-heading"><div><p className="section-kicker">02 / Interactive experiment</p><h2 id="experiment-heading">Replay the decision.</h2></div><span className="data-tag"><span className="small-dot" /> Recorded model outputs</span></div>
        <p className="section-description">Choose a prompt and adjust the two selection parameters. The browser replays the rule using recorded probabilities and attribution measurements; it does not run GPT-2.</p>

        <div className="experiment-controls">
          <div className="prompt-control"><label htmlFor="prompt-select">Prompt</label><select id="prompt-select" value={caseId} onChange={event => chooseCase(event.target.value)}>{cases.map(item => <option key={item.id} value={item.id}>{item.prompt}</option>)}</select></div>
          <div className="parameter-grid">
            <div className="parameter-control"><div className="parameter-title"><label htmlFor="ratio">R · Minimum category-mass ratio</label><output htmlFor="ratio">{parameters.minGroupRatio.toFixed(2)}×</output></div><input id="ratio" type="range" min="1.01" max="5" step="0.01" value={parameters.minGroupRatio} onChange={event => changeParameter('minGroupRatio', Number(event.target.value))} aria-describedby="ratio-help" aria-valuetext={`${parameters.minGroupRatio.toFixed(2)} times the original winner's probability`} /><p id="ratio-help">The supported group must have at least R times the original winner’s probability.</p></div>
            <div className="parameter-control"><div className="parameter-title"><label htmlFor="gap">δ · Maximum candidate deficit</label><output htmlFor="gap">{parameters.maxRelativeGap.toFixed(2)} <span>({percent(parameters.maxRelativeGap, 0)})</span></output></div><input id="gap" type="range" min="0" max="1" step="0.01" value={parameters.maxRelativeGap} onChange={event => changeParameter('maxRelativeGap', Number(event.target.value))} aria-describedby="gap-help" aria-valuetext={`${percent(parameters.maxRelativeGap, 0)} maximum relative deficit`} /><p id="gap-help">The group’s best member may trail the original winner by at most this relative amount.</p></div>
          </div>
          <div className="controls-bottom"><span>{isDefault ? 'Using the project’s original experimental defaults.' : 'Exploring different selection parameters.'}</span><button className="text-button" type="button" onClick={() => { setParameters(defaults); setInspectedInput(null); setInspectedGroup(null); }} disabled={isDefault}>Reset defaults <span aria-hidden="true">↺</span></button></div>
        </div>

        <div className={`decision-banner ${result.changed ? 'decision-changed' : ''}`} aria-live="polite" aria-atomic="true">
          <div className="decision-heading"><span className="eyebrow">{result.changed ? 'A different continuation' : 'The original continuation'}</span><span className="result-status">{statusLabel(result.status)}</span></div>
          <div className="decision-pair"><div><span className="token-caption">Original winner</span><strong>{word(experiment.original.text)}</strong><span>{percent(experiment.original.p, 4)}</span></div><Arrow /><div className={result.changed ? 'accent' : ''}><span className="token-caption">Selected token</span><strong>{word(result.selected.text)}</strong><span>{percent(result.selected.p, 4)}</span></div></div>
          <p>{result.changed ? 'Both probability conditions pass at an eligible input. The selected token keeps its own original model probability.' : statusKey(result.status) === 'uncertain_source' ? 'The reference replacements do not agree on one stopping source, so category checks are not entered.' : 'No eligible alternative passes the selection rule before the stopping source.'}</p>
          {result.hasRandomTie && <p className="quiet-note">Both category mass and best-member probability are tied. The rule chooses randomly among the tied groups, so this result may vary.</p>}
        </div>

        <div className="distribution-grid">
          <section className="chart-section" aria-labelledby="candidates-heading"><div className="chart-title"><h3 id="candidates-heading">The next-token distribution</h3><span>Top {experiment.top.length}</span></div><p>Original probability · %</p><ProbabilityBars candidates={experiment.top} originalId={experiment.original.id} selectedId={result.selected.id} /><p className="chart-description">These are the highest-probability individual tokens; labels omit leading spaces. The list is not the full vocabulary, and it does not limit the configured candidates used by the rule.</p></section>
          <section className="chart-section" aria-labelledby="attention-heading"><div className="chart-title"><h3 id="attention-heading">Which inputs are examined?</h3></div><p>Mean input attention · %</p><AttentionBars experiment={experiment} /><p className="chart-description">Attention is averaged over all layers and heads at the final input position. It orders the search; it is not an output-specific contribution measure.</p></section>
        </div>

        <div className="trace-heading"><div><p className="section-kicker">Follow the rule</p><h3>The decision, step by step.</h3></div><p>{stoppingInput ? <>Stop before <code>{word(stoppingInput.text)}</code> [{stoppingInput.index}]. Only inputs with strictly higher attention are eligible.</> : <>No agreed stopping source. The original token is retained before category comparisons.</>}</p></div>
        {result.trace.length > 0 ? <div className="trace-layout">
          <ol className="trace-list" aria-label="Examined input tokens in attention order">{result.trace.map((step, index) => {
            const source = experiment.inputs.find(input => input.index === step.sourceIndex);
            const group = step.groups.find(item => item.id === step.primaryGroupId);
            return <li key={step.sourceIndex}><button type="button" className={`trace-step ${activeStep?.sourceIndex === step.sourceIndex ? 'active-step' : ''}`} aria-pressed={activeStep?.sourceIndex === step.sourceIndex} onClick={() => { setInspectedInput(step.sourceIndex); setInspectedGroup(null); }}>
              <span className="step-number">{index + 1}</span><span className="step-content"><span className="step-title"><code>{word(source?.text || '')}</code><span>{percent(source?.attention || 0)} attention</span></span><span className="step-category">{group?.label || 'No active category'}</span><span className={`step-status ${statusKey(step.status) === 'changed' ? 'accent' : ''}`}>{statusLabel(step.status)}</span>{group?.best && statusKey(step.status) !== 'original_candidate' && <span className="step-metrics">Mass {group.ratio.toFixed(3)}× · deficit {percent(group.gap, 2)}</span>}</span><span className="step-arrow" aria-hidden="true">↗</span>
            </button></li>;
          })}</ol>
          <div className="group-inspector"><div className="inspector-heading"><p className="eyebrow">Inside input <code>{word(activeInput?.text || '')}</code></p><h4>Supported category probability</h4><p>Original probabilities summed within each group.</p></div>
            <div className="group-axis" aria-hidden="true"><span>0%</span><span>{percent(largestMass, 0)}</span></div>
            <div className="group-bars" role="group" aria-label="Supported category probabilities. All bars start at zero; values are percent.">{activeStep?.groups.map(group => <button type="button" key={group.id} className={`group-bar-button ${activeGroup?.id === group.id ? 'active-group' : ''}`} onClick={() => setInspectedGroup(group.id)} aria-pressed={activeGroup?.id === group.id} aria-label={`${group.label}, ${percent(group.mass, 4)}. Show included members.`}><span className="group-bar-title"><span>{group.label}{group.id === activeStep.primaryGroupId ? ' · largest' : ''}</span><strong>{percent(group.mass, 3)}</strong></span><span className="group-track"><span style={{ width: `${group.mass / largestMass * 100}%` }} /></span></button>)}</div>
            {activeGroup && <div className="member-detail"><h4>{activeGroup.label}: included members</h4>{activeGroup.members.length > 0 ? <ul className="member-list">{activeGroup.members.map(member => <li key={member.id}><code>{word(member.text)}</code><span>{percent(member.p, 3)}</span></li>)}</ul> : <p>No configured member has positive support under all three replacements.</p>}<p>Each token ID counts once in this group. These values are not the input’s exclusive share of the candidates’ probabilities.</p></div>}
          </div>
        </div> : <div className="empty-trace"><span className="empty-symbol" aria-hidden="true">—</span><div><h4>No category checks for this prompt</h4><p>This is a conservative fallback, not evidence that other categories failed the probability thresholds or that the original choice is better.</p></div></div>}

        <details className="attribution-detail"><summary>Inspect the stopping-source measurements <span aria-hidden="true">+</span></summary><div className="detail-content"><p>One input embedding is replaced at a time. A positive natural-log probability drop means that the input supports the original winner relative to that replacement. All three replacements must agree on the same unique, positive maximum.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="Stopping-source measurements; scroll horizontally to see all columns"><table><caption>Natural-log probability drops for <code>{word(experiment.original.text)}</code>. Larger means more estimated support; these are not percentages.</caption><thead><tr><th scope="col">Input position / token</th>{experimentData.metadata.baselines.map(baseline => <th scope="col" key={baseline}>{baseline}</th>)}</tr></thead><tbody>{experiment.inputs.map(input => <tr key={input.index} className={input.index === experiment.stopIndex ? 'stopping-table-row' : ''}><th scope="row">[{input.index}] <code>{word(input.text)}</code>{input.index === experiment.stopIndex && ' · stop'}</th>{input.originalDrops.map((drop, index) => <td key={index}>{drop > 0 ? '+' : ''}{drop.toFixed(3)}</td>)}</tr>)}</tbody></table></div><p className="baseline-summary">Strongest sources by replacement: {experiment.baselineSourceIndices.map((index, order) => <span key={order}><strong>{experimentData.metadata.baselines[order]}</strong> → {index === null ? 'no unique positive source' : `${word(experiment.inputs.find(input => input.index === index)?.text || '')} [${index}]`}{order < experiment.baselineSourceIndices.length - 1 ? '; ' : '.'}</span>)}</p></div></details>
      </section>

      <section id="model" className="method-section section-grid" aria-labelledby="method-heading">
        <p className="section-kicker">03 / Probability model</p>
        <div><h2 id="method-heading">One distribution.<br />A different decision rule.</h2><p className="lead">Let T be the next token. GPT-2 assigns each possible token a probability given the complete prompt.</p>
          <div className="formula-block"><span className="formula">p(t) = P(T = t | prompt)</span><p>The original greedy choice t* is the token with the largest p(t). The model’s learned parameters are fixed throughout this experiment.</p></div>
          <div className="method-step"><span className="method-number">1</span><div><h3>Estimate a stopping source</h3><p>Replace each input token’s embedding with a zero vector, the average vocabulary embedding, and a space-token embedding. Keep the positions and other inputs unchanged. Measure how the original winner’s probability changes.</p><p className="inline-formula">Δ = ln p(original) − ln p(after replacement)</p><p>Use a stopping source only if all three replacements identify the same unique input with the largest positive drop. Otherwise, retain the original winner. This is an intervention-based estimate, not a unique causal explanation.</p></div></div>
          <div className="method-step"><span className="method-number">2</span><div><h3>Gather supported members</h3><p>Inspect inputs with attention strictly above the stopping source. For each input i, retain configured category members with positive drops under all three replacements. Weak positive support counts; a candidate may be supported by several inputs.</p><div className="inline-formula">S(i, G) = Σ p(t), for t in the supported group</div><p>This is the probability of the next token being one of those distinct token IDs. It covers the configured, supported subset—not every possible food expression. Sum each ID once within a group, and do not add group masses across input positions.</p></div></div>
          <div className="method-step"><span className="method-number">3</span><div><h3>Require both conditions</h3><p>Choose the group with the greatest supported probability mass. Let c be its highest-probability member. Compare that group’s mass with the original <em>single token</em>, then check how closely c trails it.</p><div className="gate-formulas"><div><span>Enough group probability</span><strong>S(i, G) / p(t*) ≥ R</strong></div><div><span>A competitive best member</span><strong>[p(t*) − p(c)] / p(t*) ≤ δ</strong></div></div><p>Select the first alternative that passes both conditions. If the best member is already t*, continue to the next eligible input. If no alternative passes, keep the original. Tied group masses are resolved by best-member probability, then random choice if still tied.</p></div></div>
          <aside className="method-note"><h3>Where the method acts</h3><p>This inference-time selection rule combines model attribution, attention ordering, and semantic category probability aggregation. It acts after softmax to choose the next token, keeping the original model probabilities unchanged. A group’s probability is never assigned to its selected member.</p></aside>
        </div>
      </section>

      <section id="findings" className="findings-section" aria-labelledby="findings-heading"><div className="section-heading"><div><p className="section-kicker">04 / What we observed</p><h2 id="findings-heading">Five prompts, still a hypothesis.</h2></div><div className="change-count"><strong>{changedCount}<span>/{cases.length}</span></strong><span>selections change<br />at the current parameters</span></div></div><p className="section-description">This replacement rate is descriptive, not an accuracy measurement. Every prompt below belongs to the exploratory set; none was held out as a locked test set.</p>
        <ol className="case-results" aria-label="All recorded prompts at the current selection parameters">{allResults.map(({ experiment: item, result: replay }, index) => <li key={item.id}><a href="#experiment" className={`case-row ${item.id === caseId ? 'current-case' : ''}`} onClick={() => chooseCase(item.id)} aria-label={`Inspect ${item.prompt}. ${word(item.original.text)} to ${word(replay.selected.text)}. ${statusLabel(replay.status)}.`}><span className="case-number">0{index + 1}</span><span className="case-prompt">{item.prompt}</span><span className="case-transition"><code>{word(item.original.text)}</code><span aria-hidden="true">→</span><code className={replay.changed ? 'accent' : ''}>{word(replay.selected.text)}</code></span><span className={`case-outcome ${replay.changed ? 'accent' : ''}`}>{replay.changed ? 'Changed' : 'Retained'}</span><span aria-hidden="true">↗</span></a></li>)}</ol>
        <div className="findings-grid"><div><h3>A useful observation</h3><p>At the default parameters, the ketchup example switches from <code>face</code> to <code>salad</code>. The supported food group at input <code>I</code> passes both gates.</p></div><div><h3>What remains unproven</h3><p>Five closely related prompts cannot establish better language quality, accuracy, or generalization. Category size and coverage affect the sums; embedding replacements can be unnatural. Attention alone does not establish causal influence.</p></div><div><h3>Possible next steps</h3><p>Future testing could define new prompts and a judgment rule before inspecting outputs, tune parameters on separate data, and evaluate useful corrections and unwanted changes on a locked test set. Another possible comparison is grouping alone versus grouping with attention ordering.</p></div></div>
      </section>

      <section className="provenance-section section-grid" aria-labelledby="provenance-heading"><p className="section-kicker">05 / Reproducibility</p><div><h2 id="provenance-heading">Sources, scope, and authorship.</h2><p><strong>Data:</strong> Author-generated GPT-2 outputs for the five prompts shown here, exported from the <a href="https://github.com/caotangkiss/semantic-category-calibration">{METHOD_NAME} project</a>. No separate dataset license has been assigned to these observed outputs.</p><p><strong>Model:</strong> <a href="https://huggingface.co/openai-community/gpt2">OpenAI GPT-2 Small on Hugging Face</a>. The model card lists the MIT license. No model weights are included or run in this website.</p><p><strong>Compute:</strong> The recorded attribution experiments add three full forward passes per input token, beyond the original model run. Moving the parameters here only repeats the selection logic over those saved measurements.</p><p><strong>AI disclosure:</strong> I proposed the idea, reviewed and revised the experiment write-up line by line, and interpreted the results. I am responsible for ensuring that the overall project and its public presentation reflect my ideas and what I wanted to test. Codex helped with implementation, experiments, and the website. Doubao contributed to early discussions.</p><p><strong>Positioning:</strong> This is an inference-time postprocessor. It can be discussed alongside Supervised Fine-Tuning and Preference Learning; I assign it lower priority than both.</p></div></section>
    </main>
    <footer className="site-footer"><span>Beyond the Top Token</span><span>Probability for AI · Exploratory final project</span><a href="#top">Back to top ↑</a></footer>
  </div>;
}
