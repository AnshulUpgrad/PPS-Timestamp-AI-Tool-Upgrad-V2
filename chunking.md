# Script Parsing, Chunking & Sentence Integrity Workspace

This document explains the text parsing, initial pre-chunking, Gemini-driven chunk refinement, interactive editor, and real-time validation checks that ensure structure integrity during user editing.

---

## 1. Sentence Extraction & Splitter

Before a lecture script can be organized, it must be split into atomic, addressable units: **sentences**. The system assigns each sentence a unique `sentence_id` (e.g., `S1`, `S2`) which acts as its permanent key throughout the pipeline.

### Abbreviations-Aware Splitting

A simple split on periods (`.`) would erroneously segment common abbreviations (e.g., *Dr. Smith*, *e.g.*, *vs.*). The `split_into_sentences` helper in [app.py](file:///c:/Work%20Stuf/Prototypes/heading_matcher/app.py) solves this:

```python
abbreviations = {
    'dr', 'mr', 'mrs', 'ms', 'prof', 'sr', 'jr', 'vs', 'etc', 'eg', 'ie', 
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
}
```

The algorithm splits text on standard boundaries (`.`, `!`, `?` followed by space) and then evaluates the final word of the segment. If it matches the abbreviations dictionary, it recombines the segment with the next sequence, avoiding artificial sentence breaks.

---

## 2. Rule-Based Pre-Chunking

After sentence extraction, the server creates a default list of chunks. It groups sentences sequentially in groups of **5** (configurable):

```python
chunk_size = 5
pre_chunks = []
for i in range(0, len(sentences), chunk_size):
    chunk_id = (i // chunk_size) + 1
    chunk_sentence_ids = [s["sentence_id"] for s in sentences[i:i + chunk_size]]
    pre_chunks.append({
        "chunk_id": chunk_id,
        "sentence_ids": chunk_sentence_ids,
        "approved": False
    })
```

This serves two purposes:
1. **Fallback**: If the Gemini API key is missing or the API rate-limit fails, the user is still presented with a functional structure.
2. **LLM Template**: The initial pre-chunks are passed to Gemini as a baseline layout, speeding up model decision-making.

---

## 3. Gemini Structural Chunk Refinement

If `GEMINI_API_KEY` is present, the app calls Gemini to group sentences semantically (e.g., merging sentences about "historical context" into one chunk, and splitting "mathematical derivations" into another).

### Structured Output Schemas

The model is restricted to a strict output layout using Pydantic models:

```python
class RefinedChunk(BaseModel):
    chunk_id: int = Field(description="Sequential ID of the chunk.")
    sentence_ids: List[int] = Field(description="Strictly ordered list of sentence IDs in this chunk.")

class ChunkRefinement(BaseModel):
    chunks: List[RefinedChunk] = Field(description="List of refined chunks containing sentence groups.")
```

By passing `response_schema=ChunkRefinement` to the Gemini client, the system forces the LLM to output valid JSON conforming exactly to this structure.

### Prompt & Verification Constraints

The model is instructed:
1. You MUST include every single sentence ID from the input list exactly once.
2. Do not skip, omit, or duplicate any sentence ID.
3. Chunks must be sequential. Do not reorder sentences globally.
4. Do not rewrite, edit, or delete any sentence text.

### Validation Fallback

Even with structured output, the backend performs a strict programmatic sanity check:

```python
all_input_ids = {s["sentence_id"] for s in sentences}
all_output_ids = []
for rc in refined_chunks:
    all_output_ids.extend(rc.get("sentence_ids", []))
    
is_valid = (set(all_output_ids) == all_input_ids and len(all_output_ids) == len(all_input_ids))
if is_valid:
    is_valid = (all_output_ids == sorted(all_output_ids))
```

If the LLM output violates any of these validation rules, the server discards the AI's suggestions and falls back to the safe, rule-based pre-chunks.

---

## 4. Client-Side Chunk Editor

In Step 2 of the wizard panel, the user is presented with the **Structure Refinement Workspace** managed by [step2.js](file:///c:/Work%20Stuf/Prototypes/heading_matcher/static/js/step2.js).

### User Operations
* **Move Sentence Up/Down**: Clicking arrow icons moves sentences between adjacent chunks.
* **Merge with Next**: Merges all sentences of the current chunk into the succeeding chunk.
* **Delete Chunk**: Deletes the empty chunk row (if it has sentences, they are automatically shifted to the nearest neighboring chunk to prevent text loss).
* **Split Chunk**: Splits a chunk in half or splits it immediately before a specific sentence, creating a new sequential chunk.
* **Reset Chunks**: Resets all custom work back to the default rule-based 5-sentence groups.

---

## 5. Real-Time Sentence Integrity Validation

To guarantee that the final timestamp alignment does not crash or lose script data, a real-time validation routine (`validateIntegrity`) runs on the client after every single edit:

```javascript
const missing = allSentenceIds.filter(id => !mappedSentenceIds.includes(id));
const duplicates = mappedSentenceIds.filter((item, index) => mappedSentenceIds.indexOf(item) !== index);
const isSorted = mappedSentenceIds.every((val, i, arr) => !i || arr[i-1] <= val);
```

### Integrity Display States:

| State | CSS Class | Badge Text | Button Action |
|---|---|---|---|
| **Clean** | `.integrity-badge.clean` | `Sentence Integrity: OK` | Enables "Continue to Headings" |
| **Error** | `.integrity-badge.error` | Displays missing/duplicate IDs (e.g., `Missing S12, Duplicate S15`) | Disables "Continue to Headings" |

This forces the user to resolve structural problems (like accidental duplicates or orphaned sentences) before they can proceed, preventing bad data from entering the alignment engine.
