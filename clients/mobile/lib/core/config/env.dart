/// Compile-time defaults — overridable via --dart-define for staging/devnet
/// builds. Production values point at the live Agent Fuel backend on Railway.
class AppEnv {
  static const apiBase = String.fromEnvironment(
    'AGENT_FUEL_API_BASE',
    defaultValue: 'https://api.agentfuel.online',
  );

  static const wsBase = String.fromEnvironment(
    'AGENT_FUEL_WS_BASE',
    defaultValue: 'wss://api.agentfuel.online',
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
  static const identityUri = 'https://agentfuel.online';

  /// Brand mark wallets display next to "Agent Fuel" on the auth sheet.
  /// Some wallets (Solflare) fetch this server-side before showing the
  /// sheet — a 404 takes the whole flow down — so it must resolve to a
  /// real PNG. We host it from the repo via GitHub's raw CDN until the
  /// agentfuel.online web app is deployed; override via --dart-define
  /// when we ship a permanent URL.
  static const identityIconUri = String.fromEnvironment(
    'AGENT_FUEL_IDENTITY_ICON_URI',
    defaultValue:
        'https://raw.githubusercontent.com/frankolien/agent_fuel/main/assets/brand/icon.png',
  );

  /// Custom scheme for Phantom deep-link callbacks on iOS and shareable
  /// vault URLs. Configured in Info.plist + AndroidManifest.xml.
  static const deepLinkScheme = 'agentfuel';
}
