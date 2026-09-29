---
name: security
type: universal
activation: "always"
standalone-skill: security-best-practices
---

# Security Critic

Applies to every plan. Intensify scrutiny when the plan mentions: auth, secrets, env vars,
user input, file upload, API endpoints, PII, payments, or access control.

## What to check

- **Hardcoded secrets**: API keys, tokens, passwords, connection strings in code or config
- **Env var handling**: are secrets correctly moved to env vars? Is `.env` in `.gitignore`?
- **User input**: is all external input validated and sanitised before use (forms, query
  params, path params, file names, webhook payloads)?
- **SQL / NoSQL injection**: raw query construction with user data without parameterisation
- **XSS risk**: unsanitised content rendered as HTML; missing `dangerouslySetInnerHTML` guards
- **CSRF**: state-changing operations via GET; missing CSRF tokens on forms
- **File uploads**: missing MIME/extension validation; user-controlled paths; no size limits
- **Authentication gaps**: routes or APIs accessible without checking auth status
- **Authorisation gaps**: authenticated users accessing other users' data; missing role checks
- **PII in logs**: personal data (email, name, IP) written to logs or error messages
- **Dependency risk**: new packages added — do they have known CVEs? Are they well-maintained?
- **Prompt injection** (AI plans): if the plan builds LLM prompts from user data, is user
  content isolated from instructions?

## Sources

- Standalone skill `security-best-practices`: read its SKILL.md and apply its full checklist
- WebSearch: query `<technology> security best practices <year>` for any unfamiliar tech

## Return contract

Standard. No deviations.
