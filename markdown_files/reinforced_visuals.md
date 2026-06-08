---
name: visual-template-selection
description: >
  Use this skill whenever converting lecture transcript chunks into structured
  educational slides or visual overlays. Covers all template types — Type,
  Process, Differentiation, Timeline, Hierarchy, Graph, and Face Only — with
  precise selection criteria, formatting rules, content density guidance, and
  JSON output schema. Trigger any time you must decide which visual template
  fits a transcript segment, populate slide content, or validate that a chosen
  template matches the transcript's structure and density. Do NOT skip this
  skill and rely on memory; template rules, overflow behaviour, and formatting
  constraints are specific and must be applied exactly.
---

# Visual Template Selection Guide

A complete reference for choosing, populating, and validating visual layout
templates when converting lecture transcript chunks into educational slides.

---

## 1. Core Decision Rules

### Rule 1 — Prefer Simplicity
- If the transcript chunk is conversational, narrative, or lacks a clear
  structured concept or list, select **Face Only**.
- Do not force graphics where they add no direct educational value.

### Rule 2 — Match Information Density
Select a template whose density tier matches the transcript's structural
complexity:

| Density | Templates |
|---------|-----------|
| **Low** | Face Only, Type Template 1, Process Template 1, Differentiation Template 1, Timeline Template 1, Type Template No 24, Type Template No 25, Type Template No 26, Type Template No 28, Type Template No 29, Type Template No 41 |
| **Medium** | Type Template 2, Process Template 2, Differentiation Template 2, Graph Templates, Hierarchy Template 1, Type Template No 22, Process Template 4, Type Template No 30, Type Template No 31, Type Template No 35 |
| **High** | Process Template 3, Timeline Template 2, Type Template No 27, Type Template No 32, Type Template No 33, Type Template No 36, Type Template No 40 |

### Rule 3 — Strict Image Constraints
- Do **not** assume or generate image assets unless using **Differentiation Template 2**, **Type Template No 17**, **Type Template No 25**, **Type Template No 27**, or **Type Template No 40** — the only templates whose layouts support image integration.
- For every other template, output text and data content only.

### Rule 4 — Typography & Formatting
Apply these rules to every template without exception:

| Element | Rule |
|---------|------|
| **Plate Heading** | ALL CAPS · as short as possible · max 2 lines · max 32 characters (unless a stricter per-template limit applies) |
| **Subheadings** | Title Case |
| **Description / Content text** | Sentence case |
| **Icons** | Line icons only — no black-fill icons. Omit only when text length or formatting explicitly permits it. |
| **Sentence length** | Max 10–15 words per sentence. If a sentence exceeds 15 words, split it or rephrase as two shorter sentences. |
| **Paragraph length** | Max 2 sentences per paragraph. A third sentence is only permitted when omitting it would lose a critical detail that cannot be merged or implied. |
| **Subheading (mandatory)** | Every non-Face-Only template **must** include a subheading for every content block that contains generated text. No sentence, description, bullet point, or paragraph may appear without a subheading above it. This is a hard rule — there are no exceptions outside of Face Only. |
| **Font sizes** | Fixed in rendering — adhere strictly to word-count, line, and length limits for each template. |

### Rule 5 — Prefer Split-Screen Over Full-Screen OG Variants
When both a split-screen template and a full-screen ("OG") variant are
candidates for the same content, **always default to the split-screen
version**. The speaker's presence in the frame maintains engagement and
pedagogical continuity. Only select an OG (full-screen) variant when one of
the following conditions is explicitly met:

| Condition | Example |
|-----------|---------|
| The graphic is too dense to share space with the speaker | A large hierarchy tree or a detailed timeline with many nodes |
| The content is a standalone reference slide with no accompanying narration | A summary table shown after the speaker has finished explaining |
| The producer or script explicitly marks the segment as full-screen | Slide notes contain "full screen" or "OG" instruction |

