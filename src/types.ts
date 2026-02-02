// Clawmesh Type Definitions

export interface ClawmeshConfig {
  relays: RelayConfig;
  security: SecurityConfig;
  retention: RetentionConfig;
}

export interface RelayConfig {
  config_url?: string;
  primary: string[];
  controlled?: string | null;
}

export interface SecurityConfig {
  mode: 'allowlist' | 'open';
  allowed?: string[];
  blocked?: string[];
  authority_pubkey?: string;
  require_namespaced_ids?: boolean;
}

export interface RetentionConfig {
  max_messages: number;
  max_days: number;
}

// Message types
export interface ClawmeshMessage {
  v: 1;
  type: 'direct' | 'ack' | 'group' | 'invite';
  from_agent: string;
  to_agent?: string;
  payload: MessagePayload;
  nonce: string;
  ts: number;
}

export interface MessagePayload {
  text?: string;
  [key: string]: unknown;
}

export interface AckMessage {
  v: 1;
  type: 'ack';
  ref_nonce: string;
  status: 'received' | 'read';
  ts: number;
}

// Tool interfaces
export interface MeshSendParams {
  agent_id: string;
  message: string;
  wait_for_ack?: boolean;
}

export interface MeshSendResult {
  success: boolean;
  message_id: string;
  delivered?: boolean;
  error?: MeshError;
  error_message?: string;
}

export interface MeshInboxParams {
  unread_only?: boolean;
  limit?: number;
  from_agent?: string;
}

export interface MeshInboxResult {
  messages: InboxMessage[];
  total_unread: number;
}

export interface InboxMessage {
  id: string;
  from_pubkey: string;
  from_agent_id: string | null;
  content: string;
  timestamp: number;
  read: boolean;
}

export interface MeshPublishParams {
  group: string;
  message: string;
}

export interface MeshPublishResult {
  success: boolean;
  event_id?: string;
  error?: MeshError;
  error_message?: string;
}

export interface MeshSubscribeParams {
  group: string;
}

export interface MeshSubscribeResult {
  success: boolean;
  channel_id?: string;
  error?: MeshError;
  error_message?: string;
}

export interface MeshStatusResult {
  online: boolean;
  pubkey: string;
  agent_id: string;
  connected_relays: string[];
  failed_relays: string[];
  pending_outbound: number;
  unread_inbox: number;
}

export interface MeshPeersParams {
  online_only?: boolean;
}

export interface MeshPeersResult {
  peers: Peer[];
}

export interface Peer {
  agent_id: string;
  pubkey: string;
  last_seen: number | null;
  online: boolean;
  capabilities: string[];
}

// Error types
export type MeshError = 
  | 'AGENT_NOT_FOUND'
  | 'RELAY_ERROR'
  | 'TIMEOUT'
  | 'INVALID_PARAMS'
  | 'NOT_INITIALIZED'
  | 'ENCRYPTION_ERROR';

// Database row types
export interface IdentityRow {
  id: number;
  private_key: Buffer;
  public_key: string;
  agent_id: string;
  created_at: number;
}

export interface InboxRow {
  id: string;
  from_pubkey: string;
  from_agent_id: string | null;
  content: string;
  timestamp: number;
  read: number;
  created_at: number;
}

export interface OutboxRow {
  id: string;
  to_pubkey: string;
  to_agent_id: string | null;
  content: string;
  nonce: string;
  status: 'pending' | 'sent' | 'acked' | 'failed';
  attempts: number;
  next_retry: number | null;
  created_at: number;
}

export interface PeerRow {
  pubkey: string;
  agent_id: string | null;
  last_seen: number | null;
  capabilities: string | null;
  relays: string | null;
}

export interface GroupRow {
  group_id: string;
  is_private: number;
  group_key: Buffer | null;
  subscribed_at: number;
}

// Nostr event types (subset)
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface MappingEventContent {
  v: number;
  agent_id: string;
  capabilities?: string[];
}
