class AppEnv {
  // Default to Railway's raw subdomain rather than the custom domain — DNS
  // for `api.agentfuel.online` can take a while to propagate to every
  // device's system resolver, and Flutter's HTTP stack hard-fails on it.
  // Override with --dart-define once the CNAME is stable on the target.
  static const apiBase = String.fromEnvironment(
    'AGENT_FUEL_API_BASE',
    defaultValue: 'https://jx0m4jn1.up.railway.app',
  );

  static const wsBase = String.fromEnvironment(
    'AGENT_FUEL_WS_BASE',
    defaultValue: 'wss://jx0m4jn1.up.railway.app',
  );

  static const rpcUrl = String.fromEnvironment(
    'SOLANA_RPC_URL',
    defaultValue: 'https://api.devnet.solana.com',
  );

  static const cluster = String.fromEnvironment(
    'SOLANA_CLUSTER',
    defaultValue: 'devnet',
  );

  static const identityName = 'Agent Fuel';

  static const identityUri = String.fromEnvironment(
    'AGENT_FUEL_IDENTITY_URI',
    defaultValue: 'https://github.com/frankolien/agent_fuel',
  );

  // Relative URI matches the canonical Espresso Cash example — wallets just
  // display it as a label without trying to fetch, sidestepping every
  // URL-validation footgun. Override with a full PNG URL when one exists.
  static const identityIconUri = String.fromEnvironment(
    'AGENT_FUEL_IDENTITY_ICON_URI',
    defaultValue: 'favicon.ico',
  );

  static const deepLinkScheme = 'agentfuel';
}
