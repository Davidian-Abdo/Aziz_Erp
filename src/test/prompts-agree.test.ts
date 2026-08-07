// The two session prompts, read at build time by Vite rather than through
// `fs` — the same pattern as `loss-nature-matches-sql.test.ts`, and for the
// same reason: this test belongs to the app project, and application code has
// no filesystem.
import amer from '../../Amer_Prompt.md?raw'
import hmdnah from '../../Hmdnah_Prompt.md?raw'

/*
 * `Amer_Prompt.md` and `Hmdnah_Prompt.md` each carry a copy of the project
 * rules that hold in every phase. The copy is deliberate: the lesson this box
 * has already paid for is that a constraint living only in a document nobody
 * opens at t=0 is not a constraint, it is a preference. Each agent must find
 * the rules in the file they actually have open.
 *
 * But two copies of a rule are two rules the moment one is edited. And the way
 * they would drift is not random: someone tightens a rule in the prompt they
 * are reading, ships it, and the other agent keeps working to the loose version
 * on the other machine — with no signal anywhere, because both files still look
 * carefully written.
 *
 * So the copies are pinned. If a rule genuinely changes, it changes in both
 * files in the same commit, and this test says so when it does not.
 */

const HEADING = '## The rules that hold in every phase'

/** The rules block: from its heading up to the next top-level `## ` heading. */
function rulesOf(prompt: string): string {
  const start = prompt.indexOf(HEADING)
  if (start === -1) return ''

  const rest = prompt.slice(start + HEADING.length)
  const end = rest.indexOf('\n## ')
  return (end === -1 ? rest : rest.slice(0, end)).trim()
}

describe('the two agents are working to the same rules', () => {
  /*
   * Without this, a renamed heading turns the comparison into `'' === ''` and
   * the guard passes forever over two files that share nothing at all.
   */
  it('finds a rules block in both prompts', () => {
    expect(rulesOf(hmdnah).length).toBeGreaterThan(500)
    expect(rulesOf(amer).length).toBeGreaterThan(500)
  })

  it('carries the same rules block, verbatim, in both prompts', () => {
    expect(rulesOf(amer)).toBe(rulesOf(hmdnah))
  })

  /*
   * The rules are worth nothing if the file that carries them has quietly
   * acquired a "current phase" section. Both prompts are stateless by design —
   * `current_state.md`'s newest entry is the single place the work's position is
   * recorded, because an append-only log degrades visibly and an overwritten
   * summary does not.
   */
  it.each([
    ['Hmdnah_Prompt.md', hmdnah],
    ['Amer_Prompt.md', amer],
  ])('%s still points at current_state.md rather than restating it', (_name, prompt) => {
    expect(prompt).toContain('current_state.md')
    expect(prompt).toMatch(/STATELESS/)
    // The exact shape the 2026-08-02 regression took: a heading declaring the
    // phase, in the file that is read before anything else.
    expect(prompt).not.toMatch(/^#{1,3}\s*(State|Current phase)\b/im)
  })
})
