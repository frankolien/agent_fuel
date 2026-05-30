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
  static String wsAlerts(String owner) => '/ws/alerts/$owner';

  static const alerts = '/api/alerts';
  static const alertsUnreadCount = '/api/alerts/unread-count';
  static String alertRead(int id) => '/api/alerts/$id/read';
  static const alertsReadAll = '/api/alerts/read-all';

  static const spendsRequest = '/api/spends/request';
  static String spendApprove(int id) => '/api/spends/$id/approve';
  static String spendReject(int id) => '/api/spends/$id/reject';

  // Dev-only: returns 404 unless the backend was started with
  // AGENT_FUEL_USDC_MINT_AUTHORITY_PATH set.
  static const devAirdrop = '/api/dev/airdrop';
}