When in doubt, **split-screen wins**. Document the reason in `why_chosen`
whenever an OG variant is selected.

---

## 2. Template Catalog

### 2.1 Type Templates — Categorisation
*Use when explaining categories, variants, classifications, or types.*

---

#### Type Template 1 · Low Density
**When to use:** Quick overview of 2–5 types; each needs only a short label
and a one-sentence key differentiator.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines, max 32 characters |
| Points | Max 3 points or sub-points per type |
| Icons | Line icons required; replaceable with numbers or short-forms only |
| Images | ✗ Not permitted |
| Overflow | > 4 types → split into two plates (previous points slide out) |

---

#### Type Template 2 · Medium–High Density
**When to use:** Detailed concept breakdowns where each type needs a
subheading and a 2–3 sentence descriptive paragraph.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines, max 32 characters |
| Points | As many as needed (previous points slide up) |
| Icons | Line icons required; replaceable with numbers or short-forms only |
| Images | ✗ Not permitted |

---

#### Type Template No 16 · Split-Screen, Sequential Steps
**When to use:** Split-screen layout (speaker left, graphics right); speech
outlines a sequence of **up to 4** distinct steps or concepts, each needing a
short description or brief bulleted list.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines |
| Subheadings | Optional — if omitted, content is centre-aligned |
| Description | Max 3 lines per point; bullet pointers allowed |
| Icons | Line icons or numbers required |
| Images | ✗ Not permitted |
| Overflow | > 4 types → split into two plates (first type slides out) |

---

#### Type Template No 17 · Split-Screen, Deep Dive
**When to use:** Split-screen layout; speech introduces numbered points that
require an expanded detailed explanation or supporting graphics/images for a
specific list item.

| Constraint | Rule |
|------------|------|
| Heading | Omit if it would exceed two lines |
| Images | ✓ Permitted — inside the sub-text box or outside it (briefly) |
| Overflow | > 5 types → split into two plates (first type slides out) |

---

#### Type Template No 18 · Split-Screen, Q&A Format
**When to use:** Split-screen layout; speech follows a structured
question-and-answer format displaying specific questions (Q1, Q2 …) alongside
their answers.

| Constraint | Rule |
|------------|------|
| Questions | Sentence case; max 2 lines per question |
| Answers | 2–3 answers per question (box extends to fit) |
| Usage | Only when **both** questions and answers must appear together |
| Overflow | > 3 questions → split into two plates (first question slides out) |

---

#### Type Template No 18 OG · Full-Screen, Q&A Format
**When to use:** Same as Type Template No 18 but using a **full-page layout**
(no speaker visible).

All guidelines from Type Template No 18 apply — rendered full-screen.

---

#### Type Template No 20 · Split-Screen, Two Concepts
**When to use:** Split-screen layout; speech outlines **exactly two** distinct
types, categories, or concepts, each needing a short description or a few
bullet points.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines, max 32 characters |
| Content alignment | Description/paragraph only → centre-align; with pointers → left-align |
| Word limit | Description text max 5 lines |

---

#### Type Template No 20 OG · Full-Screen, Two Concepts
**When to use:** Same as Type Template No 20 but using a **full-page layout**
(no speaker visible), showing two concepts side-by-side.

All guidelines from Type Template No 20 apply — rendered full-screen.

---

#### Type Template No 21 · Split-Screen, Three Visual Concepts
**When to use:** Split-screen layout; speech outlines **exactly three** types
or concepts, each requiring only a subheading and a supporting graphic —
no additional text or bullet points.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 words |
| Subheadings | Title Case, max 2–3 words inside the circle |
| Icons | Required; replaceable with a short description (not recommended) |
| Sub-bullets | ✗ Not supported — use Type Template No 21 OG instead |

---

#### Type Template No 21 OG · Full-Screen, Three Visual Concepts with Callouts
**When to use:** Full-page layout (no speaker visible); speech outlines three
types or concepts represented by graphics and subheadings, where specific
concepts require brief text callouts or short points branching off from them.

