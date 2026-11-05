# Courtside recording workflow

The first version should let a parent follow a junior match on an Android phone without losing points while navigating screens. The selected approach is Quick endings with stroke selection, using large controls in portrait orientation and immediate local saves. Stroke statistics are a primary coaching output.

## Match setup

Select the tracked player and opponent, then choose a saved format or customize one. The initial presets are one FAST4 set, two FAST4 sets with a deciding match tie-break, and two normal sets with a deciding match tie-break. Show a plain-language summary of the actual rules before starting. A format name alone must not silently determine ambiguous rules.

Choose the first server and recording depth. Tournament, round, date, venue, court surface, indoor or outdoor conditions, weather, ball stage, and notes belong to the match but can be added later. Setup should not require completing every optional field.

Remember useful defaults and offer a rematch shortcut that copies relevant setup into a new match. Keep each match's rules and participant details historically stable when presets or player profiles change.

### Recording depth

| Mode | Information requested | Intended use |
| --- | --- | --- |
| Score only | Point winner | Busy periods or simple scorekeeping |
| Point endings | Player playing the final shot, outcome, and stroke | The basic paper chart workflow |
| Serves and endings | Serve attempts, optional return details, and point ending with stroke | More detailed performance analysis |

Allow the observer to change depth during a match. Previously unrecorded information remains unknown, and reports show how much of the match each statistic covers.

## Recording a point

Keep the score, current server, and player names visible. Distinguish the official point outcome from the observer's description of the rally.

In score-only mode, one tap on a player's point button records the point. In point-ending mode, choose who won the point first. Then choose a winner by that player or a forced or unforced error by the other player, and select the stroke to record the point. A backhand unforced error and a forehand unforced error must remain distinct in storage and reports.

Stroke selection is part of normal entry for every winner, forced error, and unforced error. Initial choices are forehand, backhand, volley, overhead, serve, and other. Aces and double faults have a known serve stroke without an extra question. Keep a deliberate shot-not-seen option for incomplete observations. Selecting Other identifies a stroke outside the listed categories. If the observer missed the ending entirely, Save winner only records the selected player and leaves the ending unknown.

Selecting a player and rally ending leaves the score as it is until the stroke is saved. Back returns from stroke selection to the available endings. Change winner returns to the player choice and preserves any serve observations for the current point.

In detailed mode, serve entry adapts to the current server. A first-serve fault exposes a second-serve entry; a double fault finishes the point without asking for a rally ending. Aces and other service outcomes must avoid duplicate entry. A let follows the configured rule and does not automatically become a fault or a completed point.

Support both entering serve details as play happens and filling them in after the rally. Save partial observations so an interruption does not erase work. Keep the next point ready after completion and provide clear save feedback.

### Point examples

- For an opponent's backhand unforced error, select the tracked player as the point winner, then choose the opponent's unforced error and Backhand.
- Tracked player's second serve is in, then opponent hits a return winner: preserve the serve observation and the opponent's winning return.
- Observer sees only the awarded outcome: record the point winner and leave stroke and cause unknown.
- Observer disputes a line call: retain the awarded point, separately attach a disputed-call observation, and allow a note about who made the call.

Exact button arrangements and tap counts will be tried on a phone before the interface is settled.

## Corrections and interruptions

Undo must be immediately accessible. Earlier points can also be edited through a point history. Preview score and service-order consequences when changing an earlier winner, particularly across game and set boundaries.

Treat a point with a known winner but unknown details differently from a score jump over an unknown number of points. Neither should invent serve or shot statistics.

A score correction records the new score and enough service context to continue accurately. Ask for the next server or tie-break service position when it cannot be reconstructed. Keep an explanation of the correction in the match history.

Support suspension and resumption separately from finishing. Retirement, abandonment, walkover, and normal completion need distinct outcomes; an unfinished score alone must not imply a winner. Store a reason and awarded winner where applicable.

For timed formats, explicitly define duration, whether an ongoing point finishes, how ties are handled, and whether interruptions pause the clock. Recover timing from persisted timestamps and clock actions after the app is closed.

## Match review and reports

Lead with each player's winners, unforced errors, and forced errors broken down by stroke. Include totals and an explicit category for an unseen stroke when needed. Aces count as serve winners; show double faults separately. These breakdowns must update after editing or undoing a point and be available across matches as well as in a match report.

Also provide a score summary, point history, serve and return statistics where available, tags, and notes. Reports should offer both chart styles from the existing paper workflow.

Show numerator and denominator for percentages. For example, first-serve percentage uses only service points with a known first-serve outcome. A score override can preserve the official result while leaving point-based statistics incomplete.

Long-term views should filter by player, tournament, date, opponent, surface, ball stage, and format. Compare like-for-like data and show sample size before suggesting patterns. Coaching observations should remain distinguishable from measured counts.

## First implementation scope

Start with singles, multiple saved players, a small selection of explicit formats, all three recording depths, undo and corrections, local history, a basic match report, and restorable export and import. Singles is a proposed first-release boundary; the user has not excluded doubles from the longer-term product.

Cloud backup, device synchronization, coach invitations, and richer longitudinal reports can follow. Public release requires testing the full setup, recovery, backup, and recording workflows with people beyond the first family.

## Decisions to resolve through examples

- Which additional stroke categories and serve or return details are needed beyond the initial choices.
- The preferred balance between input during the rally and after the point.
- Whether doubles is needed in the first usable version.
