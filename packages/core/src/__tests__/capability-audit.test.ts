import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUTOMATION_LAST_RUN_STATUSES,
  AUTOMATION_RECORD_TRIGGERS,
  CAPABILITY_AUDIT_PERMISSION_MODES,
  LOCAL_SKILL_SOURCE_SLUG,
  SOURCE_AUTH_TYPES,
  SOURCE_RECORD_STATUSES,
  SOURCE_RECORD_TYPES,
  deriveCapabilityAuditReport,
  type CapabilityAuditSkillInput,
} from '../capability-audit.js';
import type { PlanReminder } from '../plan-reminders.js';

describe('capability audit contract', () => {
  it('locks the visible source and automation enums', () => {
    assert.deepEqual(SOURCE_RECORD_TYPES, ['mcp', 'api', 'local']);
    assert.deepEqual(SOURCE_AUTH_TYPES, ['oauth', 'bearer', 'none']);
    assert.deepEqual(SOURCE_RECORD_STATUSES, ['ready', 'needs_auth', 'error', 'disabled']);
    assert.deepEqual(CAPABILITY_AUDIT_PERMISSION_MODES, ['explore', 'ask', 'execute']);
    assert.deepEqual(AUTOMATION_RECORD_TRIGGERS, ['manual', 'schedule', 'event']);
    assert.deepEqual(AUTOMATION_LAST_RUN_STATUSES, ['ok', 'error', 'skipped']);
  });

  it('synthesizes a local skills source and keeps skill permission mode read-first', () => {
    const skills: CapabilityAuditSkillInput[] = [
      {
        id: 'research',
        name: 'Research',
        description: 'Drafts research notes.',
        declaredTools: ['Read', 'Bash', 'Write'],
      },
      {
        id: 'notes',
        name: 'Notes',
        description: '',
      },
    ];

    const report = deriveCapabilityAuditReport({ now: 1_700_000_000_000, skills });

    assert.equal(report.checkedAt, 1_700_000_000_000);
    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].slug, LOCAL_SKILL_SOURCE_SLUG);
    assert.equal(report.sources[0].type, 'local');
    assert.equal(report.sources[0].status, 'ready');
    assert.deepEqual(report.sources[0].scopeSummary, ['2 个本地 Skill', '3 类声明工具']);
    assert.equal(report.summary.sourceCount, 1);
    assert.equal(report.summary.readySourceCount, 1);
    assert.equal(report.summary.skillCount, 2);
    assert.equal(report.summary.enabledSkillCount, 2);
    assert.equal(report.summary.skillsWithDeclaredTools, 1);
    assert.equal(report.summary.declaredToolKindCount, 3);
    assert.equal(report.skills[0].sourceSlug, LOCAL_SKILL_SOURCE_SLUG);
    assert.equal(report.skills[0].permissionMode, 'ask');
    assert.notEqual(report.skills[0].permissionMode, 'execute');
    assert.equal(report.skills[1].permissionMode, 'explore');
  });

  it('maps plan reminders into automation records without losing run state', () => {
    const reminders: PlanReminder[] = [
      {
        id: 'auto-1',
        title: '每日复盘',
        note: '',
        schedule: { kind: 'recurring', startAt: 1_700_000_000_000, recurrence: 'daily' },
        delivery: { channel: 'local' },
        status: 'scheduled',
        enabled: true,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        nextRunAt: 1_700_003_600_000,
        lastRun: { id: 'run-1', at: 1_700_001_000_000, status: 'triggered', message: 'ok' },
        runs: [],
        runCount: 1,
      },
      {
        id: 'auto-2',
        title: '周会提醒',
        note: '',
        schedule: { kind: 'once', runAt: 1_700_000_100_000 },
        delivery: { channel: 'local' },
        status: 'paused',
        enabled: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        runs: [],
        runCount: 0,
        lastRun: { id: 'run-2', at: 1_700_001_500_000, status: 'blocked', message: 'skip' },
      },
      {
        id: 'auto-3',
        title: '月末归档',
        note: '',
        schedule: { kind: 'once', runAt: 1_700_000_200_000 },
        delivery: { channel: 'local' },
        status: 'completed',
        enabled: false,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        runs: [],
        runCount: 0,
        lastRun: { id: 'run-3', at: 1_700_001_900_000, status: 'failed', message: 'fail' },
      },
    ];

    const report = deriveCapabilityAuditReport({ planReminders: reminders });

    assert.equal(report.automations.length, 3);
    assert.equal(report.automations[0].trigger, 'schedule');
    assert.equal(report.automations[0].permissionMode, 'execute');
    assert.equal(report.automations[0].lastRunStatus, 'ok');
    assert.equal(report.automations[1].permissionMode, 'ask');
    assert.equal(report.automations[1].lastRunStatus, 'skipped');
    assert.equal(report.automations[2].permissionMode, 'explore');
    assert.equal(report.automations[2].lastRunStatus, 'error');
    assert.equal(report.summary.automationCount, 3);
    assert.equal(report.summary.enabledAutomationCount, 1);
    assert.equal(report.summary.executableAutomationCount, 1);
    assert.equal(report.summary.failedAutomationCount, 1);
    assert.equal(report.summary.skippedAutomationCount, 1);
  });

  it('keeps explicit remote sources visible without forcing a local duplicate', () => {
    const report = deriveCapabilityAuditReport({
      sources: [
        {
          slug: 'mcp-github',
          name: 'GitHub MCP',
          type: 'mcp',
          enabled: true,
          authType: 'oauth',
          scopeSummary: ['issues', 'pull requests'],
          status: 'ready',
          lastTestAt: 1_700_000_000_000,
        },
      ],
      skills: [
        {
          id: 'github-review',
          name: 'GitHub Review',
          description: 'Reviews PRs.',
          declaredTools: ['Read'],
          sourceSlug: 'mcp-github',
        },
      ],
    });

    assert.equal(report.sources.length, 1);
    assert.equal(report.sources[0].slug, 'mcp-github');
    assert.equal(report.skills[0].sourceSlug, 'mcp-github');
  });
});
