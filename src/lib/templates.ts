export interface Template {
  name: string;
  description: string;
  category: string;
  theme: string;
  accentPreview: string; // CSS gradient for the preview card
  latex: string;
  customTheme?: CustomTemplateStyle;
}

export interface CustomTemplateStyle {
  baseTemplateName: string;
  baseTheme: string;
  accentColor: string;
  alertColor: string;
  exampleColor: string;
  bodyBg: string;
  bodyFg: string;
  mutedFg: string;
  titleBgStart: string;
  titleBgEnd: string;
  titleFg: string;
  sectionBgStart: string;
  sectionBgEnd: string;
  sectionFg: string;
}

export interface TemplateCommand {
  label: string;
  insert: string;
  placement: 'document' | 'frame';
}

export const CUSTOM_TEMPLATE_NAME = 'Custom Template';
export const CUSTOM_TEMPLATE_COMMENT_PREFIX = '% beamerlab-custom-theme:';
export const CUSTOM_TEMPLATE_CACHE_KEY = 'beamerlab.customTemplate.v1';

function getCustomThemeComment(template: Template): string {
  return template.customTheme
    ? `\n${CUSTOM_TEMPLATE_COMMENT_PREFIX} ${JSON.stringify(template.customTheme)}`
    : '';
}

export function createTemplateDocument(template: Template, body: string): string {
  return `\\documentclass{beamer}
\\usetheme{${template.theme}}${getCustomThemeComment(template)}
\\usepackage{amsmath,amssymb}

\\title{Untitled Presentation}
\\subtitle{}
\\author{}
\\institute{}
\\date{\\today}

\\begin{document}

${body.trim()}

\\end{document}`;
}

export function createTemplateStarter(template: Template): string {
  return `\\documentclass{beamer}
\\usetheme{${template.theme}}${getCustomThemeComment(template)}
\\usepackage{amsmath,amssymb}

\\title{Untitled Presentation}
\\subtitle{}
\\author{}
\\institute{}
\\date{\\today}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Main Idea}
\\begin{block}{Key point}
Write the central idea for this slide.
\\end{block}
\\end{frame}

\\end{document}`;
}

export function getTemplateCommands(template: Template): TemplateCommand[] {
  const commandName = template.name === CUSTOM_TEMPLATE_NAME ? 'Custom' : template.theme;

  return [
    {
      label: `${commandName} frame`,
      placement: 'document',
      insert: `\\begin{frame}{Slide Title}
Write your slide content here.
\\end{frame}`,
    },
    {
      label: 'Theme block',
      placement: 'frame',
      insert: `\\begin{block}{Block Title}
Use this for primary ${commandName} callouts.
\\end{block}`,
    },
    {
      label: 'Alert block',
      placement: 'frame',
      insert: `\\begin{alertblock}{Important}
Use this for warnings, risks, or constraints.
\\end{alertblock}`,
    },
    {
      label: 'Example block',
      placement: 'frame',
      insert: `\\begin{exampleblock}{Example}
Use this for examples, takeaways, or results.
\\end{exampleblock}`,
    },
    {
      label: 'Two columns',
      placement: 'frame',
      insert: `\\begin{columns}
\\begin{column}{0.5\\textwidth}
Left column content.
\\end{column}
\\begin{column}{0.5\\textwidth}
Right column content.
\\end{column}
\\end{columns}`,
    },
  ];
}

