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
