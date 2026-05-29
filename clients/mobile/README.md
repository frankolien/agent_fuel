# Agent Fuel Mobile

Flutter console for Agent Fuel vault owners. Manage agents, watch the spend feed, freeze vaults from your phone.

## Stack

- **State**: BLoC pattern (`flutter_bloc`)
- **Architecture**: Clean architecture — `domain` (entities, repository contracts, use cases) → `data` (datasources, models, repository implementations) → `presentation` (BLoCs, pages, widgets)
- **Navigation**: `auto_route` (code-generated)
- **DI**: `get_it` (hand-wired, kept small)
- **Error model**: `dartz` `Either<Failure, T>`
- **Networking**: `dio` (REST), `web_socket_channel` (live frames)
- **Wallet**: `solana_mobile_wallet_adapter` (Android), Phantom universal link (iOS) via `app_links`
- **Secure storage**: `flutter_secure_storage` + `local_auth`

## Layout

```
lib/
├── app/                      Theme, router, DI bootstrap
├── core/
│   ├── config/               Compile-time env (--dart-define)
│   ├── error/                Failure + exception types
│   ├── network/              Dio + interceptors
│   └── usecase/              UseCase base type
└── features/<name>/
    ├── data/
    │   ├── datasources/      Remote (REST / WS / chain)
    │   ├── models/           Wire-format models extending domain entities
    │   └── repositories/     Repository implementations
    ├── domain/
    │   ├── entities/         Pure business types
    │   ├── repositories/     Repository contracts
    │   └── usecases/         One class per business action
    └── presentation/
        ├── bloc/             Bloc + Event + State
        ├── pages/            Auto-routed pages
        └── widgets/          Page-scoped widgets
```

Features in 4.1: `fleet`, `vault`, `activity`, `wallet`, `onboarding`. Each follows the same shape.

## First-time setup

```bash
cd clients/mobile

# 1. Generate the native scaffolding (android/, ios/, web/)
flutter create --org online.agentfuel --project-name agent_fuel_mobile --platforms=android,ios .

# 2. Fetch packages
flutter pub get

# 3. Generate auto_route and injectable code
dart run build_runner build --delete-conflicting-outputs

# 4. Run
flutter run                       # picks the first available device
flutter run -d <device-id>        # explicit device
```

## Env overrides

```bash
flutter run \
  --dart-define=AGENT_FUEL_API_BASE=https://api.agentfuel.online \
  --dart-define=SOLANA_RPC_URL=https://api.devnet.solana.com \
  --dart-define=SOLANA_CLUSTER=devnet
```

Defaults are in [`lib/core/config/env.dart`](lib/core/config/env.dart).

## Deep links

Add to `android/app/src/main/AndroidManifest.xml` inside `<activity>`:

```xml
<intent-filter android:autoVerify="false">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="agentfuel" />
</intent-filter>
```

Add to `ios/Runner/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array><string>agentfuel</string></array>
  </dict>
</array>
```

## Status

| Slice | Scope | State |
|---|---|---|
| 4.1a | Read-only — REST list/detail, WS live frames | scaffolded, wire pending |
| 4.1b | Wallet connect — MWA (Android) + Phantom (iOS) | stubbed in `wallet/data/datasources` |
| 4.1c | Owner actions — approve policy, deposit, freeze | TODO |
| 4.2 | Push notifications via FCM | TODO |
| 4.3 | Dart SDK (`agent_fuel` pub package) | TODO |
