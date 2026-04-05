import { deleteSetting, getSetting, setSetting } from './settings.ts';
import { createEntity, updateEntity } from './entities.ts';
import { createFact } from './facts.ts';
import { getDb } from './schema.ts';
import {
  USER_PROFILE_QUESTIONS,
  USER_PROFILE_SETTING_KEY,
  createEmptyUserProfile,
  countAnsweredUserProfileQuestions,
  normalizeUserProfileAnswers,
  type UserProfileRecord,
} from '../user/profile.ts';

export const USER_PROFILE_VAULT_SOURCE = 'user_profile';
const USER_PROFILE_FOLLOWUP_STATE_KEY = 'user.profile.followup.v1';

export function getUserProfile(): UserProfileRecord | null {
  const raw = getSetting(USER_PROFILE_SETTING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserProfileRecord>;
    const base = createEmptyUserProfile();
    return {
      version: 1,
      answers: normalizeUserProfileAnswers((parsed.answers ?? {}) as Record<string, unknown>),
      created_at: typeof parsed.created_at === 'number' ? parsed.created_at : base.created_at,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : base.updated_at,
      completed_at: typeof parsed.completed_at === 'number' ? parsed.completed_at : null,
    };
  } catch {
    return null;
  }
}

export function saveUserProfile(input: Record<string, unknown>): UserProfileRecord {
  const existing = getUserProfile();
  const now = Date.now();
  const answers = normalizeUserProfileAnswers(input);
  const profile: UserProfileRecord = {
    version: 1,
    answers,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    completed_at: countAnsweredUserProfileQuestions({
      version: 1,
      answers,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      completed_at: null,
    }) > 0 ? now : null,
  };
  setSetting(USER_PROFILE_SETTING_KEY, JSON.stringify(profile));
  syncUserProfileKnowledge(profile);
  return profile;
}

export function clearUserProfile(): void {
  deleteSetting(USER_PROFILE_SETTING_KEY);
  clearUserProfileKnowledge();
  deleteSetting(USER_PROFILE_FOLLOWUP_STATE_KEY);
}

function syncUserProfileKnowledge(profile: UserProfileRecord): void {
  if (countAnsweredUserProfileQuestions(profile) === 0) {
    clearUserProfileKnowledge();
    return;
  }
  const db = getDb();
  const entityName = profile.answers.preferred_name?.trim() || 'User';
  const entityProperties = { is_current_user: true, profile_version: profile.version, profile_updated_at: profile.updated_at };
  const entityRow = db.prepare('SELECT id FROM entities WHERE source = ? ORDER BY updated_at DESC LIMIT 1').get(USER_PROFILE_VAULT_SOURCE) as { id: string } | null;
  const entity = entityRow
    ? updateEntity(entityRow.id, { name: entityName, properties: entityProperties })
    : createEntity('person', entityName, entityProperties, USER_PROFILE_VAULT_SOURCE);
  if (!entity) throw new Error('Failed to sync user profile entity to vault');
  db.prepare('DELETE FROM facts WHERE subject_id = ? AND source = ?').run(entity.id, USER_PROFILE_VAULT_SOURCE);
  for (const question of USER_PROFILE_QUESTIONS) {
    const answer = profile.answers[question.id]?.trim();
    if (!answer) continue;
    createFact(entity.id, question.id, answer, { confidence: 1, source: USER_PROFILE_VAULT_SOURCE });
  }
}

function clearUserProfileKnowledge(): void {
  const db = getDb();
  const rows = db.prepare('SELECT id FROM entities WHERE source = ?').all(USER_PROFILE_VAULT_SOURCE) as Array<{ id: string }>;
  db.prepare('DELETE FROM facts WHERE source = ?').run(USER_PROFILE_VAULT_SOURCE);
  for (const row of rows) {
    db.prepare('DELETE FROM entities WHERE id = ?').run(row.id);
  }
}
