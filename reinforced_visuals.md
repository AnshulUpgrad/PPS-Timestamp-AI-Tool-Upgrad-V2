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
| **Low** | Face Only, Type Template 1, Process Template 1, Differentiation Template 1, Timeline Template 1 |
| **Medium** | Type Template 2, Process Template 2, Differentiation Template 2, Graph Templates, Hierarchy Template 1 |
| **High** | Process Template 3, Timeline Template 2 |

### Rule 3 — Strict Image Constraints
- Do **not** assume or generate image assets unless using **Differentiation
  Template 2** or **Type Template No 17** — the only templates whose layouts
  support image integration.
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
| Simple ordered steps (≤ 4) | Process Template 1 |
| Multi-stage reasoning, moderate detail | Process Template 2 |
| Deep technical workflow | Process Template 3 |
| Simple side-by-side comparison | Differentiation Template 1 |
| Brand/case-study comparison with images | Differentiation Template 2 |
| Short milestones + years only | Timeline Template 1 |
| Detailed chronological analysis | Timeline Template 2 |
| Taxonomy / org chart / parent-child | Hierarchy Template 1 |
| Explicit numeric data — trend over time | Graph Template 1 |
| Explicit numeric data — category comparison | Graph Template 2 |
| Explicit numeric data — proportions (sum = 100%) | Graph Template 3 |

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
| Choosing a template with images for a non-image template | Images only in Differentiation Template 2 and Type Template No 17 |
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