export const templates: Template[] = [
  {
    name: 'Conference Talk',
    description: 'Clean, professional design for academic conferences. Balanced typography with accent-bar headers.',
    category: 'Research',
    theme: 'Meridian',
    accentPreview: 'linear-gradient(135deg, #0f172a, #0284c7)',
    latex: `\\documentclass{beamer}
\\usetheme{Meridian}
\\usepackage{amsmath,amssymb}

\\title{Scalable Inference in Probabilistic Models}
\\subtitle{A Variational Approach with Convergence Guarantees}
\\author{Dr. Jane Doe}
\\institute{University of Muster}
\\date{NeurIPS 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\section{Introduction}
\\begin{frame}
\\sectionpage
\\end{frame}

\\begin{frame}{Motivation}
\\begin{itemize}
\\item Modern ML models require inference over billions of parameters
\\item Exact inference is intractable: $\\mathcal{O}(2^n)$ complexity
\\item Variational methods approximate the posterior $p(z|x)$
\\item \\textbf{Key gap:} No existing method provides both scalability and guarantees
\\end{itemize}

\\begin{block}{Our Contribution}
We present \\textbf{FastVI}, a variational inference algorithm that achieves $\\epsilon$-accurate posterior approximation in $\\mathcal{O}(n \\log n)$ time.
\\end{block}
\\end{frame}

\\begin{frame}{Problem Setup}
Given observations $x_1, \\ldots, x_N$ and latent variables $z$:

\\begin{equation}
p(z | x) = \\frac{p(x | z) \\, p(z)}{p(x)} = \\frac{p(x|z) \\, p(z)}{\\int p(x|z) \\, p(z) \\, dz}
\\end{equation}

We seek $q^*(z) \\in \\mathcal{Q}$ that minimizes:
\\begin{equation}
q^* = \\arg\\min_{q \\in \\mathcal{Q}} \\text{KL}(q(z) \\| p(z|x))
\\end{equation}

\\begin{alertblock}{Challenge}
The evidence $\\log p(x) = \\log \\int p(x|z)p(z)dz$ is intractable for complex models.
\\end{alertblock}
\\end{frame}

\\begin{frame}{Theoretical Results}
\\begin{block}{Theorem 1 — Convergence Rate}
Under Assumptions 1-3, FastVI converges at rate:
$\\text{KL}(q_T \\| p) \\leq \\frac{C}{\\sqrt{T}} + \\mathcal{O}\\left(\\frac{\\log T}{T}\\right)$
\\end{block}

\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Assumptions:}
\\begin{enumerate}
\\item $p(x|z)$ is $L$-Lipschitz
\\item $\\mathcal{Q}$ is an exponential family
\\item Bounded variance: $\\text{Var}[\\nabla \\mathcal{L}] \\leq \\sigma^2$
\\end{enumerate}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\begin{exampleblock}{Practical Impact}
This matches SGD rates while maintaining distributional guarantees — no existing VI method achieves both.
\\end{exampleblock}
\\end{column}
\\end{columns}
\\end{frame}

\\begin{frame}{Experimental Results}
\\begin{itemize}
\\item \\textbf{Datasets:} ImageNet ($14M$ images), Common Crawl ($410B$ tokens)
\\item \\textbf{Models:} VAE, Diffusion, Hierarchical Bayesian Networks
\\item FastVI achieves $2.7\\times$ speedup over mean-field VI
\\item ELBO gap reduced by $34\\%$ compared to SOTA
\\end{itemize}

\\begin{block}{Key Takeaway}
FastVI scales linearly with model size while maintaining posterior quality within $\\epsilon = 0.01$ of the true posterior.
\\end{block}
\\end{frame}

\\begin{frame}{Conclusion \\& Future Work}
\\begin{enumerate}
\\item \\textbf{FastVI:} First variational method with both scalability and guarantees
\\item \\textbf{Theory:} $\\mathcal{O}(n \\log n)$ convergence with KL bounds
\\item \\textbf{Practice:} State-of-the-art on 5 benchmark suites
\\end{enumerate}

\\vspace{1em}
\\textbf{Open questions:}
\\begin{itemize}
\\item Extension to non-exponential family variational distributions
\\item Distributed implementation for $>10^{12}$ parameter models
\\item Connection to score-based diffusion methods
\\end{itemize}

\\vspace{1em}
\\emph{Code \\& reproducibility:} \\url{https://muster.example/fastvi}
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Graduate Lecture',
    description: 'Warm, readable design for classroom teaching. Progress bar footer and gradient accents.',
    category: 'Teaching',
    theme: 'Ember',
    accentPreview: 'linear-gradient(135deg, #1c1917, #ea580c)',
    latex: `\\documentclass{beamer}
\\usetheme{Ember}
\\usepackage{amsmath,amssymb}

\\title{Convex Optimization}
\\subtitle{Lecture 7: Duality and KKT Conditions}
\\author{Prof. John Doe}
\\institute{University of Muster}
\\date{Fall 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Last Lecture Recap}
\\begin{itemize}
\\item We formulated the general optimization problem
\\item Lagrangian function: $L(x, \\lambda, \\nu) = f_0(x) + \\sum \\lambda_i f_i(x) + \\sum \\nu_j h_j(x)$
\\item Introduced weak duality: $d^* \\leq p^*$
\\end{itemize}

\\begin{alertblock}{Today's Goal}
Understand when $d^* = p^*$ (strong duality) and derive the KKT optimality conditions.
\\end{alertblock}
\\end{frame}

\\begin{frame}{Strong Duality}
\\begin{block}{Slater's Condition}
If the primal problem is convex and there exists a \\textbf{strictly feasible} point $\\hat{x}$ such that $f_i(\\hat{x}) < 0$ for all $i$, then strong duality holds:
$p^* = d^*$
\\end{block}

\\textbf{Intuition:} The feasible set has a non-empty interior, so the dual can "reach" the primal optimum.

\\begin{enumerate}
\\item Slater's condition is \\emph{sufficient}, not necessary
\\item For linear programs, strong duality always holds
\\item Refined Slater's: only need strict feasibility for non-affine constraints
\\end{enumerate}
\\end{frame}

\\begin{frame}{KKT Conditions}
For a convex problem with strong duality, $x^*$ and $(\\lambda^*, \\nu^*)$ are primal-dual optimal \\textbf{if and only if}:

\\begin{enumerate}
\\item \\textbf{Primal feasibility:} $f_i(x^*) \\leq 0$, $h_j(x^*) = 0$
\\item \\textbf{Dual feasibility:} $\\lambda_i^* \\geq 0$
\\item \\textbf{Complementary slackness:} $\\lambda_i^* f_i(x^*) = 0$
\\item \\textbf{Stationarity:} $\\nabla f_0(x^*) + \\sum \\lambda_i^* \\nabla f_i(x^*) + \\sum \\nu_j^* \\nabla h_j(x^*) = 0$
\\end{enumerate}

\\begin{exampleblock}{Why This Matters}
KKT conditions give us a \\emph{certificate of optimality} — if you find $(x^*, \\lambda^*, \\nu^*)$ satisfying all four, you've found the global optimum.
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Example: Water-Filling}
\\textbf{Problem:} Allocate power $x_i$ across $n$ channels to maximize capacity:
\\begin{equation}
\\max \\sum_{i=1}^n \\log(1 + x_i h_i) \\quad \\text{s.t.} \\quad \\sum x_i \\leq P, \\; x_i \\geq 0
\\end{equation}

\\textbf{KKT solution:}
\\begin{equation}
x_i^* = \\left(\\frac{1}{\\lambda^*} - \\frac{1}{h_i}\\right)^+
\\end{equation}

where $(a)^+ = \\max(a, 0)$ and $\\lambda^*$ is chosen so $\\sum x_i^* = P$.

This is the famous \\textbf{water-filling} interpretation: pour water (power) until the total equals $P$.
\\end{frame}

\\begin{frame}{Summary \\& Homework}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Key Concepts:}
\\begin{itemize}
\\item Strong duality via Slater's
\\item KKT necessary \\& sufficient
\\item Complementary slackness
\\item Water-filling as KKT example
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Problem Set 7:}
\\begin{enumerate}
\\item Prove strong duality for a given SDP
\\item Derive KKT for portfolio optimization
\\item Implement water-filling in Python
\\item Show Slater's fails for a specific problem
\\end{enumerate}
\\end{column}
\\end{columns}

\\vspace{1em}
\\textbf{Reading:} Muster Optimization Notes, Chapter 5.5
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Dark Research',
    description: 'Striking dark theme for evening talks and technical deep-dives. Floating header with purple accents.',
    category: 'Research',
    theme: 'Arctic',
    accentPreview: 'linear-gradient(135deg, #020617, #7c3aed)',
    latex: `\\documentclass{beamer}
\\usetheme{Arctic}
\\usepackage{amsmath,amssymb}

\\title{Attention Is Not All You Need}
\\subtitle{Revisiting State-Space Models for Sequence Modeling}
\\author{Dr. John Doe}
\\institute{MusterMind}
\\date{ICML 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{The Attention Problem}
Transformer self-attention has $\\mathcal{O}(n^2)$ complexity:

\\begin{equation}
\\text{Attn}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V
\\end{equation}

\\begin{alertblock}{Scaling Wall}
For sequence length $n = 10^6$, attention requires $10^{12}$ operations per layer. This is fundamentally unsustainable.
\\end{alertblock}

\\textbf{Alternative:} State-space models (SSMs) achieve $\\mathcal{O}(n \\log n)$ via parallel scans.
\\end{frame}

\\begin{frame}{Structured State Spaces}
A continuous-time SSM is defined by:
\\begin{align}
\\dot{x}(t) &= Ax(t) + Bu(t) \\\\
y(t) &= Cx(t) + Du(t)
\\end{align}

\\begin{block}{Key Innovation: HiPPO Initialization}
Initialize $A$ as the HiPPO matrix that optimally compresses history:
$A_{nk} = -\\begin{cases} (2n+1)^{1/2}(2k+1)^{1/2} & \\text{if } n > k \\\\ n+1 & \\text{if } n = k \\end{cases}$
\\end{block}

This gives the model \\emph{perfect memory} of the input history in a compressed state.
\\end{frame}

\\begin{frame}{Architecture: Mamba-2}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Core Design:}
\\begin{enumerate}
\\item Selective state spaces — input-dependent $\\Delta, B, C$
\\item Hardware-aware parallel scan
\\item No attention layers needed
\\item Linear scaling with sequence length
\\end{enumerate}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Performance:}
\\begin{itemize}
\\item \\textbf{Language:} Matches MusterLM quality at $3\\times$ speed
\\item \\textbf{DNA:} 1M token context, $5\\times$ faster than FlashAttention
\\item \\textbf{Audio:} Real-time generation at 44.1kHz
\\end{itemize}
\\end{column}
\\end{columns}

\\begin{exampleblock}{The Takeaway}
SSMs aren't just efficient — they're \\emph{better} for long-range dependencies.
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Results \\& Open Questions}
\\begin{itemize}
\\item Mamba-2 achieves SOTA on 7/9 long-range benchmarks
\\item Training: $40\\%$ less compute than equivalent Transformer
\\item Inference: constant memory regardless of context length
\\end{itemize}

\\begin{block}{Open Problems}
\\begin{enumerate}
\\item Can SSMs replace attention for in-context learning?
\\item Optimal state dimension $N$ as a function of task complexity?
\\item Theoretical analysis of selective scan expressiveness
\\end{enumerate}
\\end{block}
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Project Plan',
    description: 'Structured layout for project proposals and milestone presentations. Clean green accent with side markers.',
    category: 'Industry',
    theme: 'Canopy',
    accentPreview: 'linear-gradient(135deg, #022c22, #059669)',
    latex: `\\documentclass{beamer}
\\usetheme{Canopy}
\\usepackage{amsmath}

\\title{Project Phoenix: ML Pipeline Redesign}
\\subtitle{Q3 2026 Engineering Proposal}
\\author{Engineering Team Lead: Jane Doe}
\\institute{MusterAI Infrastructure Division}
\\date{June 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\section{Problem}
\\begin{frame}
\\sectionpage
\\end{frame}

\\begin{frame}{Current State}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Pain Points:}
\\begin{itemize}
\\item Training pipeline takes \\textbf{72 hours} for a single run
\\item Data preprocessing is single-threaded
\\item No reproducibility guarantees
\\item Checkpoint storage costs \\$48K/month
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Impact:}
\\begin{itemize}
\\item Research velocity limited to \\textbf{3 experiments/week}
\\item 2 incidents in Q2 from pipeline failures
\\item Team spending 40\\% time on infrastructure vs research
\\end{itemize}
\\end{column}
\\end{columns}

