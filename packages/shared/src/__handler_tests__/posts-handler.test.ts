// Contract tests for the compiled posts-handler, exercised the SAME way the sandbox
// deploys it (the sandbox reuses ../../lambdas/dist/posts-handler verbatim).
//
// These tests prove the Option B isolation guarantee for sandbox scheduling QA:
//   • POST /posts/schedule PERSISTS the post to DynamoDB AND creates an EventBridge
//     schedule whose Target.Arn is the configured PUBLISHER_FUNCTION_ARN and whose
//     Target.RoleArn is the configured SCHEDULER_ROLE_ARN. In the sandbox those env
//     vars point at the NO-OP publisher + sandbox scheduler role, so a fired schedule
//     can never reach Facebook/the prod publisher.
//   • GET /posts returns the saved posts for the authenticated user only.
//   • PUT /posts/{id} edits a scheduled post; DELETE /posts/{id} removes it (and its
//     schedule).
//   • POST /posts/{id}/publish returns 501 — there is NO immediate-publish code path,
//     so exposing it in the sandbox cannot publish anything.
//   • Identity always comes from the JWT sub; no social-publish SDK is required/used.
//
// AWS SDKs are stubbed via the same require-cache technique as subscription-handler.test.ts.
// The scheduler stub RECORDS the exact CreateSchedule/DeleteSchedule inputs so we can
// assert the target wiring.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const handlerPath = resolve(here, '../../../../lambdas/dist/posts-handler/index.js');

// Sandbox-style env: these mirror what the SandboxStack wires in.
const SANDBOX_PUBLISHER_ARN = 'arn:aws:lambda:us-east-1:971598352824:function:SocialLeadGen-Sandbox-NoopPublisher';
const SANDBOX_SCHEDULER_ROLE = 'arn:aws:iam::971598352824:role/SocialLeadGen-Sandbox-SchedulerRole';
const SANDBOX_SCHEDULE_GROUP = 'SocialLeadGen-Sandbox';

type Call = { name: string; input: any };
let dynamoCalls: Call[];
let schedulerCalls: Call[];
let tableItems: any[]; // simulated DynamoDB store (one user's partition)

function cmd(name: string) {
  return class {
    input: any;
    __name = name;
    constructor(input: any) {
      this.input = input;
    }
  };
}

