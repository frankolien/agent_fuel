import 'package:dartz/dartz.dart';

import '../../../../core/error/exceptions.dart';
import '../../../../core/error/failures.dart';
import '../../domain/entities/connected_wallet.dart';
import '../../domain/repositories/wallet_repository.dart';
import '../datasources/auth_token_store.dart';
import '../datasources/mwa_datasource.dart';

class WalletRepositoryImpl implements WalletRepository {
  WalletRepositoryImpl(this._mwa, this._store);
  final MwaDataSource _mwa;
  final AuthTokenStore _store;

  @override
  Future<Either<Failure, ConnectedWallet>> connect() async {
    try {
      final result = await _mwa.authorize();
      await _store.save(
        authToken: result.authToken,
        pubkeyBase58: result.pubkeyBase58,
        walletUriBase: result.walletUriBase?.toString(),
        accountLabel: result.accountLabel,
      );
      return Right(_toEntity(result));
    } on WalletException catch (e) {
      return Left(WalletFailure(_messageFor(e)));
    } catch (e) {
      return Left(UnexpectedFailure(e.toString()));
    }
  }

  @override
  Future<Either<Failure, ConnectedWallet>> reauthorize(String authToken) async {
    try {
      final result = await _mwa.reauthorize(authToken);
      await _store.save(
        authToken: result.authToken,
        pubkeyBase58: result.pubkeyBase58,
        walletUriBase: result.walletUriBase?.toString(),
        accountLabel: result.accountLabel,
      );
      return Right(_toEntity(result));
    } on WalletException catch (e) {
      return Left(WalletFailure(_messageFor(e)));
    } catch (e) {
      return Left(UnexpectedFailure(e.toString()));
    }
  }

  @override
  Future<Either<Failure, Unit>> disconnect(String authToken) async {
    try {
      await _mwa.deauthorize(authToken);
      await _store.clear();
      return const Right(unit);
    } on WalletException {
      // Clear local state even if the wallet didn't respond — the user
      // wanted out, and a stale authToken is worse than a no-op deauthorize.
      await _store.clear();
      return const Right(unit);
    }
  }

  @override
  Future<ConnectedWallet?> cachedConnection() async {
    final cached = await _store.read();
    if (cached == null) return null;
    return ConnectedWallet(
      pubkeyBase58: cached.pubkey,
      authToken: cached.authToken,
      walletUriBase:
          cached.walletUri == null ? null : Uri.tryParse(cached.walletUri!),
      accountLabel: cached.accountLabel,
    );
  }

  ConnectedWallet _toEntity(MwaResult r) => ConnectedWallet(
        pubkeyBase58: r.pubkeyBase58,
        authToken: r.authToken,
        walletUriBase: r.walletUriBase,
        accountLabel: r.accountLabel,
      );

  String _messageFor(WalletException e) {
    switch (e.kind) {
      case WalletExceptionKind.noWalletInstalled:
        return 'No Solana wallet found on this device. Install Phantom, '
            'Solflare, Backpack, or use Seeker\'s Seed Vault Wallet.';
      case WalletExceptionKind.userCancelled:
        return 'Connection cancelled. Tap Connect wallet to try again.';
      case WalletExceptionKind.unsupportedPlatform:
        return 'Wallet connect is Android-only for now.';
      case WalletExceptionKind.protocol:
      case WalletExceptionKind.unknown:
        return e.message;
    }
  }
}
