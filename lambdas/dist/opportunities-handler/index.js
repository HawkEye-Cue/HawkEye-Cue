'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.TABLE_NAME;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function getUserId(event) {
  return event.requestContext?.authorizer?.jwt?.claims?.sub ?? null;
}

// ─── Server-side subscription entitlement ───────────────────────────────────────
// This handler is MIXED. Capturing, listing, status-changing and deleting Cues
// (Opportunities) is INCLUDED in Nest (free). The Lead follow-up protocol surface
// (promote-to-Lead, follow-up steps, protocol templates) is the paid "followUp"
// feature (Soar+). We enforce only those paid routes server-side so Nest keeps its
// legitimate free functionality. Effective tier is read from the account's own
// profile (legacy labels + trial expiry handled); a browser-supplied tier is ignored.
const PAID_TIERS = new Set(['soar', 'summit', 'team']);
function normalizeTier(raw) {
  const t = (raw || 'free').toString().toLowerCase();
  if (t === 'nest' || t === 'none' || t === 'expired' || t === '') return 'free';
  if (t === 'summit') return 'team';
  if (t === 'base' || t === 'growth' || t === 'flight' || t === 'pro') return 'soar';
  if (t === 'free' || t === 'soar' || t === 'team') return t;
  return 'free';
}
function effectiveTier(profile) {
  if (!profile) return 'free';
  const status = (profile.subscriptionStatus || '').toLowerCase();
  if (status === 'trial' && profile.trialEndsAt) {
    if (new Date(profile.trialEndsAt).getTime() < Date.now()) return 'free';
  }
  return normalizeTier(profile.subscriptionTier);
}
async function getEffectiveTier(userId) {
  const res = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } }));
  return effectiveTier(res.Item);
}
// Guard the paid followUp routes. Returns an error response to short-circuit, else null.
async function requireFollowUp(userId) {
  let tier;
  try {
    tier = await getEffectiveTier(userId);
  } catch (e) {
    console.error('Entitlement check failed (denying):', e.message);
    return respond(503, { error: { code: 'ENTITLEMENT_UNAVAILABLE', message: 'Could not verify subscription. Please try again.' } });
  }
  if (!PAID_TIERS.has(tier)) {
    return respond(403, { error: { code: 'UPGRADE_REQUIRED', message: 'Lead follow-ups require a Soar or Summit plan. Upgrade in Settings.' } });
  }
  return null;
}

const VALID_PLATFORMS = ['facebook', 'instagram', 'linkedin', 'tiktok', 'nextdoor', 'other'];
// 'inbox' is the review-first pre-pipeline state for AUTOMATICALLY detected opportunities
// (extension + background scanner). Inbox items do NOT appear in the New Leads column or
// count until the user explicitly adds them to the pipeline (which flips them to 'new').
// Manual entry goes straight to 'new' as before. See isAutoDetectedBody + handleCreate.
const VALID_STATUSES = ['inbox', 'new', 'followed_up', 'converted', 'dismissed'];

