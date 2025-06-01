/**
 * Utility functions for authentication and authorization
 */

export const ALLOWED_EMAIL_DOMAINS = ['@attitudeltd.com', '@attitudegroupspa.com'] as const;

/**
 * Check if a user's email domain is allowed to access the application
 * @param email - The user's email address
 * @returns true if the email domain is allowed, false otherwise
 */
export function isEmailDomainAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  
  return ALLOWED_EMAIL_DOMAINS.some(domain => 
    email.toLowerCase().endsWith(domain.toLowerCase())
  );
}

/**
 * Get the list of allowed email domains for display purposes
 * @returns Array of allowed email domains
 */
export function getAllowedEmailDomains(): readonly string[] {
  return ALLOWED_EMAIL_DOMAINS;
} 