#!/usr/bin/env node
/* eslint-disable antfu/no-import-dist -- the eval CLI runs against the built core package */
/**
 * Offline grouping evaluation over the golden corpus in `@pulls.review/core/eval`.
 *
 * Usage (after `pnpm -F @pulls.review/core run build`):
 *   node scripts/eval.mjs [--adapter llm|rule-based] [--provider anthropic] [--model <id>]
 *
 * The llm adapter reads provider keys from the environment
 * (AI_GATEWAY_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY, plus
 * PULLS_REVIEW_PROVIDER / PULLS_REVIEW_MODEL). Without a key it falls back
 * to the rule-based adapter so the harness itself can be smoke-tested.
 * Compare prompt/model changes by running before/after and diffing the
 * printed averages; every production prompt change should keep F1 and
 * critical recall from regressing.
 */
import process from 'node:process'
import { createRuleBasedAdapter, resolveModel } from '../packages/core/dist/analyze.js'
import { llmSettingsFromEnv } from '../packages/core/dist/env.js'
import { EVAL_CORPUS, runEval } from '../packages/core/dist/eval.js'
import { PROMPT_VERSION, runLlmAnalysis } from '../packages/core/dist/llm.js'

const args = process.argv.slice(2)
function flag(name) {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}

const settings = llmSettingsFromEnv(process.env, { provider: flag('provider'), model: flag('model') })
const resolved = resolveModel(settings)
const adapterName = flag('adapter') ?? (resolved ? 'llm' : 'rule-based')

const analyze = adapterName === 'llm'
  ? async (diff) => {
    if (!resolved)
      throw new Error('No model key configured for --adapter llm (set ANTHROPIC_API_KEY, OPENAI_API_KEY, or AI_GATEWAY_API_KEY).')
    return (await runLlmAnalysis(diff, resolved, 'en')).result
  }
  : createRuleBasedAdapter(key => ({ label: key, summary: key })).analyze

const label = adapterName === 'llm' ? `${resolved.model.provider}/${resolved.model.id}` : 'rule-based'
console.log(`adapter: ${label}  prompt: v${PROMPT_VERSION}  cases: ${EVAL_CORPUS.length}`)

const report = await runEval(EVAL_CORPUS, analyze)
for (const entry of report.cases) {
  const s = entry.score
  console.log(`${entry.name.padEnd(28)} F1 ${s.pairwiseF1.toFixed(3)}  P ${s.pairwisePrecision.toFixed(3)}  R ${s.pairwiseRecall.toFixed(3)}  critical ${s.criticalFileRecall.toFixed(3)}  ${entry.durationMs}ms`)
}
const a = report.average
console.log(`${'AVERAGE'.padEnd(28)} F1 ${a.pairwiseF1.toFixed(3)}  P ${a.pairwisePrecision.toFixed(3)}  R ${a.pairwiseRecall.toFixed(3)}  critical ${a.criticalFileRecall.toFixed(3)}`)