\\begin{alertblock}{Bottom Line}
Our infrastructure is the bottleneck for research progress.
\\end{alertblock}
\\end{frame}

\\begin{frame}{Proposed Architecture}
\\begin{enumerate}
\\item \\textbf{Distributed data loader} — Shard across 64 workers, $10\\times$ throughput
\\item \\textbf{Incremental checkpointing} — Delta-based storage, $70\\%$ cost reduction
\\item \\textbf{Reproducibility layer} — Deterministic training with config versioning
\\item \\textbf{Auto-scaling} — GPU allocation based on experiment priority queue
\\end{enumerate}

\\begin{block}{Expected Outcome}
Pipeline runtime: $72h \\to 8h$. Experiment throughput: $3/\\text{week} \\to 20/\\text{week}$.
\\end{block}
\\end{frame}

\\begin{frame}{Timeline \\& Milestones}
\\begin{description}
\\item[Week 1--2] Design review, architecture RFC
\\item[Week 3--6] Distributed data loader implementation
\\item[Week 7--8] Checkpoint system migration
\\item[Week 9--10] Reproducibility framework
\\item[Week 11--12] Integration testing, rollout
\\end{description}

\\begin{exampleblock}{Resources Required}
\\textbf{Team:} 3 engineers (full-time) + 1 SRE (part-time)\\\\
\\textbf{Compute:} 128 H100 GPUs for testing\\\\
\\textbf{Budget:} \\$240K (primarily compute costs)
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Risk Assessment \\& Asks}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Risks:}
\\begin{itemize}
\\item Migration downtime during cutover
\\item Distributed training introduces new failure modes
\\item H100 availability constraints
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Mitigations:}
\\begin{itemize}
\\item Blue-green deployment strategy
\\item Comprehensive fault injection testing
\\item Pre-reserved compute allocation
\\end{itemize}
\\end{column}
\\end{columns}

