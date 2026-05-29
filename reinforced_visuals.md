# Reinforced Visual Template Selection Guide

This guide governs the selection of visual layout templates when converting lecture transcript chunks into structured educational slides/visuals. 

---

## 1. Core Decision Rules

### Rule 1 — Prefer Simplicity
- If the lecture chunk is conversational, narrative, or doesn't have a clear structured concept/list, select **Face Only**.
- Do not force graphics where they add no direct educational value.

### Rule 2 — Match Information Density
Choose a template matching the transcript's structural organization and complexity:
- **Low Density**: Face Only, Type Template 1, Process Template 1, Differentiation Template 1, Timeline Template 1.
- **Medium Density**: Type Template 2, Process Template 2, Differentiation Template 2, Graph Templates, Hierarchy Template.
- **High Density**: Process Template 3, Timeline Template 2.

### Rule 3 — Strict Image Constraints
- Do NOT assume or generate image assets unless using **Differentiation Template 2** (which is designed for image-supported comparisons or case studies).
- For all other templates, output text/data content only.

---

## 2. Template Catalog & Mapping Criteria

### Type Templates (Categorization)
*Use when explaining categories, variants, classifications, or types.*
- **Type Template 1 (Low Density)**: Quick overview of 2-5 types. Output short labels and 1-sentence key differentiators.
- **Type Template 2 (Medium/High Density)**: Detailed concept breakdowns. Output subheadings and 2-3 sentence descriptive paragraphs for each type.

### Process Templates (Sequences & Steps)
*Use when explaining chronological procedures, workflows, algorithms, or cause-and-effect stages.*
- **Process Template 1 (Low Density)**: Simple ordered steps. Output short labels and brief explanations.
- **Process Template 2 (Medium Density)**: Multi-stage reasoning or moderately detailed academic procedures. Output subheadings and descriptive explanations for each stage.
- **Process Template 3 (High Density)**: Deep technical or multi-level workflows. Output headers, structured details, and bullet points.

### Differentiation Templates (Comparisons)
*Use when comparing and contrasting concepts, theories, models, or brands.*
- **Differentiation Template 1 (Low Density)**: Simple column-based text comparison points.
- **Differentiation Template 2 (Medium Density - Image Supported)**: Case studies or brand comparisons with a dedicated visual area and explanation text.

### Timeline Templates (Chronological Events)
*Use when explaining history, milestones, or progression over time.*
- **Timeline Template 1 (Low Density)**: Brief milestones with simple years/timestamps and 3-5 word event summaries.
- **Timeline Template 2 (Medium/High Density)**: Detailed chronological analysis. Output time markers, titles, and supporting descriptive bullet points.

### Hierarchy Templates (Top-Down Structure)
*Use for taxonomies, organization structures, parent-child systems, or architectures.*
- **Hierarchy Template 1**: Node-based tree structure representing hierarchy levels.

### Graph Templates (Quantitative Data)
*Use ONLY when the transcript references explicit numbers, trends, statistics, or measurable proportions.*
- **Graph Template 1 (Line Graph)**: Showing trends or performance over continuous progression (X-axis vs Y-axis).
- **Graph Template 2 (Bar Plot)**: Comparing quantities across discrete categories.
- **Graph Template 3 (Pie Chart)**: Representing proportional distributions (parts of a whole summing to 100%).

### Face Only (Default/No Graphics)
- Select when speech is narrative (storytelling, personal anecdotes), transitional ("Now let's look at..."), or lacks clear visual structures.

---

## 3. Structured JSON Schema for Visual Output

Every selected template must populate the `visuals` JSON object according to this schema:

```json
{
  "template_name": "Must be one of: Type Template 1, Type Template 2, Process Template 1, Process Template 2, Process Template 3, Differentiation Template 1, Differentiation Template 2, Timeline Template 1, Timeline Template 2, Hierarchy Template 1, Graph Template 1, Graph Template 2, Graph Template 3, Face Only",
  "why_chosen": "Detailed justification citing rules, information density, or transcript structural properties.",
  "graphics_required": true or false, (false ONLY for Face Only),
  "content": {
    "title": "Clear, educational heading for the visual slide",
    "items": [
      {
        "value": "Bullet point or simple list value string",
        "timestamp": 12.4
      }
    ],
    "details": [
      {
        "label": "Name of category, step, concept, timeline year, or graph category",
        "value": "Description, differentiator, event summary, or quantitative value (must match numeric data if a graph)",
        "timestamp": 25.8,
        "extra": "Optional supporting context, parent node for hierarchy, or image URL/metadata for Differentiation Template 2"
      }
    ]
  }
}
```

> [!IMPORTANT]
> **Element Timestamps**: For each element inside `items` or `details`, you MUST determine the precise `timestamp` (a float number representing seconds, e.g., 25.8) when the speaker begins discussing or explaining that specific item, step, category, or detail. Map this using the word-level or sentence-level timestamps provided in the transcript data. Do not make up timestamps outside of the chunk's time bounds.
```
