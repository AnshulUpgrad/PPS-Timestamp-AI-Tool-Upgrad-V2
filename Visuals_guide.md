Visual Template Selection Guide for Educational Video Transcript Structuring
Purpose

This document defines the available visual templates that an AI system can choose from when processing educational video transcripts.

The AI receives:

A transcript chunk from a lecture/video
Contextual speech from a speaker/professor
No visual assets unless explicitly mentioned

The AI must:

Understand the intent and structure of the transcript chunk
Select the most appropriate visual template
Decide whether visuals are needed at all
Avoid unnecessary graphics
Core Decision Rules
Rule 1 — Prefer Simplicity

If information can be communicated clearly without graphics, prefer:

Face Only
Simple Process Templates
Simple Differentiation Templates

Do not force graphics into every chunk.

Rule 2 — Graphics Must Match Information Density
Information Density	Recommended Template
Very low	Face Only
Low	Type/Differentiation Template 1
Medium	Process Template 1 or 2
High	Process Template 3
Structured data	Graph Templates
Chronological events	Timeline Templates
Organizational structure	Hierarchy Template
Rule 3 — No Images Unless Explicitly Allowed

Do NOT generate:

Illustrations
Icons
Decorative graphics
Photos
Case study imagery

UNLESS the chosen template explicitly supports images.

Currently only:

Differentiation Template 2

supports image-based layouts.

TEMPLATE DEFINITIONS
TYPE TEMPLATES

These templates are used when the speaker is explaining multiple categories, classifications, variants, or types of something.

Examples:

Types of memory
Types of leadership
Types of machine learning
Types of psychological tests
Type Template 1
Purpose

Used when multiple types need to be briefly differentiated.

Structure
Title/Heading
List of types
Each type gets:
1–2 lines maximum
Short explanation
Key differentiator
Information Density

Low

Best Use Cases
Quick comparisons
Introductory overviews
Classification summaries
Fast conceptual differentiation
Avoid When
Detailed explanations are needed
Large paragraphs are required
Deep analysis is present
Example Style
Type A → used for X
Type B → focuses on Y
Type C → optimized for Z
Type Template 2
Purpose

Same core purpose as Type Template 1, but more text-heavy.

Structure
Title/Heading
Multiple types/categories
Each section contains:
Subheading
Longer descriptive paragraph
Supporting explanation
Information Density

Medium to High

Best Use Cases
Educational breakdowns
Conceptual teaching
Detailed category explanations
Academic comparisons
Avoid When
The transcript only briefly mentions types
Information is too short
PROCESS TEMPLATES

Used when the speaker explains:

Steps
Workflows
Sequences
Procedures
Cause-and-effect flows

Examples:

Steps in memory formation
Research methodology flow
Conflict resolution process
How a neural network trains
Process Template 1
Purpose

Simple step-by-step flow with minimal text.

Structure
Heading
Ordered steps/process flow
Each step contains:
Short label
1–2 line explanation
Information Density

Low

Best Use Cases
Simple procedures
High-level workflows
Fast process explanations
Sequential teaching
Avoid When
Large explanations exist
The speaker elaborates heavily on each step
Process Template 2
Purpose

Moderately detailed process explanation.

Structure
Heading
Multiple process stages
Each stage includes:
Subheading
Supporting paragraph
Moderate detail
Information Density

Medium

Best Use Cases
Educational walkthroughs
Academic processes
Analytical explanations
Multi-stage reasoning
Avoid When
The process is extremely simple
Very heavy detail is required
Process Template 3
Purpose

Highly detailed process visualization.

Structure
Heading
Multi-level process sections
Detailed paragraphs
Optional bullet points
Rich explanatory content
Information Density

High

Best Use Cases
Deep teaching segments
Complex workflows
Technical explanations
Detailed academic instruction
Avoid When
Transcript chunk is short
Process is simple
Minimal explanation exists
DIFFERENTIATION TEMPLATES

Used when the speaker compares:

Concepts
Models
Theories
Systems
Products
Case studies

Examples:

Classical vs Operant Conditioning
Qualitative vs Quantitative Research
Brand comparisons
Theory comparisons
Differentiation Template 1
Purpose

Simple comparison between concepts.

Structure
Heading
Comparison points
Each point:
Very short explanation
Maximum 1–2 lines
Information Density

Low

Best Use Cases
Quick conceptual comparisons
Simple differentiations
Short educational contrasts
Avoid When
Heavy explanation exists
Case-study depth is needed
Differentiation Template 2
Purpose

Image-supported comparison or case-study explanation.

