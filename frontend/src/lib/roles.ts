/**
 * How a role is named to the person holding it.
 *
 * One definition: the account menu, the profile header and anywhere else that
 * shows "who am I" read from here, so a student can never be labelled as the
 * coordinator because a component hardcoded a string.
 */
export const ROLE_LABELS: Record<string, string> = {
  student:             'Student',
  academic_supervisor: 'Academic Supervisor',
  company_supervisor:  'Company Supervisor',
  coordinator:         'Coordinator',
  admin:               'Administrator',
};
