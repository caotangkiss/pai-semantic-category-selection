# Beyond the Top Token

## Question and hypothesis

This project explores Semantic Category-Guided Next-Token Selection, an inference-time postprocessing rule for choosing a next token after a language model has produced its probabilities. The question is whether several related candidates, individually less likely than the original winner, can collectively justify a different selection.

The motivating prompt is `I put ketchup on my`. GPT-2 favors `face`, while `salad`, `burger`, and `sandwich` are each less likely. In an ordinary eating context, a food continuation is the student's preference. The original hypothesis was that ketchup might receive higher attention than the input associated with face, with its support spread across several food candidates.

## Probability model and selection parameters

GPT-2 supplies a probability distribution over possible next tokens conditional on the full prompt. A token can be a word or part of a word. The original decision is the token with the largest probability. GPT-2's learned parameters and this original distribution remain unchanged.

The added rule has manually specified category membership and two adjustable parameters, stored in `app/category-policy.json`: the minimum category-mass ratio and maximum relative candidate deficit. The existing experimental defaults are 2 and 0.10. The category mass is the sum of original probabilities of distinct, configured, single-token members supported by the current input. It is not the probability of every possible food expression or the probability contributed exclusively by one input.

## Procedure

1. Run GPT-2 for the complete prompt and record next-token probabilities and input attention.
2. Replace each input embedding, one at a time, with zero, the mean vocabulary embedding, and the space-token embedding. Measure the original minus perturbed **natural-log probability** for each candidate. A positive decrease indicates support relative to that replacement.
3. Use a stopping source for the original winner only if all three baselines identify the same unique input with the largest positive decrease. Otherwise retain the original winner.
4. Inspect only inputs whose attention is strictly higher than that stopping source, in descending order. Keep configured candidates with positive support under all three baselines and select the category with the largest summed original probability. Resolve a category-mass tie by its best member's probability, then by random choice if still tied.
5. Replace the original winner with the chosen group's best member only if that member is different, the group mass is at least the configured multiple of the winner's probability, and the member's relative deficit is within the configured limit. Stop at the first passing replacement. Otherwise retain the original winner after the eligible inputs are exhausted.

## Evidence and interaction

The five prompts in `experiments/cases.json` are the existing ketchup, mustard, article, cream, and pronoun variations. They were previously explored. They are not independent validation data or a locked test set, and this project does not add new evaluation cases.

In the local export, `I put ketchup on my` changes from `face` (4.045409%) to `salad` (3.703902%). The supported food group at `I` sums to 8.208383%, about 2.029 times the original winner, while salad trails by 8.442% in relative terms. The replacement occurs while inspecting `I`, rather than `etchup`, which surprised the student. The three attribution baselines agree on `my` as the stopping source. With the default thresholds, the mustard, cream, and her variations keep `face`; the article variation keeps `piece` because the source estimates disagree. The website's displayed measurements come from the exported local runs.

The browser replays the decision using recorded candidate probabilities, attention, and support relationships. Changing a selection parameter can change the selected token and the decision trace. It does not rerun GPT-2, recompute attribution, or change the probabilities. The site has no arbitrary-prompt inference service and no runtime network requests.

## Interpretation and limitations

These examples demonstrate how the specified rule can replace or retain a token. They do not establish that ketchup causes the hypothesized probability dispersion, that attention ordering improves results, or that the rule improves accuracy on new prompts. Attention and baseline-dependent attribution are different measurements; neither uniquely identifies a candidate's causal origin.

The method guides next-token selection using semantic categories while preserving the model's original probabilities. It has not been evaluated for probability calibration on labeled held-out data and does not establish improved probability calibration.

Manual categories cover only part of the vocabulary. Group size and membership affect the sums, multi-token candidates are excluded, and the attribution result depends on the replacement baselines. For a prompt of n input tokens, attribution requires 3n additional full model passes. Runtime and memory benefits have not been established.

Semantic Category-Guided Next-Token Selection can complement Supervised Fine-Tuning and Preference Learning; in this proposal, its intended priority is lower than both when used together. The project's contribution is an inspectable exploratory selection workflow with real, reproducible measurements and an interactive parameter comparison.

See [sources](../SOURCES.md) and [AI assistance notes](../AI-NOTES.md) for provenance. This text supplements the website; it is not a PDF submission artifact.
