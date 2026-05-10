/**
 * Surgical SQLi/Injection Regex
 * Detects: --, ;, DROP, DELETE, UNION, SELECT, INSERT, <script>, and common script/HTML injection patterns.
 */
export const INJECTION_REGEX = /(--|;|DROP|DELETE|UNION|SELECT|INSERT|<script>|<\/script>|javascript:|onclick=|onerror=)/i;

/**
 * Validates if the input contains malicious injection patterns.
 * @param value The string to check
 * @returns true if it's safe, false if it's malicious
 */
export const securityValidator = (value: string): boolean => {
  if (!value) return true;
  return !INJECTION_REGEX.test(value);
};
