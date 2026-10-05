# TASK

Pull request #{{PR_NUMBER}} for issue {{TASK_ID}} ({{ISSUE_TITLE}}) cannot be merged into `main`. Either it conflicts with `main`, or CI fails on it.

You are on branch {{BRANCH}}. Make it mergeable:

1. Run `git merge main --no-edit`
2. If there are merge conflicts, resolve them intelligently by reading both sides and choosing the correct resolution
3. Run the same checks CI runs and fix anything that fails:
   - `npm run lint`
   - `npm run format:check` (run `npm run format` to fix formatting)
   - `npm run typecheck`
   - `npm run test`
   - `npm run build`

Do not change the scope of the pull request. Only fix what is needed to integrate it with `main` and make CI pass.

# COMMIT

Commit your changes using the [Conventional Commits](https://www.conventionalcommits.org/) format, e.g. `fix: resolve conflicts with main` or `fix(parser): repair failing tiff offset test`. Do NOT use any other prefix such as `RALPH:`.

Do not push and do not merge the pull request. Both are handled outside the sandbox.

Once everything passes, output <promise>COMPLETE</promise>.
