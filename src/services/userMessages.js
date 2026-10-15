// Backend messages can include SQL, record contents or infrastructure details.
// Never return unknown error text. Match known cases to copy owned by the app.
export const DEFAULT_ERROR_MESSAGE = "We couldn’t complete that request. Please try again."

const codeMessages = {
  invalid_credentials: "The email or password is incorrect. Please try again.",
  email_not_confirmed: "Please confirm your email address before signing in.",
  user_banned: "Your account is inactive. Please contact your cafe owner.",
  weak_password: "Choose a stronger password and try again.",
  same_password: "Choose a password different from your current password.",
  email_exists: "This email address is already in use.",
  user_already_exists: "This email address is already in use.",
  over_request_rate_limit: "Too many attempts. Please wait a few minutes and try again.",
  over_email_send_rate_limit: "Too many attempts. Please wait a few minutes and try again.",
  otp_expired: "This link has expired. Please request a new one.",
  refresh_token_not_found: "Your session has expired. Please sign in again.",
  session_not_found: "Your session has expired. Please sign in again.",
  '42501': "You don’t have permission to do that. Contact your cafe owner if you need access.",
  '23505': "A matching record already exists. Check the details and try again.",
  '23503': "This record is linked to other information and cannot be changed this way.",
}

const knownCases = [
  [/^(?:Invalid login credentials\.?|Invalid credentials)$/, codeMessages.invalid_credentials],
  [/^(?:Account Disabled:|Your account has been deactivated)/i, codeMessages.user_banned],
  [/^(?:Access Denied:|Authorization Error:|Not authorized\.?$)/i, codeMessages['42501']],
  [/^(?:Authentication Required:|Session expired|Invalid session)/i, codeMessages.session_not_found],
  [/^Cafe Not Found:/i, "We couldn’t find this cafe. Check the link or ask the cafe for a new QR code."],
  [/^Subscription Inactive:/i, "This cafe’s subscription is inactive. Please contact the cafe owner."],
  [/^Invalid login credentials\./i, codeMessages.invalid_credentials],
  [/^Current password is incorrect\.$/, "Your current password is incorrect. Please try again."],
  [/^(?:This email is already registered\.|Email already exists\.)$/, codeMessages.email_exists],
  [/^(?:The )?(?:menu-item|menu item) limit .*reached\.?$/i, "This cafe has reached its menu-item limit. Remove an item or ask the owner to review the package."],
  [/^(?:The )?staff(?: user| account)? limit .*reached\.?$/i, "This cafe has reached its staff-account limit. Ask the owner to review the package."],
  [/^Notifications not supported$/, "This browser does not support notifications."],
  [/^VAPID public key not configured$/, "Notifications are temporarily unavailable. Please try again later."],
  [/^This operation is not included in this cafe package\.$/, "Your cafe’s package does not include this feature. Ask the owner to review the package."],
  [/^Choose a valid IANA time zone\.$/, "Choose a valid time zone."],
  [/^Paid transactions are immutable\.$/, "This payment has been completed and can no longer be changed."],
  [/^Order is closed\.$/, "This order is closed and can no longer be changed."],
  [/^Invalid payment method\.$/, "Choose an available payment method and try again."],
  [/^(?:Invalid payment proof\.|Use the proof upload workflow\.)$/, "Please upload your payment receipt again."],
  [/^(?:Invalid customizations\.|Invalid option selection\.|Duplicate choice\.|Invalid ingredient\.|Invalid menu option\.)$/, "An item’s available options have changed. Review your cart and try again."],
  [/^(?:Failed to fetch|NetworkError when attempting to fetch resource\.|Network request failed)$/, "We couldn’t connect. Check your internet connection and try again."],
  [/already has an account/i, "This email already has an account. Use a different owner email."],
  [/Choose an active package/i, "Choose an active package."],
  [/Only a pending request can be approved/i, "Only a pending request can be approved."],
  [/Temporary password must (?:contain 12|be at least 12)/i, "Temporary password must be at least 12 characters long."],
]

// Exact messages emitted by local validation are safe to retain. Do not add
// broad prefix matches that could pass through arbitrary backend details.
const validationMessages = new Set([
  "Use the platform sign-in page for your superadmin account.",
  "This account belongs to a different cafe. Use your cafe’s sign-in link.",
  "Your sign-in session changed. Please sign in again.",
  "A sign-in is already in progress. Please wait.",
  "Email is required.", "Password is required.", "Item name is required.",
  "Cafe name is required.", "Choose a valid staff role.", "Choose an existing cafe.",
  "Package selection is required.", "Package id is required.",
  "A package key is required (e.g. premium).", "A package name is required.",
  "Menu items limit must be a whole number of at least 1.",
  "Staff users limit must be a whole number of at least 1.",
  "Password must be at least 6 characters.", "New password must be at least 6 characters long.",
  "Order must include at least one item.",
  "This subscription request has already been approved.",
  "The request must contain a valid customer email address before it can be approved.",
  "Password changed, but account setup is incomplete. Please sign in again or contact your cafe owner.",
  "Account validation is temporarily unavailable. Please try again.",
  "Cafe validation is temporarily unavailable. Please try again.",
  "We could not sign you in. Please try again.",
  "Your order could not be loaded. Please retry.",
  "Choose a supported accounting currency.",
  "Currency is locked after the first order. Existing amounts cannot be converted by changing settings.",
  "Package limits are required.", "Limits must be whole numbers from 1 to 1000000.",
  "Enter a valid package name and status.", "Invalid preparation time.", "Invalid discount.",
  "This cafe is not accepting orders.", "Choose a valid cafe table.",
  "Quantity must be a whole number.", "Menu item is not available in this cafe.",
  "Temporary password must be at least 12 characters long.",
  "Temporary password must contain 12 to 128 characters.",
  "Temporary password must contain at least one uppercase letter.",
  "Temporary password must contain at least one lowercase letter.",
  "Temporary password must contain at least one number.",
  "Temporary password must contain at least one special character.",
  "This email already has an account. Use a different owner email.",
  "Choose an active package.",
  "Only a pending request can be approved.",
  "A valid owner email is required.",
  "Subscription request not found.",
  "Unable to provision this request.",
])

export function toUserMessage(error, fallback = DEFAULT_ERROR_MESSAGE) {
  const code = typeof error === "object" && error ? String(error.code || "") : ""
  if (Object.hasOwn(codeMessages, code)) return codeMessages[code]
  const status = typeof error === "object" && error ? Number(error.status) : 0
  if (status === 401) return codeMessages.session_not_found
  if (status === 403) return codeMessages['42501']
  if (status === 429) return codeMessages.over_request_rate_limit
  const message = typeof error === "string" ? error : error?.message
  if (typeof message !== "string") return fallback
  if (validationMessages.has(message)) return message
  for (const [pattern, copy] of knownCases) if (pattern.test(message)) return copy
  return fallback
}
