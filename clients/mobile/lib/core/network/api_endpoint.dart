/// Every Agent Fuel HTTP route the mobile client speaks to lives here.
///
/// Two reasons for the indirection:
///   - One file to grep when a route renames upstream.
///   - Path parameters become explicit `String → String` builders, so the
///     callsite can't accidentally interpolate a typo.
///
/// Base URL lives in [AppEnv.apiBase] — these are *paths*, not URLs.
class ApiEndpoint {
  const ApiEndpoint._();

  // ── Auth (SIWS handshake) ────────────────────────────────────────────────
  static const authNonce = '/auth/nonce';
  static const authVerify = '/auth/verify';

  // ── Agents ───────────────────────────────────────────────────────────────
  static const agents = '/api/agents';
  static String agent(String pubkey) => '/api/agents/$pubkey';
  static String agentActivity(String pubkey) => '/api/agents/$pubkey/activity';
  static String agentScoreHistory(String pubkey) =>
      '/api/agents/$pubkey/score/history';
  static String agentBackfill(String pubkey) => '/api/agents/$pubkey/backfill';

  // ── Vaults ───────────────────────────────────────────────────────────────
  static const vaults = '/api/vaults';
  static String vault(String pubkey) => '/api/vaults/$pubkey';
  static String vaultActivity(String pubkey) => '/api/vaults/$pubkey/activity';
  static String vaultBackfill(String pubkey) => '/api/vaults/$pubkey/backfill';

  // ── Services ─────────────────────────────────────────────────────────────
  static const services = '/api/services';

  // ── Devices (push tokens) ────────────────────────────────────────────────
  static const devices = '/api/devices';
  static String device(int id) => '/api/devices/$id';

  // ── Public reputation lookup ─────────────────────────────────────────────
  static String reputation(String agent) => '/reputation/$agent';

  // ── WebSocket channels (paths only — full URL needs AppEnv.wsBase) ───────
  static String wsAgent(String pubkey) => '/ws/agents/$pubkey';
  static String wsVault(String pubkey) => '/ws/vaults/$pubkey';
  static String wsService(String pubkey) => '/ws/services/$pubkey';
}
