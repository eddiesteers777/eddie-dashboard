import type { Register } from 'claude-code'
import { noteFor, shouldAttach } from './coach'

const KEY = 'enabled'

export const register: Register = on => {
  let enabled = true

  on('session.start', async ($, e, next) => {
    enabled = (await $.store.get(KEY)) !== false
    await $.command.register({
      name: 'prompt-coach',
      description: 'Prompt coach: on, off, or status (shows the note added to your prompts)',
      argumentHint: 'on | off | status',
    })
    return next(e)
  })

  on('command.run', { command: 'prompt-coach' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      enabled = arg === 'on'
      await $.store.set(KEY, enabled)
      return { text: `Prompt coach is ${arg}.` }
    }
    return {
      text: `Prompt coach is ${enabled ? 'on' : 'off'}. It adds this note beside each prompt (your words are not changed):\n\n${noteFor('example')}\n\n/prompt-coach off turns it off.`,
    }
  })

  // Attach the note as context. The prompt's text is passed on untouched.
  on('prompt.submit', ($, e, next) => {
    if (!enabled || !shouldAttach(e)) return next(e)
    return next({ ...e, context: [...(e.context ?? []), noteFor(e.text)] })
  })
}