\\vspace{1em}
\\textbf{Decision needed:} Approve Q3 allocation and compute budget by June 15.
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Thesis Defense',
    description: 'Elegant minimal design for thesis and dissertation defenses. Maximum content focus with subtle styling.',
    category: 'Academic',
    theme: 'Slate',
    accentPreview: 'linear-gradient(145deg, #18181b, #3f3f46)',
    latex: `\\documentclass{beamer}
\\usetheme{Slate}
\\usepackage{amsmath,amssymb}

\\title{Geometric Deep Learning on Manifolds}
\\subtitle{PhD Thesis Defense}
\\author{Jane Doe}
\\institute{University of Muster Department of Mathematics}
\\date{August 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Thesis Overview}
\\textbf{Central question:} How can we generalize deep learning to non-Euclidean domains while preserving theoretical guarantees?

\\vspace{1em}
\\textbf{Contributions:}
\\begin{enumerate}
\\item A unified framework for equivariant networks on Riemannian manifolds
\\item Novel spectral convolution operator with $\\mathcal{O}(n \\log n)$ complexity
\\item Stability bounds under manifold perturbations
\\item Applications to molecular dynamics and climate modeling
\\end{enumerate}

\\vspace{1em}
\\textbf{Publications:} 4 first-author papers (ICML, NeurIPS, JMLR, Nature Computational Science)
\\end{frame}

\\begin{frame}{Background: Convolution on Manifolds}
On $\\mathbb{R}^n$, convolution is defined via translation:
\\begin{equation}
(f * g)(x) = \\int_{\\mathbb{R}^n} f(y) \\, g(x - y) \\, dy
\\end{equation}

On a manifold $\\mathcal{M}$, there is no global translation operator.

\\begin{block}{Approach: Spectral Domain}
Using the Laplace-Beltrami operator $\\Delta_{\\mathcal{M}}$:
$\\Delta_{\\mathcal{M}} \\phi_k = \\lambda_k \\phi_k$

We define spectral convolution:
$f *_{\\mathcal{M}} g = \\sum_k \\hat{f}(\\lambda_k) \\hat{g}(\\lambda_k) \\phi_k$
\\end{block}
\\end{frame}

\\begin{frame}{Contribution 1: Equivariant Networks}
\\begin{block}{Definition — $G$-Equivariant Layer}
A layer $\\Phi: L^2(\\mathcal{M}) \\to L^2(\\mathcal{M})$ is $G$-equivariant if:
$\\Phi(\\rho(g) \\cdot f) = \\rho(g) \\cdot \\Phi(f) \\quad \\forall g \\in G$
where $\\rho$ is the group representation on $L^2(\\mathcal{M})$.
\\end{block}

\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Our construction:}
\\begin{itemize}
\\item Gauge-equivariant convolution
\\item Parallel transport for feature comparison
\\item Connection-aware message passing
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Guarantees:}
\\begin{itemize}
\\item Exact equivariance (not approximate)
\\item Universal approximation on compact manifolds
\\item Stability: $\\|\\Phi(f) - \\Phi(f')\\| \\leq C \\|f - f'\\|$
\\end{itemize}
\\end{column}
\\end{columns}
\\end{frame}

\\begin{frame}{Experimental Validation}
\\begin{itemize}
\\item \\textbf{Molecular dynamics:} Predict protein folding energy with MAE $< 0.3$ kcal/mol
\\item \\textbf{Climate:} Global temperature prediction, $15\\%$ improvement over CNN baselines
\\item \\textbf{Shape analysis:} 99.2\\% accuracy on SHREC'17 (previous SOTA: 96.8\\%)
\\end{itemize}

\\begin{exampleblock}{Computational Efficiency}
Our spectral method runs in $\\mathcal{O}(n \\log n)$ vs $\\mathcal{O}(n^2)$ for spatial methods, enabling deployment on meshes with $>10^6$ vertices.
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Summary \\& Future Directions}
\\textbf{This thesis establishes:}
\\begin{enumerate}
\\item A principled framework connecting geometry, group theory, and deep learning
\\item Practical algorithms that scale to real-world scientific problems
\\item Theoretical foundations for understanding generalization on manifolds
\\end{enumerate}

\\vspace{1em}
\\textbf{Future work:}
\\begin{itemize}
\\item Extension to \\emph{learning} the manifold structure jointly with the task
\\item Applications to quantum chemistry and general relativity simulations
\\item Connections to topological data analysis
\\end{itemize}
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Workshop Talk',
    description: 'Bold crimson design for workshop presentations and invited talks. Strong visual hierarchy.',
    category: 'Research',
    theme: 'Crimson',
    accentPreview: 'linear-gradient(135deg, #1c1917, #dc2626)',
    latex: `\\documentclass{beamer}
\\usetheme{Crimson}
\\usepackage{amsmath,amssymb}

\\title{Causal Inference Meets Foundation Models}
\\subtitle{AAAI 2026 Workshop on Causality}
\\author{Prof. John Doe}
\\institute{University of Muster}
\\date{February 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{The Causal Reasoning Gap}
Foundation models excel at correlation but struggle with causation:

\\begin{itemize}
\\item MusterLM achieves only $54\\%$ on causal reasoning benchmarks
\\item Image models hallucinate physically impossible scenes
\\item RL agents fail under distribution shift
\\end{itemize}

\\begin{block}{Thesis}
Integrating structural causal models (SCMs) into foundation model training can close this gap.
\\end{block}
\\end{frame}

\\begin{frame}{Framework: Causal Transformers}
We augment the Transformer with a causal graph $\\mathcal{G} = (V, E)$:

\\begin{equation}
\\text{CausalAttn}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}} + M_{\\mathcal{G}}\\right) V
\\end{equation}

where $M_{\\mathcal{G}}$ encodes the causal structure:
\\begin{equation}
(M_{\\mathcal{G}})_{ij} = \\begin{cases} 0 & \\text{if } i \\to j \\in \\mathcal{G} \\\\ -\\infty & \\text{otherwise} \\end{cases}
\\end{equation}

\\begin{exampleblock}{Result}
This simple modification improves causal reasoning by $+23\\%$ while maintaining language performance.
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Interventional Training}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Standard training:}
$\\min_\\theta \\mathbb{E}_{p(x)}[-\\log p_\\theta(x)]$

Learns $p(x)$ (observational)
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Our approach:}
$\\min_\\theta \\mathbb{E}_{p(x|do(a))}[-\\log p_\\theta(x|a)]$

Learns $p(x | do(a))$ (interventional)
\\end{column}
\\end{columns}

\\vspace{1em}
\\begin{alertblock}{Key Insight}
Training on interventional data — even synthetically generated — teaches models to distinguish causation from correlation.
\\end{alertblock}
\\end{frame}

\\begin{frame}{Open Problems}
\\begin{enumerate}
\\item \\textbf{Causal discovery at scale:} Learning $\\mathcal{G}$ from data with $>10^6$ variables
\\item \\textbf{Counterfactual generation:} "What would this image look like if...?"
\\item \\textbf{Causal RL:} Agents that transfer across environments via causal invariance
\\end{enumerate}

\\vspace{1em}
\\begin{block}{Call to Action}
The causality and ML communities need tighter integration. Let's build benchmarks, shared tools, and joint training programs.
\\end{block}

