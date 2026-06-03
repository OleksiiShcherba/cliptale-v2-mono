/** Typed error classes for the API layer.
 *
 * Controllers catch these and map them to HTTP status codes.
 * Repositories throw only on DB failure — never throw these from a repository.
 */

export class ValidationError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  readonly statusCode = 401;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class OptimisticLockError extends ConflictError {
  constructor(message = 'Version conflict') {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

export class UnprocessableEntityError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = 'UnprocessableEntityError';
  }
}

/**
 * Generate-gate failures (generate-ai-flow T11, AC-03/05/06/17).
 *
 * All are 422 (a subclass of UnprocessableEntityError, so the existing centralized
 * error handler maps the status for free) but each carries a stable machine `code`
 * (mirroring contracts/openapi.yaml POST .../generate) plus structured `details`,
 * so the controller (T15) can surface `{error, code, details}` to the client.
 *
 * NOTE: a reference to a *never-owned* asset is NOT one of these — it is a 404
 * (NotFoundError, existence hiding, AC-04). `flow.asset_missing` is reserved for an
 * asset the Creator *previously owned* and is now gone.
 */
export class GateError extends UnprocessableEntityError {
  /** Machine-readable error code from the OpenAPI contract (e.g. "flow.required_input_missing"). */
  readonly code: string;
  /** Structured, client-safe context (e.g. { blockId, input }). */
  readonly details: Record<string, unknown>;
  constructor(message: string, code: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'GateError';
    this.code = code;
    this.details = details;
  }
}

/** A required model input has no compatible connection and no supplied value (AC-03). */
export class RequiredInputMissingError extends GateError {
  constructor(message: string, details: Record<string, unknown>) {
    super(message, 'flow.required_input_missing', details);
    this.name = 'RequiredInputMissingError';
  }
}

/** An exactly-one-of (exclusiveGroup) rule was violated — zero or 2+ provided (AC-06). */
export class ExclusivityViolationError extends GateError {
  constructor(message: string, details: Record<string, unknown>) {
    super(message, 'flow.exclusivity_violation', details);
    this.name = 'ExclusivityViolationError';
  }
}

/**
 * A referenced library asset the Creator PREVIOUSLY OWNED is now missing (AC-05).
 * Never raised for a never-owned asset — that path is a 404 (NotFoundError).
 */
export class AssetMissingError extends GateError {
  constructor(message: string, details: Record<string, unknown>) {
    super(message, 'flow.asset_missing', details);
    this.name = 'AssetMissingError';
  }
}

/** A content block is empty or holds invalid/incompatible media (AC-17). */
export class ContentInvalidError extends GateError {
  constructor(message: string, details: Record<string, unknown>) {
    super(message, 'flow.content_invalid', details);
    this.name = 'ContentInvalidError';
  }
}

/**
 * Per-Creator generation rate limit exceeded (generate-ai-flow ADR-0004, ≤ 30/min).
 *
 * Maps to HTTP 429. Carries the seconds the caller should wait (for the
 * `Retry-After` header, set by the controller T15) plus the OpenAPI machine
 * `code`/`details` so the unified `{error, code, details}` body can be returned.
 */
export class RateLimitedError extends Error {
  readonly statusCode = 429;
  readonly code = 'flow.rate_limited';
  readonly retryAfterSeconds: number;
  readonly details: Record<string, unknown>;
  constructor(message: string, retryAfterSeconds: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
  }
}

/**
 * Thrown when the requested resource has been permanently removed and will not
 * come back. Maps to HTTP 410 Gone.
 *
 * Used by restore services when the row no longer exists (hard-purged) or when
 * the soft-delete TTL (30 days) has expired.
 */
export class GoneError extends Error {
  readonly statusCode = 410;
  constructor(message: string) {
    super(message);
    this.name = 'GoneError';
  }
}
