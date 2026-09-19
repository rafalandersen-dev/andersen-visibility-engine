/** Client-safe seat outcome. The server refuses an invitation or role change with this
 * exact message when the owner's plan has no free seat of the needed kind; the browser
 * recognizes it without trusting any other error text. */
export const TEAM_SEAT_LIMIT_MESSAGE = "team_seat_limit";
export class TeamSeatLimitError extends Error {
  constructor() {
    super(TEAM_SEAT_LIMIT_MESSAGE);
    this.name = "TeamSeatLimitError";
  }
}
export function isTeamSeatLimit(error: unknown): boolean {
  return (
    error instanceof TeamSeatLimitError ||
    (error instanceof Error && error.message === TEAM_SEAT_LIMIT_MESSAGE) ||
    (typeof error === "object" &&
      error !== null &&
      "message" in error &&
      error.message === TEAM_SEAT_LIMIT_MESSAGE)
  );
}
