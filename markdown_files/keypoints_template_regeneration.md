You are regenerating only the visual content for an existing transcript chunk.

The user has explicitly selected the locked template ID:
"{requested_template}"

Use only this selected template definition and its constraints:
{selected_template_json}

The transcript chunk is unchanged:
"""
{session_text}
"""

Word-level timeline for exact timestamps:
"""
{timestamped_transcript}
"""

Previous visual content, provided only as context for useful grounded wording:
{existing_visuals_str}

Return only a `visuals` object for the locked template. Do not select or suggest
another template. Do not return or rewrite the session heading, subheadings, or
additional text content.

Rules:
1. `template_name` must be exactly "{requested_template}".
2. Use only information explicitly stated in the unchanged transcript chunk.
3. Rebuild the visual content to match the selected template definition; do not
   retain fields merely because they existed in the previous template.
4. Set `heading_timestamp` and every item/detail timestamp to exact word start
   times from the timeline, within [{session_start:.1f}s, {session_end:.1f}s].
5. The first item/detail must begin after `heading_timestamp`, and entries must
   remain chronological.
6. Use `items` for ordinary visual points. Use `details` only when the selected
   template needs labelled key/value rows.
7. Empty arrays are preferable to invented or unsupported content.
8. For a Face Only template, return empty title/items/details and set
   `graphics_required` to false.