// ─── Intake quality helpers (mirror of packages/shared opportunity-intake.ts) ───
// Inlined here because this Lambda is bundled standalone (no shared-package import at
// runtime). Keep in lockstep with the shared module + its tests.
function isAutoDetectedBody(body) {
  if (!body) return false;
  if (body.autoDetected === true) return true;
  if (body.keywordId === 'extension-detected') return true;
  if (body.source === 'background-scan') return true;
  if (Array.isArray(body.matchedKeywords)) return true;
  return false;
}
const INTAKE_UI_LABELS = new Set([
  'unknown', 'unnamed', 'photos', 'photo', 'videos', 'video', 'reels', 'reel',
  'see more', 'see less', 'like', 'comment', 'share', 'follow', 'following',
  'message', 'sponsored', 'suggested for you', 'shared post', 'facebook',
  'write a comment', 'active', 'admin', 'top contributor', 'author',
  'see what you’ve been waiting for', "see what you've been waiting for",
]);
const INTAKE_URL_OR_DOMAIN = /(https?:\/\/|www\.|m\.me\b|\bfb\.me\b|@|\.com\b|\.net\b|\.org\b|\.io\b|\.co\b|\.lc\b|\.gov\b|\.edu\b|\.biz\b|\.info\b|\.us\b|\.ca\b|\.uk\b)/i;
function isUsableAuthor(author) {
  const a = (author == null ? '' : String(author)).trim();
  if (a.length < 2) return false;
  if (INTAKE_UI_LABELS.has(a.toLowerCase())) return false;
  if (INTAKE_URL_OR_DOMAIN.test(a)) return false;
  if (!/[a-z\u00c0-\u024f]/i.test(a)) return false;
  if (a.length > 60) return false;
  return true;
}
// Canonicalize a post URL for dedupe. Strips tracking params/fragments; returns null for
// a bare feed root (not a per-post identifier). Mirrors shared canonicalizePostUrl.
function intakeCanonicalizePostUrl(url) {
  const raw = (url == null ? '' : String(url)).trim();
  if (!raw) return null;
  const noProto = raw.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  if (/^(m\.|mobile\.)?facebook\.com$/i.test(noProto)) return null;
  try {
    const u = new URL(raw);
    const fbid = u.searchParams.get('story_fbid') || u.searchParams.get('fbid');
    const path = u.pathname.replace(/\/+$/, '');
    const postMatch = path.match(/\/(posts|permalink|videos|reel|p)\/([^/]+)/i);
    if (postMatch) return (u.hostname.replace(/^www\./i, '') + path).toLowerCase();
    if (fbid) return (u.hostname.replace(/^www\./i, '') + '/' + fbid).toLowerCase();
    if (path && path !== '') return (u.hostname.replace(/^www\./i, '') + path).toLowerCase();
    return null;
  } catch (e) { return null; }
}
// Stable dedupe key for one source post: post id → canonical URL → author+content.
// Returns null when there is nothing reliable to key on (never dedupe blindly).
function intakeDedupeKey(input) {
  const id = (input.postId == null ? '' : String(input.postId)).trim();
  if (id) return 'id:' + id.toLowerCase();
  const canon = intakeCanonicalizePostUrl(input.sourceUrl);
  if (canon) return 'url:' + canon;
  const author = (input.sourceAuthor == null ? '' : String(input.sourceAuthor)).trim().toLowerCase();
  const content = (input.sourceContent == null ? '' : String(input.sourceContent)).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  if (content) return 'ac:' + author + '|' + content;
  return null;
}
// CRM pipeline sub-stage (additive, optional). The stored `status` is unchanged — this
// only refines the three middle board columns within status='followed_up'. NEW and
// CLIENTS derive from status ('new' / 'converted'), so they are not stored here.
// Accepted sub-stage values (lowercase, canonical): contacted | quoted | closing.
// `null`/'' clears the sub-stage (e.g. moving back to NEW or into CLIENTS).
const VALID_PIPELINE_STAGES = ['contacted', 'quoted', 'closing'];
// Normalize an incoming pipelineStage. Returns { ok, value } — value is the canonical
// lowercase sub-stage, or null to clear. Rejects anything outside the approved set so a
// bad value can never corrupt the record. Backward-compatible: absent field = no change.
function normalizePipelineStage(raw) {
  if (raw === null || raw === '') return { ok: true, value: null };
  const v = String(raw).trim().toLowerCase();
  // Tolerate the capitalized CRM labels NEW/CLIENTS by mapping them to "clear" since
  // those columns are derived from status, not stored as a sub-stage.
  if (v === 'new' || v === 'clients') return { ok: true, value: null };
  if (VALID_PIPELINE_STAGES.includes(v)) return { ok: true, value: v };
  return { ok: false, value: null };
}