All guidelines from Type Template No 21 apply, with the addition of brief
text callouts or sub-pointer branches on specific concepts.

---

#### Type Template No 22 · Split-Screen, Types with Description
**When to use:** Split-screen layout displaying 5-7 categories or key takeaways, where each category needs a title and a brief description of 5-10 words.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 words |
| Subheadings | Title Case |
| Description | Sentence case; max 10 words per description |
| Icons | Line icons required (can be replaced with numbers, but cannot be omitted) |
| Limit | Max 5 visible categories at once (if more, first two slide up) |

---

#### Type Template No 24 · Glassbox (Percentage)
**When to use:** Displaying a statistics fact, quantitative survey results, or percentages in a glassbox card.

| Constraint | Rule |
|------------|------|
| Heading | Optional, allowed ONLY in the Split-Screen version; ALL CAPS |
| Description Header | ALL CAPS |
| Description / Text | Sentence case |
| Visuals | Glassbox card highlighting the percentage figure |

---

#### Type Template No 25 · Glassbox (Company Logo)
**When to use:** Displaying company, brand, product, or organization logos/images to build brand recall.

| Constraint | Rule |
|------------|------|
| Heading | ✗ Not permitted |
| Logos / Images | High quality required (must be specified in JSON) |
| Text / Description | ✗ Not permitted |

---

#### Type Template No 26 · Question Box
**When to use:** Displaying a single focus question, reflection prompt, or discussion prompt for learner engagement.

| Constraint | Rule |
|------------|------|
| Question Text | Sentence case; max 25 words |
| Headings | ✗ Not permitted |
| Explanations | ✗ Not permitted (only the question text inside the box) |

---

#### Type Template No 27 · Definition Plate
**When to use:** Defining a new term, theory, framework, or dictionary-style definition.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS |
| Subheading | Optional, Title Case |
| Definition Text | Sentence case; readable & concise |
| Keywords | Bold and highlighted in **red** (must be specified in JSON) |
| Right Column | Supporting vector/illustration (must be specified in JSON) |
| Processes | ✗ Do not use for sequential processes |

---

#### Type Template No 28 · Quote Plate
**When to use:** Highlighting famous quotes, sayings, principles, or memorable statements.

| Constraint | Rule |
|------------|------|
| Quote Text | Sentence case; no trailing full stops |
| Speaker Image | ✗ Not permitted |
| Keywords | Bold and black (must be specified in JSON) |
| Quotation Styling | Stylized quotation marks |

---

#### Type Template No 29 · Takeaway Plate
**When to use:** Highlighting a key learning point, conclusion, or a very brief definition.
**this template does not use a header or title.**
| Constraint | Rule |
|------------|------|
| Heading | ✗ Not permitted |
| Punctuation | No trailing full stops |
| Keywords | Bold and highlighted in **red** (must be specified in JSON) |
| Word limit | Ideally max 14-18 words (longer permitted in OG version) |

---

#### Type Template No 30 · Box Plate (Horizontal)
**When to use:** Displaying up to four concepts, pillars, categories, or framework elements horizontally side-by-side.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 32 characters |
| Subheading | Title Case (in each box) |
| Sub-pointers | Sentence case; max 5 words per pointer |
| Boxes limit | Max 4 boxes aligned horizontally |

---

#### Type Template No 31 · Box Plate (Vertical)
**When to use:** Displaying 2 or 3 vertically stacked boxes where more explanation space is needed per category.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 32 characters |
| Subheading | Title Case |
| Sub-pointers | Sentence case |
| Boxes limit | Max 3 stacked vertical boxes |

---

#### Type Template No 32 · Fact / Background Plate
**When to use:** Structured teaching with 4-5 main points and subpointers, or providing historical context, researcher bio, or origin background.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 32 characters |
| Subheadings | Mandatory, Title Case (for each main point/fact) |
| Sub-points | Sentence case (supporting detail/context) |
| Definitions | ✗ Do not use for pure definitions |

