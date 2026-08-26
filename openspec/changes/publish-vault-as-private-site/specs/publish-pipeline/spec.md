## Purpose

Defines when the site is rebuilt from the vault and how the publisher reports what it could not render, so the owner learns about degraded content without a publish being blocked by it.

## ADDED Requirements

### Requirement: Publishing is triggered by a push to the vault's main branch

The publisher SHALL rebuild and republish the site when a change is pushed to the main branch of the vault repository. No manual step SHALL be required.

#### Scenario: Push to main

- **WHEN** a commit is pushed to the vault repository's main branch
- **THEN** the site is rebuilt from that commit and the published site reflects it

#### Scenario: Push to another branch

- **WHEN** a commit is pushed to a branch other than main
- **THEN** the published site is unchanged

#### Scenario: Configuration changed without note changes

- **WHEN** a push changes only the selection configuration
- **THEN** the site is rebuilt and the published set reflects the new configuration, including removing pages for notes no longer selected

### Requirement: Degraded content is reported as a warning

The publisher SHALL emit a `[WARNING]` line to the build output for each wikilink it could not resolve and each Bases query block it dropped, identifying the note it occurred in.

#### Scenario: Unresolved link

- **WHEN** a published note links to a note that is unpublished or absent
- **THEN** the build output contains a `[WARNING]` line naming the containing note and the unresolved link

#### Scenario: Dropped Bases block

- **WHEN** a published note contains a Bases query block
- **THEN** the build output contains a `[WARNING]` line naming the containing note

#### Scenario: Nothing degraded

- **WHEN** every link resolves and no block is dropped
- **THEN** the build output contains no degradation warning lines. Warnings mandated by other capabilities — an unmatched selection entry, for instance — are out of this requirement's scope and MAY still appear

### Requirement: Warnings never fail a publish

A warning SHALL NOT prevent a page from being published or a publish from completing. The publisher SHALL publish the degraded page.

#### Scenario: Page with unresolved links

- **WHEN** a published note contains unresolved links
- **THEN** the page is published with those links as plain text, and the publish succeeds

#### Scenario: Many warnings in one publish

- **WHEN** a publish produces warnings across many notes
- **THEN** all warnings are reported and the publish still succeeds
