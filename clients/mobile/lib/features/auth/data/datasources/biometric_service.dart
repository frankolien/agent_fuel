import 'package:local_auth/local_auth.dart';

class BiometricService {
  BiometricService({LocalAuthentication? auth})
      : _auth = auth ?? LocalAuthentication();

  final LocalAuthentication _auth;

  /// Prompts the user's fingerprint (or Face ID on iOS), with device PIN as
  /// fallback if no biometric is enrolled. Returns true on success, false on
  /// user cancel or failure.
  Future<bool> authorize(String reason) async {
    try {
      final supported = await _auth.isDeviceSupported();
      if (!supported) return true; // emulators / devices without sensors — let it pass
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
