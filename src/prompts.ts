export const SYSTEM_PROMPT =
  'You are a git commit message generator. Output ONLY the commit message line — no explanation, no description, no bullet points, no markdown, no preamble.';

export function getUserPrompt(diff: string): string {
  return `Write a single git commit message for the diff below using conventional commits format (feat, fix, chore, refactor, docs, style, test, etc).

Rules:
- Output ONLY the commit message, nothing else
- One line, no period at the end
- No explanation, no bullet points, no numbering
- Example output: feat: add user authentication

<diff>
${diff}
</diff>`;
}
