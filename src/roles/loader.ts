import YAML from 'yaml';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { RoleDefinition, KPI, CommunicationStyle, SubRoleTemplate } from './types.ts';

/**
 * Load a role from a YAML file
 */
export function loadRole(filePath: string): RoleDefinition {
  const content = readFileSync(filePath, 'utf-8');
  const data = YAML.parse(content);

  if (!validateRole(data)) {
    throw new Error(`Invalid role definition in ${filePath}`);
  }

  return data;
}

/**
 * Load all roles from a directory
 */
export function loadRolesFromDir(dirPath: string): Map<string, RoleDefinition> {
  const roles = new Map<string, RoleDefinition>();

  try {
    const files = readdirSync(dirPath);

    for (const file of files) {
      const filePath = join(dirPath, file);
      const stat = statSync(filePath);

      if (stat.isFile() && (extname(file) === '.yaml' || extname(file) === '.yml')) {
        try {
          const role = loadRole(filePath);
          roles.set(role.id, role);
        } catch (error) {
          console.error(`Failed to load role from ${file}:`, error);
          // Continue loading other roles
        }
      }
    }
  } catch (error) {
    console.error(`Failed to read roles directory ${dirPath}:`, error);
  }

  return roles;
}

/**
 * Validate a role definition (check required fields)
 */
export function validateRole(role: unknown): role is RoleDefinition {
  if (!role || typeof role !== 'object') {
    console.error('[RoleLoader] Validation failed: role is not an object');
    return false;
  }

  const r = role as Record<string, unknown>;

  // Log diagnostic info to debug exactly what's failing in the environment
  console.log('[RoleLoader] Validating role object structure:', {
    id: typeof r.id,
    name: typeof r.name,
    description: typeof r.description,
    heartbeat_instructions: typeof r.heartbeat_instructions,
    responsibilities: Array.isArray(r.responsibilities),
    autonomous_actions: Array.isArray(r.autonomous_actions),
    approval_required: Array.isArray(r.approval_required),
    kpis: Array.isArray(r.kpis),
    sub_roles: Array.isArray(r.sub_roles),
    tools: Array.isArray(r.tools),
    authority_level: typeof r.authority_level,
    communication_style: typeof r.communication_style,
  });

  // Check required string fields
  if (typeof r.id !== 'string' || !r.id) { console.error('[RoleLoader] Validation failed: id is missing or not a string'); return false; }
  if (typeof r.name !== 'string' || !r.name) { console.error('[RoleLoader] Validation failed: name is missing or not a string'); return false; }
  if (typeof r.description !== 'string' || !r.description) { console.error('[RoleLoader] Validation failed: description is missing or not a string'); return false; }
  if (typeof r.heartbeat_instructions !== 'string' || !r.heartbeat_instructions) { console.error('[RoleLoader] Validation failed: heartbeat_instructions is missing or not a string'); return false; }

  // Check required arrays
  if (!Array.isArray(r.responsibilities)) { console.error('[RoleLoader] Validation failed: responsibilities is missing or not an array'); return false; }
  if (!Array.isArray(r.autonomous_actions)) { console.error('[RoleLoader] Validation failed: autonomous_actions is missing or not an array'); return false; }
  if (!Array.isArray(r.approval_required)) { console.error('[RoleLoader] Validation failed: approval_required is missing or not an array'); return false; }
  if (!Array.isArray(r.kpis)) { console.error('[RoleLoader] Validation failed: kpis is missing or not an array'); return false; }
  if (!Array.isArray(r.sub_roles)) { console.error('[RoleLoader] Validation failed: sub_roles is missing or not an array'); return false; }
  if (!Array.isArray(r.tools)) { console.error('[RoleLoader] Validation failed: tools is missing or not an array'); return false; }

  // Validate authority_level
  if (typeof r.authority_level !== 'number') { console.error('[RoleLoader] Validation failed: authority_level is missing or not a number'); return false; }
  if (r.authority_level < 1 || r.authority_level > 10) { console.error('[RoleLoader] Validation failed: authority_level must be between 1 and 10'); return false; }

  // Validate communication_style
  if (!validateCommunicationStyle(r.communication_style)) {
    console.error('[RoleLoader] Validation failed: communication_style is invalid');
    return false;
  }

  // Validate arrays and sub-objects
  if (!r.responsibilities.every((item) => typeof item === 'string')) {
    const invalid = r.responsibilities.filter(i => typeof i !== 'string');
    console.error('[RoleLoader] Validation failed: responsibilities contains non-string items:', invalid.map(i => `(${typeof i}) ${JSON.stringify(i)}`));
    return false;
  }
  if (!r.autonomous_actions.every((item) => typeof item === 'string')) { console.error('[RoleLoader] Validation failed: autonomous_actions contains non-string items'); return false; }
  if (!r.approval_required.every((item) => typeof item === 'string')) { console.error('[RoleLoader] Validation failed: approval_required contains non-string items'); return false; }
  if (!r.tools.every((item) => typeof item === 'string')) { console.error('[RoleLoader] Validation failed: tools contains non-string items'); return false; }

  if (!r.kpis.every(validateKPI)) { console.error('[RoleLoader] Validation failed: one or more kpis are invalid'); return false; }
  if (!r.sub_roles.every(validateSubRoleTemplate)) { console.error('[RoleLoader] Validation failed: one or more sub_roles are invalid'); return false; }

  return true;
}

/**
 * Validate a KPI object
 */
function validateKPI(kpi: unknown): kpi is KPI {
  if (!kpi || typeof kpi !== 'object') return false;
  const k = kpi as Record<string, unknown>;
  return (
    typeof k.name === 'string' &&
    typeof k.metric === 'string' &&
    typeof k.target === 'string' &&
    typeof k.check_interval === 'string'
  );
}

/**
 * Validate a CommunicationStyle object
 */
function validateCommunicationStyle(style: unknown): style is CommunicationStyle {
  if (!style || typeof style !== 'object') return false;
  const s = style as Record<string, unknown>;
  return (
    typeof s.tone === 'string' &&
    (s.verbosity === 'concise' || s.verbosity === 'detailed' || s.verbosity === 'adaptive') &&
    (s.formality === 'formal' || s.formality === 'casual' || s.formality === 'adaptive')
  );
}

/**
 * Validate a SubRoleTemplate object
 */
function validateSubRoleTemplate(template: unknown): template is SubRoleTemplate {
  if (!template || typeof template !== 'object') return false;
  const t = template as Record<string, unknown>;
  return (
    typeof t.role_id === 'string' &&
    typeof t.name === 'string' &&
    typeof t.description === 'string' &&
    typeof t.spawned_by === 'string' &&
    typeof t.reports_to === 'string' &&
    typeof t.max_budget_per_task === 'number'
  );
}
