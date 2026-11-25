import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyRemoteActiveDatabasePointer,
  buildConnectionBackupBundle,
  buildDefaultBuiltInProfile,
  BUILTIN_DEFAULT_CONNECTION_ID,
  classifyConnectionFailure,
  consolidateBuiltInDuplicates,
  createOrUpdateConnectionProfile,
  deleteConnectionProfile,
  getActiveConnectionProfile,
  importConnectionBackupBundle,
  loadDatabaseConnectionLogs,
  loadDatabaseRegistry,
  mergeRemoteDatabaseRegistry,
  parseAndValidateConnectionBackup,
  rollbackDatabaseConnection,
  sanitizeDatabaseRegistryForFirestore,
  setDefaultConnectionProfile,
  stripSecretFields,
  switchActiveDatabaseConnection,
  validateConnectionProfile,
} from '../src/lib/dbConnectionManager';
import {
  deleteSecretRecord,
  getMaskedSecretStatuses,
  upsertSecretRecord,
} from '../server/dbSecretVault';
import type {
  DatabaseConnectionProfile,
  DatabaseConnectionRegistryState,
  DatabaseConnectionTestResult,
} from '../src/types/database';

test('built-in default profile loads cleanly without leaking secrets', () => {
  const builtIn = buildDefaultBuiltInProfile();
  assert.equal(builtIn.id, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(builtIn.providerType, 'firebase_firestore');
  assert.equal(builtIn.isBuiltIn, true);
  assert.ok(builtIn.firebaseConfig.projectId.length > 0);

  const reg = loadDatabaseRegistry();
  assert.equal(reg.activeConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(reg.defaultConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.ok(reg.profiles.some((p) => p.id === BUILTIN_DEFAULT_CONNECTION_ID));
});

test('stripSecretFields removes nested private keys, service accounts, and tokens', () => {
  const dirty = {
    name: 'Test DB',
    serviceAccountJson: '{"client_email":"a@b.iam.gserviceaccount.com"}',
    privateKey: '-----BEGIN PRIVATE KEY-----',
    cloudflareToken: 'cf-secret-token',
    nested: {
      projectId: 'my-project-123',
      apiSecret: 'super-secret',
      adminToken: 'tok',
    },
  };

  const cleaned = stripSecretFields(dirty) as Record<string, unknown>;
  assert.equal(cleaned.name, 'Test DB');
  assert.equal('serviceAccountJson' in cleaned, false);
  assert.equal('privateKey' in cleaned, false);
  assert.equal('cloudflareToken' in cleaned, false);
  const nested = cleaned.nested as Record<string, unknown>;
  assert.equal(nested.projectId, 'my-project-123');
  assert.equal('apiSecret' in nested, false);
  assert.equal('adminToken' in nested, false);
});

test('validateConnectionProfile enforces dynamic fields per provider type', () => {
  const validFirestore = buildDefaultBuiltInProfile();
  assert.equal(validateConnectionProfile(validFirestore).valid, true);

  const rtdbMissingUrl = {
    ...validFirestore,
    id: 'rtdb-test',
    providerType: 'firebase_realtime' as const,
    firebaseConfig: { ...validFirestore.firebaseConfig, databaseURL: '' },
  };
  const rtdbCheck = validateConnectionProfile(rtdbMissingUrl);
  assert.equal(rtdbCheck.valid, false);
  assert.ok(rtdbCheck.errors.some((e) => e.includes('Database URL')));

  const invalidApi = {
    ...validFirestore,
    id: 'custom-test',
    providerType: 'custom_api' as const,
    customApiConfig: {
      endpointUrl: 'ftp://invalid-endpoint',
      healthPath: '/health',
      authHeaderName: 'Authorization',
      useWorkerProxy: false,
    },
  };
  assert.equal(validateConnectionProfile(invalidApi).valid, false);
});

test('classifyConnectionFailure classifies real error reasons accurately', () => {
  assert.equal(classifyConnectionFailure(new Error('Request timeout exceeded')).status, 'timeout');
  assert.equal(
    classifyConnectionFailure({ code: 'permission-denied', message: 'Missing permissions' }).status,
    'permission_denied'
  );
  assert.equal(
    classifyConnectionFailure({ code: 'resource-exhausted', message: 'Quota exceeded' }).status,
    'quota_exceeded'
  );
  assert.equal(
    classifyConnectionFailure(new Error('API key not valid. Please pass a valid API key.')).status,
    'invalid_config'
  );
  assert.equal(
    classifyConnectionFailure({ code: 'unavailable', message: 'Failed to get document because the client is offline' }).status,
    'offline'
  );
});

test('CRUD guards, test-gated switching, rollback, and checksummed config backup', async () => {
  const created = createOrUpdateConnectionProfile(
    {
      id: 'staging-firestore-1',
      name: 'قاعدة البيانات التجريبية',
      providerType: 'firebase_firestore',
      firebaseConfig: {
        projectId: 'staging-rahaltv-123',
        apiKey: 'AIzaSyFakeTestKeyForUnitTestsOnly123456',
        authDomain: 'staging-rahaltv-123.firebaseapp.com',
        firestoreDatabaseId: '(default)',
        databaseURL: '',
        storageBucket: '',
        messagingSenderId: '1234567890',
        appId: '1:1234567890:web:abcdef123456',
      },
    },
    { uid: 'owner-1', name: 'Owner' }
  );

  assert.equal(created.isNew, true);
  assert.ok(created.registry.profiles.some((p) => p.id === 'staging-firestore-1'));

  // Safety gate: switching with a failed test must refuse and preserve active DB
  const failedTest: DatabaseConnectionTestResult = {
    ok: false,
    status: 'permission_denied',
    statusLabelAr: 'مشكلة في الصلاحيات',
    message: 'قواعد الأمان ترفض القراءة',
    testedAt: new Date().toISOString(),
    latencyMs: 42,
    canSwitchSafely: false,
    steps: [],
  };
  const blockedSwitch = await switchActiveDatabaseConnection(
    'staging-firestore-1',
    { uid: 'owner-1', name: 'Owner' },
    { verifiedTest: failedTest }
  );
  assert.equal(blockedSwitch.ok, false);
  assert.equal(getActiveConnectionProfile().id, BUILTIN_DEFAULT_CONNECTION_ID);

  // Passing verified test permits switching
  const passingTest: DatabaseConnectionTestResult = {
    ok: true,
    status: 'connected',
    statusLabelAr: 'متصل',
    message: 'تم الاتصال بنجاح',
    testedAt: new Date().toISOString(),
    latencyMs: 35,
    canSwitchSafely: true,
    steps: [],
  };
  const allowedSwitch = await switchActiveDatabaseConnection(
    'staging-firestore-1',
    { uid: 'owner-1', name: 'Owner' },
    { verifiedTest: passingTest }
  );
  assert.equal(allowedSwitch.ok, true);
  assert.equal(getActiveConnectionProfile().id, 'staging-firestore-1');

  // Cannot delete active profile
  const delActive = deleteConnectionProfile('staging-firestore-1');
  assert.equal(delActive.ok, false);

  // Set default & verify default cannot be deleted even after rollback
  const defRes = setDefaultConnectionProfile('staging-firestore-1');
  assert.equal(defRes.ok, true);

  // Rollback returns to previous built-in profile
  const rbRes = await rollbackDatabaseConnection({ uid: 'owner-1', name: 'Owner' });
  assert.equal(rbRes.ok, true);
  assert.equal(getActiveConnectionProfile().id, BUILTIN_DEFAULT_CONNECTION_ID);

  // Cannot delete while set as default
  assert.equal(deleteConnectionProfile('staging-firestore-1').ok, false);

  // Reset default to built-in, then unused profile deletes cleanly
  setDefaultConnectionProfile(BUILTIN_DEFAULT_CONNECTION_ID);

  // Export & verify backup bundle checksum
  const bundle = buildConnectionBackupBundle('Owner');
  const parsed = parseAndValidateConnectionBackup(JSON.stringify(bundle));
  assert.equal(parsed.valid, true);
  assert.equal(parsed.checksumMatched, true);

  // Tampered checksum is flagged
  const tampered = { ...bundle, profiles: [] };
  const parsedTampered = parseAndValidateConnectionBackup(JSON.stringify(tampered));
  assert.equal(parsedTampered.valid, true);
  assert.equal(parsedTampered.checksumMatched, false);

  // Delete unused staging profile, then restore via merge
  const delUnused = deleteConnectionProfile('staging-firestore-1');
  assert.equal(delUnused.ok, true);
  const imported = importConnectionBackupBundle(bundle, 'merge', { uid: 'owner-1', name: 'Owner' });
  assert.ok(imported.profiles.some((p) => p.id === 'staging-firestore-1'));
  deleteConnectionProfile('staging-firestore-1');

  assert.ok(loadDatabaseConnectionLogs().length > 0);
});

test('server dbSecretVault encrypts secrets on disk and returns masked status only', () => {
  const testConnId = 'unit-test-vault-conn';
  const vaultPath = path.resolve(process.cwd(), '.rahaltv-secrets.json');
  const existedBefore = fs.existsSync(vaultPath);
  const prevRaw = existedBefore ? fs.readFileSync(vaultPath, 'utf8') : null;

  try {
    const status = upsertSecretRecord({
      connectionId: testConnId,
      serviceAccountJson: JSON.stringify({
        type: 'service_account',
        project_id: 'unit-test-proj',
        client_email: 'bot@unit-test-proj.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\nSECRET_KEY_VALUE\n-----END PRIVATE KEY-----\n',
      }),
      apiSecret: 'secret-token-xyz',
      updatedBy: 'owner@example.com',
    });

    assert.equal(status.connectionId, testConnId);
    assert.equal(status.hasServiceAccount, true);
    assert.equal(status.hasApiSecret, true);
    assert.equal(status.serviceAccountClientEmail, 'bot@unit-test-proj.iam.gserviceaccount.com');
    assert.equal('private_key' in status, false);
    assert.equal('apiSecret' in status, false);

    // Ensure disk file does not store plaintext private key or apiSecret
    const onDisk = fs.readFileSync(vaultPath, 'utf8');
    assert.equal(onDisk.includes('SECRET_KEY_VALUE'), false);
    assert.equal(onDisk.includes('secret-token-xyz'), false);

    const allStatuses = getMaskedSecretStatuses();
    assert.equal(allStatuses[testConnId]?.hasServiceAccount, true);

    assert.equal(deleteSecretRecord(testConnId), true);
  } finally {
    if (prevRaw !== null) {
      fs.writeFileSync(vaultPath, prevRaw, { encoding: 'utf8', mode: 0o600 });
    } else if (fs.existsSync(vaultPath)) {
      fs.unlinkSync(vaultPath);
    }
  }
});

function hasAnyUndefinedValue(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasAnyUndefinedValue);
  if (value && typeof value === 'object') {
    return Object.values(value).some(hasAnyUndefinedValue);
  }
  return false;
}

test('sanitizeDatabaseRegistryForFirestore strips secrets, caps profiles & tombstones, and emits no undefined keys', () => {
  const builtIn = buildDefaultBuiltInProfile();
  const extraProfiles: DatabaseConnectionProfile[] = Array.from({ length: 30 }, (_, i) => ({
    ...builtIn,
    id: `custom-db-${i}`,
    name: `Custom DB ${i}`,
    isBuiltIn: false,
    firebaseConfig: {
      ...builtIn.firebaseConfig,
      projectId: `proj-${i}-abcd`,
      apiKey: `AIzaSyFakeKey${i}000000000000`,
    },
    lastStatusMessage: i % 2 === 0 ? undefined : 'ok',
    lastLatencyMs: i % 2 === 0 ? undefined : 25,
    // Inject dirty server secrets to verify stripping
    ...({
      serviceAccountJson: '{"private_key":"secret"}',
      apiSecret: 'super-secret',
    } as Record<string, unknown>),
  }));

  const deletedIds = Array.from({ length: 55 }, (_, i) => `deleted-conn-${i}`);

  const dirtyRegistry: DatabaseConnectionRegistryState = {
    version: 1,
    activeConnectionId: 'non-existent-id',
    previousConnectionId: 'also-missing',
    defaultConnectionId: 'custom-db-1',
    lastGoodConnectionId: 'non-existent-id',
    autoRetryEnabled: true,
    updatedAtMs: 1700000000000,
    deletedProfileIds: deletedIds,
    profiles: [builtIn, ...extraProfiles],
  };

  const sanitized = sanitizeDatabaseRegistryForFirestore(dirtyRegistry) as {
    profiles: Array<Record<string, unknown>>;
    deletedProfileIds: string[];
    activeConnectionId: string;
    previousConnectionId: string | null;
    defaultConnectionId: string;
    lastGoodConnectionId: string;
  };

  assert.equal(sanitized.profiles.length, 25);
  assert.equal(sanitized.deletedProfileIds.length, 40);
  assert.equal(sanitized.activeConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(sanitized.previousConnectionId, null);
  assert.equal(sanitized.defaultConnectionId, 'custom-db-1');
  assert.equal(sanitized.lastGoodConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(hasAnyUndefinedValue(sanitized), false);

  for (const prof of sanitized.profiles) {
    assert.equal('serviceAccountJson' in prof, false);
    assert.equal('apiSecret' in prof, false);
  }
});

test('mergeRemoteDatabaseRegistry deduplicates identical Firebase targets, remaps IDs, and honors deletedProfileIds tombstones', () => {
  const builtIn = buildDefaultBuiltInProfile();
  const sharedTarget = {
    projectId: 'shared-prod-999',
    apiKey: 'AIzaSySharedTestKeyForMergeTests1234',
    authDomain: 'shared-prod-999.firebaseapp.com',
    firestoreDatabaseId: '(default)',
    databaseURL: '',
    storageBucket: '',
    messagingSenderId: '999',
    appId: '1:999:web:shared999',
    measurementId: '',
  };

  const localProfileAddedOnMobile: DatabaseConnectionProfile = {
    id: 'mobile-added-dup',
    name: 'قاعدة الموبايل',
    description: '',
    providerType: 'firebase_firestore',
    isBuiltIn: false,
    firebaseConfig: sharedTarget,
    lastStatus: 'connected',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  };

  const localDeletedTarget: DatabaseConnectionProfile = {
    id: 'pc-removed-profile',
    name: 'Old DB',
    description: '',
    providerType: 'firebase_firestore',
    isBuiltIn: false,
    firebaseConfig: {
      ...sharedTarget,
      projectId: 'old-deleted-111',
      apiKey: 'AIzaSyOldDeletedKey11111111111111',
    },
    lastStatus: 'untested',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  const remoteCanonicalProfile: DatabaseConnectionProfile = {
    id: 'pc-canonical-id',
    name: 'قاعدة الكمبيوتر',
    description: '',
    providerType: 'firebase_firestore',
    isBuiltIn: false,
    firebaseConfig: sharedTarget,
    lastStatus: 'connected',
    createdAt: '2026-10-02T12:00:00.000Z',
    updatedAt: '2026-10-02T12:00:00.000Z',
  };

  const remoteExtraProfile: DatabaseConnectionProfile = {
    id: 'pc-extra-analytics',
    name: 'تحليلات إضافية',
    description: '',
    providerType: 'firebase_firestore',
    isBuiltIn: false,
    firebaseConfig: {
      ...sharedTarget,
      projectId: 'extra-analytics-222',
      apiKey: 'AIzaSyExtraAnalytics22222222222222',
    },
    lastStatus: 'untested',
    createdAt: '2026-10-02T12:00:00.000Z',
    updatedAt: '2026-10-02T12:00:00.000Z',
  };

  const localState: DatabaseConnectionRegistryState = {
    version: 1,
    activeConnectionId: 'mobile-added-dup',
    previousConnectionId: BUILTIN_DEFAULT_CONNECTION_ID,
    defaultConnectionId: 'mobile-added-dup',
    lastGoodConnectionId: 'mobile-added-dup',
    autoRetryEnabled: true,
    updatedAtMs: Date.parse('2026-10-01T10:00:00.000Z'),
    deletedProfileIds: [],
    profiles: [builtIn, localProfileAddedOnMobile, localDeletedTarget],
  };

  const remoteState: Partial<DatabaseConnectionRegistryState> = {
    version: 1,
    activeConnectionId: 'pc-canonical-id',
    previousConnectionId: BUILTIN_DEFAULT_CONNECTION_ID,
    defaultConnectionId: 'pc-canonical-id',
    lastGoodConnectionId: 'pc-canonical-id',
    autoRetryEnabled: false,
    updatedAtMs: Date.parse('2026-10-02T12:05:00.000Z'),
    deletedProfileIds: ['pc-removed-profile'],
    profiles: [builtIn, remoteCanonicalProfile, remoteExtraProfile],
  };

  const merged = mergeRemoteDatabaseRegistry(localState, remoteState);

  // Deduplicated identical Firebase target -> kept canonical PC profile, removed duplicate mobile ID
  assert.equal(merged.profiles.some((p) => p.id === 'mobile-added-dup'), false);
  assert.equal(merged.profiles.some((p) => p.id === 'pc-canonical-id'), true);
  // Extra remote profile pulled in
  assert.equal(merged.profiles.some((p) => p.id === 'pc-extra-analytics'), true);
  // Tombstoned profile removed when remote deletion timestamp >= local profile update time
  assert.equal(merged.profiles.some((p) => p.id === 'pc-removed-profile'), false);
  assert.ok(merged.deletedProfileIds?.includes('pc-removed-profile'));
  // Active/default pointers remapped cleanly and remote newer autoRetryEnabled applied
  assert.equal(merged.activeConnectionId, 'pc-canonical-id');
  assert.equal(merged.defaultConnectionId, 'pc-canonical-id');
  assert.equal(merged.lastGoodConnectionId, 'pc-canonical-id');
  assert.equal(merged.autoRetryEnabled, false);
});

test('built-in config matches rahaaltv-v1 and duplicate manual entries consolidate onto BUILTIN_DEFAULT_CONNECTION_ID', () => {
  const builtIn = buildDefaultBuiltInProfile();
  assert.equal(builtIn.firebaseConfig.projectId, 'rahaaltv-v1');
  assert.equal(builtIn.firebaseConfig.appId, '1:1046117254330:web:9c255dd2316917a224ae83');
  assert.equal(builtIn.firebaseConfig.firestoreDatabaseId, '(default)');

  // Manually adding the same built-in rahaaltv-v1 target consolidates onto BUILTIN_DEFAULT_CONNECTION_ID
  const dupCreate = createOrUpdateConnectionProfile(
    {
      name: 'RahaL TV Mobile Manual Add',
      providerType: 'firebase_firestore',
      firebaseConfig: { ...builtIn.firebaseConfig },
    },
    { uid: 'owner-1', name: 'Owner' }
  );
  assert.equal(dupCreate.isNew, false);
  assert.equal(dupCreate.profile.id, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(dupCreate.registry.profiles.length, 1);

  // Consolidating an existing dirty registry removes duplicate rahaaltv-v1 entries and remaps pointers
  const dupProfile: DatabaseConnectionProfile = {
    ...builtIn,
    id: 'db_mobile_duplicate_123',
    name: 'Mobile Added Copy',
    isBuiltIn: false,
    lastStatus: 'connected',
    lastTestedAt: '2026-11-25T10:00:00.000Z',
  };
  const dirtyState: DatabaseConnectionRegistryState = {
    version: 1,
    activeConnectionId: 'db_mobile_duplicate_123',
    previousConnectionId: BUILTIN_DEFAULT_CONNECTION_ID,
    defaultConnectionId: 'db_mobile_duplicate_123',
    lastGoodConnectionId: 'db_mobile_duplicate_123',
    autoRetryEnabled: true,
    updatedAtMs: 1000,
    deletedProfileIds: [],
    profiles: [builtIn, dupProfile],
  };

  const consolidated = consolidateBuiltInDuplicates(dirtyState);
  assert.equal(consolidated.changed, true);
  assert.equal(consolidated.state.profiles.length, 1);
  assert.equal(consolidated.state.profiles[0].id, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(consolidated.state.profiles[0].lastStatus, 'connected');
  assert.equal(consolidated.state.activeConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(consolidated.state.defaultConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(consolidated.state.lastGoodConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(consolidated.state.previousConnectionId, null);

  // Remote merge with duplicate built-in target also converges onto BUILTIN_DEFAULT_CONNECTION_ID
  const mergedDup = mergeRemoteDatabaseRegistry(dirtyState, {
    ...dirtyState,
    activeConnectionId: 'db_pc_duplicate_456',
    defaultConnectionId: 'db_pc_duplicate_456',
    lastGoodConnectionId: 'db_pc_duplicate_456',
    updatedAtMs: 2000,
    profiles: [builtIn, { ...dupProfile, id: 'db_pc_duplicate_456', name: 'PC Copy' }],
  });
  assert.equal(mergedDup.profiles.length, 1);
  assert.equal(mergedDup.activeConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);
  assert.equal(mergedDup.defaultConnectionId, BUILTIN_DEFAULT_CONNECTION_ID);

  // Remote active database pointer matching built-in config resolves cleanly to BUILTIN_DEFAULT_CONNECTION_ID
  const pointerRes = applyRemoteActiveDatabasePointer({
    connectionId: 'db_remote_alias_789',
    connectionName: 'Remote PC Alias',
    providerType: 'firebase_firestore',
    firebaseConfig: { ...builtIn.firebaseConfig },
  });
  assert.equal(pointerRes.switched, false);
  assert.equal(getActiveConnectionProfile().id, BUILTIN_DEFAULT_CONNECTION_ID);
});


