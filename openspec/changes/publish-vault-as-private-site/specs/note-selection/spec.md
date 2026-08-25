## Purpose

Determines which notes in the source vault become published pages and which never leave it, so that sharing part of a confidential vault does not risk the rest.

## ADDED Requirements

### Requirement: Selection is declared in configuration

The publisher SHALL publish only those notes named, directly or by containing folder, in a configuration file. A note not covered by the configuration SHALL NOT be published.

#### Scenario: Folder selected

- **WHEN** the configuration names a folder
- **THEN** every note within that folder, including its subfolders, is published

#### Scenario: Individual note selected

- **WHEN** the configuration names an individual note
- **THEN** that note is published, and no other note in its folder is published by virtue of that entry

#### Scenario: Note not covered by configuration

- **WHEN** a note in the vault is named by no configuration entry and lies within no selected folder
- **THEN** the note is not published and no page is generated for it

### Requirement: Configuration is the sole source of truth for selection

The publisher SHALL determine selection from the configuration file alone. No frontmatter key, tag, or file naming convention in the vault SHALL cause a note to be published or withheld.

#### Scenario: audience frontmatter is ignored

- **WHEN** a note carries an `audience:` frontmatter key with any value
- **THEN** that key has no effect on whether the note publishes; only the configuration decides

#### Scenario: Selected note carrying no audience key

- **WHEN** the configuration selects a note that has no `audience:` key at all
- **THEN** the note is published

### Requirement: A fixed exclusion floor overrides configuration

The publisher SHALL maintain a fixed set of excluded paths that configuration cannot override. The excluded set SHALL include `CLAUDE.md`, `.claude/`, `.obsidian/`, `Journal/`, and `Private/`. An excluded path SHALL NOT be published under any configuration.

#### Scenario: Configuration names an excluded folder

- **WHEN** the configuration names `Journal/` or any folder in the exclusion floor
- **THEN** no note within it is published, and the publish still completes

#### Scenario: Configuration names an excluded file directly

- **WHEN** the configuration names `CLAUDE.md`
- **THEN** it is not published

#### Scenario: Excluded folder nested inside a selected folder

- **WHEN** a selected folder contains an excluded folder such as `Private/`
- **THEN** the notes in the selected folder publish and the notes within the excluded folder do not

#### Scenario: Excluded folder does not yet exist

- **WHEN** an excluded path such as `Private/` is absent from the vault
- **THEN** the publish completes normally, and the path remains excluded if it is later created

### Requirement: Selection failures do not publish more than intended

Where the publisher cannot determine what the configuration means — a malformed file, or an entry naming a path that does not exist — it SHALL NOT respond by publishing anything the configuration did not clearly select.

#### Scenario: Configuration names a path that does not exist

- **WHEN** a configuration entry names a folder or note absent from the vault
- **THEN** the publisher reports the unmatched entry and publishes only what did match

#### Scenario: Configuration file is malformed or missing

- **WHEN** the configuration cannot be read or parsed
- **THEN** the publish fails and no content is published