---

#### Type Template No 33 · Fact Plate
**When to use:** Presenting evidence-based findings, research facts, statistics, or general informational pointers with subpointers.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 32 characters |
| Subheadings | Mandatory, Title Case (for each point/fact) |
| Sub-points | Can have multiple sub-points in sentence case |

---

#### Type Template No 35 · Split-Screen, Glassbox Contrast
**When to use:** Split-screen layout displaying short statements, keywords, or paired contrasting concepts in glassbox style.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS |
| Subheading | Title Case |
| Description | Sentence case (no header style if only one sentence) |

---

#### Type Template No 36 · Heavy Text Plate
**When to use:** Detailed explanations, complex academic theories, or policy explanations that cannot be visualised using other templates.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 32 characters |
| Subheading | Title Case |
| Description | Sentence case |
| Usage rule | Use only as a last resort when other templates are unsuitable |

---

#### Type Template No 40 · Image with Description
**When to use:** Presentation where a specific case study, historical person, scenario, object, or story is central to the narration.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS |
| Description | Sentence case; no trailing periods |
| Person images | Must include name labels |
| Right Column | Dedicated case study image area (can use pointers and source tags) |

---

#### Type Template No 41 · Pointers
**When to use:** Lists of characteristics, benefits, features, or standalone ideas without hierarchical complexity.

| Constraint | Rule |
|------------|------|
| Description | Sentence case; max 15 words per pointer |
| Pointers limit | Max 6 visible pointers before sliding up |
| Sub-pointers | ✗ Not permitted (strictly flat list) |

---

### 2.2 Process Templates — Sequences & Steps
*Use when explaining chronological procedures, workflows, algorithms, or
cause-and-effect stages.*

---

#### Process Template 1 · Low Density
**When to use:** Simple ordered steps needing only short labels and brief
explanations.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines, max **20** characters |
| Pointers | Bullets allowed, max 2 lines; align pointers to the text |
| Images | ✗ Not permitted |
| Overflow | > 4 steps → first step slides out |

---

#### Process Template 2 · Medium Density
**When to use:** Multi-stage reasoning or moderately detailed academic
procedures; each stage needs a subheading and a descriptive explanation.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines, max 32 characters |
| Icons | Optional — remove if > 2 pointers per stage |
| Pointers | Can be faded to fit additional points |
| Images | ✗ Not permitted |
| Overflow | > 4 steps → first step slides out |

---

#### Process Template 3 · High Density
**When to use:** Deep technical or multi-level workflows requiring headers,
structured details, and multiple bullet points.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines, max 32 characters |
| Points | Unlimited sub-points (previous points slide up) |
| Icons & Images | ✗ Not permitted |
| Overflow | > 4 steps → first step slides out |

---

#### Process Template 4 · Split-Screen, Modern Process Flow
**When to use:** Split-screen layout displaying a sequential process, workflow, or customer journey with step titles (1-5 words) and NO supporting description.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS |
| Subheadings | Title Case |
| Icons | Line icons or numbers required |
| Limit | Max 5 stages visible at one time (if more, first stage slides out) |
| Descriptions | ✗ Not permitted |

---

### 2.3 Differentiation Templates — Comparisons
*Use **only** when the transcript is explicitly contrasting **exactly two** things side by side — two concepts, two brands, two interpretations, two outcomes, etc.*

> **Hard Rule:** Differentiation Templates are strictly for 2-vs-2 contrast. They must **never** be used for content that is sequential, causal, or procedural — even if that content involves two elements. If the relationship between the items implies order, flow, cause-and-effect, or progression, use a **Process Template** instead.

| Content Shape | Correct Template |
|---------------|-----------------|
| A vs B, two sides, no order | Differentiation Template 1 or 2 |
| Step 1 leads to Step 2, or Action causes Reaction | Process Template |
| Intention vs Impact (sequential narrative) | Process Template |
| Before vs After (implies progression) | Process Template |
| Two truly parallel, non-ordered concepts | Differentiation Template 1 or 2 |

