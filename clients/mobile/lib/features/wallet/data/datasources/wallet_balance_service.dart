import 'package:solana/solana.dart';

import '../../../../core/config/env.dart';

typedef WalletBalance = ({int solLamports, int usdcMicro});

class WalletBalanceService {
  WalletBalanceService({RpcClient? rpc})
      : _rpc = rpc ?? RpcClient(AppEnv.rpcUrl);

  final RpcClient _rpc;

  Future<WalletBalance> fetch(String ownerBase58) async {
    final owner = Ed25519HDPublicKey.fromBase58(ownerBase58);
    final mint = Ed25519HDPublicKey.fromBase58(AppEnv.usdcMint);

    final solRes = await _rpc.getBalance(owner.toBase58());
    final solLamports = solRes.value;

    int usdcMicro = 0;
    try {
      final ata = await findAssociatedTokenAddress(owner: owner, mint: mint);
      final tokRes = await _rpc.getTokenAccountBalance(ata.toBase58());
      usdcMicro = int.parse(tokRes.value.amount);
    } catch (_) {
      // ATA may not exist yet — that's just a zero balance, not an error.
    }
    return (solLamports: solLamports, usdcMicro: usdcMicro);
  }
}