function sdkStubs() {
  return {
    '@aws-sdk/client-dynamodb': { DynamoDBClient: class {} },
    '@aws-sdk/lib-dynamodb': {
      DynamoDBDocumentClient: {
        from: () => ({
          send: async (c: any) => {
            dynamoCalls.push({ name: c.__name, input: c.input });
            if (c.__name === 'PutCommand') {
              tableItems.push({ ...c.input.Item });
              return {};
            }
            if (c.__name === 'QueryCommand') {
              const pk = c.input.ExpressionAttributeValues[':pk'];
              const pid = c.input.ExpressionAttributeValues[':pid'];
              let items = tableItems.filter((i) => i.PK === pk && String(i.SK).startsWith('POST#'));
              if (pid !== undefined) items = items.filter((i) => i.postId === pid);
              return { Items: items };
            }
            if (c.__name === 'UpdateCommand') {
              const found = tableItems.find((i) => i.PK === c.input.Key.PK && i.SK === c.input.Key.SK);
              if (found) {
                const names = c.input.ExpressionAttributeNames || {};
                const values = c.input.ExpressionAttributeValues || {};
                // Apply "SET #k = :k" assignments.
                const expr = String(c.input.UpdateExpression || '');
                for (const m of expr.replace(/^SET\s+/i, '').split(',')) {
                  const mm = m.trim().match(/(#\w+)\s*=\s*(:\w+)/);
                  if (mm) {
                    const field = names[mm[1]] ?? mm[1].slice(1);
                    found[field] = values[mm[2]];
                  }
                }
              }
              return {};
            }
            if (c.__name === 'DeleteCommand') {
              tableItems = tableItems.filter((i) => !(i.PK === c.input.Key.PK && i.SK === c.input.Key.SK));
              return {};
            }
            return {};
          },
        }),
      },
      PutCommand: cmd('PutCommand'),
      QueryCommand: cmd('QueryCommand'),
      UpdateCommand: cmd('UpdateCommand'),
      DeleteCommand: cmd('DeleteCommand'),
    },
    '@aws-sdk/client-scheduler': {
      SchedulerClient: class {
        async send(c: any) {
          schedulerCalls.push({ name: c.__name, input: c.input });
          return {};
        }
      },
      CreateScheduleCommand: cmd('CreateScheduleCommand'),
      DeleteScheduleCommand: cmd('DeleteScheduleCommand'),
    },
  } as Record<string, any>;
}

// By default the handler is loaded with the sandbox schedule group configured (matching
// the SandboxStack wiring). Pass { group: null } to simulate the PRODUCTION config,
// where SCHEDULE_GROUP_NAME is unset and schedules must land in the default group.
function loadHandler(opts: { group?: string | null } = {}) {
  process.env.TABLE_NAME = 'SocialLeadGen-Sandbox';
  process.env.SCHEDULER_ROLE_ARN = SANDBOX_SCHEDULER_ROLE;
  process.env.PUBLISHER_FUNCTION_ARN = SANDBOX_PUBLISHER_ARN;
  const group = opts.group === undefined ? SANDBOX_SCHEDULE_GROUP : opts.group;
  if (group === null) {
    delete process.env.SCHEDULE_GROUP_NAME;
  } else {
    process.env.SCHEDULE_GROUP_NAME = group;
  }
  const source = readFileSync(handlerPath, 'utf8');
  const stubs = sdkStubs();
  const realRequire = createRequire(handlerPath);
  const m = new Module(handlerPath, undefined as any);
  m.filename = handlerPath;
  (m as any).paths = (Module as any)._nodeModulePaths(dirname(handlerPath));
  (m as any).require = ((id: string) => (id in stubs ? stubs[id] : realRequire(id))) as unknown as NodeRequire;
  (m as any)._compile(source, handlerPath);
  return (m.exports as any).handler as (e: any) => Promise<any>;
}

function event(method: string, path: string, body?: any, sub = 'user-123') {
  return {
    requestContext: { http: { method, path }, authorizer: { jwt: { claims: { sub } } } },
    headers: {},
    body: body === undefined ? null : JSON.stringify(body),
  };
}

function futureIso(daysAhead = 2) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();
}

function validSchedulePayload(overrides: Record<string, any> = {}) {
  return {
    contentId: 'content-1',
    content: 'Protect what matters — ask me about affordable coverage.',
    platforms: ['facebook'],
    scheduledAt: futureIso(2),
    ...overrides,
  };
}

beforeEach(() => {
  dynamoCalls = [];
  schedulerCalls = [];
  tableItems = [];
});

describe('posts-handler — authentication', () => {
  it('rejects requests without a JWT sub', async () => {
    const handler = loadHandler();
    const res = await handler({ requestContext: { http: { method: 'GET', path: '/posts' } }, body: null });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('UNAUTHORIZED');
    expect(dynamoCalls).toHaveLength(0);
    expect(schedulerCalls).toHaveLength(0);
  });
});

describe('posts-handler — POST /posts/schedule (persistence + isolated schedule)', () => {
  it('persists the post and creates a schedule targeting the configured (sandbox no-op) publisher + role', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/posts/schedule', validSchedulePayload()));
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('scheduled');
    expect(body.id).toBeTruthy();

    // Persisted to DynamoDB.
    const put = dynamoCalls.find((c) => c.name === 'PutCommand');
    expect(put).toBeTruthy();
    expect(put!.input.TableName).toBe('SocialLeadGen-Sandbox');
    expect(put!.input.Item.PK).toBe('USER#user-123');
    expect(put!.input.Item.status).toBe('scheduled');
    expect(tableItems).toHaveLength(1);

    // Exactly one schedule created, pointed at the configured target + role, and
    // confined to the sandbox schedule group.
    const creates = schedulerCalls.filter((c) => c.name === 'CreateScheduleCommand');
    expect(creates).toHaveLength(1);
    const target = creates[0].input.Target;
    expect(target.Arn).toBe(SANDBOX_PUBLISHER_ARN);
    expect(target.RoleArn).toBe(SANDBOX_SCHEDULER_ROLE);
    expect(creates[0].input.GroupName).toBe(SANDBOX_SCHEDULE_GROUP);
  });

  it('ISOLATION: the schedule target is the no-op publisher, NEVER the prod publisher', async () => {
    const handler = loadHandler();
    await handler(event('POST', '/posts/schedule', validSchedulePayload()));
    const create = schedulerCalls.find((c) => c.name === 'CreateScheduleCommand')!;
    const arn = String(create.input.Target.Arn);
    // Positive: it is the sandbox no-op publisher.
    expect(arn).toContain('Sandbox-NoopPublisher');
    // Negative guards: not the prod publisher, and the payload carries only id/user
    // (no content/credentials pushed into the scheduler input).
    expect(arn).not.toMatch(/PostPublisher(?!.*Sandbox)/);
    expect(arn).not.toContain('SocialLeadGen-PostPublisher');
    const input = JSON.parse(create.input.Target.Input);
    expect(input).toHaveProperty('postId');
    expect(input).toHaveProperty('userId', 'user-123');
    expect(input).not.toHaveProperty('content');
  });

  it('rejects a payload scheduled in the past (no persistence, no schedule)', async () => {
    const handler = loadHandler();
    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await handler(event('POST', '/posts/schedule', validSchedulePayload({ scheduledAt: past })));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
    expect(dynamoCalls.find((c) => c.name === 'PutCommand')).toBeUndefined();
    expect(schedulerCalls).toHaveLength(0);
  });

  it('rejects an unknown platform', async () => {
    const handler = loadHandler();
    const res = await handler(event('POST', '/posts/schedule', validSchedulePayload({ platforms: ['myspace'] })));
    expect(res.statusCode).toBe(400);
    expect(schedulerCalls).toHaveLength(0);
  });
});