---

#### Differentiation Template 1 · Low Density
**When to use:** Simple column-based text comparison of two sides.

| Constraint | Rule |
|------------|------|
| Text length | Max 3 lines per comparison point |
| Icons & Images | ✗ Not permitted |
| Overflow | > 4 differences → split into two plates (first 1–2 points slide out) |

---

#### Differentiation Template 2 · Medium Density, Image-Supported
**When to use:** Case studies or brand comparisons requiring a dedicated
visual area alongside explanation text.

| Constraint | Rule |
|------------|------|
| Side headings | Max 3 words each |
| Content | Description and pointers below the image; max 2–3 lines |
| Images | ✓ Required — used for differences only |

---

### 2.4 Timeline Templates — Chronological Events
*Use when explaining history, milestones, or progression over time.*

---

#### Timeline Template 1 · Low Density
**When to use:** Brief milestones needing only a year/timestamp and a 3–5
word event summary.

| Constraint | Rule |
|------------|------|
| Pointers | ✗ Cannot be added |
| Images | ✓ Text can be replaced with images |
| Timestamps | > 5 timestamps supported |

---

#### Timeline Template 2 · Medium–High Density
**When to use:** Detailed chronological analysis needing time markers,
event titles, and supporting descriptive bullet points.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 32 characters |
| Points | Unlimited; > 5 timestamps supported |
| Icons & Images | ✗ Not permitted |

---

### 2.5 Hierarchy Templates — Top-Down Structure
*Use for taxonomies, organisation structures, parent-child systems, or
architectures.*

---

#### Hierarchy Template 1
**When to use:** Node-based tree structures representing hierarchy levels.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS |
| Node text | Title Case; max 2 lines per node |
| Points | Unlimited nodes |
| Images | ✗ Not permitted |

---

### 2.6 Graph Templates — Quantitative Data
*Use **only** when the transcript references explicit numbers, trends,
statistics, or measurable proportions.*

---

#### Graph Template 1 · Line Graph
**When to use:** Showing trends or performance over a continuous progression
(X-axis vs Y-axis).

#### Graph Template 2 · Bar Plot
**When to use:** Comparing quantities across discrete categories.

#### Graph Template 3 · Pie Chart
**When to use:** Representing proportional distributions (parts of a whole
summing to 100%).

**Shared graph guidelines:**

| Constraint | Rule |
|------------|------|
| Heading | Required, ALL CAPS |
| Axis labels | Sentence case (Line and Bar graphs) |
| Sub-points | May appear on the right side of the graph |
| Source | Must be provided explicitly (e.g. "Courtesy: Company Name") |

---

### 2.7 Face Only — Default / No Graphics
**When to use:** Speech is narrative (storytelling, personal anecdotes),
transitional ("Now let's look at …"), or lacks any clear visual structure.
No graphics or overlay elements are added.

This is the **default fallback**. When in doubt, choose Face Only.

---

### 2.8 Misc Templates
*Use for specific layout needs such as mind maps, learner progress, soft skills, or outcome importance.*

---

#### Importance Template
**Purpose:** Used to introduce a module or concept that has 5 or 6 different constituent sessions or subtopics or a topic has 5 to 6 key takeaways such that each is either a title of 5-6 words or is explained in a single sentence of maximum 12 words.

**When to Use:**
- At the start of a concept/Mind Map.
- Before introducing a new module or topic with 5-6 component subtopics or types.
- Summarizing the 5-6 key takeaways from a topic.

**How to Identify This Situation in a Script:**
Look for:
- "Why is this topic important?"
- "In today's workplace..."
- "This module will help you..."
- "Understanding this concept will enable you to..."
- "The importance of learning this topic is..."

**What Appears on Screen:**
- Main heading.
- 2–5 importance statements.
- Short benefit-oriented descriptions (maximum 12 words).
- Visual emphasis on learner outcomes.

