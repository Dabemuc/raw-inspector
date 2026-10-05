# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view <ID>`. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits and run tests.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run the same checks CI runs and make sure they all pass:

- `npm run lint`
- `npm run format:check` (run `npm run format` to fix formatting)
- `npm run typecheck`
- `npm run test`
- `npm run build`

# COMMIT

Make git commits using the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<optional scope>): <short imperative summary>

<body>

Refs #{{TASK_ID}}
```

- `<type>` is one of `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- The summary is lowercase, imperative, has no trailing period, and is at most 72 characters.
- The body briefly covers key decisions and any blockers or notes for the next iteration.
- Do NOT use any other prefix such as `RALPH:`.

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the issue with what was done.

Do not close the issue - this will be done later.

Once complete, output a pull request title for the whole change in Conventional Commits format (it becomes the squash-merge commit on `main`), then the completion signal:

<pr-title>feat(parser): detect CR2, NEF, ARW and DNG formats</pr-title>
<promise>COMPLETE</promise>

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
