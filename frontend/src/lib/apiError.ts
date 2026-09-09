/**
 * One reading of an API failure, for every form in the app.
 *
 * The API answers a Zod failure with `{ errors: { field: [msg] } }` and NO
 * `message` key (see backend globalErrorHandler), while every page read only
 * `data.message` — so a rejected field rendered as "Something went wrong.
 * Please try again", which is both untrue and unactionable. A request that
 * never got a response (offline, a redeploy in flight, CORS) read the same.
 *
 * Field names are mapped to the words the forms use where they differ; an
 * unmapped field falls back to its own name rather than being dropped.
 */
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  firstName: 'First name',
  lastName: 'Last name',
  gender: 'Gender',
  phone: 'Phone',
  indexNumber: 'Index number',
  academicLevel: 'Level',
  programmeId: 'Programme',
  password: 'Password',
  email: 'Email',
  description: 'Summary line',
  body: 'Written guidance',
  externalUrl: 'Link',
  fileUrl: 'File',
  category: 'Category',
  audienceRoles: 'Who sees it',
  sortOrder: 'Order',
  isPublished: 'Publish',
  companyName: 'Company name',
  companyAddress: 'Company address',
  companySupervisorName: 'Company supervisor',
  companySupervisorEmail: 'Supervisor email',
  region: 'Region',
  startDate: 'Start date',
  endDate: 'End date',
};

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: {
      message?: string;
      errors?: Record<string, string[] | undefined>;
    };
  };
  code?: string;
}

export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as ApiErrorShape;

  // No response at all: the request never completed. Saying "try again" is
  // right here and nowhere else.
  if (!e?.response) {
    return 'Could not reach the server. Check your connection and try again.';
  }

  const { status, data } = e.response;
  if (status === 413) return 'That file is too large. The limit is 10 MB.';
  if (status === 415) return 'That file type is not accepted. Use a PDF, PNG, JPG or DOCX.';

  const fieldErrors = data?.errors;
  if (fieldErrors) {
    const parts = Object.entries(fieldErrors)
      .map(([field, msgs]) => {
        const msg = msgs?.[0];
        if (!msg) return null;
        return `${FIELD_LABELS[field] ?? field}: ${msg}`;
      })
      .filter((p): p is string => !!p);
    if (parts.length > 0) return parts.join(' · ');
  }

  if (typeof data?.message === 'string' && data.message) return data.message;
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  // Nothing readable came back (a proxy's HTML 502, say). The status is the
  // only fact there is, and it is worth more to whoever is asked about it than
  // a bare apology.
  return status ? `${fallback} (HTTP ${status})` : fallback;
}

/**
 * The same failure, written for a panel rather than a form.
 *
 * A dashboard that renders one fixed sentence ("Couldn't load the coordinator
 * dashboard.") for 401, 403, 500 and a request that never left the browser is
 * unfixable from a screenshot — every cause looks identical, and the first
 * question anyone asks back is "what did it actually say?". This keeps the
 * headline stable and puts the status and the server's own words beneath it.
 *
 * Returns null when there is nothing to add.
 */
export function apiErrorDetail(err: unknown): string | null {
  if (!err) return null;
  const e = err as ApiErrorShape;

  if (!e?.response) return 'The request never reached the server.';

  const { status, data } = e.response;
  const said = typeof data?.message === 'string' && data.message ? data.message : null;
  if (status && said) return `HTTP ${status} · ${said}`;
  if (status) return `HTTP ${status}`;
  return said;
}

/**
 * Did the server itself fault? Only a 5xx is worth digging into — a 401, a 403
 * or a request that never left the browser is already fully explained by its
 * status, and offering a self-test there would just be noise.
 */
export function serverFaulted(err: unknown): boolean {
  const status = (err as ApiErrorShape)?.response?.status ?? 0;
  return status >= 500;
}