**Do's and Don'ts:**
- Focus on learner benefits.
- Focus on practical relevance.
- Keep statements concise and outcome-focused.
- Do not explain the entire module.
- Do not include detailed theory.
- Heading - ALL CAPS, Description - Sentence case.
- Description can be a maximum of 2 lines.
- Word limit: 10–12 words per point.
- Plate heading should be as short as possible.
- Heading cannot exceed 2 lines.

| Constraint | Rule |
|------------|------|
| Heading | ALL CAPS, max 2 lines, as short as possible |
| Description / Content | Sentence case, max 2 lines, 10–12 words per point |
| Statements limit | 2–5 importance statements |
| Visuals | Focus on learner benefits/outcomes and practical relevance |
| Theory / Explanations | ✗ Do not explain the entire module or include detailed theory |

**Example Script Cue:**
"Understanding conflict resolution helps managers improve teamwork, reduce misunderstandings, and improve workplace productivity."

---

#### IMT Mind Map
**Purpose:** Used to visually show the overall structure of a course or module and how the various topics connect to each other. Acts as a navigation map for the learner.

**When to Use:**
- Beginning of a module.
- Beginning of a course.
- Module overview sections.
- Learning journey explanations.

**How to Identify This Situation in a Script:**
Look for:
- "In this module we will cover..."
- "The module consists of..."
- "We will learn about..."
- "The key topics include..."

**What Appears on Screen:**
- Central module topic.
- Connected topic branches.
- Learning path.
- Visual topic relationships.

**Do's and Don'ts:**
- Use only for module mapping.
- Keep text concise.
- Show logical relationships between topics.
- Focus on learning structure.
- Do not use for detailed content explanations.
- Do not overload with excessive text.
- Circle should not contain text.
- Main heading should appear at the top in FULL CAPS.
- Used across all courses.
- Can be revisited during module summaries.

| Constraint | Rule |
|------------|------|
| Heading | FULL CAPS, at the top |
| Text | Concise, focus on learning structure |
| Circles | ✗ Should not contain text |
| Layout | Central module topic with connected branches showing relationships |
| Usage | Only for module mapping; do not use for detailed content explanations or overload with excessive text |

**Example Script Cue:**
"In this module we will study conflict styles, conflict assessment, negotiation, and resolution strategies."

---

#### NMIMS Mind Map
**Purpose:** Used to visually map module structure while also showing learner progress and learning outcomes. Designed specifically for NMIMS courses.

**When to Use:**
- Module introductions.
- Module overview videos.
- Learning outcome mapping.
- Module completion summaries.

**How to Identify This Situation in a Script:**
Look for:
- "In this module..."
- "By the end of this module..."
- "The learning objectives are..."
- "We will cover the following topics..."

**What Appears on Screen:**
- Central module structure.
- Learning outcomes.
- Connected topic nodes.
- Progress indicators.
- Completed segments turn green as the learner progresses.

**Do's and Don'ts:**
- Use specifically for NMIMS programs.
- Focus on learning outcomes.
- Show module progression clearly.
- Keep text concise.
- Do not overload the map with detailed explanations.
- Do not use for concept teaching.
- Should clearly communicate learning outcomes.
- Should visually connect module introduction and module summary.
- Completed segments should visually indicate progress.

| Constraint | Rule |
|------------|------|
| Text | Concise, focus on learning outcomes, clearly communicating them |
| Layout | Central module structure, connected topic nodes, progress indicators |
| Interactive Visuals | Completed segments turn green to indicate progress |
| Usage | NMIMS programs only; do not overload with details or use for concept teaching |

**Example Script Cue:**
"By the end of this module, you will be able to identify conflict styles, assess conflict situations, and choose appropriate resolution strategies."

---

#### Soft Skills Template
**Purpose:** Used to display short and simple 1-2 liner concepts, takeaways, learning summaries, communication principles, insights, or key messages in a clean and simple visual format not emphasizing it so much **this template does not use a header or title**. Maximum 15 words.

