---
name: assess
description: Assess a Mural workshop board comprehensively and produce an evidence-grounded executive digest. Captures board areas, sticky notes, text, images, stickers, spatial groupings, activities, prompts, decisions, open questions, follow-ups, and action items. Asks for the workshop date, transcript, and supporting documents, then finds those files in the current project. Use when the user invokes /mural:assess or asks to assess, digest, summarize, or synthesize a Mural workshop.
compatibility: Requires a configured Mural MCP server with read access to the supplied board. Optional meeting transcripts and supporting files must be available under the current project directory.
---

# Assess a Mural workshop

Build a comprehensive, source-grounded account of what happened in a workshop. Treat the board's words, visual structure, and facilitation design as evidence. Use the meeting date, transcript, and supporting documents to explain context and discussion that the board alone cannot show.

## Invocation contract

The command is:

```text
/mural:assess <Mural board URL and assessment request>
```

The argument should contain a Mural board URL. If it does not, ask for one before continuing. Preserve any requested audience, emphasis, format, or output path.

This is an autonomous assessment workflow. Once required inputs are available, continue through capture, reconciliation, synthesis, quality control, and delivery without asking the user to approve routine intermediate steps.

## Intake

Before assessing the board, collect missing context in one prompt. Use `ask_user` when available and ask for:

1. Workshop date, including time zone when known, or confirmation that the date is unavailable.
2. Meeting transcript filename or project-relative path, or confirmation that no transcript is available.
3. Additional document filenames or project-relative paths, or confirmation that there are none.
4. Intended audience or special emphasis only when the invocation does not already make it clear.

Do not make the workshop date, a transcript, or supporting documents mandatory. If the user confirms any of them is unavailable, proceed and state the limitation in the digest. Do not infer a workshop date from file timestamps.

If the user names a transcript or supporting document, search the current project directory and its children before asking again. Use narrow filename matching first, then common workshop file types such as `.txt`, `.md`, `.vtt`, `.srt`, `.docx`, `.pdf`, `.pptx`, and `.xlsx`. Ignore dependency, build, VCS, and hidden state directories unless the user explicitly points there.

If a referenced file is not under the current project:

- Explain which file is missing.
- Ask the user to copy it into the current project directory and provide its project-relative path.
- Do not search outside the project or pretend the file was read.
- Pause assessment until the referenced file is available, unless the user explicitly chooses to continue without it.

Read available files with the host's appropriate file or document tools. Record the exact files used and any files that could not be read.

## Capture the Mural

The Mural MCP server exposes logical tool names that may have a host prefix. Resolve the exact available tool whose name ends with the logical name. In Copilot CLI, these normally appear as `mural-get_mural`, `mural-get_mural_structure`, and similar names.

1. Extract the mural ID from the supplied URL. If it cannot be extracted, use `search_murals` with the board title or identifying text from the request.
2. Call `get_mural` for title, dimensions, timestamps, and sharing metadata.
3. Call `get_mural_summary` to establish widget counts and likely board scope.
4. Call `get_mural_structure` for areas, frameworks, sticky notes, text, images, stickers, icons, visual order, and spatial grouping.
5. Call `get_mural_text` for a complete readable-text pass in visual reading order. Use `groupByColor: true` when color appears to encode categories, status, teams, votes, or sentiment.
6. Call `get_mural_widgets` only when raw geometry, style, color, or fields omitted from the structure are needed to resolve a meaningful ambiguity. Respect its bounded page size.

If any Mural call fails, call `check_connection` first. Report authentication, permission, or board-access failures directly. Do not substitute a generic summary of the URL or claim board coverage without successful board reads.

### What to capture

Build an internal evidence inventory before drafting:

- Board metadata and stated workshop purpose.
- Area and framework titles in reading order.
- Facilitator instructions, activities, prompts, and questions posed to participants.
- Sticky notes and text grouped by area, proximity, color, connector, container, or other visible relationship.
- Images, screenshots, diagrams, stickers, icons, and voting markers, including their nearby text and likely role.
- Repeated themes, clusters, priorities, disagreements, outliers, and unresolved branches.
- Explicit decisions, commitments, owners, due dates, open questions, risks, dependencies, and parking-lot items.
- Empty, incomplete, or low-participation areas that affect interpretation.

Do not assume that proximity, color, sticker choice, or an image has a specific meaning unless the board provides a legend or the transcript confirms it. Label interpretations as inferred.

## Reconcile context

Use the transcript and documents to add chronology, rationale, speaker context, definitions, constraints, and discussion that are absent from the board. The board and transcript may disagree or reflect different moments.

Apply these evidence rules:

- An **explicit decision** requires direct decision language in the board, transcript, or a supplied document. Otherwise classify it as a proposal, leaning, or inference.
- An **action item** requires an expressed next step or commitment. Never invent an owner or due date. Use `Unassigned` and `Not stated` when absent.
- Preserve material disagreement and minority views. Do not turn vote counts or repeated notes into consensus without evidence.
- Explain conflicts between sources instead of silently choosing one.
- Treat copied templates and facilitator examples as instructions unless participant use or transcript context shows they became workshop input.
- Keep facts from each workshop separate when files cover multiple dates or sessions.

Maintain source references while taking notes. Prefer references such as `[Mural: <area>, <widget id or note text>]`, `[Transcript: <filename>, <timestamp or line>]`, and `[Document: <filename>, <page/slide/sheet/section>]`. When precise locations are unavailable, cite the narrowest reliable source label.

## Produce the digest

Follow [references/digest-template.md](references/digest-template.md). Adapt length to the evidence and audience, but retain every required section. Put the executive summary first and detailed evidence later.

The digest must cover:

- High-level outcomes.
- Key points and themes.
- Decisions and commitments.
- Open questions and unresolved issues.
- Follow-ups and action items.
- Workshop activities, prompts, and questions asked of the team.
- Visual and participation signals that materially affect interpretation.
- Sources used, coverage limitations, and confidence.

Save the digest to the path requested by the user. If no path is requested, return it in the response rather than creating a project file.

## Quality gate

Before delivering, verify:

1. Every required digest section is present, even if its content is `None identified`.
2. Every decision and action is supported by a source reference.
3. Owners, due dates, vote meaning, consensus, and visual semantics were not invented.
4. Explicit facts are clearly separated from interpretations.
5. Contradictions, missing sources, unreadable files, and incomplete board areas are disclosed.
6. The workshop date is user-provided or source-supported, not inferred from metadata.
7. The source inventory names the board and every local file actually used.
8. The final digest answers any additional emphasis in the invocation.

Do not declare the assessment comprehensive if board structure or readable text could not be captured.
