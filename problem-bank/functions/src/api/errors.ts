export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "invalid_request", "A JSON object is required.");
  }
  return value as Record<string, unknown>;
}

export function requiredString(
  value: unknown,
  field: string,
  maxLength = 2_000,
): string {
  const normalized = String(value ?? "").trim().slice(0, maxLength);
  if (!normalized) throw new ApiError(400, "invalid_request", `${field} is required.`);
  return normalized;
}

export function boundedInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ApiError(400, "invalid_request", `${field} must be an integer from ${minimum} to ${maximum}.`);
  }
  return number;
}
