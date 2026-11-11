# Application structure and UI changes

The application separates tennis rules, saved records, application operations, and presentation. Phone and tablet layouts use the same operations and record formats. A layout change must not require a scoring-rule, SQLite-schema, or backup-format change.

## Responsibilities and dependencies

| Location | Responsibility | Allowed dependencies |
| --- | --- | --- |
| `src/domain` | Scoring, service order, match history, observations, statistics, and entry workflow rules | Other domain modules |
| `src/storage/model.ts` and `matchGroups.ts` | Saved-record definitions, validation, and grouping | Domain and storage models |
| `src/storage/repository.ts` | Transactions, revision checks, persistence, and backup/restore | Domain, storage models, and an injected database interface |
| `src/application/matchCommands.ts` | Typed match inputs and transformations used by recording operations | Domain and storage models |
| `src/application/useNotebook.ts` | Application state, commands, save/retry coordination, recovery, and export orchestration | React, application modules, domain, storage contracts, and report calculations |
| `src/reports` except `files.ts` | Shared report calculations and PDF generation | Domain, storage models, and PDF libraries |
| `src/ui` and the view in `App.tsx` | Controls, forms, presentation state, screen composition, scrolling, keyboards, accessibility, and responsive layout | Application state and command contracts, read-only models, domain calculators, and report helpers |
| `src/storage/database.ts` and `src/reports/files.ts` | Expo SQLite and device/browser file operations | Platform libraries and the shared core |
| `src/platform/notebookDependencies.ts` | Connect concrete database, identifier, clock, and file adapters to the application | Platform adapters and application contracts |

`App.tsx` is the composition root: it supplies platform dependencies to the controller and renders the resulting state. Views call named operations instead of creating event histories, writing repository records, or opening databases. The controller contains no JSX, screen dimensions, styles, keyboard handling, or native platform imports. Application operations receive native capabilities through dependencies.

The dependency direction matters more than whether a component imports a domain type. A scoreboard can use the shared score-label calculator, and a form can display a domain validation error. Tennis rules must not import UI components, and changing component geometry must not change how an operation is recorded.

## Changing a screen

For changes to spacing, colours, typography, navigation presentation, dialogs, or the arrangement of existing controls, edit the presentation layer. A wide screen can place a match list beside a report while a narrow screen shows them sequentially. Both call the same application commands.

Keep temporary presentation state, such as expanded sections and unsaved form text, in the view. Keep match state and durable entry drafts in the application and storage layers. Moving a button or switching layouts must not recreate a match or discard its saved draft. Keep the controller mounted above alternative phone/tablet layouts so resizing does not recreate its state. The controller exposes an `entrySavedVersion` signal after a successful entry save; the view decides whether to scroll in response. Scrolling and keyboard visibility are view concerns, separate from the success of a saved operation.

Adding a new tennis format, recorded observation, or product capability may require core or record changes. UI independence applies to presenting and arranging existing capabilities; it does not remove the need to model new information. Cross-device synchronization remains separate work and is not part of this separation.

## Data and behaviour guarantees

This separation preserves existing match records, event history, SQLite schema, and JSON backup format. The existing `tennis-tracker` database filename and backup marker remain compatibility identifiers.

- Display an entry as recorded only after its save succeeds.
- Keep unfinished entry drafts durable and recover them after reopening.
- Preserve event identities during retries and reject stale record revisions.
- Compute scores, statistics, and reports from the same domain functions for every layout.
- Keep scoring and recording available offline.

## Verification

`npm run check` runs type checking, domain/storage checks, application-command tests, and dependency-boundary tests. Boundary checks parse source imports and reject dependencies from core modules into presentation or native adapters, and direct repository/history mutations imported by views.

The browser application smoke test exercises the complete workflow, including saved drafts, edits, undo, offline recording, reports, and backup/restore. It verifies the controller and views together. Native phone and tablet checks remain necessary for platform behaviour such as sharing, keyboards, rotation, and window resizing.
