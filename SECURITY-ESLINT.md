# 🔒 ESLint Security Configuration

This document describes the ESLint security plugin configuration added to the Unthread Discord Bot project.

## Overview

The project now includes `eslint-plugin-security` to automatically detect common security vulnerabilities during the linting process. This follows the principle of "shift-left security" by catching security issues early in the development cycle.

## Security Rules Enabled

The following security rules are actively monitoring the codebase:

### Error Level Rules (Will fail CI/build)
- `security/detect-buffer-noassert` - Detects usage of `buffer.noAssert` which can lead to buffer overflows
- `security/detect-child-process` - Detects usage of child_process module which can lead to command injection
- `security/detect-disable-mustache-escape` - Detects disabled mustache escape which can lead to XSS
- `security/detect-eval-with-expression` - Detects usage of `eval()` with user input
- `security/detect-new-buffer` - Detects usage of deprecated `new Buffer()` constructor
- `security/detect-no-csrf-before-method-override` - Detects missing CSRF protection
- `security/detect-non-literal-require` - Detects dynamic `require()` calls that could load malicious modules
- `security/detect-pseudoRandomBytes` - Detects usage of weak pseudoRandomBytes for cryptographic purposes
- `security/detect-unsafe-regex` - Detects Regular Expression Denial of Service (ReDoS) vulnerabilities

### Warning Level Rules (Will show warnings but not fail build)
- `security/detect-non-literal-fs-filename` - Warns about dynamic file paths (set to warning for flexibility)
- `security/detect-non-literal-regexp` - Warns about dynamic regex patterns (set to warning for Discord message processing)
- `security/detect-object-injection` - Warns about potential object injection vulnerabilities
- `security/detect-possible-timing-attacks` - Warns about potential timing attack vulnerabilities

## Configuration Philosophy

The configuration follows the **KISS (Keep It Simple, Stupid)** principle:

1. **Simple Setup**: Uses the well-established `eslint-plugin-security` with minimal configuration
2. **Balanced Approach**: Error-level rules for critical security issues, warnings for potential issues that need context
3. **Discord Bot Optimized**: Some rules are set to warning level to accommodate Discord message processing patterns
4. **Full Compatibility**: Maintains existing ESLint rules while adding security layer

## Usage

### Running Security Linting
```bash
# Lint all TypeScript files with security checks
npm run lint

# Auto-fix what can be automatically fixed
npm run lint:fix
```

### Example Security Issue Detection

The security plugin will catch issues like:

```typescript
// ❌ Will trigger security/detect-eval-with-expression
const userInput = getUserInput();
eval(userInput);

// ❌ Will trigger security/detect-unsafe-regex  
const unsafeRegex = /(a+)+/;
userInput.match(unsafeRegex);

// ❌ Will trigger security/detect-new-buffer
const buffer = new Buffer(size);

// ❌ Will trigger security/detect-child-process
const { exec } = require('child_process');
exec('ls ' + userInput);
```

## Migration Notes

- Migrated from `.eslintrc.json` to `eslint.config.js` for ESLint 9.x compatibility
- All existing ESLint rules preserved
- Security rules added as an additional layer
- TypeScript and JavaScript files both covered

## Maintenance

- Security rules are kept up-to-date with the `eslint-plugin-security` package
- Review security warnings during code reviews
- Consider upgrading to error level if warnings become frequent in specific areas
- Regularly update the security plugin for new vulnerability patterns

## Benefits

✅ **Early Detection**: Catch security vulnerabilities during development  
✅ **Automated Scanning**: No manual security review needed for common patterns  
✅ **Education**: Developers learn secure coding practices through immediate feedback  
✅ **CI/CD Integration**: Security checks run automatically in the build pipeline  
✅ **Zero Configuration**: Works out of the box with sensible defaults