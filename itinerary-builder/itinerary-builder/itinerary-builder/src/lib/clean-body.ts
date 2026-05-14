/**
 * cleanBody — strip empty strings before Zod validation.
 *
 * Zod's z.string().email() / .url() / .min(1) all reject "" (empty string).
 * When a frontend form submits an optional field that was left blank it sends "".
 * This helper converts every "" → null so .optional().nullable() fields pass correctly.
 * Required fields (z.string().min(1)) still fail loudly with a proper 400 response.
 */
export function cleanBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) => {
      if (v === '') return [k, null];
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) return [k, cleanBody(v)];
      return [k, v];
    }),
  );
}
