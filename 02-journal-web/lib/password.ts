export type PasswordCheck = {
  length: boolean;
  upper: boolean;
  digit: boolean;
  symbol: boolean;
  ok: boolean;
};

export function checkPassword(pw: string): PasswordCheck {
  const length = pw.length >= 12;
  const upper = /[A-Z]/.test(pw);
  const digit = /[0-9]/.test(pw);
  const symbol = /[^A-Za-z0-9]/.test(pw);
  return {
    length,
    upper,
    digit,
    symbol,
    ok: length && upper && digit && symbol,
  };
}