// Validate an opportunity create request.
//
// Privacy/data-minimization (D1): a Minimal-Save opportunity does NOT store copied
// post text (sourceContent) or author name (sourceAuthor), so both are OPTIONAL.
// To still reject meaningless/empty records, a valid record MUST have a usable
// sourceUrl AND a keywordId. (The Discover edition adds further provenance checks
// in handleCreateOpportunity.)
function isUsableUrl(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateOpportunity(body) {
  const errors = [];
  if (!body) return ['Request body is required'];

  // A keyword is always required to anchor the record.
  if (typeof body.keywordId !== 'string' || body.keywordId.trim().length < 1) {
    errors.push('keywordId is required');
  }

  // Reject meaningless/empty records (R14.7): a valid create must have EITHER a
  // usable sourceUrl (extension/minimal save) OR a meaningful manual reference
  // (a non-empty author name or content, e.g. a hand-entered lead with no post URL).
  const hasUsableUrl = isUsableUrl(body.sourceUrl);
  const hasAuthorRef =
    typeof body.sourceAuthor === 'string' && body.sourceAuthor.trim().length > 0;
  const hasContentRef =
    typeof body.sourceContent === 'string' && body.sourceContent.trim().length > 0;
  if (!hasUsableUrl && !hasAuthorRef && !hasContentRef) {
    errors.push(
      'a usable sourceUrl or a meaningful source reference (author or content) is required'
    );
  }

  // Optional personal content — only size/type checked when present.
  if (body.sourceContent != null) {
    if (typeof body.sourceContent !== 'string') {
      errors.push('sourceContent must be a string');
    } else if (body.sourceContent.length > 5000) {
      errors.push('sourceContent must be at most 5000 characters');
    }
  }
  if (body.sourceAuthor != null && typeof body.sourceAuthor !== 'string') {
    errors.push('sourceAuthor must be a string');
  }
  if (body.sourcePlatform && !VALID_PLATFORMS.includes(body.sourcePlatform)) {
    errors.push(`sourcePlatform must be one of: ${VALID_PLATFORMS.join(', ')}`);
  }

  return errors;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

// GET /opportunities
async function handleGetOpportunities(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
      },
      ScanIndexForward: false,
    })
  );

  const opportunities = (result.Items || []).map((item) => {
    // Canonical-schema normalization. Historical background keyword-scanner records
    // (lead-scanner) stored a different shape: platform/authorName/postContent/
    // matchedKeywords/source:'background-scan' and no keywordId/sourcePlatform/
    // sourceAuthor/sourceContent. Read-time fallbacks render those records correctly
    // without any migration. D1: never fabricate a sourceUrl — scanner records have
    // none, so sourceUrl stays empty and the "View original post" link simply hides.
    const isScanRecord = item.source === 'background-scan' || Array.isArray(item.matchedKeywords);
    const resolvedKeywordId = item.keywordId ?? (isScanRecord ? 'extension-detected' : item.keywordId);
    const resolvedKeywordText =
      resolvedKeywordId === 'manual-entry'
        ? (item.leadSource || 'Manual')
        : (Array.isArray(item.matchedKeywords) && item.matchedKeywords.length > 0
            ? item.matchedKeywords[0]
            : resolvedKeywordId);
    return {
    id: item.opportunityId,
    keywordId: resolvedKeywordId,
    keywordText: resolvedKeywordText,
    sourceContent: item.sourceContent ?? item.postContent ?? null,
    sourcePlatform: item.sourcePlatform ?? item.platform ?? 'other',
    sourceUrl: item.sourceUrl || '',
    sourceAuthor: item.sourceAuthor ?? item.authorName ?? null,
    promotedToLead: item.promotedToLead === true,
    promotedAt: item.promotedAt || null,
    leadSource: item.leadSource || null,
    leadSourceGroup: item.leadSourceGroup || null,
    consentBasis: item.consentBasis || null,
    policyType: item.policyType || null,
    assignedTo: item.assignedTo || null,
    bucket: item.bucket || null,
    // CRM pipeline sub-stage (additive, optional; null for legacy records).
    pipelineStage: item.pipelineStage || null,
    expectedPremium: item.expectedPremium || null,
    leadNotes: item.leadNotes || null,
    leadColor: item.leadColor || null,
    status: item.status,
    createdAt: item.createdAt,
    // CRM push tracking (Discover/Grow editions)
    pushStatus: item.pushStatus || 'not_pushed',
    crmRecordId: item.crmRecordId || null,
    lastPushError: item.lastPushError || null,
    pushedAt: item.pushedAt || null,
    pushedConnectionId: item.pushedConnectionId || null,
    };
  });

  return respond(200, { opportunities });
}

