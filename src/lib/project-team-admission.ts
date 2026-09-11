/** PostgreSQL NOWAIT denial proves the transaction did not acquire admission. */
export class TeamAdmissionBusyError extends Error {
  constructor() {
    super("Team access is busy. Try again.");
    this.name = "TeamAdmissionBusyError";
  }
}
export function assertTeamAdmission(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "55P03")
    throw new TeamAdmissionBusyError();
}
