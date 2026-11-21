# 视频录音定稿

以下为本人配音版视频采用的英文旁白及中文对照。2026-11-20 已使用新录音制作 [demo.mp4](demo.mp4)，成片 59.41 秒；英文字幕已嵌入视频，中英文 VTT 字幕另存于同目录。

## 为什么这个问题有意思

对于“I put ketchup on my”，在通常的饮食语境下，人们会预期接一个食物词。GPT-2 的候选分布中也能看到与这种语言预期一致的信号：排名靠前的 salad、burger 和 sandwich 都属于食物，salad 的概率只比 face 低一点，而这三个食物候选的概率合起来超过 face 的两倍。然而，贪心解码仍然选择了单个概率最高的 face。

这里值得研究的是：分布中已经存在多个食物候选共同提供的概率支持，但贪心选择只取概率最高的单个 token，不会把候选词之间的语义关系作为额外依据。这让我想研究：能否利用这些已有的类别信号，让下一 token 的选择更符合上下文中的语言习惯？

这里的研究目标是得到更合理的续写。五个已有案例展示了选择规则的行为；它能否在更多输入上达到这个目标，仍需要进一步测试。

## 谁会关心这个答案

视频面向研究语言模型生成方法的人，以及开发文本生成应用的人。

- 研究语言模型生成方法的人：关心如何利用模型已经给出的概率及候选词之间的关系，改进下一 token 的选择。
- 开发文本生成应用的人：关心生成的文本是否更符合上下文，以及选择规则会怎样影响输出。

## 英文朗读稿

只读下面的英文，不读标题。共 142 词；词数不保证能在一分钟内读完，实际时长以试读计时为准。标注的秒数是视频的目标安排。每句单独分段，方便朗读。

### 约 0 到 15 秒 研究问题与受众

Can a language model choose a more sensible next token by considering related candidates together?

This matters to researchers and developers seeking better text generation.

Greedy decoding simply picks the single most probable token.

### 约 15 到 40 秒 概率亮点

After “I put ketchup on my,” we normally expect food, yet greedy decoding selects face.

Salad, burger, and sandwich rank highly, with salad only slightly below face.

Their combined probability is over twice face's, consistent with that expectation.

My rule groups supported candidates by meaning and applies two thresholds, keeping the model's probabilities unchanged.

Changing a parameter reruns selection, not GPT-2.

### 约 40 到 60 秒 结果与下一步

At default settings, face changes to salad in the ketchup case; the other four remain unchanged.

These five related examples give me initial confidence in the approach, but its benefits on new prompts still need testing.

Next, I would expand semantic categories and test more varied inputs.

## 中文对照

语言模型能否把语义相关的候选词放在一起考虑，从而选择更合理的下一个 token？这个问题与希望改善文本生成的研究者和开发者有关。贪心解码只会选择概率最高的单个 token。

在“I put ketchup on my”之后，我们通常会预期接食物词，然而贪心解码选择了 face。salad、burger 和 sandwich 都排名靠前，salad 的概率也只比 face 低一点。它们的概率合起来超过 face 的两倍，与食物续写的预期一致。我的规则将得到支持的候选按语义分组，通过两个阈值决定是否替换，同时保持模型原始概率不变。改变参数只会重新执行选择规则，不会重新运行 GPT-2。

在默认参数下，番茄酱案例从 face 改选为 salad，其他四个案例保留原始选择。这五个相关案例让我对这条思路有初步信心，但它能否改善新输入的续写，还需要进一步测试。

下一步，我希望扩充语义类别，在更多类型的输入上继续测试。

## 配套画面建议

- 开场先提出问题，并标明受众是关注文本生成的研究者和开发者。
- 开场右侧问题框直接写：**Can grouping related candidates help us choose the next token?**（把语义相关的候选词分组，能否帮助我们选择下一个 token？）
- 用现有概率柱状图突出 face 与 salad 的接近程度，以及 salad、burger、sandwich 的共同语义和合计概率。这里讨论的是这三个候选的概率之和；原有结果页的“supported food probability”则使用经过支持条件筛选的候选集合，两者保持各自的含义。
- 概率图对照句：**Expected in an eating context: food. Greedy choice: face.**
- 概率亮点部分简述“按语义分组，再用两个阈值决定是否替换”，将注意力排序和消融基线等细节留给报告。
- 结果页保留实验参数、替换结果和其他案例标签，直接说明把握程度：五个相关案例提供了初步支持，让我对思路有初步信心；对新输入的改善仍需测试。发现与把握程度放在同一页。
- 结果页总结：**Initial confidence from five related examples.**
- 结果页待验证内容：**Benefits on new prompts still need testing.**
- 视频结果页省去“在输入 I 处触发替换”的归因细节；这一观察及其与最初猜测 ketchup 的差异保留在现有网页和书面报告中说明。
- 结尾标题用 **Next steps**，说明扩充语义类别，并在更多类型的输入上继续测试。

## 内容依据

研究动机来自你在本次讨论中的解释；AI 将其整理为中英文文案。候选排序、概率比较和五个默认选择结果依据项目已有的 [实验记录](../app/experiment-data.json)；数据来源及许可沿用 [SOURCES.md](../SOURCES.md)。本稿没有新增实验或数据。

源项目[实验报告](https://github.com/caotangkiss/semantic-category-selection/blob/main/docs/EXPERIMENT.md)的分析与结论说明测试符合所设规则的预期行为，并初步验证了这一选择思路的可行性；同时指出，测试用例较少，尚不能证明整体质量提高。视频据此表达对思路的初步信心，并把对新输入的效果留作待验证的问题。这里不把规则的可实现性表述为改善效果已获理论证明。

## 录音提示

先试读一遍，目标接近 60 秒，优先保证每个词清楚。可以按上面的三段分别录制；读错时停一下，再从该句开头重读，方便后续剪辑。只需朗读英文稿，画面文字不用额外读出来。
