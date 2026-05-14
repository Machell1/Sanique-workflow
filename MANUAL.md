# Sanique's workspace — User Manual

**Personal case-management workspace**
Sanique Richards · Version 2.7.0

This manual shows you how to do the day's work in the workspace. It is task-driven —
look for the heading that matches what you need to do, follow the numbered
steps, and skip anything that does not apply.

---

## Contents

1. [First 10 minutes — set the app up](#1-first-10-minutes--set-the-app-up)
2. [Filing a new appeal](#2-filing-a-new-appeal)
3. [Working a case file day-to-day](#3-working-a-case-file-day-to-day)
4. [Calendar — booking hearings and judgment deliveries](#4-calendar--booking-hearings-and-judgment-deliveries)
5. [Filing documents into a case](#5-filing-documents-into-a-case)
6. [Drafting a memo, advice, judgment or order](#6-drafting-a-memo-advice-judgment-or-order)
7. [Verifying citations before you rely on them](#7-verifying-citations-before-you-rely-on-them)
8. [Asking the AI assistant for help](#8-asking-the-ai-assistant-for-help)
9. [Running the pipeline — workflow board](#9-running-the-pipeline--workflow-board)
10. [Audit ledger — proving nothing was tampered with](#10-audit-ledger--proving-nothing-was-tampered-with)
11. [Reading documents in-app](#11-reading-documents-in-app)
12. [Global search](#12-global-search)
13. [Backing up and moving the workspace between machines](#13-backing-up-and-moving-the-workspace-between-machines)
14. [Troubleshooting](#14-troubleshooting)
15. [Keyboard shortcuts and small conveniences](#15-keyboard-shortcuts-and-small-conveniences)

---

## 1. First 10 minutes — set the app up

The first launch should look familiar — the **Dashboard** opens with sample
cases pre-loaded so you can see the shape of the app. Before you start
filing real work, do these four things in order.

### 1.1 Confirm who you are

The workspace seeds itself with **S. Richards, KC** as the current user. If that is
not you:

1. Click **Settings** in the left rail (bottom group, gear icon).
2. Pick the **Users** tab.

The current user appears with a **You** badge. You cannot change the active
user from the UI in this build — your name shows on every audit entry, so
make sure the right person is signed in. (For multi-user setups, see
*§11.4 Multi-user on shared hardware*.)

### 1.2 Decide whether to enable AI

1. Settings → **AI provider** tab.
2. Pick a provider — **Anthropic Claude**, **OpenAI**, **Google Gemini**, **Mistral**, **Ollama** (local), or any **OpenAI-compatible** endpoint (Groq, OpenRouter, LM Studio, vLLM, LocalAI, DeepSeek, Together, etc.).
3. Paste a fresh API key. The key is stored locally and is never echoed
   back to the UI — only the last four characters show after saving.
4. Optionally edit **Model** (defaults to `claude-sonnet-4-6`) and the
   **System prompt** that the AI assistant reads before every conversation.
5. **Save AI settings.**

Leave the provider as **— Disabled —** if you do not want AI running. The
rest of the app works without it; only the Agent module is degraded.

### 1.3 Set the Truth Harness floor

1. Settings → **Compliance** tab.
2. **Confidence floor** — default `0.98`. Anything below this is *Blocked*
   by the Verification module. Lower it only if you understand the
   consequences (see *§7.3 What the four tiers mean*).
3. Tick **Require at least one verified citation per generated draft** if
   you want the Generator to refuse to mark a draft as *Final* until a
   citation in it has been verified.
4. **Save compliance.**

### 1.4 Note where your data lives

1. Settings → **Data location** tab.
2. The path shown is where your SQLite database and the file vault live.
   On a typical Windows install this is
   `C:\Users\<you>\AppData\Roaming\Sanique's workspace\workspace-data\`.
3. Click **Open in File Explorer** to confirm it exists.
4. Add this folder to your backup routine (OneDrive, an external drive,
   whatever the registry uses). See *§11 Backing up*.

You are now set up. The rest of this manual assumes you have done these
four steps.

---

## 2. Filing a new appeal

Use this workflow when a Notice of Appeal lands on your desk.

1. **Sidebar → File Cabinet → New case** (top-right gilt button).
2. Fill in the **case number** (e.g. `SCCA 87/2026`) and **title**
   (e.g. `R v. Henriques`). Both are required.
3. Pick **Type** (Civil / Criminal / Application / Procedural /
   Miscellaneous), **Status** (start with *Open*), **Term** (Hilary /
   Easter / Trinity) and **Roster** (A / B / C / D).
4. Type the **Presiding judge**, **Appellant** and **Respondent**, and a
   one-paragraph **Description**.
5. Click **Create case**.

The new case appears in the left rail under its status group, and the
detail panel opens on the right.

Now attach the founding documents:

6. Switch to **Upload** in the sidebar.
7. Click the dashed box. The native Windows file picker opens — select
   the Notice of Appeal (and any other founding documents) and click
   **Open**.
8. In the **Categorise** column, pick the **Linked case** you just
   created.
9. Pick a **Category**. For a Notice of Appeal use *Submission*. For the
   bundle being assembled use *Record of Appeal*. For a single sealed
   document use *Order* or *Judgment*.
10. Add brief **Notes** (custodian, source, version, anything that helps
    later).
11. Click **File N document(s)**.

Every file you upload gets a SHA-256 hash computed as it is copied into
the vault. The hash is stored alongside the file and written to the
audit ledger. The original on your desktop is unchanged — the workspace works on
its own copy.

Optionally, queue the first piece of work:

12. Sidebar → **Workflow → New task**.
13. Title: *Index transcripts*. **Stage:** Intake. **Priority:** Normal.
    **Linked case:** the one you just made. **Due date:** seven days
    from today.
14. **Create task.**

And book the first hearing:

15. Sidebar → **Schedule → New event**.
16. **Title:** *Case management — R v. Henriques*. Pick a date, time
    range, **Type:** *Case management*, **Linked case:** the new case,
    **Term** and **Roster** to match the case.
17. **Create.**

The case now exists, has its founding documents, has a first task in
the pipeline, and is on the calendar.

---

## 3. Working a case file day-to-day

Every morning, start in this order:

1. **Dashboard** — scan the four KPI cards across the top. The two
   that matter most are *Overdue work* and *Audit chain*. If *Audit
   chain* says anything other than **Intact**, stop and follow *§10.3
   When the chain breaks*.
2. Look at **Upcoming hearings** on the right of the dashboard. If
   anything is in the next 48 hours, click through to **Schedule** and
   confirm it.
3. Look at **Overdue work** (bottom left). Each item links to the
   relevant case in the pipeline.
4. **Workflow** — open the pipeline board (sidebar). You should see
   five vertical columns. Anything you finished yesterday gets advanced
   here (see *§9.2 Advancing a task*). Anything you cannot do, mark as
   blocked (see *§9.3 Blocking a task*).

To inspect a single case:

5. Sidebar → **File Cabinet**.
6. Use the **search box** to filter by case number, title, appellant or
   respondent.
7. Click the case in the left column. The right panel shows everything
   filed against it: parties, judge, term, roster, every document.

To open a document filed in the cabinet:

8. In the **Documents in this folder** list, click the **eye** icon to
   read the document **inside the workspace** (PDF, DOCX, images and text all
   render natively). Click the **arrow** icon if you want it to open
   in the default Windows app instead (Adobe Reader, Word, etc.). See
   *§11 Reading documents in-app* for what the in-app viewer can and
   can't do.

To change the status of a case (e.g. *open* → *reserved* on the day
the bench reserves judgment):

9. With the case open in the detail panel, the **Status** dropdown sits
   in the top-right corner. Pick the new status; the change is saved
   immediately and recorded in the audit ledger.

To edit any other field on the case (title, parties, term, roster,
presiding judge, description):

10. Click the **pencil** icon at the top right of the case detail panel.
    The same form you used to create the case opens, pre-filled. Save
    your changes.

To remove a case (or a document):

11. The trash-can icon next to the case title (top right of the detail
    panel) deletes the case **and every document filed under it**.
    The workspace asks for confirmation; the deletion is recorded in the audit
    ledger.

To re-categorise or re-link a filed document (you filed an *Exhibit*
that turned out to be a *Submission*, or you filed under the wrong
case):

12. In the **Documents in this folder** list, click the **pencil** icon
    next to the document. You can change the *Linked case*, the
    *Category*, and the *Notes*. The file content and its SHA-256 hash
    are not editable — re-upload if the file itself has changed.

To produce a stand-alone **provenance certificate** for an uploaded
document (e.g. to attach to a witness statement, or to lodge with the
registry as proof of filing):

13. Click the **shield** icon next to the document. The workspace saves a small
    `.provenance.txt` companion file containing the document ID,
    filename, MIME type, size, category, SHA-256, the upload timestamp
    and actor, the linked case, and the current audit-chain integrity
    state. The original file is never modified. Hand the certificate
    over alongside the file; the recipient can re-hash the file and
    compare against the value in the certificate to confirm it is
    untouched.

---

## 4. Calendar — booking hearings and judgment deliveries

The Schedule module is a month-view court calendar with filters for
**Term** and **Roster**.

### 4.1 Move around the calendar

- The two **chevrons** beside the month name move forward and back by
  one month.
- **Today** snaps to the current month.
- The **Term** and **Roster** dropdowns filter events. Use *All* to see
  everything.

### 4.2 Add an event

You can add an event two ways:

- Click any day cell — the New event dialog opens with that day pre-
  filled.
- Click the **New event** button top right.

In the dialog:

1. Type a clear **title**. *"Hearing — Smith v. Jones"* beats *"Hearing"*.
2. Pick a **Date**, **Start** and **End** time.
3. Pick the **Type**: Hearing / Case management / Judgment delivery /
   Admin / Deadline. The colour on the calendar grid follows the type.
4. **Linked case** — start typing the case number; the workspace links the
   event to the case file.
5. **Term** and **Roster** — match the case.
6. Optionally a **Description**.
7. **Create.**

### 4.3 Edit or delete an event

To **reschedule** or **rename** an event, either:

- Click the coloured event chip directly inside a calendar day cell, or
- Scroll to **All events this view** and click the pencil icon next to
  the event.

The form opens pre-filled with the event's current values. Change what
you need and click **Save changes**.

To **delete** an event, use the trash-can icon next to it in the *All
events this view* list. The workspace asks for confirmation. The deletion is
audited.

### 4.4 Read the dashboard "Upcoming" list

The dashboard shows the next eight events. Anything beyond that, open
the calendar.

---

## 5. Filing documents into a case

This is the workflow you will use most often.

### 5.1 What the workspace accepts

The picker is pre-filtered to PDF, DOCX, DOC, XLSX, XLS, PPTX, PPT, TXT
and RTF. You can switch the filter to **All files** in the picker if
you have something unusual (e.g. an MP3 voice note, a scanned TIFF, an
EML).

### 5.2 The three-column flow

The Upload page is intentionally a single screen in three columns:

1. **Pick files** — click the dashed box. Hold Ctrl in the picker to
   select multiple files. The workspace remembers them until you confirm or
   cancel.
2. **Categorise** — every uploaded file shares the category and notes
   you set here. If you have two categories worth of files, do them in
   two batches.
3. **Confirm filing** — the big gilt button. The workspace hashes each file,
   copies it into the vault, writes an audit entry, and clears the
   form. You will see a green *Filed* row appear under *Just uploaded*.

### 5.3 Best practice for naming

The workspace keeps the original filename. Pick filenames the registry can read
six months from now:

- Good: `2026-05-14_R_v_Henriques_Notice_of_Appeal.pdf`
- Bad: `Scan_001.pdf`

The workspace also keeps a SHA-256 hash. If you ever need to prove a document
has not been tampered with, the hash on the audit entry must match the
file in the vault.

### 5.4 Filing without a case

Leave **Linked case** as *— Unfiled —*. The document goes into
`<vault>/_unfiled/`. You can link it to a case later by re-filing it.

---

## 6. Drafting a memo, advice, judgment or order

The Generator carries four templates: **Memo**, **Counsel's Written Advice**,
**Draft Reasons for Judgment**, and **Draft Order**. Each one scaffolds a
document in the Court's house style. From v2.4.0 the editor is a
**split-pane Markdown editor** — Markdown source on the left, live
formatted preview on the right.

### 6.1 Generate the scaffold

1. Sidebar → **Generator → New draft**.
2. **Template** — pick one of the four.
3. **Custom title** — optional. Leave blank to use the template title.
4. **Linked case** — when you pick a case, the workspace autofills *Case
   reference*, *Parties (formatted)* and *Presiding bench* from the
   case file. Saves typing.
5. The remaining fields are template-specific:
   - **Case reference** — neutral citation or case number.
   - **Subject / Recipient** — memo only.
   - **Presiding bench** — judgment only.
   - **Parties (formatted)** — judgment / order only. The dialog
     auto-formats this when you pick a linked case.
   - **Author** — your name. Defaults to the current user.
   - **Opening paragraph** — the first substantive sentence that goes
     into the template.
6. **Generate.**

### 6.2 Edit in the split-pane Markdown editor

The draft opens with two panes side-by-side:

- **Left:** the Markdown source (mono-typed textarea). Type freely.
- **Right:** the live rendered preview, styled with the same typography
  The workspace uses to display Word documents in-app.

Above the editor sits a toolbar with quick-insert buttons for the
common formatting moves:

- **Bold** — `**text**` (or `Ctrl+B`)
- **Italic** — `*text*` (or `Ctrl+I`)
- **Heading 1 / 2** — `#` / `##` at the start of a line
- **Bulleted list** — `- ` at the start of a line
- **Numbered list** — `1. ` at the start of a line
- **Blockquote** — `> ` at the start of a line

Click any toolbar icon and the relevant Markdown is inserted around
your selection (or on the current line for the line-prefixed ones).
The right pane updates as you type. There is also an **eye / eye-off**
toggle that hides the source and shows only the preview — useful when
reading back through a long judgment.

Other controls along the top:

- **Title** — top left, click to rename.
- **Status** — dropdown. Move *Draft → Reviewed → Final* as the
  document matures.
- **Save changes** (gilt) — persists your edits. The status badge in
  the left list updates.

### 6.3 Copy, export, print, delete

The icon row at the top of the editor:

- **Copy icon** — copies the Markdown source to the clipboard.
- **Download icon** — exports as a plain `.txt` file using the
  document's title as the filename.
- **Document icon** — **exports as a Microsoft Word `.docx` file**. The
  Markdown is honoured: headings become Word headings, lists become
  numbered / bulleted Word lists, blockquotes are indented, **bold**
  and *italic* survive the round-trip.
- **Printer icon** — opens the **system print dialog** with a
  print-friendly version of the rendered preview. Use this for hard
  copy to the bench. The print version uses one-inch margins, the
  Court's serif typography, and (if the provenance setting is on)
  prints the document ID and timestamp in small grey type at the foot.
- **Trash icon** — deletes the draft. Audited.

### 6.4 The provenance seal on exported drafts

If **Settings → Compliance → Print provenance on exports** is on (the
default), every Generator export carries a provenance block at the foot
of the document, listing:

- The application that produced it (`Sanique's workspace v2.3.0`).
- The Document ID (the database UUID).
- The document type (memo / advice / judgment / order).
- The current status (draft / reviewed / final).
- The author name (the active the workspace user at the time of export).
- The creation timestamp and the export timestamp.
- The **SHA-256 of the body content** at the moment of export.

`.docx` exports additionally carry:

- A small grey **page footer** on every printed page with the short
  hash, the export date, and the page number — so each printed sheet
  has its own seal.
- Native Word metadata fields (*Author*, *Title*, *Subject*,
  *Description*) populated with the same provenance.

What the seal proves, and what it does not:

- It proves the document is **byte-for-byte identical to what the workspace
  produced** at the timestamp in the block. To verify, re-hash the body
  text and compare against the value printed in the provenance block.
- It is **invalidated by any edit made in a word processor** after the
  export. A document opened in Word, edited, and saved is no longer
  what the workspace sealed. Re-export from the workspace after any change you want
  recorded in the audit chain.

To suppress the provenance block (e.g. for outgoing copies where house
style forbids any footer), turn the setting off in
*Settings → Compliance*. The hash is still computed and written to the
audit ledger — only the on-page footprint is omitted.

### 6.4 House-style notes

- The four templates use the Court's typical headings and the formal
  numbering convention.
- Where the template inserts `[bracketed placeholders]`, replace
  them — they are deliberately bracketed so you cannot ship a draft
  with `[APPELLANT]` still in it.
- A signature line is the responsibility of the human author. the workspace
  does not affix any electronic seal.

---

## 7. Verifying citations before you rely on them

The Verification module pulls citations out of a passage of text and
scores them against the **AI Truth Harness**.

### 7.1 Run a verification

1. Sidebar → **Verification**.
2. Click **Use example text** if you want to see what an output looks
   like, or paste your own passage into the textarea.
3. Optionally pick a **Linked case** — the result is then attached to
   that case file for future reference.
4. **Run verification.**

The workspace extracts every citation it recognises (Jamaican neutral citations,
SCCA / COA App numbers, UK neutral citations, CCJ citations, statutory
section references, and generic *X v. Y* patterns) and gives each a
status:

### 7.2 What the four tiers mean

| Confidence | Tier             | What you do                                         |
| ---------: | ---------------- | --------------------------------------------------- |
| 100%       | Verified         | No human flag needed. Cite as fact.                 |
| 99%        | High confidence  | Confirm in your usual sources before final draft.   |
| 98%        | Escalation       | Stop. Double-check independently before relying.    |
| <98%       | Blocked          | Cannot be presented as fact. Treat as a typo.       |

The thresholds are governed by the **Confidence floor** setting (see
*§1.3*).

### 7.3 What the parser actually catches

The parser is heuristic, not exhaustive. It is calibrated for the way
the Jamaican appellate courts cite authorities:

- **Court of Appeal Jamaica** — `SCCA 12/2025`, `COA App 3/2025`.
- **Jamaican neutral** — `[2024] JMCA Crim 14`, `[2025] JMSC Civ 88`.
- **UK neutral** — `[2020] UKSC 14`, `[2019] EWCA Civ 1041`.
- **Caribbean Court of Justice** — `[2023] CCJ 4 (AJ)`.
- **Statutes** — `section 24 of the Constitution of Jamaica`.
- **Generic case** — `Brown v Smith [2020]`.

If a citation is mangled (a missing space, a wrong year format), the
parser will skip it. That is not a bug — your reader will skip it too.
Fix the citation in the source text and re-run.

### 7.4 Reviewing, overriding, and removing past verifications

Scroll down to **Verification history** under the form. The most recent
500 checks are listed with timestamps. Use this to prove what was
checked, when, and what the tier was.

If a human review disagrees with the parser's score, click the
**pencil** icon on the row. Choose the correct tier and explain why in
the notes. The override is recorded in the audit ledger with both the
previous tier and the new one — the original score is not silently
overwritten.

If an entry was created in error (wrong text pasted, accidental run),
click the **bin** icon to remove it. The deletion itself is audited.

### 7.5 Adding a citation manually

Use this when a citation should be on the record but the parser did not
catch it (an unusual format, a regulation reference, a foreign
authority you want to flag for the bench):

1. **Add citation manually** (top right of the Verification page).
2. Type the citation exactly as it should be quoted.
3. Pick a **Type** that best fits (Statute section, Jamaican neutral,
   CCJ, etc., or just *Manual* for anything else).
4. Pick the **Tier** you are willing to certify the citation at.
5. Optionally link to a case and add notes (source, holding, paragraph
   reference).
6. **Record.**

The entry is added to the same history table and audited as a manual
addition.

---

## 8. Asking the AI assistant for help

the AI assistant is the in-app chat agent. It uses whichever provider you
configured in *§1.2*. It is **not** a court reporter — anything it says
is advisory until you have verified it (use *§7* to do exactly that).

### 8.1 Start a conversation

1. Sidebar → **Agent**.
2. **New conversation** (top right).
3. Give it a useful title — *"Bail authorities for SCCA 12/2025"* beats
   *"Question"*.
4. Optionally pick a **Linked case** so the conversation is filed with
   that case for later.
5. **Create.**

### 8.2 Ask things

- Type your prompt in the textarea at the bottom and click the send
  arrow, or press **Ctrl+Enter**.
- the AI assistant streams its reply into the conversation. While it is thinking,
  the spinner shows *the AI assistant is thinking…*.
- Each assistant message carries a confidence badge tied to the same
  Truth Harness as the Verification module.

### 8.3 the AI assistant reads the case file when a thread is linked

When you link a conversation to a case (in *§8.1 step 4*, or via the
pencil → relink action in *§8.5*), the AI assistant receives a structured case
brief alongside every prompt: the case number, parties, presiding
judge, term and roster; the list of every document filed under the
case; any upcoming hearings; and, when your prompt is specific
enough, short excerpts from the indexed document bodies that match
what you asked.

This means questions like *"summarise the appellant's grounds"* or
*"what authorities are cited in the lower-court judgment?"* work
without you pasting anything — the AI assistant already has the relevant text.

Two caveats:

- the AI assistant only sees documents that are **indexed** (see §11.5). Image-
  only PDFs, encrypted PDFs, and very recent uploads still being
  indexed will not appear in its context.
- The case brief is rebuilt fresh on every message so the model
  always sees the current state. Nothing is cached.

### 8.4 What the AI assistant is good at

- *"Summarise the procedural history below in two paragraphs."*
- *"Distinguish R v. Brown from the Privy Council line on confessions."*
- *"Draft an outline of arguments for the appellant in this matter."*
- *"What are the leading Jamaican authorities on construction of
  testamentary trust language?"*

### 8.5 What the AI assistant is bad at

- Citing things that do not exist. Always run *§7 Verification* over
  the assistant's output before you put it in a draft.
- Maths and time-sensitive facts. Use a calculator and a current
  almanac.
- Procedural directions specific to this Court. the AI assistant does not know the
  current Practice Direction unless you paste it into the chat.

### 8.6 Rename or relink a conversation

Click the **pencil** icon at the top of the chat pane. You can change
the title and the linked case. The conversation history is preserved.

### 8.7 Delete a conversation

The trash icon top-right of the chat pane. Audited.

---

## 9. Running the pipeline — workflow board

Workflow is a five-column Kanban: **Intake → Review → Drafting →
Verification → Delivery**. Every task lives in exactly one column.

### 9.1 Read the board

Top strip:

- **In pipeline** — total live tasks.
- **Overdue** — tasks past their due date.
- **Blocked** — tasks with a blocked reason filled in.
- One number per stage so you can see the bottleneck at a glance.

If one stage is much fatter than the others, that is the bottleneck.
The header also shows a *bottleneck* badge in escalation colour.

### 9.2 Move a task between stages

Hover over the task card. A row of action icons appears at the bottom:

- **←** moves the task back one stage. Use this when work returns from
  *Verification* to *Drafting* because of a missing authority, for
  example.
- **→** advances the task to the next stage.
- **Pencil** opens the full edit dialog (title, stage, priority,
  linked case, assignee, due date, notes).
- **Ban / Play** blocks or unblocks the task. See §9.3.
- **✕** deletes the task.

All movements are audited.

### 9.3 Blocking a task

Click the **ban (no-entry)** icon on the task card. A dialog opens and
asks you for the **reason** ("What is blocking this, and what unblocks
it?"). Type the reason and click **Block task**.

The card now shows a red border, the reason inline, and a *play* icon
that unblocks the task when the impediment is cleared. The blocked
count at the top of the page goes up. The original stage is preserved
— blocking does not move the task.

To **unblock**, click the *play* icon on the card. The block reason is
cleared and the task continues normally.

### 9.4 Plan a new task

Top right: **New task**. The form mirrors the case form — pick a
title, stage, priority, linked case, due date and notes. Tasks always
start in **Intake** unless you change the stage.

### 9.5 Daily rhythm

A registrar's morning loop:

1. Dashboard → confirm nothing is on fire.
2. Workflow → advance everything you finished yesterday.
3. Workflow → bring in any new arrivals as Intake.
4. Schedule → confirm today's hearings.
5. Generator → continue any draft you parked.

---

## 10. Audit ledger — proving nothing was tampered with

Every meaningful action in The workspace writes an entry to the audit log. Each
entry carries the SHA-256 hash of its own canonical material **and**
the hash of the entry immediately before it. The first entry uses the
literal string `GENESIS` as its predecessor. Modifying any historic
entry, even by a byte, breaks the chain for every subsequent entry.

### 10.1 Reading the ledger

1. Sidebar → **Audit**.
2. The top card shows the chain integrity result — **INTACT** in green
   or **BROKEN** in red, with the total number of entries.
3. The ledger table below shows the most recent 50 entries. Use the
   search bar to filter by action, entity or actor.

### 10.2 Exporting

The **Export JSON** button at the top of the page writes the *current
page* of the ledger to a JSON file. Use this for archival or to feed
into external reporting.

### 10.3 When the chain breaks

If the integrity check ever says **BROKEN**, do this immediately:

1. Note the entry ID it reports as broken (`brokenAt`).
2. **Do not** make any further changes in The workspace — every new entry will
   chain to a corrupted predecessor and obscure the forensic trail.
3. Copy the entire data folder (see *§11.1*) to a safe location.
4. Open the SQL database in a read-only tool (DB Browser for SQLite is
   sufficient) and inspect entries on either side of the break.
5. Report to your supervisor. The audit ledger is a court record.

### 10.4 What gets audited

Every create/update/delete on a case, document, workflow item,
calendar event, generated document, agent thread or setting. Every
verification run. Every AI message. The exact `action` strings are
namespaced like `case.create`, `document.upload`, `verification.run`.

### 10.5 What does **not** get audited

- Read-only operations (opening a case to look at it).
- Navigation between pages.
- AI provider HTTP failures that happen before a message lands in the
  database.

---

## 11. Reading documents in-app

From v2.4.0 you no longer need to leave the workspace to read a filed document.
Click the **eye** icon next to any document in the File Cabinet and a
full-screen viewer opens.

### 11.1 What the viewer can render

- **PDF** — rendered by the bundled Chromium PDF viewer. You get the
  usual toolbar (page navigation, zoom, fit-to-width, print this PDF,
  save a copy).
- **Word (.docx)** — converted to HTML in-process and styled with the
  Court's typography. Headings, lists, blockquotes, **bold** and
  *italic*, tables and images all carry over. The original `.docx`
  itself is untouched in the vault.
- **Images** (PNG, JPEG, GIF, WebP, SVG, BMP) — shown full-screen on
  an obsidian backdrop, scaled to fit.
- **Plain text** (.txt, .md, .csv, .json, .xml, .html) — shown as a
  scrollable monospace view.

For anything The workspace does not recognise — `.xlsx`, `.pptx`, exotic CAD
files, video, etc. — the viewer offers a one-click fallback to the
default Windows app for that file type.

### 11.2 The viewer header

The viewer header always shows the document's filename, category,
size, upload timestamp, and the first 14 characters of its
**SHA-256**. From the header you can:

- **Shield icon** — save the document's provenance certificate.
- **Arrow-out icon** — close the in-app viewer and open the document
  with its default Windows app (useful if you need Word's review
  tools).
- **X icon** (or **Esc**) — close the viewer.

### 11.3 What the viewer cannot do

It is **read-only**. There is no in-app highlighting, sticky notes, or
mark-up — for those, open the file in Adobe Reader (PDF) or Word
(DOCX) via the arrow-out icon. the workspace's audit ledger does not track
annotations made in external apps.

### 11.4 Re-verifying the seal

The viewer header carries a **shield-with-question-mark** button. Click
it and The workspace reads the file from disk, recomputes the SHA-256, and
compares it against the seal recorded when the document was filed:

- **`seal matches`** (green) — every byte is identical to the day it
  was filed.
- **`seal BROKEN`** (red) — the bytes on disk do not match the stored
  hash. Treat the file as compromised and notify your supervisor.
  Look at the audit log for any `document.update` entries; the file
  itself should never be edited.
- **`file missing`** — the vault entry has been deleted from disk
  outside the workspace. Restore it from your backup.

### 11.5 Searchable document content

From v2.5.0 The workspace also extracts the text from every uploaded PDF and
Word document so that the global search (see §12) can find phrases
inside the body, not just the filename. Indexing happens:

- **Automatically after upload.** The Upload page kicks off a
  background extraction for each new file; you can keep working while
  it runs.
- **On first view.** If a document was filed before v2.5.0 (or
  extraction previously failed), opening it in the viewer triggers a
  one-time extraction.

A small badge in the viewer header tells you the state:

- `indexing` — extraction is in progress.
- `searchable` — the body has been indexed; global search can find
  phrases inside.
- `not indexed` — extraction failed (encrypted PDF, image-only scan,
  unsupported encoding). The file remains viewable; you can still
  search its filename, notes, and category.

## 12. Global search

The **Search** entry on the sidebar opens a single, fast search box
that runs across every searchable piece of state the workspace holds:

- **Cases** — case number, title, parties, description.
- **Documents** — original filename, notes.
- **Generated drafts** — title and **the full body content** of every
  memo / advice / judgment / order.
- **the AI assistant conversations** — every message (user and assistant).
- **Audit ledger** — action, entity ID, payload, actor name.

### 12.1 How to use it

1. Type two or more characters. Results appear as you type — the last
   word is prefix-matched, so `judg` finds `judgment`, `judging`,
   `judges`, etc.
2. Use quotes to require an exact phrase: `"section 24"` only matches
   that phrase, not `section` and `24` separately.
3. Hits are grouped by kind. Click any row to jump to the module that
   owns it; the workspace lands you on the right page (the Audit module for an
   audit hit, the File Cabinet for a case, and so on).
4. The **Inside-document** group (only appears when there are hits)
   highlights the matched phrase inside the actual extracted body of a
   PDF or Word document. Click through to find the source file in the
   File Cabinet.

### 12.2 What's indexed when

The index is maintained by SQLite triggers, so every new case, every
upload, every saved draft, every the AI assistant message and every audit entry
becomes searchable **immediately** — no batch job to wait for. The
text inside an uploaded PDF or Word document is extracted in the
background after upload (see §11.5); large files take a few seconds.
If you upgrade from a previous version, the first launch backfills
the search index across all existing data; it runs once and takes a
moment on large vaults.

### 12.3 What's *not* indexed

- **Image-only PDFs and scanned documents.** The workspace does not perform OCR
  yet. A PDF that is just photographs of pages produces no searchable
  text; the document is still viewable, just not searchable by body.
- **Encrypted PDFs.** The text extractor cannot read inside a
  password-protected PDF. Remove the password (in Adobe Reader) and
  re-upload if you need it searchable.
- Confidence scores and timestamps. Use the dedicated filters in the
  Verification and Audit modules for time-based queries.

### 12.4 Keyboard shortcut

Press **Ctrl+K** anywhere in the workspace to jump straight to the search page
with the cursor in the box.

## 13. Backing up and moving the workspace between machines

The workspace keeps everything in one folder. Back that folder up and you have
backed up the application.

### 13.1 Where it lives

`C:\Users\<you>\AppData\Roaming\Sanique's workspace\workspace-data\`

Inside:

- `claw.db` — the SQLite database.
- `claw.db-wal`, `claw.db-shm` — SQLite's write-ahead log files. They
  must be copied alongside `claw.db` or you may lose recent writes.
- `files/` — the document vault. Inside, one subfolder per linked
  case (named by case ID), plus `_unfiled/` for everything else.

You can open this folder from inside the app: **Settings → Data
location → Open in File Explorer**.

### 13.2 Daily backup

The simplest reliable plan:

1. **Close the workspace** — quitting flushes the WAL into the main database.
2. Copy `claw-data` into your usual backup (OneDrive, an external
   drive, an internal share).
3. Re-open the workspace.

If you are willing to lose the last minute or two of work, you can
skip the close step. SQLite WAL mode is crash-safe but a live copy may
miss in-flight changes.

### 13.3 Move the workspace to a new machine

1. Install the workspace on the new machine (download the same version of
   `Saniques-Workspace-Setup-x.y.z.exe` and run it).
2. **Do not open the workspace yet.** The fresh install will seed sample data
   the first time you open it, and the seed will collide with any
   restored data.
3. Replace `C:\Users\<new-you>\AppData\Roaming\Sanique's workspace\workspace-data\` with
   the folder from your backup.
4. Open the workspace. Your cases, documents, calendar, audit log — all of it
   should be there.

### 13.4 Multi-user on shared hardware

The workspace is single-user per Windows account. Each user gets their own
`%APPDATA%\the workspace\claw-data\` folder.

Inside one the workspace install you can still have a **directory of multiple
users** (so that the audit log identifies who did what):

1. **Settings → Users → Add user.**
2. Fill in name, email, role and rank, then **Add user**.
3. The new user appears in the list with a **Switch** button.
4. Click **Switch** to set them as the active user. Their name will
   appear on subsequent audit entries until you switch again.
5. The current active user can be **edited** (pencil icon) but cannot
   be **deleted** (you would lose your own context); switch to a
   different user first if you need to remove someone.

Switching users only changes whose name lands on the audit log; it does
not change which Windows account or which data folder is in use.
**Do not share a Windows account** if you need genuine separation.

### 13.5 Uninstalling

Settings → Apps → search for **Sanique's workspace v2.1.0** → **Uninstall**. By
default the uninstaller leaves `claw-data` alone (your data survives).
If you want a clean wipe, manually delete `%APPDATA%\the workspace\` after the
uninstaller finishes.

---

## 14. Troubleshooting

### 14.1 Windows SmartScreen warns on first launch

The installer is unsigned. Windows shows *"Windows protected your PC"*.
Click **More info → Run anyway**. This is a one-time prompt.

### 14.2 the workspace opens to a black window and never paints

Quit (Alt+F4), re-open. If it happens twice in a row, the renderer
process is wedged. Most often this is a GPU driver issue:

1. Quit the workspace.
2. Edit `%APPDATA%\the workspace\command-line-flags.txt` (create it if it does
   not exist) with the single line `--disable-gpu`.
3. Re-open.

### 14.3 "Database is locked" toast

Two the workspace windows are running at once, fighting over `claw.db`. Quit
both. Open Task Manager and end any leftover `the workspace.exe` processes.
Re-open once.

### 14.4 Citation parser missed an obvious citation

The parser does not catch every form. The reliable workaround:

1. Re-format the citation to match a recognised pattern (see *§7.3*).
2. Re-run the verification.

If you find a citation form that *should* be recognised, save the
example — the parser regexes live in `electron/ipc/verification.cjs`
and can be extended.

### 14.5 the AI assistant says "AI provider is not configured"

Settings → AI provider → set provider → paste a fresh key → Save.
Re-open the Agent. See *§1.2*.

### 14.6 the AI assistant replies with a `[Provider error]`

The HTTP call to Anthropic or OpenAI failed. Common causes:

- Wrong key, or key revoked. Paste a fresh one in Settings.
- Network blocked. The workspace does not use a proxy by default — check
  whether your firewall is blocking `api.anthropic.com` or
  `api.openai.com`.
- Model name typo. Settings → AI provider → Model. Defaults are
  `claude-sonnet-4-6` (Anthropic) and `gpt-4o` (OpenAI).

### 14.7 "An audit entry hash mismatched" on startup

The chain is broken. See *§10.3*. Stop using the app until your
supervisor has reviewed.

### 14.8 Uploaded a 2 GB scanned bundle, app got slow

The workspace handles files up to a few hundred megabytes comfortably. For
multi-gigabyte bundles, split into volumes and upload as separate
documents under the same case (each gets its own hash). A future
release will stream-hash so the app stays responsive on the very large
files.

---

## 14a. Bundle assembly (Record of Appeal)

Court of Appeal work often calls for a single Record of Appeal made
up of many separate PDFs in a particular order, with a cover page and
a table of contents. From v2.6.0 The workspace does this inside the app.

1. **File Cabinet → pick the case → Bundles card → Assemble bundle.**
2. The dialog lists every PDF filed under that case, with checkboxes
   and up / down arrows. **Tick the documents you want included and
   put them in the right order.**
3. Type a **bundle title** (defaults to *"Record of Appeal — &lt;case
   number&gt;"*) and optional notes.
4. **Build bundle (N PDFs).** The workspace reads each source from the vault,
   merges them with pdf-lib, prepends a cover page and a table of
   contents (each entry showing the source name, page range, and the
   source's SHA-256 fingerprint), and saves the merged PDF back into
   the vault as a new Record of Appeal document. The originals are
   untouched.
5. The new bundle appears in the Bundles list of the case. Click the
   **eye** icon to read it in-app or the **trash** to remove it (the
   sources remain).

Bundles are themselves sealed with their own SHA-256 hash and can be
cryptographically signed (see *§14d Electronic signatures*).

## 14b. Notes pinned to a document

Annotation in the workspace is text-only and lives **alongside** the document
rather than being painted onto the PDF — so the underlying file's
SHA-256 seal stays intact.

1. Open any document in the viewer (File Cabinet → eye icon).
2. Click the **chat bubble** icon at the top right to open the Notes
   panel.
3. Click the **+** to compose a note. You can:
   - Pin to a **specific page** (or leave blank for a whole-document
     note).
   - Pick a **colour** (gilt / verified / escalation / blocked / info /
     neutral) for visual triage.
4. Notes show your name, timestamp, and edit history. Each note has
   pencil and trash icons for edit / delete.

Notes are searched by the global search (along with everything else)
and appear in the audit ledger as `note.create` / `note.update` /
`note.delete` entries.

## 14c. Draft version history

Every time you save a draft in the Generator (the gilt **Save changes**
button), the workspace snapshots the full body. Only saves where the body
actually changed are snapshotted — rename-only and status-only edits
are skipped so the history stays meaningful.

1. Open any draft in the Generator.
2. Click the **clock-circle** (history) icon in the toolbar.
3. The Versions panel slides in showing every snapshot newest-first.
   Each row shows version number, status, author, timestamp, and the
   body size.
4. Click a version to **inspect** its content.
5. Click the **⇆** icon to enter diff mode, then pick a second
   version to compare. Added lines glow green; removed lines glow red.
6. Click **Restore** to revert the live draft to a snapshot. Restore
   itself is a write, so the live draft is snapshotted as the next
   version — you never lose history.

## 14d. Electronic signatures

The workspace signs documents with Ed25519. Each user gets a keypair, generated
the first time they sign anything; the private key never leaves their
local AppData folder.

### What you can sign

- A **generated draft** — signing moves the draft to *Final* status and
  binds the signature to the SHA-256 of the draft's body.
- An **uploaded document** — signature binds to the file's SHA-256
  (the same seal you see in the viewer).
- A **bundle** — signature binds to the merged-PDF SHA-256.

### Signing flow

1. Open the item (Generator draft, document viewer, or bundle entry).
2. Click the **pen-square** icon to open the signatures panel.
3. Click **Sign**. Pick a **Capacity** (Counsel, Registrar, Judge of
   Appeal, etc. — defaults to your rank).
4. **Sign.** the workspace combines the SHA-256, your name, your capacity, and
   the timestamp into a signing payload; signs it with your private
   key; and stores the signature + the public key alongside.

### Verifying a signature

Each signature in the panel has a small shield icon. Click it and the workspace
will:

1. Re-derive the signing payload from the stored facts.
2. Verify the signature against the stored public key.
3. **Re-check that the underlying content still matches the SHA-256
   the signature covers.**

You'll see one of:

- **verified** (green) — signature is authentic *and* the content is
  byte-identical to what was signed.
- **content drifted** (orange) — signature is authentic, but the
  content has been modified since signing.
- **signature forged** (red) — the signature does not match the public
  key. Treat as a forgery and escalate.

### Where the keys live

Settings → Data location opens the folder. Inside `claw.db` the
`user_keys` table holds your PEM-encoded private key. Back this folder
up like any other the workspace data — losing it invalidates your ability to
sign as the same identity (verifications of past signatures still
work, because the public key travels with the signature itself).

## 14e. Sending a document by email

The workspace does not send email itself. It writes an `.eml` file with the
document attached (base64 in standard MIME multipart) and asks Windows
to open it. Outlook (or whichever client is registered for `.eml`)
opens a draft you can edit, address, and send.

1. Open the item (Generator draft or any uploaded document).
2. Click the **mail** icon.
3. Fill in **To** / **Cc** / **Subject** / **Body** in the compose
   modal.
4. **Open in mail client.** The workspace writes a temp `.eml`, launches it
   with the OS handler, and the rest of the flow is in your mail
   client. The audit ledger records that an email export happened;
   the workspace never sees the final message or its recipient.

If your machine has no default mail client registered, the dialog will
report the OS error. The temp `.eml` path is logged in the audit entry
so you can still locate it manually.

## 15. Keyboard shortcuts and small conveniences

- **Ctrl+K** anywhere in The workspace — jump to the global search page.
- **Ctrl+B** / **Ctrl+I** in the Generator — bold or italic the
  selection.
- **Ctrl+Enter** in any the AI assistant textarea — send the message.
- **Esc** — closes any open dialog or the document viewer.
- **Click a calendar event chip** — opens the edit form for that
  event with all fields pre-filled.
- **Click a calendar day** — opens the New event dialog with the day
  pre-filled.
- **Search box on the File Cabinet** — filters by case number, title,
  appellant or respondent in real time.
- **Sidebar → Search** — global full-text search across cases,
  documents, drafts, the AI assistant conversations and the audit ledger.
- **Workflow card hover** — surfaces the advance / retreat / edit /
  block / delete actions.
- **Sidebar collapse button** (top of the sidebar) — collapses the rail
  to icons-only when you need more horizontal space.

---

## Where to find what

| If you want to…                                      | Go to                                       |
| ---------------------------------------------------- | ------------------------------------------- |
| See today's headline numbers                         | Dashboard                                   |
| Add a new case                                       | File Cabinet → New case                     |
| Change a case status (e.g. *open → reserved*)        | File Cabinet → pick case → Status dropdown  |
| Rename / edit a case                                 | File Cabinet → pick case → pencil           |
| Attach a document to a case                          | Upload                                      |
| Re-categorise or re-link a filed document            | File Cabinet → document → pencil            |
| Book a hearing                                       | Schedule → New event                        |
| Reschedule or rename a hearing                       | Schedule → click the event chip             |
| Move a task forward / back                           | Workflow → hover card → ← / →               |
| Edit a task in full                                  | Workflow → hover card → pencil              |
| Block / unblock a task                               | Workflow → hover card → ban / play          |
| Draft a memo / advice / judgment / order             | Generator → New draft                       |
| Export a draft to Word (.docx)                       | Generator → open draft → document icon      |
| Suppress the provenance footer on outgoing drafts    | Settings → Compliance → Print provenance    |
| Issue a provenance certificate for an uploaded doc   | File Cabinet → document → shield icon       |
| Score the citations in a passage                     | Verification → Run verification             |
| Override a parser score / record a manual citation   | Verification → pencil / Add citation manually |
| Chat with the AI assistant                                  | Agent → New conversation                    |
| Rename / relink a the AI assistant conversation                  | Agent → open thread → pencil                |
| Confirm nothing has been tampered with               | Audit → integrity card                      |
| Switch which user appears on the audit log           | Settings → Users → Switch                   |
| Add or remove a user from the directory              | Settings → Users → Add user / bin           |
| Change AI provider, compliance, data path            | Settings                                    |
| Read a PDF or Word doc without leaving the workspace          | File Cabinet → document → eye icon          |
| Print a draft for the bench                          | Generator → open draft → printer icon       |
| Format a draft (bold, lists, headings, quotations)   | Generator → toolbar, or type Markdown       |
| Find a phrase across every case / draft / the AI assistant msg   | Sidebar → Search **or Ctrl+K**              |
| Find a phrase **inside** a PDF or Word document      | Sidebar → Search (Inside-document hits)     |
| Re-verify a document's SHA-256 seal in-app           | File Cabinet → eye → shield-? icon          |
| Ask the AI assistant about a specific case's file                | Agent → link thread to case → ask           |
| **Assemble a Record of Appeal bundle (merge PDFs)**  | File Cabinet → case → Bundles → Assemble    |
| **Annotate / pin a note to a document or page**      | File Cabinet → eye → notes icon → +         |
| **Scroll back through every saved version of a draft** | Generator → open draft → history icon     |
| **Diff two versions of a draft**                     | Generator → versions panel → ⇆ icon + pick 2nd version |
| **Cryptographically sign a draft / document / bundle** | Open the item → signatures icon → Sign     |
| **Verify someone else's signature**                  | Signatures panel → shield icon on the signature |
| **Email a draft or document to colleagues**          | Open the item → mail icon → fill in mail-client draft |

---

**Sanique Richards · Sanique's workspace v2.6.0**
For technical support, see *§14 Troubleshooting* first, then escalate
to your system administrator. The source code and the change log live
at <https://github.com/Machell1/Sanique-workflow>.
