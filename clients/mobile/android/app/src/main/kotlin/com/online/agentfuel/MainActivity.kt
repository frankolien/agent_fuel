package com.online.agentfuel

import io.flutter.embedding.android.FlutterFragmentActivity

// FlutterFragmentActivity is required so local_auth can host the biometric
// prompt — the default FlutterActivity isn't a FragmentActivity and the
// prompt throws at runtime.
class MainActivity : FlutterFragmentActivity()
