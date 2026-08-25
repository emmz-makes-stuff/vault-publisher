## Purpose

Defines how a reader finds their way around the published site — the folder explorer, the front page, and how pages are named and ordered — for readers who do not use Obsidian and may be on a phone.

## ADDED Requirements

### Requirement: The site presents an explorer mirroring the vault structure

The site SHALL present a navigation control, positioned to the left of the page content, that mirrors the folder structure of the source vault. Folders SHALL be collapsible.

#### Scenario: Folder structure reflected

- **WHEN** the published notes come from a vault with nested folders
- **THEN** the explorer shows those folders in the same nesting

#### Scenario: Folder collapsed and expanded

- **WHEN** a reader collapses or expands a folder in the explorer
- **THEN** its contents are hidden or shown accordingly

### Requirement: A folder appears when any of its notes are published

The explorer SHALL show a folder if at least one note within it is published, whether or not other notes in that folder are excluded. A folder with no published notes SHALL NOT appear.

#### Scenario: Partially published folder

- **WHEN** a folder contains both published and unpublished notes
- **THEN** the explorer shows the folder, listing only the published notes, with no indication that others exist

#### Scenario: Folder with no published notes

- **WHEN** no note within a folder is published
- **THEN** the folder does not appear in the explorer

#### Scenario: Folder published only via a subfolder

- **WHEN** a folder holds no published notes directly but a subfolder within it does
- **THEN** the folder appears as a container for that subfolder

### Requirement: Entries are labelled by title and ordered by filename

The explorer SHALL label each entry with the note's `title` frontmatter value where one is present, and with the note's filename otherwise. Entries within a folder SHALL be ordered by filename.

#### Scenario: Note with a title

- **WHEN** a published note carries a `title` frontmatter value
- **THEN** the explorer labels it with that title

#### Scenario: Note without a title

- **WHEN** a published note carries no `title` frontmatter value
- **THEN** the explorer labels it with the note's filename

#### Scenario: Ordering does not follow the label

- **WHEN** notes carry titles that sort differently from their filenames
- **THEN** the explorer still orders them by filename

### Requirement: The vault's index note is the front page

The site's front page SHALL be the rendered `Index.md` note from the vault root. It SHALL be subject to the same rendering rules as any other published page.

#### Scenario: Reader arrives at the site root

- **WHEN** an authenticated reader opens the site without naming a page
- **THEN** the rendered index note is shown

#### Scenario: Links from the index

- **WHEN** the index note links to notes that are not published
- **THEN** those links degrade to plain text as they would on any other page

### Requirement: The site is readable on a phone

Published pages and the explorer SHALL remain readable and navigable on a mobile-sized screen. The site SHALL present a single light theme.

#### Scenario: Page viewed on a narrow screen

- **WHEN** a reader opens a published page on a phone
- **THEN** the text is legible without horizontal scrolling and the explorer remains reachable

#### Scenario: Wide table on a narrow screen

- **WHEN** a published page contains a table wider than the screen
- **THEN** the table remains readable without breaking the page layout

#### Scenario: Reader's device prefers dark mode

- **WHEN** a reader's device is set to a dark colour scheme
- **THEN** the site still presents its light theme
