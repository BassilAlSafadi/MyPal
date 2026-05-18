/**
 * 'Surgical' SQLi/Injection regex
 * Checks for common malicious patterns:
 * - SQL Comments/Operators: --, ;, /*
 * - SQL Commands: DROP, DELETE, UNION, SELECT, INSERT, UPDATE, TRUNCATE
 * - XSS/Scripting: <script>, onload=, alert(, javascript:
 */
export const INJECTION_REGEX = /(--|;|DROP|DELETE|UNION|SELECT|INSERT|UPDATE|TRUNCATE|<script>|onload=|alert\(|javascript:)/i;

export interface ValidationResult {
  isValid: boolean;
  pattern?: string;
}

/**
 * securityValidator
 * Validates input against common injection patterns.
 */
export const securityValidator = (value: string): ValidationResult => {
  if (!value) return { isValid: true };
  
  const match = value.match(INJECTION_REGEX);
  if (match) {
    return {
      isValid: false,
      pattern: match[0]
    };
  }
  
  return { isValid: true };
};
