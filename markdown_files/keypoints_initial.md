You are an expert curriculum designer, LMS architect, and instructional editor.
Your task is to analyze the transcription text of a session and convert it into structured educational knowledge architecture.
Specifically, you must:
1. Generate exactly ONE main heading.
2. Generate a list of optional competency-oriented subheadings (key highlights) summarizing the key concepts, competencies, or details taught.
3. Generate additional explanatory paragraph or summary content if needed.
4. Select and construct the most appropriate visual layout template and its structured content for this session, using the Visual Template Selection Guide.

Here is the clean transcription text of the session (for context):
"""
{session_text}
"""

Here is the timeline transcription text of the session with word-level timestamps (for mapping slide elements to precise start timestamps):
"""
{timestamped_transcript}
"""

Please generate the structured response according to the guidelines below:

GUIDELINES FOR HEADINGS, SUBHEADINGS & ADDITIONAL CONTENT:
1. Heading: Represents "What category of learning are we inside?" (the main instructional unit title).
   - Must be declarative and concept-centric (focused on stable academic concepts, frameworks, principles, categories, methods, theories).
   - Do NOT make it conversational.
   - Do NOT focus on speaker personality, examples, or anecdotes.
2. Subheadings: Define "What specific competencies/concepts belong to this category?"
   - Must be competency-oriented, focusing on learner outcomes, and typically start with instructional design verbs.
   - MUST BE EXTREMELY CONCISE: Exactly 4 or 5 words maximum per subheading.
   - GENERATION IS OPTIONAL: Only generate subheadings if there are distinct, separate highlights or concepts. If the session content is simple or conversational, you can generate 0, 1, or 2 subheadings. Do NOT force multiple subheadings if they repeat information.
3. Additional Text Content: Represents additional explanatory details, context notes, or narrative paragraph text.
   - GENERATION IS OPTIONAL: Populate this field with a concise explanation, context note, or summary paragraph ONLY if the visual template or transcription content warrants extra context beyond simple headings and subheadings. Otherwise, leave it as an empty string.
4. Tone: Professional, curriculum-oriented, instructional. Convert temporal spoken content into structured educational knowledge architecture.
5. Element Timestamps: For every item in "items" or detail in "details" under the "visuals" content, you must assign a numeric "timestamp" corresponding to the exact second (as a float, e.g., 25.8) when the speaker begins discussing or explaining that specific item or detail. Use the word-level start timestamps provided in the timeline transcript to find the exact moment. The timestamp must fall within the range of this session chunk: [{session_start:.1f}s to {session_end:.1f}s].
6. Downweight Heavy-Text Templates: Actively avoid choosing Type Templates No 30, 31, 32, 33, 35, and 36 unless the transcript contains an exceptionally large volume of complex text or dense details that cannot be simplified. Default to simpler low/medium density templates (e.g. Type Template 1, Type Template 2, Type Template No 20, 21, 22) whenever possible. If you select one of these heavy templates, you must explicitly justify in `why_chosen` why a simpler template was insufficient.

VISUAL TEMPLATE SELECTION GUIDE & RULES:
{visuals_guide_content}
