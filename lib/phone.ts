export class PhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneError";
  }
}

export function normalizePhone(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) throw new PhoneError("Enter a phone number.");
  if (digits.length < 7 || digits.length > 15) throw new PhoneError("Phone number looks invalid.");
  return digits;
}
