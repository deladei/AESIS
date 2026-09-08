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
  // The department renamed these two. Labels only: the `coordinator` and
  // `admin` enum values, their routes and their permissions are untouched, so
  // nobody's access changed — only what the screen calls them.
  //
  // NOTE: `admin` and `academic_supervisor` now print the same words. That is
  // what was asked for, but they remain two distinct roles with different
  // dashboards and different powers, so anywhere the two can appear side by
  // side needs a disambiguator before it will read correctly.
  coordinator:         'Administrator',
  admin:               'Academic Supervisor',
};
