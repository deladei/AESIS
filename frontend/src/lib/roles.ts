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
  // `admin` is "System Supervisor" rather than plain "Academic Supervisor":
  // that label already belongs to the faculty role above, and two different
  // roles printing the same words is worse than either name is good. It read
  // badly wherever both can appear — the register page offers "Academic
  // Supervisor" as a sign-up option, which would have meant one thing to the
  // person choosing it and another to an admin reading their own title.
  coordinator:         'Administrator',
  admin:               'System Supervisor',
};
