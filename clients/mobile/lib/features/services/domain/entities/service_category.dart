/// Mirrors `programs/reputation/src/state.rs::ServiceCategory`. Order is
/// the on-chain Borsh discriminant — DO NOT reorder without bumping a
/// migration on the backend mirror.
enum ServiceCategory {
  dataFeed(0, 'Data feed', 'Price feeds, indexed data, oracle reads'),
  compute(1, 'Compute', 'Inference, transcoding, paid compute'),
  swap(2, 'Swap', 'DEX routes, aggregators'),
  rpc(3, 'RPC', 'Solana RPC, archival, geyser streams'),
  other(4, 'Other', 'Anything that doesn\'t fit another category');

  const ServiceCategory(this.onchainValue, this.label, this.hint);

  final int onchainValue;
  final String label;
  final String hint;

  static ServiceCategory fromOnchain(int value) {
    for (final c in ServiceCategory.values) {
      if (c.onchainValue == value) return c;
    }
    return ServiceCategory.other;
  }
}
