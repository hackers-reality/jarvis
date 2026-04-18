import { getDb, generateId } from '../vault/schema.ts';

/**
 * Persistence layer for Agent state.
 * Inspired by LangGraph Checkpointing.
 */
export interface AgentState {
  memory: any[];
  thoughts: string[];
  current_goal?: string;
  next_action?: string;
  tool_outputs: Record<string, any>;
  custom_data?: any;
}

export type Checkpoint = {
  id: string;
  conversation_id: string;
  agent_id: string;
  parent_checkpoint_id: string | null;
  state: AgentState;
  metadata: Record<string, any>;
  created_at: number;
};

export class CheckpointManager {
  static save(checkpoint: Omit<Checkpoint, 'id' | 'created_at'>): Checkpoint {
    const db = getDb();
    const id = generateId();
    const created_at = Date.now();

    db.run(
      `INSERT INTO agent_checkpoints (
        id, conversation_id, agent_id, parent_checkpoint_id,
        state_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        checkpoint.conversation_id,
        checkpoint.agent_id,
        checkpoint.parent_checkpoint_id,
        JSON.stringify(checkpoint.state),
        JSON.stringify(checkpoint.metadata),
        created_at,
      ],
    );

    return { id, created_at, ...checkpoint };
  }

  static getLatest(conversation_id: string, agent_id: string): Checkpoint | null {
    const db = getDb();
    const row = db.query(
      `SELECT * FROM agent_checkpoints
       WHERE conversation_id = ? AND agent_id = ?
       ORDER BY created_at DESC LIMIT 1`,
    ).get(conversation_id, agent_id) as any;

    if (!row) return null;

    return {
      id: row.id,
      conversation_id: row.conversation_id,
      agent_id: row.agent_id,
      parent_checkpoint_id: row.parent_checkpoint_id,
      state: JSON.parse(row.state_json),
      metadata: JSON.parse(row.metadata_json || '{}'),
      created_at: row.created_at,
    };
  }

  static history(conversation_id: string, agent_id: string, limit = 10): Checkpoint[] {
    const db = getDb();
    const rows = db.query(
      `SELECT * FROM agent_checkpoints
       WHERE conversation_id = ? AND agent_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    ).all(conversation_id, agent_id, limit) as any[];

    return rows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      agent_id: row.agent_id,
      parent_checkpoint_id: row.parent_checkpoint_id,
      state: JSON.parse(row.state_json),
      metadata: JSON.parse(row.metadata_json || '{}'),
      created_at: row.created_at,
    }));
  }
}
