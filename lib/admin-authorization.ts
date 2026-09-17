export function parseAllowedAdminEmails(rawEmails: string | undefined) {
  return (rawEmails ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedAdminEmail(
  email: string | null | undefined,
  rawEmails: string | undefined,
) {
  if (!email) {
    return false;
  }

  const allowedEmails = parseAllowedAdminEmails(rawEmails);

  return (
    allowedEmails.length > 0 &&
    allowedEmails.includes(email.trim().toLowerCase())
  );
}
