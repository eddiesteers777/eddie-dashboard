// Pure logic for prompt-coach: reads a prompt and builds the short note the
// model sees beside it. Never changes the prompt itself.

export type Mode = 'SCOUT' | 'MOCKUP' | 'BUILD' | 'SHIP' | 'STATUS'

const MODES: readonly Mode[] = ['SCOUT', 'MOCKUP', 'BUILD', 'SHIP', 'STATUS']

const WHAT: Record<Mode, string> = {
  SCOUT: 'research only; check licences; build and change nothing.',
  MOCKUP: '2-3 options, phone + desktop screenshots in /mnt/project-files/<topic>/; no production code.',
  BUILD: 'build the approved option on a branch, run tests, show screenshots incl. the empty state, stop at the gate.',
  SHIP: 'merge checklist: fetch origin/main into the branch, npm run manifest, tests, read the QUEUE.md rules ledger, merge, confirm the deploy, name one new on-screen text.',
  STATUS: 'report only; start, open or spawn nothing.',
}

/** The mode Eddie named: the first word of the prompt, or "push it" = SHIP. */
export function namedMode(text: string): Mode | undefined {
  const t = text.trim()
  const first = t.split(/[\s:.,!-]+/, 1)[0]?.toUpperCase() ?? ''
  if ((MODES as readonly string[]).includes(first)) return first as Mode
  if (/^push( it)?\b/i.test(t)) return 'SHIP'
  return undefined
}

/** The note added beside the prompt. Kept short: it rides on every prompt. */
export function noteFor(text: string): string {
  const mode = namedMode(text)
  const modeLine = mode
    ? `- Mode: ${mode} (named) - ${WHAT[mode]}`
    : '- Mode: not named. Infer SCOUT / MOCKUP / BUILD / SHIP / STATUS and say which in one line.'
  return [
    "Prompt check (prompt-coach mod; Eddie's words above are unchanged):",
    modeLine,
    '- First, say in one line what "done" looks like for this ask.',
    '- Rules: no merge or deploy without "push it"; mock up before significant UI; a typed yes repeating the exact action before any device or live-system action; a firestore.rules change means "Rules paste needed".',
    '- End build reports with "Waiting to push: <what>" or "Nothing to push."',
  ].join('\n')
}

/** Sources that are not Eddie typing a request: leave them alone. */
const SKIP = new Set(['task-notification', 'peer', 'peer-send-message', 'observer', 'observer-activity', 'scheduled-trigger', 'plugin'])

export function shouldAttach(e: { text: string; origin?: { kind: string }; command?: unknown; isMeta?: true }): boolean {
  if (e.command || e.isMeta) return false
  if (e.origin && SKIP.has(e.origin.kind)) return false
  return e.text.trim().length > 0
}
