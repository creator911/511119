export const PASSWORD_STRENGTH_LABELS = [
  "매우약함",
  "약함",
  "보통",
  "강함",
  "아주강함",
] as const;

export type PasswordStrengthScore = 0 | 1 | 2 | 3 | 4;

const COMMON_PASSWORD_PARTS = [
  "password",
  "admin",
  "qwer",
  "asdf",
  "1234",
  "1111",
  "0000",
];

export function scorePasswordStrength(
  password: string,
): PasswordStrengthScore {
  if (password.length < 8) return 0;

  const characterGroups = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;

  let score: PasswordStrengthScore;
  if (password.length >= 16 && characterGroups >= 4) score = 4;
  else if (password.length >= 12 && characterGroups >= 3) score = 3;
  else if (password.length >= 10 && characterGroups >= 3) score = 2;
  else score = 1;

  const normalized = password.toLowerCase();
  const containsCommonSequence = COMMON_PASSWORD_PARTS.some((part) =>
    normalized.includes(part),
  );
  const containsLongRepeat = /(.)\1{2,}/.test(password);
  if ((containsCommonSequence || containsLongRepeat) && score > 1) {
    score = (score - 1) as PasswordStrengthScore;
  }

  return score;
}