\\emph{Slides and code:} \\url{https://causal-fm.github.io}
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Poster Lightning Talk',
    description: 'Concise, high-impact design for poster session lightning talks. Data-dense with clear visual hierarchy.',
    category: 'Research',
    theme: 'Meridian',
    accentPreview: 'linear-gradient(135deg, #0c4a6e, #38bdf8)',
    latex: `\\documentclass{beamer}
\\usetheme{Meridian}
\\usepackage{amsmath,amssymb}

\\title{Zero-Shot Cross-Lingual Transfer via Optimal Transport}
\\subtitle{Poster \\#47 — Spotlight Presentation}
\\author{Dr. Jane Doe \\and Dr. John Doe}
\\institute{University of Muster}
\\date{MusterNLP 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{TL;DR}
\\begin{block}{One-Sentence Summary}
We align multilingual embeddings using optimal transport, enabling zero-shot transfer to 47 unseen languages with $<3\\%$ accuracy drop.
\\end{block}

\\vspace{0.5em}
\\textbf{Why it matters:}
\\begin{itemize}
\\item 7,000+ languages worldwide; labeled data exists for $<100$
\\item Current multilingual models degrade sharply on low-resource languages
\\item Our method requires \\textbf{zero} parallel data for alignment
\\end{itemize}
\\end{frame}

\\begin{frame}{Method}
Given source embeddings $\\mathcal{X} \\subset \\mathbb{R}^d$ and target $\\mathcal{Y} \\subset \\mathbb{R}^d$:

\\begin{equation}
T^* = \\arg\\min_T \\sum_{i,j} T_{ij} \\, c(x_i, y_j) + \\varepsilon \\, H(T)
\\end{equation}

where $c(x,y) = \\|x - y\\|^2$ and $H(T) = -\\sum T_{ij} \\log T_{ij}$ is entropic regularization.

\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\begin{exampleblock}{Computational Cost}
Sinkhorn iterations converge in $\\mathcal{O}(n^2 / \\varepsilon)$ — feasible for vocabularies up to $500K$ tokens.
\\end{exampleblock}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Key insight:} Monolingual word frequency distributions provide sufficient signal for alignment without any bilingual dictionary.
\\end{column}
\\end{columns}
\\end{frame}

\\begin{frame}{Results}
\\begin{itemize}
\\item \\textbf{NER (CoNLL):} $91.2\\%$ F1 (en) $\\to$ $88.7\\%$ F1 (zero-shot avg over 47 languages)
\\item \\textbf{Sentiment:} $+4.2\\%$ accuracy over mBERT baseline on low-resource languages
\\item \\textbf{QA:} Competitive with supervised on XQuAD ($\\Delta < 1.8\\%$)
\\item \\textbf{Scaling:} Alignment quality improves log-linearly with monolingual corpus size
\\end{itemize}

\\begin{alertblock}{Limitation}
Performance degrades for agglutinative languages (Turkish, Finnish) where morphological structure differs fundamentally — future work on subword OT.
\\end{alertblock}
\\end{frame}

\\begin{frame}{Take-Aways \\& Poster Details}
\\begin{enumerate}
\\item Optimal transport provides a principled, unsupervised alignment framework
\\item Zero-shot transfer is viable for dozens of unseen languages
\\item No parallel corpora, no bilingual dictionaries, no language-specific tuning
\\end{enumerate}

\\vspace{1em}
\\textbf{Poster:} Hall B, Board \\#47, 2:00--4:00 PM\\\\
\\textbf{Code:} \\url{https://github.com/example/ot-xling}\\\\
\\textbf{Contact:} \\texttt{jane.doe@example.edu}
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Lab Group Meeting',
    description: 'Informal but structured design for weekly lab meetings and journal clubs. Warm tones with progress tracking.',
    category: 'Teaching',
    theme: 'Ember',
    accentPreview: 'linear-gradient(135deg, #431407, #f97316)',
    latex: `\\documentclass{beamer}
\\usetheme{Ember}
\\usepackage{amsmath,amssymb}

\\title{Weekly Update: Reinforcement Learning Group}
\\subtitle{Paper Discussion + Progress Reports}
\\author{Robotics \\& Decision Lab}
\\institute{University of Muster}
\\date{Week 18, Spring 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\section{Paper Discussion}
\\begin{frame}
\\sectionpage
\\end{frame}

\\begin{frame}{This Week's Paper}
\\textbf{Title:} "Decision Transformer: Reinforcement Learning via Sequence Modeling"\\\\
\\textbf{Authors:} Doe et al., MusterML 2021\\\\
\\textbf{Presenter:} Jane Doe

\\vspace{0.5em}
\\begin{block}{Core Idea}
Frame RL as a sequence modeling problem. Instead of learning $Q(s,a)$, learn $P(a_t | s_t, R_t)$ where $R_t$ is the desired return-to-go.
\\end{block}

\\textbf{Key equation — autoregressive generation:}
\\begin{equation}
a_t \\sim \\pi_\\theta(a_t | \\hat{R}_1, s_1, a_1, \\ldots, \\hat{R}_t, s_t)
\\end{equation}
\\end{frame}

\\begin{frame}{Discussion Points}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Strengths:}
\\begin{itemize}
\\item Elegant reformulation — uses Transformer directly
\\item No value function estimation
\\item Works with offline data
\\item Conditioning on desired return is powerful
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Weaknesses / Open Qs:}
\\begin{itemize}
\\item Can it explore? (offline only)
\\item Return conditioning assumes you know the optimal return
\\item Scaling to continuous action spaces?
\\item Comparison to CQL, IQL unfair?
\\end{itemize}
\\end{column}
\\end{columns}

\\begin{alertblock}{For Next Week}
Read the follow-up: "Online Decision Transformer" (Doe et al., MusterML 2022) — addresses the exploration gap.
\\end{alertblock}
\\end{frame}

\\section{Progress Reports}
\\begin{frame}
\\sectionpage
\\end{frame}

\\begin{frame}{Team Updates}
\\begin{description}
\\item[Jane Doe] Sim-to-real transfer experiments running on quadruped. Initial results: $62\\%$ success rate in real world (vs $94\\%$ sim). Gap analysis in progress.
\\item[John Doe] Finished reward shaping ablation. Sparse rewards $+$ HER outperform dense rewards by $12\\%$ on manipulation tasks.
\\item[Jane Doe] Draft of multi-agent communication paper ready for internal review. Deadline: MusterAgents, July 15.
\\item[John Doe] GPU cluster maintenance next Tuesday — plan jobs accordingly.
\\end{description}
\\end{frame}

\\begin{frame}{Action Items}
\\begin{enumerate}
\\item Jane Doe: Share sim-to-real gap analysis by Thursday
\\item John Doe: Upload reward shaping code to shared repo
\\item Everyone: Review Jane Doe's draft by Monday
\\item Next presenter: John Doe (topic: model-based RL)
\\end{enumerate}

\\vspace{1em}
\\textbf{Next meeting:} Tuesday, May 12, 10:00 AM, Room HG-E22
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Systems Architecture',
    description: 'Technical deep-dive template for systems design reviews and architecture presentations. Dark theme with purple accents.',
    category: 'Industry',
    theme: 'Arctic',
    accentPreview: 'linear-gradient(135deg, #0f0720, #a855f7)',
    latex: `\\documentclass{beamer}
\\usetheme{Arctic}
\\usepackage{amsmath}

\\title{Distributed Training Infrastructure}
\\subtitle{Architecture Design Review — Platform Team}
\\author{Jane Doe, Staff Engineer}
\\institute{MusterAI}
\\date{Q3 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Design Goals}
\\begin{enumerate}
\\item Train models with $>10^{12}$ parameters across $1024+$ GPUs
\\item Fault tolerance: recover from node failure in $< 30$ seconds
\\item Cost efficiency: $> 85\\%$ GPU utilization (MFU)
\\item Developer experience: single config file, zero infrastructure code
\\end{enumerate}

\\begin{alertblock}{Constraint}
Must run on heterogeneous clusters (H100 + A100 mixed) without performance cliff.
\\end{alertblock}
\\end{frame}

\\begin{frame}{Architecture Overview}
\\begin{block}{Three-Layer Design}
\\begin{description}
\\item[Orchestration Layer] Job scheduler, resource allocator, health monitor
\\item[Communication Layer] NCCL rings with fallback to Gloo; topology-aware collectives
\\item[Compute Layer] FSDP with activation checkpointing; mixed precision (BF16/FP8)
\\end{description}
\\end{block}

\\textbf{Key innovation — Elastic Pipeline Parallelism:}
\\begin{equation}
\\text{Throughput} = \\frac{B \\cdot S}{T_{\\text{forward}} + T_{\\text{backward}} + T_{\\text{comm}}}
\\end{equation}

Our scheduler dynamically adjusts pipeline stages when nodes join/leave, maintaining $> 90\\%$ of peak throughput during elastic scaling events.
\\end{frame}

\\begin{frame}{Fault Tolerance}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Current (baseline):}
\\begin{itemize}
\\item Checkpoint every 30 min
\\item Node failure = restart from checkpoint
\\item Recovery time: $\\sim 15$ min
\\item Wasted compute: up to 45 min
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Proposed:}
\\begin{itemize}
\\item In-memory redundant shards
\\item Async checkpointing (zero overhead)
\\item Hot standby nodes
\\item Recovery time: $< 30$ seconds
\\end{itemize}
\\end{column}
\\end{columns}

\\begin{exampleblock}{Impact}
At \\$2/GPU-hour with 1024 GPUs, reducing recovery from 15 min to 30s saves \\$500K/year assuming 2 failures/day.
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Rollout Plan \\& Decision}
\\begin{description}
\\item[Phase 1 (Week 1--4)] Communication layer + elastic scheduling prototype
\\item[Phase 2 (Week 5--8)] Fault tolerance integration + stress testing
\\item[Phase 3 (Week 9--10)] Migration of top-3 training jobs, A/B performance comparison
\\item[Phase 4 (Week 11--12)] Full rollout, deprecate legacy system
\\end{description}

\\vspace{1em}
\\textbf{Resources:} 4 engineers $\\times$ 12 weeks + 256 H100 test cluster\\\\
\\textbf{Decision needed:} Approve design and allocate test cluster by EOW.
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Grant Proposal',
    description: 'Formal, structured template for research grant pitches and funding presentations. Green accents with clear deliverables.',
    category: 'Academic',
    theme: 'Canopy',
    accentPreview: 'linear-gradient(135deg, #064e3b, #34d399)',
    latex: `\\documentclass{beamer}
\\usetheme{Canopy}
\\usepackage{amsmath,amssymb}

\\title{Interpretable AI for Clinical Decision Support}
\\subtitle{ERC Starting Grant Proposal Pitch}
\\author{Dr. Jane Doe}
\\institute{University of Muster, Department of Computer Science}
\\date{2026 Funding Cycle}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\section{The Problem}
\\begin{frame}
\\sectionpage
\\end{frame}

\\begin{frame}{Clinical AI: Promise vs Reality}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Current state:}
\\begin{itemize}
\\item Deep learning achieves $>95\\%$ accuracy in radiology, pathology
\\item \\textbf{But:} $< 5\\%$ of FDA-approved AI tools are adopted in practice
\\item Clinicians don't trust black-box predictions
\\item Regulatory frameworks require explainability
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{The gap:}
\\begin{itemize}
\\item Post-hoc explanations (SHAP, LIME) are unfaithful to model reasoning
\\item Interpretable models sacrifice $10$--$15\\%$ accuracy
\\item No framework connects interpretability to clinical workflows
\\end{itemize}
\\end{column}
\\end{columns}

