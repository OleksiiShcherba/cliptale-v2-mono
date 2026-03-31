// Augments the Express Request type to include the authenticated user payload
// attached by auth.middleware.ts after JWT validation.
declare namespace Express {
  interface Request {
    user?: { id: string; email: string };
  }
}