// POST /opportunities
async function handleCreateOpportunity(userId, body) {
  const errors = validateOpportunity(body);
  if (errors.length > 0) {
    return respond(400, { error: { code: 'VALIDATION_ERROR', message: errors.join('; ') } });
  }

  // Discover edition requires social-origin provenance on every captured lead (Req 4.7).
  if (body && body.edition === 'discover') {
    const requiredFields = ['sourcePlatform', 'sourceUrl', 'leadSource', 'consentBasis'];
    const missing = requiredFields.filter((f) => {
      const v = body[f];
      return v == null || String(v).trim() === '';
    });
    if (missing.length > 0) {
      return respond(400, { error: { code: 'VALIDATION_ERROR', message: `Missing required fields for Discover capture: ${missing.join(', ')}`, missing } });
    }
  }

  const opportunityId = randomUUID();
  const now = new Date().toISOString();

  // D1: Minimal Save stores no author/content. Only persist what was provided.
  const hasContent = typeof body.sourceContent === 'string' && body.sourceContent.length > 0;
  // Author quality: only persist a real, usable identity. Junk (UI labels like "Photos",
  // URLs/domains like "m.me", ad links) is stored as null → UI shows "Author unavailable".
  // Preserves the original sourceUrl + post content regardless.
  const usableAuthor = isUsableAuthor(body.sourceAuthor) ? String(body.sourceAuthor).trim() : null;
  const hasAuthor = usableAuthor !== null;
  // Explicit promotion at save time. Minimal/Enriched save alone does NOT promote.
  const promoteToLead = body.promoteToLead === true;

  // Review-first gating: automatically detected opportunities land in the Opportunity
  // Inbox ('inbox'), NOT the New Leads pipeline. Manual entry keeps its straight-to-'new'
  // behavior. An explicit promote at save time (manual intent) still goes to 'new'.
  const autoDetected = isAutoDetectedBody(body) && !promoteToLead;
  const initialStatus = autoDetected ? 'inbox' : 'new';

  // The opportunity item (built once; written either plainly or inside a dedupe txn).
  const oppItem = {
    PK: `USER#${userId}`,
    SK: `OPP#${now}#${opportunityId}`,
    opportunityId,
    keywordId: body.keywordId || 'manual-entry',
    sourceContent: hasContent ? body.sourceContent.substring(0, 5000) : null,
    sourcePlatform: body.sourcePlatform || 'other',
    sourceUrl: body.sourceUrl || '',
    sourceAuthor: usableAuthor,
    leadSource: body.leadSource || null,
    leadSourceGroup: body.leadSourceGroup || null,
    consentBasis: body.consentBasis || null,
    policyType: body.policyType || null,
    assignedTo: body.assignedTo || null,
    bucket: body.bucket || null,
    expectedPremium: body.expectedPremium || null,
    contactEmail: body.contactEmail || null,
    status: initialStatus,
    // Opportunity → Lead marker (D1). An Opportunity stays an Opportunity until an
    // explicit promote. Only set true if the caller explicitly promoted at save time.
    promotedToLead: promoteToLead,
    promotedAt: promoteToLead ? now : null,
    pushStatus: 'not_pushed',
    createdAt: now,
  };

  // ─── Server-side duplicate prevention (auto-detected only) ───────────────────
  // Manual entry is NEVER deduped (preserves existing behavior). For auto-detected
  // captures we reserve a per-user sentinel keyed by a STABLE post identifier. The
  // sentinel AND the opportunity are written in ONE atomic TransactWriteCommand with a
  // ConditionExpression attribute_not_exists(SK) on the sentinel. Because the two writes
  // commit or roll back together, a failed opportunity write can NEVER leave an orphaned
  // sentinel that would permanently block a legitimate future capture. The transaction is
  // user-scoped (PK), O(1) (two item writes, no Query/Scan), and atomic against
  // simultaneous submissions (only one concurrent identical txn wins).
  // If no reliable key exists we do NOT dedupe (never block blindly) — plain Put.
  //
  // INTENTIONAL: the sentinel is permanent, so a post the user DISMISSED is not
  // re-captured by a later automatic scan (dismiss = "stop surfacing this post"). To add
  // such a person deliberately, use manual entry (keywordId 'manual-entry'), which bypasses
  // this dedupe entirely.
  const dedupeKey = autoDetected
    ? intakeDedupeKey({
        postId: body.postId ?? body.sourceCommentId,
        sourceUrl: body.sourceUrl,
        sourceAuthor: usableAuthor,
        sourceContent: hasContent ? body.sourceContent : null,
      })
    : null;

  if (dedupeKey) {
    try {
      await dynamo.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE_NAME,
                Item: { PK: `USER#${userId}`, SK: `OPPDEDUPE#${dedupeKey}`, opportunityId, createdAt: now },
                ConditionExpression: 'attribute_not_exists(SK)',
              },
            },
            { Put: { TableName: TABLE_NAME, Item: oppItem } },
          ],
        })
      );
    } catch (e) {
      // The dedupe condition failed → this post was already captured for this user. A
      // cancelled transaction writes NOTHING (no orphaned OPP, no orphaned sentinel).
      // Idempotent: report success with the existing record id, writing no new OPP.
      const name = e && (e.name || e.code);
      if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
        let existingId = null;
        try {
          const got = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { PK: `USER#${userId}`, SK: `OPPDEDUPE#${dedupeKey}` } }));
          existingId = got && got.Item ? got.Item.opportunityId : null;
        } catch (_) { /* best-effort */ }
        return respond(200, { id: existingId, duplicate: true, status: 'inbox' });
      }
      throw e;
    }
  } else {
    // Manual entry (or keyless auto-detect): single plain Put — no dedupe sentinel.
    await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: oppItem }));
  }

  // D1: The Lead follow-up protocol is a LEAD side effect. It is created ONLY when the
  // opportunity is explicitly promoted to a Lead — never on a plain (Minimal/Enriched)
  // save. This prevents a silent derived personal-data record (leadName) on save.
  if (promoteToLead) {
    await createLeadProtocol(userId, opportunityId, now, usableAuthor);
  }

  return respond(201, { id: opportunityId, status: initialStatus, promotedToLead: promoteToLead, createdAt: now });
}

