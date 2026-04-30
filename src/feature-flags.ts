/**
 * Build-time feature flags. Anything gated here is wired up on the
 * frontend but waiting on a piece of the backend / spec / design that
 * isn't ready yet — flip the flag to re-enable once that lands.
 *
 * Document every disabled flag in README.md so contributors know why
 * a UI affordance is missing and what unblocks it.
 */

/**
 * The "Automations" section of the device editor (the navigator group,
 * the step CTA on the right pane, and the "+ Add automation" dialog).
 *
 * Disabled because the backend WebSocket API doesn't yet expose the
 * automation endpoints the UI needs (catalog of triggers/conditions/
 * actions, schema lookups, save-back hooks). Re-enable by setting this
 * to `true` once those land.
 */
export const AUTOMATIONS_ENABLED = false;
