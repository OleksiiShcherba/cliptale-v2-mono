// Augments the Express Request type to include the authenticated user payload
// attached by auth.middleware.ts after session token validation.
declare namespace Express {
  interface Request {
    user?: { userId: string; email: string; displayName: string };
  }
}