\\begin{alertblock}{Research Question}
Can we build AI systems that are \\emph{inherently} interpretable \\emph{without} sacrificing predictive performance?
\\end{alertblock}
\\end{frame}

\\begin{frame}{Proposed Approach}
\\textbf{Three pillars:}

\\begin{enumerate}
\\item \\textbf{Concept Bottleneck Models 2.0} — Learn clinically meaningful intermediate concepts:
\\begin{equation}
f(x) = g(c_1(x), c_2(x), \\ldots, c_k(x))
\\end{equation}
where each $c_i$ maps to a medical concept (e.g., lesion texture, symmetry)

\\item \\textbf{Causal Explanation Graphs} — Provide counterfactual explanations aligned with clinical reasoning: "This is malignant \\emph{because} irregular borders AND high vascularity"

\\item \\textbf{Clinician-in-the-Loop Evaluation} — Deploy in 3 Muster Health partner hospitals with randomized controlled evaluation of clinical decision quality
\\end{enumerate}
\\end{frame}

\\begin{frame}{Work Packages \\& Timeline}
\\begin{description}
\\item[WP1 (Y1)] Concept discovery from medical ontologies + pre-training
\\item[WP2 (Y1--2)] Causal explanation framework + theoretical guarantees
\\item[WP3 (Y2--3)] Clinical prototype for dermatology and radiology
\\item[WP4 (Y3--4)] Multi-site RCT with Muster Health partners
\\item[WP5 (Y4--5)] Open-source toolkit + regulatory submission support
\\end{description}

\\begin{exampleblock}{Deliverables}
\\textbf{Publications:} 12+ papers in top venues (MusterML, MusterMedAI, Muster Digital Health)\\\\
\\textbf{Software:} Open-source interpretable clinical AI toolkit\\\\
\\textbf{Impact:} CE-marked decision support tool ready for deployment
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Budget \\& Team}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Budget (5 years):}
\\begin{itemize}
\\item Personnel: \\texteuro 1.2M (PI + 3 PhDs + 2 postdocs)
\\item Compute: \\texteuro 300K (GPU cluster)
\\item Clinical study: \\texteuro 200K
\\item Travel \\& dissemination: \\texteuro 100K
\\item \\textbf{Total: \\texteuro 1.8M}
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{PI Qualifications:}
\\begin{itemize}
\\item 28 publications, h-index 19
\\item Best Paper Award, MusterMedAI 2024
\\item Clinical AI deployment at 2 hospitals
\\item Industry collaboration with Roche Diagnostics
\\end{itemize}
\\end{column}
\\end{columns}