describe('posts-handler — GET /posts', () => {
  it('returns the posts saved for the authenticated user', async () => {
    const handler = loadHandler();
    await handler(event('POST', '/posts/schedule', validSchedulePayload({ content: 'first' })));
    await handler(event('POST', '/posts/schedule', validSchedulePayload({ content: 'second' })));

    const res = await handler(event('GET', '/posts'));
    expect(res.statusCode).toBe(200);
    const posts = JSON.parse(res.body).posts;
    expect(posts).toHaveLength(2);
    expect(posts.map((p: any) => p.content).sort()).toEqual(['first', 'second']);
    expect(posts.every((p: any) => p.status === 'scheduled')).toBe(true);
  });

  it('does not return another user\'s posts', async () => {
    const handler = loadHandler();
    await handler(event('POST', '/posts/schedule', validSchedulePayload(), 'user-123'));
    const res = await handler(event('GET', '/posts', undefined, 'someone-else'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).posts).toHaveLength(0);
  });
});

describe('posts-handler — PUT /posts/{id}', () => {
  it('edits a scheduled post content', async () => {
    const handler = loadHandler();
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    const res = await handler(event('PUT', `/posts/${created.id}`, { content: 'updated copy' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).content).toBe('updated copy');
    expect(tableItems[0].content).toBe('updated copy');
  });

  it('returns 404 for an unknown id', async () => {
    const handler = loadHandler();
    const res = await handler(event('PUT', '/posts/does-not-exist', { content: 'x' }));
    expect(res.statusCode).toBe(404);
  });
});

describe('posts-handler — DELETE /posts/{id}', () => {
  it('deletes a scheduled post and removes its schedule', async () => {
    const handler = loadHandler();
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    const res = await handler(event('DELETE', `/posts/${created.id}`));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).deleted).toBe(true);
    expect(tableItems).toHaveLength(0);
    // Schedule deletion attempted for the same post, in the sandbox group.
    const del = schedulerCalls.find((c) => c.name === 'DeleteScheduleCommand');
    expect(del).toBeTruthy();
    expect(del!.input.Name).toBe(`post-${created.id}`);
    expect(del!.input.GroupName).toBe(SANDBOX_SCHEDULE_GROUP);
  });

  it('returns 404 when deleting an unknown id', async () => {
    const handler = loadHandler();
    const res = await handler(event('DELETE', '/posts/nope'));
    expect(res.statusCode).toBe(404);
  });
});