**When to Use:**
- Short conceptual explanations (maximum 15 words).
- An insight.
- A short learning takeaway or definition.
- A small supporting example/fact (maximum 15 words).

**How to Identify This Situation in a Script:**
Look for:
- "Good communication involves..."
- "Effective leaders..."
- "Coaches should..."
- "Trust develops when..."

**What Appears on Screen:**
- Main concept.
- Short supporting description.
- Simple visual treatment.
- Minimal text.

**Do's and Don'ts:**
- Use for short soft-skills concepts.
- Keep messaging concise.
- Focus on behavioural learning.
- Do not use for detailed frameworks.
- Do not use for long explanations.
- Text Description - Sentence case.
- Maximum 2 sentences (maximum 15 words).

| Constraint | Rule |
|------------|------|
| Description | Sentence case, max 2 sentences, max 15 words total |
| Visuals | Simple visual treatment, minimal text |
| Usage | Soft-skills concepts only; do not use for detailed frameworks or long explanations |

**Example Script Cue:**
"Trust is built through consistency, transparency, and genuine concern for others."

---

## 3. Template Quick-Selection Reference

Use this table for fast first-pass matching before consulting full guidelines.

| Signal in Transcript | First Template to Consider |
|----------------------|---------------------------|
| Narrative, anecdote, transition | Face Only |
| 2–5 types, short labels | Type Template 1 |
| 2–5 types, detailed paragraphs | Type Template 2 |
| Up to 4 sequential steps, short descriptions, split-screen | Type Template No 16 |
| Numbered points needing deep-dive or images, split-screen | Type Template No 17 |
| Q&A pairs | Type Template No 18 *(split-screen — preferred)* |
| Q&A pairs, graphic too dense for split or explicit full-screen instruction | Type Template No 18 OG *(full-screen — fallback only)* |
| Exactly 2 concepts, short desc | Type Template No 20 *(split-screen — preferred)* |
| Exactly 2 concepts, graphic too dense for split or explicit full-screen instruction | Type Template No 20 OG *(full-screen — fallback only)* |
| Exactly 3 concepts, graphic + label only | Type Template No 21 *(split-screen — preferred)* |
| Exactly 3 concepts, graphic + callouts, too dense for split or explicit full-screen instruction | Type Template No 21 OG *(full-screen — fallback only)* |
| 5–7 points, brief descriptions (max 10 words), split-screen | Type Template No 22 |
| Quantitative stats / percentage highlights in a card | Type Template No 24 |
| Brand/competitor/organization logos grid | Type Template No 25 |
| Single key question or reflection prompt | Type Template No 26 |
| Academic concept/term definition + vector illustration | Type Template No 27 |
| Memorable quote or principle citation | Type Template No 28 |
| Learning takeaway / short definition (max 14–18 words) | Type Template No 29 |
| Up to 4 framework pillars horizontally side-by-side | Type Template No 30 |
| 2–3 stacked vertical boxes with longer description | Type Template No 31 |
| Detailed topic with 4–5 main points and subpointers, or researcher bio/context | Type Template No 32 |
| Evidence-based observations/findings with subpointers | Type Template No 33 |
| Short statements/paired concepts in glassbox style, split-screen | Type Template No 35 |
| Text-heavy explanation as a last resort | Type Template No 36 |
| Case study, person scenario, story with main image | Type Template No 40 |
| Flat list of benefits/features (max 15 words per point) | Type Template No 41 |
| Simple ordered steps (≤ 4) | Process Template 1 |
| Multi-stage reasoning, moderate detail | Process Template 2 |
| Deep technical workflow | Process Template 3 |
| Ordered steps (titles only, ≤ 5), split-screen | Process Template 4 |
| Simple side-by-side comparison | Differentiation Template 1 |
| Brand/case-study comparison with images | Differentiation Template 2 |
| Short milestones + years only | Timeline Template 1 |
| Detailed chronological analysis | Timeline Template 2 |
| Taxonomy / org chart / parent-child | Hierarchy Template 1 |
| Explicit numeric data — trend over time | Graph Template 1 |
| Explicit numeric data — category comparison | Graph Template 2 |
| Explicit numeric data — proportions (sum = 100%) | Graph Template 3 |
| 5–6 key takeaways or subtopics, intro/benefits, outcome emphasis | Importance Template |
| Course/module structure overview or learning journey map | IMT Mind Map |
| Module structure mapping showing progress & outcomes (NMIMS) | NMIMS Mind Map |
| Short soft-skills concept, insight, takeaway (max 15 words) | Soft Skills Template |

