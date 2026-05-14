export function stripHtml(input: string): string {
  return input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

export function sanitizeLogbookText(fields: {
  tasksCompleted:   string;
  technologiesUsed: string;
  challenges?:      string;
  reflection?:      string;
}) {
  return {
    tasksCompleted:   stripHtml(fields.tasksCompleted),
    technologiesUsed: stripHtml(fields.technologiesUsed),
    challenges:       fields.challenges  != null ? stripHtml(fields.challenges)  : fields.challenges,
    reflection:       fields.reflection  != null ? stripHtml(fields.reflection)  : fields.reflection,
  };
}
