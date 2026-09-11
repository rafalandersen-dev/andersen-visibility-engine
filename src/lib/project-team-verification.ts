/** A confirmed mismatch in saved approval or image evidence, not a failed read. */
export class TeamVerificationMismatchError extends Error {
  constructor(message = "The project image could not be confirmed. Refresh before trying again.") {
    super(message);
    this.name = "TeamVerificationMismatchError";
  }
}
