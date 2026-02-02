/**
 * Clawmesh - Agent-to-agent communication for OpenClaw via Nostr
 */

// Core types from protocol spec
export type {
  ClawmeshConfig,
  RelayConfig,
  SecurityConfig,
  RetentionConfig,
  ClawmeshMessage as ProtocolMessage,
  MessagePayload,
  AckMessage,
  MeshSendParams,
  MeshSendResult,
  MeshInboxParams,
  MeshInboxResult,
  MeshPublishParams,
  MeshPublishResult,
  MeshSubscribeParams,
  MeshSubscribeResult,
  MeshStatusResult,
  MeshPeersParams,
  MeshPeersResult,
  MeshDiscoverParams,
  MeshDiscoverResult,
  MeshError,
  NostrEvent,
  MappingEventContent
} from './types.js';

// Implementation exports
export { generateIdentity, saveIdentity, loadIdentity, requireIdentity, identityExists, isValidAgentId, type Identity } from './identity.js';
export { connectToRelays, publishToRelays, queryRelays, closeRelays, type RelayPool } from './relay.js';
export { register, discoverAgent, discoverAll, type DiscoveredAgent } from './discovery.js';
export { sendDM, fetchDMs, type ClawmeshMessage } from './dm.js';
export { publishToGroup, subscribeToGroup, fetchGroupMessages, listSubscribedGroups } from './groups.js';
export { saveInboxMessage, getInboxMessages, getPeers, getUnreadCount, savePeer, closeDb } from './store.js';

export const VERSION = '0.1.0';
export const PROTOCOL_VERSION = 1;
