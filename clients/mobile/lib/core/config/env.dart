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

  // Devnet USDC mint (Circle's faucet at usdcfaucet.com mints this one).
  // Override at build time when targeting mainnet.
  static const usdcMint = String.fromEnvironment(
    'AGENT_FUEL_USDC_MINT',
    defaultValue: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
  );

  static const identityName = 'Agent Fuel';

  static const identityUri = String.fromEnvironment(
    'AGENT_FUEL_IDENTITY_URI',
    defaultValue: 'https://agentfuel.online',
  );

  // Relative URI matches the canonical Espresso Cash example — wallets just
  // display it as a label without trying to fetch, sidestepping every
  // URL-validation footgun. Override with a full PNG URL when one exists.
  static const identityIconUri = String.fromEnvironment(
    'AGENT_FUEL_IDENTITY_ICON_URI',
    defaultValue: 'favicon.ico',
  );

  static const deepLinkScheme = 'agentfuel';

  static const reputationProgramId = String.fromEnvironment(
    'AGENT_FUEL_REPUTATION_PROGRAM',
    defaultValue: '4GjB4xdm1VTPVM6KSiEEfJpD4u7BfY1qDx77StiFShvQ',
  );

  static const creditVaultProgramId = String.fromEnvironment(
    'AGENT_FUEL_CREDIT_VAULT_PROGRAM',
    defaultValue: 'EsykPsafhHUeN7jA9DGqBiGuBsTBaFynLDVVpE4jFXDg',
  );
}