// Create the Lead follow-up protocol from the user's saved template, if any.
// Idempotent: writes SK `LEAD_PROTOCOL#{opportunityId}` with a condition that it does
// not already exist, so repeated promotes (retries / double-clicks / refreshes) never
// create duplicates.
async function createLeadProtocol(userId, opportunityId, now, leadName) {
  try {
    const templateResult = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LEAD_PROTOCOL_TEMPLATE' },
    }));
    const template = (templateResult.Items || [])[0];
    if (template && template.steps && template.steps.length > 0) {
      const startDate = new Date(now);
      const steps = template.steps.map((s, i) => {
        const eventDate = new Date(startDate);
        eventDate.setDate(eventDate.getDate() + (s.day || 0));
        if (eventDate.getDay() === 0) {
          eventDate.setDate(eventDate.getDate() + 1);
        }
        const scheduledDate = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${String(eventDate.getDate()).padStart(2, '0')}`;
        return {
          idx: i,
          day: s.day || 0,
          type: s.type || 'call',
          task: s.task || '',
          completed: false,
          completedAt: null,
          scheduledDate,
        };
      });

      try {
        await dynamo.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `USER#${userId}`,
            SK: `LEAD_PROTOCOL#${opportunityId}`,
            opportunityId,
            leadName: leadName || null,
            steps,
            createdAt: now,
            updatedAt: now,
          },
          // Idempotency guard — do not overwrite / duplicate an existing protocol.
          ConditionExpression: 'attribute_not_exists(SK)',
        }));
      } catch (e) {
        // ConditionalCheckFailed => protocol already exists; promotion is idempotent.
        if (!(e && e.name === 'ConditionalCheckFailedException')) throw e;
      }
    }
  } catch (e) {
    console.error('Failed to create lead protocol:', e);
  }
}

// POST /opportunities/{id}/promote — explicit Opportunity → Lead promotion (D1).
// Idempotent: sets promotedToLead=true on the opportunity and creates the Lead
// follow-up protocol only if it does not already exist. Repeated calls do not create
// duplicate LEAD_PROTOCOL records and do not error.
async function handlePromoteToLead(userId, opportunityId) {
  // Find the opportunity's full SK.
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'opportunityId = :oppId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
        ':oppId': opportunityId,
      },
    })
  );
  const item = (queryResult.Items || [])[0];
  if (!item) {
    return respond(404, { error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });
  }

  const now = new Date().toISOString();
  const alreadyPromoted = item.promotedToLead === true;

  // Mark promoted (idempotent — re-setting the same flag is harmless).
  await dynamo.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: item.PK, SK: item.SK },
    UpdateExpression: 'SET promotedToLead = :t, promotedAt = if_not_exists(promotedAt, :now)',
    ExpressionAttributeValues: { ':t': true, ':now': now },
  }));

  // Create the Lead follow-up protocol once (guarded by attribute_not_exists in the helper).
  await createLeadProtocol(userId, opportunityId, now, item.sourceAuthor || null);

  return respond(200, {
    id: opportunityId,
    promotedToLead: true,
    promotedAt: item.promotedAt || now,
    alreadyPromoted,
  });
}

