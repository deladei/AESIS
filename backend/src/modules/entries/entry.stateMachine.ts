import { AppError } from '../../middleware/errorHandler';

// Weekly entry lifecycle:
//   draft -> submitted -> acknowledged   (acknowledged is TERMINAL, LOCKS the week)
//   submitted -> returned -> draft       (reopen increments version)
//   submitted -> rejected                (TERMINAL — week declined, not a revision)
export type EntryStatus = 'draft' | 'submitted' | 'returned' | 'acknowledged' | 'rejected';

export type TransitionAction = 'submit' | 'acknowledge' | 'return' | 'reopen' | 'reject';

export type EntryRole =
  | 'student'
  | 'academic_supervisor'
  | 'company_supervisor'
  | 'coordinator'
  | 'admin';

interface TransitionDef {
  from: EntryStatus[];
  to: EntryStatus;
  /** Roles permitted to perform this transition (admin is always allowed as break-glass). */
  roles: EntryRole[];
  /** Whether performing this transition increments the entry version. */
  bumpsVersion: boolean;
}

// The single source of truth for the state machine. Both the from-state guard
// (409 on invalid transition) and the role guard (403) derive from this table.
export const TRANSITIONS: Record<TransitionAction, TransitionDef> = {
  submit: { from: ['draft'], to: 'submitted', roles: ['student'], bumpsVersion: false },
  acknowledge: {
    from: ['submitted'],
    to: 'acknowledged',
    roles: ['academic_supervisor'],
    bumpsVersion: false,
  },
  return: {
    from: ['submitted'],
    to: 'returned',
    roles: ['academic_supervisor'],
    bumpsVersion: false,
  },
  // Student takes a returned entry back to draft to correct it (new version).
  reopen: { from: ['returned'], to: 'draft', roles: ['student'], bumpsVersion: true },
  // Supervisor declines a week outright (distinct from `return`, which invites a revision).
  reject: {
    from: ['submitted'],
    to: 'rejected',
    roles: ['academic_supervisor'],
    bumpsVersion: false,
  },
};

// Terminal states lock the week — no further transitions or content edits.
export const TERMINAL_STATUSES: readonly EntryStatus[] = ['acknowledged', 'rejected'];

export function isTerminal(status: EntryStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Whether the entry contents (activities/reflection) may still be edited. */
export function isEditable(status: EntryStatus): boolean {
  return status === 'draft' || status === 'returned';
}

/**
 * Validate a transition. Throws 409 if the action is not legal from the current
 * status, 403 if the role may not perform it. Returns the resulting status.
 * Pure and side-effect-free so it can be unit-tested in isolation.
 */
export function resolveTransition(
  current: EntryStatus,
  action: TransitionAction,
  role: EntryRole,
): { to: EntryStatus; bumpsVersion: boolean } {
  const def = TRANSITIONS[action];
  if (!def) throw new AppError(400, `Unknown transition: ${action}`);

  // Role guard first so an unauthorized actor can't probe state via 409s.
  if (role !== 'admin' && !def.roles.includes(role)) {
    throw new AppError(403, `Role '${role}' may not ${action} a logbook entry`);
  }

  if (!def.from.includes(current)) {
    throw new AppError(
      409,
      `Cannot ${action} an entry that is '${current}' (allowed from: ${def.from.join(', ')})`,
    );
  }

  return { to: def.to, bumpsVersion: def.bumpsVersion };
}
