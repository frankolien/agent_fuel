/// Every Agent Fuel HTTP and WebSocket path the mobile client speaks to.
/// Base URLs live in [AppEnv]; these are paths only.
class ApiEndpoint {
  const ApiEndpoint._();

  static const authNonce = '/auth/nonce';
  static const authVerify = '/auth/verify';

  static const agents = '/api/agents';
  static String agent(String pubkey) => '/api/agents/$pubkey';
  static String agentActivity(String pubkey) => '/api/agents/$pubkey/activity';
  static String agentScoreHistory(String pubkey) =>
      '/api/agents/$pubkey/score/history';
  static String agentBackfill(String pubkey) => '/api/agents/$pubkey/backfill';

  static const vaults = '/api/vaults';
  static String vault(String pubkey) => '/api/vaults/$pubkey';
  static String vaultActivity(String pubkey) => '/api/vaults/$pubkey/activity';
  static String vaultBackfill(String pubkey) => '/api/vaults/$pubkey/backfill';

  static const services = '/api/services';

  static const devices = '/api/devices';
  static String device(int id) => '/api/devices/$id';

  static String reputation(String agent) => '/reputation/$agent';

  static String wsAgent(String pubkey) => '/ws/agents/$pubkey';
  static String wsVault(String pubkey) => '/ws/vaults/$pubkey';
  static String wsService(String pubkey) => '/ws/services/$pubkey';
}