// PUT /opportunities/{id}/status
async function handleUpdateStatus(userId, opportunityId, body) {
  const { status, assignedTo, policyType, expectedPremium, bucket, contactEmail } = body || {};
  const hasPipelineStage = body && body.pipelineStage !== undefined;

  // At least one field must be provided
  if (!status && assignedTo === undefined && policyType === undefined && expectedPremium === undefined && bucket === undefined && contactEmail === undefined && !hasPipelineStage) {
    return respond(400, { error: { code: 'INVALID_INPUT', message: 'At least one field is required' } });
  }

  if (status && !VALID_STATUSES.includes(status)) {
    return respond(400, { error: { code: 'INVALID_STATUS', message: `status must be one of: ${VALID_STATUSES.join(', ')}` } });
  }

  // Validate the optional CRM sub-stage without touching the stored status.
  let pipelineStageValue = null;
  if (hasPipelineStage) {
    const norm = normalizePipelineStage(body.pipelineStage);
    if (!norm.ok) {
      return respond(400, { error: { code: 'INVALID_PIPELINE_STAGE', message: `pipelineStage must be one of: ${VALID_PIPELINE_STAGES.join(', ')} (or null to clear)` } });
    }
    pipelineStageValue = norm.value;
  }

  // Query to find the full SK for this opportunity
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'opportunityId = :oppId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
        ':oppId': opportunityId,
      },
    })
  );

  const item = (queryResult.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });

  // Build dynamic update expression
  const updates = [];
  const names = {};
  const values = {};
  if (status) {
    updates.push('#status = :status');
    names['#status'] = 'status';
    values[':status'] = status;
  }
  if (assignedTo !== undefined) {
    updates.push('assignedTo = :assignedTo');
    values[':assignedTo'] = assignedTo || null;
  }
  if (policyType !== undefined) {
    updates.push('policyType = :policyType');
    values[':policyType'] = policyType || null;
  }
  if (expectedPremium !== undefined) {
    updates.push('expectedPremium = :expectedPremium');
    values[':expectedPremium'] = expectedPremium || null;
  }
  if (bucket !== undefined) {
    updates.push('bucket = :bucket');
    values[':bucket'] = bucket || null;
  }
  if (hasPipelineStage) {
    updates.push('pipelineStage = :pipelineStage');
    values[':pipelineStage'] = pipelineStageValue;
  }
  if (body.leadNotes !== undefined) {
    updates.push('leadNotes = :leadNotes');
    values[':leadNotes'] = body.leadNotes || null;
  }
  if (body.consentBasis !== undefined) {
    updates.push('consentBasis = :consentBasis');
    values[':consentBasis'] = body.consentBasis || null;
  }
  if (body.leadColor !== undefined) {
    updates.push('leadColor = :leadColor');
    values[':leadColor'] = body.leadColor || null;
  }
  if (body.transferredTo !== undefined) {
    updates.push('transferredTo = :transferredTo');
    values[':transferredTo'] = body.transferredTo || null;
  }
  if (body.contactEmail !== undefined) {
    updates.push('contactEmail = :contactEmail');
    values[':contactEmail'] = body.contactEmail || null;
  }

  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: item.PK, SK: item.SK },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
      ExpressionAttributeValues: values,
    })
  );

  return respond(200, { id: opportunityId, status: status || item.status, assignedTo: assignedTo !== undefined ? assignedTo : item.assignedTo, policyType: policyType !== undefined ? policyType : item.policyType, expectedPremium: expectedPremium !== undefined ? expectedPremium : item.expectedPremium, bucket: bucket !== undefined ? bucket : item.bucket, pipelineStage: hasPipelineStage ? pipelineStageValue : (item.pipelineStage || null) });
}