describe('posts-handler — POST /posts/{id}/publish (no immediate publish path)', () => {
  it('returns 501 NOT_IMPLEMENTED — exposing it in the sandbox cannot publish', async () => {
    const handler = loadHandler();
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    const res = await handler(event('POST', `/posts/${created.id}/publish`));
    expect(res.statusCode).toBe(501);
    expect(JSON.parse(res.body).error.code).toBe('NOT_IMPLEMENTED');
    // No scheduler create beyond the original schedule; no publish side effect.
    const creates = schedulerCalls.filter((c) => c.name === 'CreateScheduleCommand');
    expect(creates).toHaveLength(1);
  });
});

describe('posts-handler — EventBridge schedule-group isolation', () => {
  it('SANDBOX: create confines the schedule to the SocialLeadGen-Sandbox group', async () => {
    const handler = loadHandler(); // group configured by default
    await handler(event('POST', '/posts/schedule', validSchedulePayload()));
    const create = schedulerCalls.find((c) => c.name === 'CreateScheduleCommand')!;
    expect(create.input.GroupName).toBe(SANDBOX_SCHEDULE_GROUP);
  });

  it('SANDBOX: delete targets the schedule in the SocialLeadGen-Sandbox group', async () => {
    const handler = loadHandler();
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    await handler(event('DELETE', `/posts/${created.id}`));
    const del = schedulerCalls.find((c) => c.name === 'DeleteScheduleCommand')!;
    expect(del.input.Name).toBe(`post-${created.id}`);
    expect(del.input.GroupName).toBe(SANDBOX_SCHEDULE_GROUP);
  });

  it('PRODUCTION compat: with SCHEDULE_GROUP_NAME unset, NO GroupName is sent (default group)', async () => {
    const handler = loadHandler({ group: null }); // simulate prod env (no group var)
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    const create = schedulerCalls.find((c) => c.name === 'CreateScheduleCommand')!;
    // GroupName must be ABSENT (not undefined-as-key) so prod behavior is unchanged.
    expect('GroupName' in create.input).toBe(false);

    await handler(event('DELETE', `/posts/${created.id}`));
    const del = schedulerCalls.find((c) => c.name === 'DeleteScheduleCommand')!;
    expect('GroupName' in del.input).toBe(false);
  });

  it('ISOLATION: every scheduler call stays within the configured sandbox group', async () => {
    const handler = loadHandler();
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    await handler(event('DELETE', `/posts/${created.id}`));
    // No scheduler call may reference any other group (e.g. default).
    for (const c of schedulerCalls) {
      expect(c.input.GroupName).toBe(SANDBOX_SCHEDULE_GROUP);
    }
  });
});

describe('posts-handler — reschedule (date/time change) behavior', () => {
  // The current handler's PUT only accepts `content` and `platforms`; it does NOT
  // accept `scheduledAt`. So a user cannot change the date/time of an existing post
  // through the edit workflow, and the EventBridge schedule therefore cannot drift
  // from the saved post. These tests PIN that contract so a future change that adds
  // rescheduling must also update the schedule (and these tests).
  it('PUT does not change scheduledAt and makes NO scheduler calls', async () => {
    const handler = loadHandler();
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    const originalScheduledAt = tableItems[0].scheduledAt;
    const schedulerCallsBefore = schedulerCalls.length;

    const res = await handler(
      event('PUT', `/posts/${created.id}`, { scheduledAt: futureIso(10), content: 'edited' }),
    );
    expect(res.statusCode).toBe(200);
    // scheduledAt is ignored — the stored value is unchanged.
    expect(tableItems[0].scheduledAt).toBe(originalScheduledAt);
    // content WAS applied (the supported edit field).
    expect(tableItems[0].content).toBe('edited');
    // No new/updated/deleted schedule as a result of the edit.
    expect(schedulerCalls.length).toBe(schedulerCallsBefore);
  });

  it('PUT with ONLY scheduledAt is a no-op update (422/400 NO_UPDATES), schedule untouched', async () => {
    const handler = loadHandler();
    const created = JSON.parse((await handler(event('POST', '/posts/schedule', validSchedulePayload()))).body);
    const schedulerCallsBefore = schedulerCalls.length;
    const res = await handler(event('PUT', `/posts/${created.id}`, { scheduledAt: futureIso(10) }));
    // scheduledAt is not a recognized editable field → no valid updates.
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('NO_UPDATES');
    expect(schedulerCalls.length).toBe(schedulerCallsBefore);
  });
});