---

## 4. JSON Output Schema

Every selected template must output a `visuals` JSON object matching this
schema exactly.

```json
{
  "template_name": "<one of the exact names listed in Section 2>",
  "why_chosen": "Detailed justification citing the decision rule(s), information density tier, and structural properties of the transcript that led to this selection.",
  "graphics_required": true,
  "content": {
    "title": "Clear educational heading for the visual slide",
    "items": [
      {
        "value": "Bullet point or simple list value string.",
        "timestamp": 12.4
      }
    ],
    "details": [
      {
        "label": "Category name, step name, concept, timeline year, or graph category",
        "value": "Description, differentiator, event summary, or quantitative value. Must match numeric data exactly for graph templates.",
        "timestamp": 25.8,
        "extra": "Optional: supporting context, parent-node label for hierarchies, or image URL/metadata for Differentiation Template 2 and Type Template No 17."
      }
    ]
  }
}
```

> **Face Only exception:** Set `"graphics_required": false` and omit `items`
> and `details`. `template_name` must be `"Face Only"`.

---

## 5. Timestamp Rules

- Every element inside `items` or `details` **must** carry a `timestamp`
  (float, seconds) marking when the speaker **begins** discussing that
  specific item.
- Derive timestamps from word-level or sentence-level transcript data.
- **Never** invent timestamps or use values outside the chunk's time bounds.
- If a precise timestamp cannot be determined, use the nearest verifiable
  boundary within the chunk.

---

## 6. Common Mistakes to Avoid

| Mistake | Correct Behaviour |
|---------|------------------|
| Choosing a template with images for a non-image template | Images only in Differentiation Template 2, Type Template No 17, Type Template No 25, Type Template No 27, and Type Template No 40 |
| Heading in mixed case | ALL CAPS always for plate headings |
| Heading exceeding 32 characters | Shorten the title; rephrase if necessary |
| Selecting Type Template No 21 when sub-bullets exist | Use Type Template No 21 OG instead |
| Using a Graph Template without explicit numeric data | Switch to a Type or Process template |
| Guessing timestamps | Derive from transcript word/sentence boundaries only |
| Adding icons to Process Template 3 or Timeline Template 2 | Icons not permitted in these templates |
| Using Q&A templates without both Q and A present | Face Only or a Type template is more appropriate |
| Choosing an OG (full-screen) variant without justification | Default to the split-screen equivalent; only use OG when content is too dense, explicitly instructed, or has no live narration |
| Sentences exceeding 15 words | Split into two shorter sentences or rephrase; max 10–15 words per sentence |
| Paragraphs running longer than 2 sentences | Trim to 2 sentences; a third is only allowed when a critical detail cannot otherwise be captured |
| Content block with no subheading (non-Face-Only template) | Every block of generated text must have a subheading — add one; this rule has no exceptions outside Face Only |
| Using Differentiation Template for sequential or causal content | If content has order, flow, or cause-and-effect (e.g. intention → impact, action → reaction), use a Process Template instead |
| Using Differentiation Template for more than 2 things | Differentiation is strictly 2-vs-2; for 3+ items use a Type Template |
| Adding Heading in Template 29| Leave the heading section blank or do not generate a heading at all|