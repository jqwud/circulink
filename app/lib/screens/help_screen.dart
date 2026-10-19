import 'package:flutter/material.dart';

import '../core/i18n.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/pawsa.dart';

/// M19: the rules in plain words.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final List<List<String>> rules = <List<String>>[
      <String>['How borrowing works', 'Find an item, choose dates (up to 14 days) and send a request. Quick-borrow items are approved right away. Others wait for the owner or barangay staff.'],
      <String>['Credits', 'You start with 3 credits. Borrowing costs 1 (2 for valuable items). Lenders earn 1 credit after a good, on-time return. Late returns cost the borrower 1.'],
      <String>['Handover and return', 'Meet at the pickup point. The owner confirms the handover and the return in the app. For some items a photo is taken.'],
      <String>['Damaged or lost items', 'Tell the owner right away. The barangay will help both sides settle it. No lending credit is given until then.'],
      <String>['Not allowed', 'Weapons, medicines, chemicals, fireworks, alcohol, cigarettes and other hazardous items.'],
      <String>['Your privacy', 'Neighbors see only your first name and purok. Your ID photo is seen only by barangay staff.'],
    ];
    return Scaffold(
      appBar: hiAppBar(context.t('Help and rules')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          const Center(child: PawsaImage(pose: 'wink', size: 90)),
          const SizedBox(height: 8),
          ...rules.map((List<String> r) => HiCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(context.t(r[0]), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    const SizedBox(height: 4),
                    Text(context.t(r[1]), style: const TextStyle(height: 1.4)),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}
