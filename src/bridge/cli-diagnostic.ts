import { redactCliText } from './cli-activity.js';
/** Only error-shaped lines are returned; never forward entire stderr/configuration dumps. */
export function cliDiagnostic(stderr: string) {
  const lines = redactCliText(stderr).split(/\r?\n/);
  return lines
    .filter((line) =>
      /error|failed|not logged in|unauthorized|unavailable|not found|unknown (?:flag|option|argument)|must provide|permission denied|invalid (?:model|config|api)/i.test(
        line,
      ),
    )
    .map((line) => line.slice(0, 800))
    .join('\n')
    .slice(0, 2400);
}
export function cliErrorCode(detail: string) {
  if (
    /authenticat|not logged in|unauthorized|invalid api.?key|login required|sign in/i.test(detail)
  )
    return 'CLI_AUTH_REQUIRED';
  if (
    /model (?:unavailable|not found)|provider\.no-route|no (?:configured )?model|unknown model/i.test(
      detail,
    )
  )
    return 'CLI_MODEL_UNAVAILABLE';
  if (
    /unknown (?:flag|option|argument)|must provide a message|invalid (?:flag|option|argument)/i.test(
      detail,
    )
  )
    return 'CLI_USAGE_ERROR';
  return 'CLI_REPORTED_ERROR';
}
