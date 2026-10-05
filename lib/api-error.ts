/** A non-2xx API response: `message` is user-facing, `body` keeps the rest of the JSON error. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}
