import 'service_category.dart';

class Service {
  const Service({
    required this.pubkey,
    required this.name,
    required this.category,
    required this.active,
    required this.totalAgentsServed,
    required this.totalVolumeReceivedUsdcMicro,
    required this.lastActiveSlot,
  });

  factory Service.fromJson(Map<String, dynamic> json) => Service(
        pubkey: json['pubkey'] as String,
        name: (json['name'] as String?) ?? '',
        category:
            ServiceCategory.fromOnchain((json['category'] as num).toInt()),
        active: json['active'] as bool? ?? false,
        totalAgentsServed: (json['total_agents_served'] as num?)?.toInt() ?? 0,
        totalVolumeReceivedUsdcMicro:
            (json['total_volume_received_usdc'] as num?)?.toInt() ?? 0,
        lastActiveSlot: (json['last_active_slot'] as num?)?.toInt() ?? 0,
      );

  final String pubkey;
  final String name;
  final ServiceCategory category;
  final bool active;
  final int totalAgentsServed;
  final int totalVolumeReceivedUsdcMicro;
  final int lastActiveSlot;

  double get totalVolumeReceivedUsdc =>
      totalVolumeReceivedUsdcMicro / 1000000.0;
}
