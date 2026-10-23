export type OfdErrorCode =
  | 'E_NETWORK'
  | 'E_NOT_ZIP'
  | 'E_NO_ENTRY'
  | 'E_PARSE_XML'
  | 'E_ENCRYPTED'
  | 'E_FONT'
  | 'E_IMAGE'
  | 'E_CANVAS'
  | 'E_RENDER';

export class OfdError extends Error {
  readonly code: OfdErrorCode;
  constructor(code: OfdErrorCode, message: string) {
    super(message);
    this.name = 'OfdError';
    this.code = code;
  }
}

export function isOfdError(value: unknown): value is OfdError {
  return value instanceof OfdError;
}

export function toOfdError(value: unknown, fallback: OfdErrorCode): OfdError {
  if (isOfdError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  return new OfdError(fallback, message);
}