// DELETE /opportunities/{id}
async function handleDeleteOpportunity(userId, opportunityId) {
  const queryResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'opportunityId = :oppId',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
        ':oppId': opportunityId,
      },
    })
  );

  const item = (queryResult.Items || [])[0];
  if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Opportunity not found' } });

  // Data integrity: deleting a client card must NOT leave an orphaned won Sale that keeps
  // inflating production. Find any linked DEAL# (by opportunityId) and VOID it (stage →
  // 'voided', preserved for audit) so its premium stops counting. Revenue aggregations
  // count only stage === 'won', so a voided deal is excluded everywhere. Best-effort: a
  // deal-void failure must not block the opportunity delete.
  let voidedDealIds = [];
  try {
    const dealsRes = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      FilterExpression: 'opportunityId = :oppId',
      ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'DEAL#', ':oppId': opportunityId },
    }));
    const now = new Date().toISOString();
    for (const deal of (dealsRes.Items || [])) {
      if (deal.stage === 'voided') continue;
      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: deal.PK, SK: deal.SK },
        UpdateExpression: 'SET #st = :voided, priorStage = :prior, voidedAt = :now, voidedReason = :reason, updatedAt = :now',
        ExpressionAttributeNames: { '#st': 'stage' },
        ExpressionAttributeValues: {
          ':voided': 'voided', ':prior': deal.stage || 'won', ':now': now,
          ':reason': 'Client card deleted — linked sale auto-voided to keep production accurate',
        },
      }));
      voidedDealIds.push(deal.dealId || deal.SK);
    }
  } catch (e) { console.error('Linked-deal void on opportunity delete failed (non-fatal):', e && e.message); }

  await dynamo.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: item.PK, SK: item.SK } })
  );

  return respond(200, { deleted: true, voidedDeals: voidedDealIds });
}

