## Purpose

Guarantees that published content reaches only the people the owner has named, and defines how those people prove who they are, because the material is client-confidential and the project is only permissible while this holds.

## ADDED Requirements

### Requirement: No unauthenticated access to published content

The site SHALL NOT serve published content, in any form, to a request that is not authenticated as a reader on the allow-list. This SHALL hold for every page and every asset, not only for the front page.

#### Scenario: Unauthenticated request for a page
- **WHEN** an unauthenticated visitor requests any published page
- **THEN** the content is not served and the visitor is directed to authenticate

#### Scenario: Unauthenticated request for an asset
- **WHEN** an unauthenticated visitor requests an image or other published asset directly by its address
- **THEN** the asset is not served

#### Scenario: Address is known but the visitor is not authenticated
- **WHEN** an unauthenticated visitor knows the exact address of a page
- **THEN** knowing the address grants no access; the content is still withheld

#### Scenario: Authenticated reader
- **WHEN** a reader on the allow-list has authenticated
- **THEN** they may read every published page; there is no per-reader restriction on which pages they see

### Requirement: Readers authenticate by an emailed single-use credential

The system SHALL authenticate a reader by sending a single-use credential to their email address, which they present to gain access. The credential SHALL expire. Readers SHALL NOT be asked to create, remember, or supply a password.

#### Scenario: Reader on the allow-list requests access
- **WHEN** a person enters an email address that is on the allow-list
- **THEN** a single-use credential is sent to that address, and presenting it authenticates them

#### Scenario: Address not on the allow-list
- **WHEN** a person enters an email address that is not on the allow-list
- **THEN** they are not granted access, and no credential that would grant access is sent to that address

#### Scenario: Login page does not disclose who the readers are
- **WHEN** a person enters an email address, whether or not it is on the allow-list
- **THEN** the response is the same in both cases and does not reveal whether that address is allowed

#### Scenario: Credential is reused or has expired
- **WHEN** a credential that has already been used, or has expired, is presented
- **THEN** access is not granted and the person may request a new one

### Requirement: The allow-list is managed outside the vault repository

The reader allow-list SHALL be held outside the vault repository and SHALL be changeable without committing to it. The system SHALL NOT keep a password store or a user database.

#### Scenario: Adding a reader
- **WHEN** the owner adds an email address to the allow-list
- **THEN** that person can authenticate, with no commit to the vault repository and no republish of the site

#### Scenario: Removing a reader
- **WHEN** the owner removes an email address from the allow-list
- **THEN** that person can no longer obtain access

#### Scenario: Reader record
- **WHEN** a reader authenticates
- **THEN** no password or credential for them is stored

### Requirement: Published content has no unauthenticated route

The published site SHALL be reachable only through the hostname that access control protects. No alternative hostname, preview address, or default platform address SHALL serve published content.

#### Scenario: Platform default hostname
- **WHEN** the hosting platform offers a default hostname for the deployment alongside the protected one
- **THEN** that hostname does not serve published content

#### Scenario: Preview or non-production deployment
- **WHEN** a deployment other than the production one exists
- **THEN** it does not serve published content to an unauthenticated visitor

#### Scenario: Built site at rest
- **WHEN** the site has been built
- **THEN** the rendered output is not committed to any repository