Structure
Visual/Image area
Supporting explanation text below
Case-study style presentation
Information Density

Medium

Special Rule

This is the ONLY template that supports images/graphics.

Best Use Cases
Brand case studies
Product comparisons
Real-world examples
Visual explainers
Avoid When
No visual reference is needed
Transcript is purely theoretical
Speaker is storytelling
TIMELINE TEMPLATES

Used when the speaker explains events over time.

Examples:

Historical development
Research evolution
Company growth timeline
Chronological milestones
Timeline Template 1
Purpose

Minimal timeline visualization.

Structure
Timeline points
Each milestone contains:
Year/month/time marker
3–5 word summary
Information Density

Low

Best Use Cases
Fast chronological summaries
Historical overviews
Lightweight event sequencing
Avoid When
Detailed historical explanation exists
Timeline Template 2
Purpose

Detailed chronological explanation.

Structure
Timeline milestones
Each milestone includes:
Subheading
Bullet points
Supporting details
Information Density

Medium to High

Best Use Cases
Historical teaching
Detailed event analysis
Evolution of ideas/systems
Avoid When
Timeline references are brief
HIERARCHY TEMPLATE
Hierarchy Template 1
Purpose

Used for hierarchical structures.

Structure
Tree-like layout
Parent-child relationships
Organizational structure
Best Use Cases
Organizational hierarchy
Taxonomy
Classification trees
System architecture
Avoid When
Information is sequential instead of hierarchical
GRAPH TEMPLATES

Used ONLY when the transcript explicitly references:

Numerical relationships
Trends
Statistics
Comparisons with measurable values

Do NOT invent data.

If numerical data is not present or strongly implied, avoid graph templates.

Graph Template 1 — Line Graph
Purpose

Show trends over continuous progression.

Best Use Cases
Growth over time
Performance trends
Continuous change
Requirements
X-axis variable
Y-axis variable
Trend relationship
Graph Template 2 — Bar Plot
Purpose

Compare quantities across categories.

Best Use Cases
Category comparisons
Frequency comparisons
Discrete measurements
Requirements
Distinct categories
Comparable values
Graph Template 3 — Pie Chart
Purpose

Show proportional distribution.

Best Use Cases
Percentage breakdowns
Share distributions
Composition analysis
Requirements
Parts of a whole
Relative proportions
Graph Template 4
Purpose

Reserved for future graph types.

FACE ONLY MODE
Purpose

No graphics or templates are shown.

Only the speaker/video footage remains visible.

Use Face Only When
Storytelling
Personal stories
Experiences
Anecdotes
Conversational Speech
Motivation
Introductions
Casual commentary
Emotional/Reflective Segments
Life lessons
Reflections
Opinions
Weak Visual Structure

When the transcript:

Has no clear structure
Contains no classifications
Contains no process
Contains no comparisons
Contains no timeline
Contains no data
Filler/Transition Segments
“Now let’s move to the next topic…”
Recaps
Verbal transitions
Administrative speech
TEMPLATE SELECTION LOGIC
Choose Type Templates When

The speaker says:

“There are three types…”
“These categories include…”
“This can be classified into…”
Choose Process Templates When

The speaker explains:

Steps
Sequences
Workflows
Procedures
Stages

Indicators:

“First… then… finally…”
“The process works by…”
“Step one is…”
Choose Differentiation Templates When

The speaker compares things.

Indicators:

“Unlike…”
“Compared to…”
“On the other hand…”
“The difference between…”
Choose Timeline Templates When

The transcript is chronological.

Indicators:

Years
Dates
Historical progression
“Over time…”
Choose Hierarchy Templates When

The information is structured as:

Parent → child
Top-down systems
Organizational structures
Choose Graph Templates When

The speaker references:

Statistics
Data
Numerical trends
Percentages
Quantitative relationships
Choose Face Only When

No visual structure meaningfully improves understanding.

This is preferred over forcing weak visuals.

IMPORTANT FINAL RULES
Do NOT Force Templates

A transcript chunk does NOT need a visual template.

Face Only is a valid and preferred outcome when visuals add little value.

Match Visual Complexity to Transcript Complexity

Avoid:

Complex layouts for simple explanations
Heavy graphics for conversational speech
Prefer Educational Clarity

The goal is:

Faster comprehension
Better educational retention
Cleaner visual communication

NOT decorative visuals.

FINAL OUTPUT EXPECTATION FOR AI

For every transcript chunk, the AI should output:

Selected Template Name
Why the template was chosen
Whether graphics are required
What content should populate the template

OR

Face Only
Reason why no graphics are beneficial