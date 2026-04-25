/**
 * Stub email service — logs to console instead of sending real emails.
 * Replace with Resend/SES/SendGrid implementation when ready.
 */

/** Sends a password reset email with a token link. */
export async function sendPasswordResetEmail(
  email: string,
  _resetToken: string,
): Promise<void> {
  console.log(`[email-stub] Password reset email requested for ${email}`);
}

/** Sends an email verification link after registration. */
export async function sendEmailVerificationEmail(
  email: string,
  _verificationToken: string,
): Promise<void> {
  console.log(`[email-stub] Email verification email requested for ${email}`);
}