\\vspace{1em}
\\textbf{Host institution:} University of Muster AI for Medicine Lab — access to MusterGPU cluster, Muster Health data partnerships, and translational medicine center.
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Startup Pitch',
    description: 'High-energy design for startup demos and investor pitches. Minimal styling with maximum impact.',
    category: 'Industry',
    theme: 'Slate',
    accentPreview: 'linear-gradient(145deg, #09090b, #52525b)',
    latex: `\\documentclass{beamer}
\\usetheme{Slate}
\\usepackage{amsmath}

\\title{MusterDB: The Database That Understands Your Data}
\\subtitle{Seed Round — \\$4M Raise}
\\author{Co-founders: John Doe \\& Jane Doe}
\\institute{MusterDB, Inc.}
\\date{Muster Accelerator Demo Day, 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{The Problem}
\\textbf{80\\% of enterprise data is unstructured} — documents, logs, conversations.

\\begin{itemize}
\\item Traditional databases can't query: "Find contracts where liability exceeds \\$1M"
\\item Vector databases return similar documents, not \\emph{answers}
\\item Teams spend \\textbf{40\\% of engineering time} building data pipelines to make unstructured data queryable
\\end{itemize}

\\begin{block}{Market Size}
Enterprise search \\& analytics: \\$32B by 2027 (Gartner). Unstructured data management is the fastest-growing segment at 24\\% CAGR.
\\end{block}
\\end{frame}

\\begin{frame}{The Solution}
\\textbf{MusterDB:} A database engine with native language understanding.

\\begin{enumerate}
\\item \\textbf{Ingest} any document — PDFs, emails, Slack, code repos
\\item \\textbf{Query} in natural language or SQL — we translate automatically
\\item \\textbf{Get answers}, not documents — with citations and confidence scores
\\end{enumerate}

\\begin{exampleblock}{Example Query}
\\texttt{SELECT summary, risk\\_level FROM contracts WHERE liability > 1000000 AND expires\\_before('2026-12-31')}\\\\
\\vspace{0.3em}
This runs over \\emph{raw PDF contracts} — no pre-processing, no schema definition.
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Traction \\& Metrics}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Growth:}
\\begin{itemize}
\\item \\textbf{\\$480K ARR} (up from \\$0, 6 months ago)
\\item \\textbf{12 paying customers} including 3 Fortune 500
\\item \\textbf{3.2x} net revenue retention
\\item \\textbf{14-day} avg sales cycle
\\end{itemize}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Product:}
\\begin{itemize}
\\item \\textbf{97.3\\%} query accuracy on customer benchmarks
\\item \\textbf{<200ms} p95 latency
\\item \\textbf{SOC 2 Type II} certified
\\item \\textbf{8.9/10} NPS score
\\end{itemize}
\\end{column}
\\end{columns}

\\begin{alertblock}{Customer Quote}
"MusterDB replaced a 6-person data engineering team for our legal department." — VP Engineering, Muster 500 Fintech
\\end{alertblock}
\\end{frame}

\\begin{frame}{The Ask}
\\textbf{Raising \\$4M Seed} to:
\\begin{enumerate}
\\item Hire 5 engineers (distributed systems + ML)
\\item Expand to 50 customers by EOY
\\item Launch self-serve tier for mid-market
\\item SOC 2 Type II $\\to$ HIPAA compliance for healthcare vertical
\\end{enumerate}

\\vspace{1em}
\\textbf{Team:} Ex-MusterData (MusterStore), Ex-MusterAI, 2 PhD (NLP)\\\\
\\textbf{Advisors:} Former CTO of MusterWarehouse, Prof. at University of Muster NLP\\\\

\\vspace{0.5em}
\\emph{Let's talk:} \\texttt{founders@musterdb.ai}
\\end{frame}

\\end{document}`,
  },
  {
    name: 'Security Briefing',
    description: 'Bold, high-contrast design for cybersecurity talks, threat briefings, and incident reviews.',
    category: 'Industry',
    theme: 'Crimson',
    accentPreview: 'linear-gradient(135deg, #1a0000, #ef4444)',
    latex: `\\documentclass{beamer}
\\usetheme{Crimson}
\\usepackage{amsmath}

\\title{Supply Chain Attack Post-Mortem}
\\subtitle{Incident Review \\& Hardening Roadmap}
\\author{Security Engineering Team}
\\institute{MusterCloud, Inc.}
\\date{Confidential — May 2026}

\\begin{document}

\\begin{frame}
\\titlepage
\\end{frame}

\\begin{frame}{Incident Summary}
\\begin{alertblock}{Timeline}
\\textbf{Apr 12, 03:14 UTC} — Malicious package \\texttt{lodash-utils-v2} published to npm\\\\
\\textbf{Apr 12, 09:22 UTC} — Auto-merged by Dependabot in 3 microservices\\\\
\\textbf{Apr 12, 14:47 UTC} — Anomalous outbound traffic detected by SOC\\\\
\\textbf{Apr 12, 15:03 UTC} — Incident declared, containment initiated\\\\
\\textbf{Apr 12, 16:30 UTC} — Full containment achieved
\\end{alertblock}

\\textbf{Impact:}
\\begin{itemize}
\\item 3 production services compromised for $\\sim$5.5 hours
\\item API keys for 2 third-party services exfiltrated
\\item No customer data accessed (confirmed via audit logs)
\\item Severity: \\textbf{SEV-1} (resolved)
\\end{itemize}
\\end{frame}

\\begin{frame}{Root Cause Analysis}
\\begin{columns}
\\begin{column}{0.5\\textwidth}
\\textbf{Attack vector:}
\\begin{enumerate}
\\item Typosquatted package name
\\item Post-install script exfiltrated \\texttt{.env} files
\\item Used legitimate HTTPS to C2 server
\\item Payload activated only in CI/CD (checked for \\texttt{CI=true})
\\end{enumerate}
\\end{column}
\\begin{column}{0.5\\textwidth}
\\textbf{Why we missed it:}
\\begin{itemize}
\\item No package provenance verification
\\item Dependabot auto-merge enabled for patches
\\item Post-install scripts not sandboxed
\\item Egress filtering too permissive
\\end{itemize}
\\end{column}
\\end{columns}

\\begin{block}{Lesson}
Supply chain security requires defense in depth — no single control would have prevented this.
\\end{block}
\\end{frame}

\\begin{frame}{Hardening Roadmap}
\\begin{description}
\\item[Immediate (Week 1)] Disable auto-merge; rotate all compromised credentials
\\item[Short-term (Month 1)] Implement package provenance checks (Sigstore); restrict post-install scripts; deploy egress allow-listing
\\item[Medium-term (Q3)] SBOM generation for all services; runtime dependency monitoring; red team exercise
\\item[Long-term (Q4)] Zero-trust CI/CD pipeline; hardware-backed signing for all artifacts
\\end{description}

\\begin{exampleblock}{Success Metrics}
Mean time to detect supply chain anomalies: $5.5h \\to < 15\\text{min}$\\\\
Packages with verified provenance: $0\\% \\to 100\\%$
\\end{exampleblock}
\\end{frame}

\\begin{frame}{Action Items \\& Owners}
\\begin{enumerate}
\\item \\textbf{Platform Team:} Egress allow-list in production by May 15
\\item \\textbf{DevEx Team:} Package provenance gate in CI by May 30
\\item \\textbf{Security:} Threat model update for supply chain by June 1
\\item \\textbf{All teams:} Audit \\texttt{.npmrc} and lock file integrity
\\item \\textbf{Leadership:} Approve budget for runtime monitoring tooling
\\end{enumerate}

\\vspace{1em}
\\textbf{Next review:} June 15, 2026 — progress check on all hardening items.\\\\
\\emph{This document is classified INTERNAL. Do not share externally.}
\\end{frame}

\\end{document}`,
  },
];

