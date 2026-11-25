export type DatabaseProviderType =
  | 'firebase_firestore'
  | 'firebase_realtime'
  | 'custom_api';

export type DatabaseConnectionHealthStatus =
  | 'connected'
  | 'offline'
  | 'invalid_config'
  | 'permission_denied'
  | 'timeout'
  | 'quota_exceeded'
  | 'untested';

export interface FirebaseConnectionFields {
  projectId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  databaseURL?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}

export interface CustomApiConnectionFields {
  endpointUrl: string;
  healthPath?: string;
  authHeaderName?: string;
  useWorkerProxy?: boolean;
}

export interface DatabaseConnectionProfile {
  id: string;
  name: string;
  description?: string;
  providerType: DatabaseProviderType;
  isBuiltIn?: boolean;
  firebaseConfig: FirebaseConnectionFields;
  customApiConfig?: CustomApiConnectionFields;
  lastStatus: DatabaseConnectionHealthStatus;
  lastStatusMessage?: string;
  lastLatencyMs?: number;
  lastConnectedAt?: string;
  lastDisconnectedAt?: string;
  lastTestedAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface DatabaseConnectionRegistryState {
  version: number;
  activeConnectionId: string;
  previousConnectionId: string | null;
  defaultConnectionId: string;
  lastGoodConnectionId: string;
  autoRetryEnabled: boolean;
  updatedAtMs?: number;
  deletedProfileIds?: string[];
  profiles: DatabaseConnectionProfile[];
}

export interface DatabaseTestStepResult {
  step: 'config' | 'reachability' | 'auth' | 'read' | 'write';
  label: string;
  ok: boolean;
  detail: string;
  latencyMs?: number;
}

export interface DatabaseConnectionTestResult {
  ok: boolean;
  status: Exclude<DatabaseConnectionHealthStatus, 'untested'>;
  statusLabelAr: string;
  message: string;
  rawError?: string;
  latencyMs: number;
  testedAt: string;
  canSwitchSafely: boolean;
  requiresReauthNotice?: boolean;
  counts?: {
    media?: number;
    settingsExists?: boolean;
  };
  steps: DatabaseTestStepResult[];
}

export type DatabaseLogEventType =
  | 'test'
  | 'switch'
  | 'rollback'
  | 'create'
  | 'update'
  | 'delete'
  | 'set_default'
  | 'outage'
  | 'retry'
  | 'migrate'
  | 'secret_update'
  | 'backup_export'
  | 'backup_import';

export interface DatabaseConnectionLogEntry {
  id: string;
  timestamp: string;
  event: DatabaseLogEventType;
  connectionId: string;
  connectionName: string;
  status: 'success' | 'warning' | 'error' | 'info';
  resultStatus?: DatabaseConnectionHealthStatus;
  latencyMs?: number;
  actorUid?: string;
  actorName?: string;
  message: string;
  rawError?: string;
}

export interface DatabaseServerSecretStatus {
  connectionId: string;
  hasServiceAccount: boolean;
  serviceAccountClientEmail?: string;
  hasPrivateKey: boolean;
  hasApiSecret: boolean;
  hasCloudflareToken: boolean;
  updatedAt?: string;
  updatedBy?: string;
  vaultSource?: 'node_vault' | 'cloudflare_kv' | 'none';
}

export interface DatabaseMigrationCollectionCount {
  collection: string;
  labelAr: string;
  sourceCount: number;
  targetBeforeCount: number;
  copiedCount: number;
  targetAfterCount: number;
  verified: boolean;
  warning?: string;
}

export interface DatabaseMigrationReport {
  ok: boolean;
  sourceConnectionId: string;
  targetConnectionId: string;
  startedAt: string;
  finishedAt: string;
  totalSourceDocs: number;
  totalCopiedDocs: number;
  collections: DatabaseMigrationCollectionCount[];
  errors: string[];
}

export interface DatabaseBackupBundle {
  format: 'rahaltv-db-connections-v1';
  exportedAt: string;
  exportedBy?: string;
  checksum: string;
  activeConnectionId: string;
  defaultConnectionId: string;
  previousConnectionId: string | null;
  profiles: DatabaseConnectionProfile[];
}