// GET /opportunities/stats
async function handleGetStats(userId) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'OPP#',
      },
    })
  );

  const items = result.Items || [];
  const stats = {
    total: items.length,
    // Review-first: 'inbox' (auto-detected, pending review) is counted separately and is
    // NOT part of 'new'. 'new' = items the user has added to the pipeline or entered manually.
    inbox: items.filter((i) => i.status === 'inbox').length,
    new: items.filter((i) => i.status === 'new').length,
    followed_up: items.filter((i) => i.status === 'followed_up').length,
    converted: items.filter((i) => i.status === 'converted').length,
    dismissed: items.filter((i) => i.status === 'dismissed').length,
  };

  return respond(200, { stats });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method ?? event.httpMethod;
    const path = event.requestContext?.http?.path ?? event.path;
    const userId = getUserId(event);

    if (!userId) return respond(401, { error: { code: 'UNAUTHORIZED', message: 'Missing user identity' } });

    // Paid followUp surface (Soar+): promote-to-Lead, follow-up steps, protocol +
    // protocol templates. Capture/list/stats/status/delete stay free for Nest. We gate
    // these specific routes server-side; everything else falls through unguarded.
    const isFollowUpRoute =
      (/^\/opportunities\/[^/]+\/promote$/.test(path) && method === 'POST') ||
      (/^\/opportunities\/[^/]+\/followups$/.test(path) && method === 'GET') ||
      (/^\/opportunities\/[^/]+\/followups\/\d+$/.test(path) && method === 'PUT') ||
      (/^\/opportunities\/[^/]+\/protocol$/.test(path) && method === 'PUT') ||
      (path === '/opportunities/protocol-template' && (method === 'GET' || method === 'PUT'));
    if (isFollowUpRoute) {
      const gate = await requireFollowUp(userId);
      if (gate) return gate;
    }

    // GET /opportunities/stats
    if (method === 'GET' && path === '/opportunities/stats') {
      return handleGetStats(userId);
    }

    // GET /opportunities
    if (method === 'GET' && path === '/opportunities') {
      return handleGetOpportunities(userId);
    }

    // POST /opportunities
    if (method === 'POST' && path === '/opportunities') {
      const body = event.body ? JSON.parse(event.body) : null;
      // Capturing a Cue is free (Nest). But promoting to a Lead at save time creates
      // the paid follow-up protocol, so that specific option requires Soar+.
      if (body && body.promoteToLead === true) {
        const gate = await requireFollowUp(userId);
        if (gate) return gate;
      }
      return handleCreateOpportunity(userId, body);
    }

    // GET /opportunities/{id}/followups — get follow-up protocol for a lead
    const followupsGetMatch = path.match(/^\/opportunities\/([^/]+)\/followups$/);
    if (method === 'GET' && followupsGetMatch) {
      const oppId = followupsGetMatch[1];
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': `LEAD_PROTOCOL#${oppId}` },
      }));
      const item = (result.Items || [])[0];
      return respond(200, { steps: item?.steps || [] });
    }

    // PUT /opportunities/{id}/followups/{stepIdx} — mark step complete/incomplete
    const followupStepMatch = path.match(/^\/opportunities\/([^/]+)\/followups\/(\d+)$/);
    if (method === 'PUT' && followupStepMatch) {
      const oppId = followupStepMatch[1];
      const stepIdx = parseInt(followupStepMatch[2]);
      const body = event.body ? JSON.parse(event.body) : {};

      // Get existing protocol
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': `LEAD_PROTOCOL#${oppId}` },
      }));
      const item = (result.Items || [])[0];
      if (!item) return respond(404, { error: { code: 'NOT_FOUND', message: 'Protocol not found for this lead' } });

      const steps = item.steps || [];
      if (stepIdx < 0 || stepIdx >= steps.length) return respond(400, { error: { code: 'INVALID_INDEX', message: 'Invalid step index' } });

      steps[stepIdx] = { ...steps[stepIdx], completed: body.completed !== false, completedAt: body.completed !== false ? new Date().toISOString() : null };

      await dynamo.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${userId}`, SK: `LEAD_PROTOCOL#${oppId}` },
        UpdateExpression: 'SET steps = :s',
        ExpressionAttributeValues: { ':s': steps },
      }));

      return respond(200, { steps });
    }

    // PUT /opportunities/{id}/protocol — save/update full protocol for a lead
    const protocolMatch = path.match(/^\/opportunities\/([^/]+)\/protocol$/);
    if (method === 'PUT' && protocolMatch) {
      const oppId = protocolMatch[1];
      const body = event.body ? JSON.parse(event.body) : {};
      const steps = (body.steps || []).map((s, i) => ({
        idx: i,
        day: s.day || 0,
        type: s.type || 'call',
        task: s.task || '',
        completed: s.completed || false,
        completedAt: s.completedAt || null,
        scheduledDate: s.scheduledDate || null,
      }));

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: `LEAD_PROTOCOL#${oppId}`,
          opportunityId: oppId,
          steps,
          updatedAt: new Date().toISOString(),
        },
      }));

      return respond(200, { steps });
    }

    // GET /opportunities/protocol-template — get user's saved default protocol
    if (method === 'GET' && path === '/opportunities/protocol-template') {
      const result = await dynamo.send(new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: { ':pk': `USER#${userId}`, ':sk': 'LEAD_PROTOCOL_TEMPLATE' },
      }));
      const item = (result.Items || [])[0];
      return respond(200, { steps: item?.steps || [] });
    }

    // PUT /opportunities/protocol-template — save user's default protocol template
    if (method === 'PUT' && path === '/opportunities/protocol-template') {
      const body = event.body ? JSON.parse(event.body) : {};
      const steps = (body.steps || []).map((s) => ({
        day: s.day || 0,
        type: s.type || 'call',
        task: s.task || '',
      }));

      await dynamo.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `USER#${userId}`,
          SK: 'LEAD_PROTOCOL_TEMPLATE',
          steps,
          updatedAt: new Date().toISOString(),
        },
      }));

      return respond(200, { steps });
    }

    // PUT /opportunities/{id}/status
    const statusMatch = path.match(/^\/opportunities\/([^/]+)\/status$/);
    if (method === 'PUT' && statusMatch) {
      const body = event.body ? JSON.parse(event.body) : {};
      return handleUpdateStatus(userId, statusMatch[1], body);
    }

    // POST /opportunities/{id}/promote — explicit Opportunity → Lead (D1, idempotent)
    const promoteMatch = path.match(/^\/opportunities\/([^/]+)\/promote$/);
    if (method === 'POST' && promoteMatch) {
      return handlePromoteToLead(userId, promoteMatch[1]);
    }

    // DELETE /opportunities/{id}
    const deleteMatch = path.match(/^\/opportunities\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      return handleDeleteOpportunity(userId, deleteMatch[1]);
    }

    return respond(404, { error: { code: 'NOT_FOUND', message: `No route for ${method} ${path}` } });
  } catch (e) {
    console.error('opportunities-handler error:', e);
    return respond(500, { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
};