export function createDefaultCustomStyle(baseTemplate: Template = templates[0]): CustomTemplateStyle {
  const defaults: Record<string, Omit<CustomTemplateStyle, 'baseTemplateName' | 'baseTheme'>> = {
    Meridian: {
      accentColor: '#0284c7',
      alertColor: '#dc2626',
      exampleColor: '#16a34a',
      bodyBg: '#ffffff',
      bodyFg: '#1e293b',
      mutedFg: '#64748b',
      titleBgStart: '#0f172a',
      titleBgEnd: '#0c4a6e',
      titleFg: '#f8fafc',
      sectionBgStart: '#0c4a6e',
      sectionBgEnd: '#0284c7',
      sectionFg: '#ffffff',
    },
    Ember: {
      accentColor: '#ea580c',
      alertColor: '#dc2626',
      exampleColor: '#16a34a',
      bodyBg: '#fafaf9',
      bodyFg: '#292524',
      mutedFg: '#78716c',
      titleBgStart: '#1c1917',
      titleBgEnd: '#44403c',
      titleFg: '#fafaf9',
      sectionBgStart: '#292524',
      sectionBgEnd: '#ea580c',
      sectionFg: '#fafaf9',
    },
    Arctic: {
      accentColor: '#7c3aed',
      alertColor: '#f87171',
      exampleColor: '#34d399',
      bodyBg: '#0f172a',
      bodyFg: '#e2e8f0',
      mutedFg: '#94a3b8',
      titleBgStart: '#020617',
      titleBgEnd: '#1e293b',
      titleFg: '#e2e8f0',
      sectionBgStart: '#1e1b4b',
      sectionBgEnd: '#7c3aed',
      sectionFg: '#f8fafc',
    },
    Canopy: {
      accentColor: '#059669',
      alertColor: '#dc2626',
      exampleColor: '#16a34a',
      bodyBg: '#ffffff',
      bodyFg: '#1e293b',
      mutedFg: '#64748b',
      titleBgStart: '#022c22',
      titleBgEnd: '#065f46',
      titleFg: '#ecfdf5',
      sectionBgStart: '#064e3b',
      sectionBgEnd: '#059669',
      sectionFg: '#ecfdf5',
    },
    Slate: {
      accentColor: '#71717a',
      alertColor: '#dc2626',
      exampleColor: '#16a34a',
      bodyBg: '#ffffff',
      bodyFg: '#18181b',
      mutedFg: '#71717a',
      titleBgStart: '#18181b',
      titleBgEnd: '#27272a',
      titleFg: '#fafafa',
      sectionBgStart: '#18181b',
      sectionBgEnd: '#18181b',
      sectionFg: '#fafafa',
    },
    Crimson: {
      accentColor: '#dc2626',
      alertColor: '#991b1b',
      exampleColor: '#16a34a',
      bodyBg: '#fffbfb',
      bodyFg: '#1c1917',
      mutedFg: '#78716c',
      titleBgStart: '#1c1917',
      titleBgEnd: '#7f1d1d',
      titleFg: '#fef2f2',
      sectionBgStart: '#450a0a',
      sectionBgEnd: '#dc2626',
      sectionFg: '#fef2f2',
    },
  };
  const colors = defaults[baseTemplate.theme] || defaults.Meridian;

  return {
    baseTemplateName: baseTemplate.name,
    baseTheme: baseTemplate.theme,
    ...colors,
  };
}

export function injectCustomThemeComment(latex: string, customTheme: CustomTemplateStyle): string {
  const comment = `${CUSTOM_TEMPLATE_COMMENT_PREFIX} ${JSON.stringify(customTheme)}`;
  const withoutExisting = latex.replace(new RegExp(`^${CUSTOM_TEMPLATE_COMMENT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\n?`, 'm'), '');

  return withoutExisting.replace(/(\\usetheme(?:\[[^\]]*\])?\{[^}]*\})/, `$1\n${comment}`);
}

export function createCustomTemplate(baseTemplate: Template, customTheme: CustomTemplateStyle): Template {
  return {
    name: CUSTOM_TEMPLATE_NAME,
    description: `Inherits ${baseTemplate.name} with your saved slide and command colors.`,
    category: 'Custom',
    theme: baseTemplate.theme,
    accentPreview: `linear-gradient(135deg, ${customTheme.titleBgStart}, ${customTheme.accentColor}, ${customTheme.titleBgEnd})`,
    latex: injectCustomThemeComment(baseTemplate.latex, customTheme),
    customTheme,
  };
}

export function getSavedCustomTemplate(): Template | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(CUSTOM_TEMPLATE_CACHE_KEY);
    const customTheme = raw ? JSON.parse(raw) as CustomTemplateStyle : null;
    if (!customTheme || typeof customTheme.baseTemplateName !== 'string') return null;

    const baseTemplate = templates.find(template => template.name === customTheme.baseTemplateName) || templates[0];
    return createCustomTemplate(baseTemplate, { ...customTheme, baseTemplateName: baseTemplate.name, baseTheme: baseTemplate.theme });
  } catch {
    return null;
  }
}

export function saveCustomTemplate(template: Template): void {
  if (typeof window === 'undefined' || !template.customTheme) return;

  try {
    window.localStorage.setItem(CUSTOM_TEMPLATE_CACHE_KEY, JSON.stringify(template.customTheme));
  } catch {
    // Browser storage can be unavailable or full; the template can still be used for this session.
  }
}
