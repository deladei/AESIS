import { useCallback, useState } from 'react';
import { z } from 'zod';

// Re-export the shared field primitives so components import validation from
// one place. The schemas themselves live with the API (backend/src/shared/
// validation, aliased as @shared) and are the same objects the server parses
// with — client-side checking is UX, the server remains the guarantee.
export * from '@shared';

export type FieldErrors<T> = Partial<Record<keyof T & string, string>>;

/**
 * Runs a Zod object schema field-by-field so each message lands next to its own
 * input instead of surfacing as one form-level failure.
 *
 * - `check(field, value)` validates a single field (use on blur).
 * - `validate(values)` validates the whole object (use on submit); returns the
 *   parsed data or null and populates every failing field.
 * - `clear(field)` drops a message as the user types.
 * - `setServerErrors(...)` folds a 422 body's field paths into the same slots,
 *   so a server-only rule reads identically to a client-side one.
 */
export function useFieldErrors<S extends z.ZodTypeAny>(schema: S) {
  type Values = z.input<S>;
  const [errors, setErrors] = useState<FieldErrors<Values>>({});

  const shapeOf = (s: z.ZodTypeAny): z.ZodRawShape | null => {
    // Unwrap effects/refinements so per-field checking still works on a schema
    // that carries a .superRefine() or .refine() at the object level.
    const inner = s as unknown as { _def?: { schema?: z.ZodTypeAny; shape?: () => z.ZodRawShape } };
    if (inner?._def?.schema) return shapeOf(inner._def.schema);
    if (typeof inner?._def?.shape === 'function') return inner._def.shape();
    return null;
  };

  const check = useCallback(
    (field: keyof Values & string, value: unknown): boolean => {
      const shape = shapeOf(schema);
      const fieldSchema = shape?.[field];
      if (!fieldSchema) return true;
      const r = fieldSchema.safeParse(value);
      setErrors((prev) => ({ ...prev, [field]: r.success ? undefined : r.error.issues[0]?.message }));
      return r.success;
    },
    [schema],
  );

  const validate = useCallback(
    (values: Values): z.output<S> | null => {
      const r = schema.safeParse(values);
      if (r.success) {
        setErrors({});
        return r.data;
      }
      const next: FieldErrors<Values> = {};
      for (const issue of r.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key as keyof Values & string]) {
          next[key as keyof Values & string] = issue.message;
        }
      }
      setErrors(next);
      return null;
    },
    [schema],
  );

  const clear = useCallback((field: keyof Values & string) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }, []);

  /** Fold the API's field errors into the same inline slots. */
  const setServerErrors = useCallback((fieldErrors: Record<string, string>) => {
    setErrors((prev) => ({ ...prev, ...(fieldErrors as FieldErrors<Values>) }));
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  return { errors, check, validate, clear, setServerErrors, reset };
}

/**
 * Pull field-level errors out of an axios error. A Zod failure comes back as
 * `{ code: 'VALIDATION_ERROR', errors: { field: [msg, ...] } }` (the API's
 * globalErrorHandler flattens it); everything else is a form-level message and
 * yields {}.
 */
export function extractFieldErrors(err: unknown): Record<string, string> {
  const errors = (err as { response?: { data?: { errors?: unknown } } })?.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === 'string') out[field] = first;
  }
  return out;
}

/** Form-level fallback: the message the API sent, or a generic one. */
export function formLevelMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback
  );
}
