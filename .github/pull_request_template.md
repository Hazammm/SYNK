## Summary

<!-- Up to five bullet points: what changed and why. -->

-

Closes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor or clean-up
- [ ] Docs or tests only

## How it was tested

- [ ] `npx eslint src tests scripts` and `npx tsc --noEmit -p .` pass
- [ ] `npm test` and `npm run test:coverage` pass (coverage stays at 80% or more)
- [ ] `npm run test:e2e` passes, or browser tests were added or updated
- [ ] New routes or permission rules have an integration test, including a denied case

## Checklist

- [ ] Permissions are checked on the server, and hidden items return "not found"
- [ ] Input is validated with Zod at the route or socket handler
- [ ] Database changes include a migration
- [ ] Accessible: keyboard works, icon buttons are labelled, text is 12px or larger, contrast meets the targets
- [ ] Screenshots attached for visual changes (desktop and phone width, light and dark)
- [ ] No secrets, `.env` values or personal data in the diff
