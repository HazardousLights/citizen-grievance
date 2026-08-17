// utils/validators.js
// Mirrors backend validation rules so users get instant feedback before
// hitting the API (backend re-validates everything regardless).

export function isValidPhone(phone) {
  return /^\+?[0-9]{10,15}$/.test(phone)
}

export function isValidPassword(password) {
  return password.length >= 8
}

export function isValidComplaintText(text) {
  const trimmed = text.trim()
  return trimmed.length >= 20 && trimmed.length <= 2000
}

export const VALID_COMPLAINT_EXAMPLE =
  'There has been a broken water pipe on MG Road near the bus stop for 3 days, causing flooding.'

export const INVALID_COMPLAINT_EXAMPLES = [
  'water problem',
  'fix it',
  'My neighbor stole my bicycle yesterday.',
]
