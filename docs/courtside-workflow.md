# Courtside recording workflow

The first version should let a parent follow a junior match on an Android phone without losing points while navigating screens. The selected approach is Quick endings with stroke selection, using large controls in portrait orientation and immediate local saves. Stroke statistics are a primary coaching output.

## Match setup

Select the tracked player and opponent, then choose a saved format or customize one. The presets are one FAST4 set, two FAST4 sets with a deciding match tie-break, two normal sets with a deciding match tie-break, and best of three full normal sets. Show a plain-language summary of the actual rules before starting. A format name alone must not silently determine ambiguous rules.

Choose the recording depth and save the match before play begins. Ask for the first server only when starting the saved match, which also starts its clock. Tournament, round, date, venue, court surface, indoor or outdoor conditions, weather, ball stage, and notes belong to the match but can be added later. Setup should not require completing every optional field.

Remember useful defaults and offer a rematch shortcut that copies relevant setup into a new match. Keep each match's rules and participant details historically stable when presets or player profiles change.

### Recording depth

| Mode | Information requested | Intended use |
| --- | --- | --- |
| Score | Point winner | Busy periods or simple scorekeeping |
| Score & last shot | Point winner, final-shot outcome, and stroke | The basic paper chart workflow |
| Score, serve & last shot | Serve attempts, optional return details, and point ending with stroke | More detailed performance analysis |

Allow the observer to change depth during a match. Previously unrecorded information remains unknown, and reports show how much of the match each statistic covers.

## Recording a point

Keep the score, current server, and player names visible. Distinguish the official point outcome from the observer's description of the rally.

In Score mode, one tap on a player's point button records the point. In Score & last shot mode, choose who won the point first. Keep that selection in a separate card with Change winner. Then tap Forehand, Backhand or Volley within the relevant winner, unforced-error or forced-error section to record the point in one tap. A backhand unforced error and a forehand unforced error must remain distinct in storage and reports.

Each section has a racket button for a modal with Overhead, Other and I'm not sure. The last choice preserves the selected ending but leaves the stroke unknown; Other identifies a stroke outside the listed categories. Serve is available only for the actual server's winner or unforced error when no serve or return observation has been entered, recording an ace or double fault respectively. The players appear in scoreboard order. A visually separated **I'm not sure how it ended** option records the selected point winner and leaves both ending and stroke unknown.

Selecting a point winner or opening the racket menu leaves the score unchanged. Close or Android Back dismisses the menu without saving, retaining the winner selection. An unfinished selection survives an app restart. Change winner returns to the player choice and preserves any serve observations for the current point.

In Score, serve & last shot mode, show one question at a time: first serve, second serve after a fault, return result, then return stroke if the return was in or missed. Serve choices use the server's colour and return choices use the receiver's colour. During return entry, show a compact completed Serve card above the active Return card. Keep read-only Serve and Return cards visible while choosing the point winner, classifying a missed return, and recording the last shot. Clear these references when the next point begins. A double fault or ace finishes the point immediately. A let keeps the current serve question open without recording a point.

I'm not sure / didn't see on either serve advances to the return result while keeping the unobserved serve unknown. An unknown return result skips its stroke question and proceeds to the point winner. After a missed return's stroke, ask only whether the return was a forced or unforced error, with an unknown-error option. Back revisits the preceding question without saving a point; answering an earlier question again clears its dependent observations. Save the current question alongside observations so explicit unknown answers survive a restart.

Support both entering serve details as play happens and filling them in after the rally. Save partial observations so an interruption does not erase work. Keep the next point ready after completion and provide clear save feedback.

### Point examples

- For an opponent's backhand unforced error, select the tracked player as the point winner, then tap Backhand in the opponent's unforced-error section.
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

Lead with each player's winners, unforced errors, and forced errors broken down by stroke. Include totals and an explicit category for an unseen stroke when needed. Aces count as serve winners. Double faults count as unforced serve errors and also have their own tally. These breakdowns must update after editing or undoing a point and be available across matches as well as in a match report.

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
