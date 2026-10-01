import type { AnalyzeAdapter, DiffGroup, GroupedResultCore } from '../../../types/analyze'
import type { GroupRule, RuleKey, RuleText } from './rules'
import picomatch from 'picomatch'
import { normalizeGroupedResult } from '../../../types/analyze'
import { codeRule, defaultRules, otherRule } from './rules'

export const RULE_BASED_SCHEMA_VERSION = 1

const matchers = defaultRules.map(rule => ({
  rule,
  isMatch: rule.patterns
    ? picomatch(rule.patterns)
    : () => false,
}))

function matchRule(path: string): GroupRule {
  for (const { rule, isMatch } of matchers) {
    if (isMatch(path))
      return rule
  }
  return codeRule
}

export function createRuleBasedAdapter(text: (key: RuleKey) => RuleText): AnalyzeAdapter {
  return {
    id: 'rule-based',
    available: true,
    async analyze(diff) {
      const groupsByRule = new Map<GroupRule, DiffGroup>()

      for (const file of diff.files) {
        const rule = file.isBinary ? otherRule : matchRule(file.path)
        let group = groupsByRule.get(rule)
        if (!group) {
          group = {
            key: rule.key,
            ...text(rule.key),
            category: rule.category,
            filePaths: [],
          }
          groupsByRule.set(rule, group)
        }
        group.filePaths.push(file.path)
      }

      const core: GroupedResultCore = {
        groups: defaultRules.flatMap(rule => groupsByRule.get(rule) ?? []),
        schemaVersion: RULE_BASED_SCHEMA_VERSION,
      }
      return normalizeGroupedResult('rule-based', core)
    },
  }
}
