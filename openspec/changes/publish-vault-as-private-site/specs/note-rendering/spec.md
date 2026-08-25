## Purpose

Defines how a note written in Obsidian-flavoured Markdown becomes a published page, so that what the author sees in the vault is what the reader sees on the site, and so that unpublished notes are never revealed by a link to them.

## ADDED Requirements

### Requirement: Links between published notes resolve

The publisher SHALL render a wikilink whose target is a published note as a working link to that note's page.

#### Scenario: Link to a published note

- **WHEN** a published note contains `[[Some Note]]` and `Some Note` is also published
- **THEN** the rendered page shows a link that navigates to that note's page

#### Scenario: Aliased link to a published note

- **WHEN** a published note contains `[[Some Note|display text]]` and `Some Note` is published
- **THEN** the rendered page shows a link reading "display text" that navigates to that note's page

#### Scenario: Heading link to a published note

- **WHEN** a published note contains `[[Some Note#Section]]` and `Some Note` is published
- **THEN** the rendered page shows a link that navigates to that note's page; navigating to the named section is not required

### Requirement: Links to unpublished or absent notes degrade to plain text

The publisher SHALL render a wikilink whose target is not published as plain text. No link SHALL be produced, and the reader SHALL NOT be able to reach the unpublished note through it.

#### Scenario: Link to an unselected note

- **WHEN** a published note contains `[[Some Note]]` and `Some Note` exists in the vault but is not published
- **THEN** the rendered page shows the words "Some Note" as ordinary text with no link

#### Scenario: Link to a note that does not exist

- **WHEN** a published note contains a wikilink to a note absent from the vault
- **THEN** the rendered page shows the link text as ordinary text with no link

#### Scenario: Aliased link that cannot be resolved

- **WHEN** a published note contains `[[Some Note|display text]]` and `Some Note` is not published
- **THEN** the rendered page shows "display text" as ordinary text with no link

### Requirement: Obsidian formatting is preserved

The publisher SHALL render callouts, tables, task checkboxes, and images so that the published page carries the same meaning as the note in Obsidian.

#### Scenario: Callout

- **WHEN** a published note contains a callout of any of the types `warning`, `important`, `danger`, `note`, `abstract`, `tip`, `quote`, `success`, or `info`
- **THEN** the rendered page shows the callout with its title and body, visually distinguished according to its type

#### Scenario: Table

- **WHEN** a published note contains a Markdown table
- **THEN** the rendered page shows the table with its rows, columns and header intact

#### Scenario: Task checkbox

- **WHEN** a published note contains `- [ ]` or `- [x]` items
- **THEN** the rendered page shows unticked and ticked marks respectively, and the reader cannot change them

#### Scenario: Image

- **WHEN** a published note references an image that is itself published
- **THEN** the rendered page displays the image

### Requirement: Unsupported constructs are dropped, not rendered

The publisher SHALL omit constructs it does not support rather than emitting their source. Obsidian Bases query blocks SHALL be dropped. Attachments other than images SHALL NOT be published.

#### Scenario: Bases query block

- **WHEN** a published note contains a `base` code block
- **THEN** the block does not appear on the rendered page, in any form, and the rest of the note renders normally

#### Scenario: Non-image attachment

- **WHEN** the vault contains a PDF, presentation, or word-processor document
- **THEN** no page or download for it is published, whether or not a published note references it

### Requirement: Each page ends with a frontmatter table

The publisher SHALL render, at the foot of every published page, a table of a fixed set of frontmatter fields: `type`, `area`, `grade`, `status`, `owner`, `tags`, `updated`, `starts`, `ends`. The same field set SHALL apply to every page.

#### Scenario: Note carrying some of the fields

- **WHEN** a published note has frontmatter values for only some of the listed fields
- **THEN** the page's table shows the fields that have values

#### Scenario: Note carrying none of the fields

- **WHEN** a published note has no frontmatter, or none of the listed fields
- **THEN** the page renders without a frontmatter table

#### Scenario: Frontmatter fields outside the set

- **WHEN** a published note carries frontmatter fields not in the listed set
- **THEN** those fields do not appear on the page
