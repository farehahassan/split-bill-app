import 'package:flutter/material.dart';

import '../core/utils/money.dart';

/// The signed-in user for the showcase.
class UserProfile {
  const UserProfile({
    required this.name,
    required this.email,
    required this.initials,
  });

  final String name;
  final String email;
  final String initials;
}

const UserProfile currentUser = UserProfile(
  name: 'Ahmed Raza',
  email: 'ahmed@example.com',
  initials: 'A',
);

/// A group the user splits bills with.
class MockGroup {
  const MockGroup({
    required this.id,
    required this.name,
    required this.members,
    required this.icon,
    required this.totalSpent,
    this.youOwe,
    this.youAreOwed,
  });

  final String id;
  final String name;
  final int members;
  final IconData icon;

  /// Total spent inside the group (home screen).
  final Money totalSpent;

  /// What the user owes inside the group (groups screen).
  final Money? youOwe;

  /// What the user is owed inside the group (groups screen).
  final Money? youAreOwed;
}

/// A single transaction in the activity feed.
class MockActivity {
  const MockActivity({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
    required this.amount,
    this.isInflow = false,
    required this.dateLabel,
  });

  final String id;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final Color iconBackground;

  /// Signed amount; [isInflow] marks money coming back to the user.
  final Money amount;
  final bool isInflow;

  /// e.g. "Today", "Yesterday", "This week".
  final String dateLabel;
}

/// A friend the user has outstanding balances with.
class MockFriend {
  const MockFriend({
    required this.id,
    required this.name,
    required this.initials,
    this.youOwe,
    this.owesYou,
  });

  final String id;
  final String name;
  final String initials;

  /// Money the user owes this friend (red).
  final Money? youOwe;

  /// Money the friend owes the user (green).
  final Money? owesYou;
}

/// A line item on a scanned receipt.
class ReceiptItem {
  const ReceiptItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.total,
    this.unitPrice,
    this.assignedTo,
  });

  final String id;
  final String name;
  final int quantity;

  /// Total for this line, in minor units.
  final int total;

  /// Per-unit price, in minor units (shown as "600 ea").
  final int? unitPrice;

  /// Person the item is currently assigned to (null = unassigned).
  final String? assignedTo;

  ReceiptItem copyWith({String? assignedTo}) => ReceiptItem(
    id: id,
    name: name,
    quantity: quantity,
    total: total,
    unitPrice: unitPrice,
    assignedTo: assignedTo,
  );
}

/// A person participating in a receipt split.
class ReceiptPerson {
  const ReceiptPerson({required this.name, required this.initials});

  final String name;
  final String initials;
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const UserProfile user = currentUser;

const List<MockGroup> mockGroups = [
  MockGroup(
    id: 'g1',
    name: 'Trip to Naran',
    members: 5,
    icon: Icons.terrain,
    totalSpent: Money(4500000),
    youOwe: Money(1250000),
  ),
  MockGroup(
    id: 'g2',
    name: 'Roommates',
    members: 3,
    icon: Icons.apartment,
    totalSpent: Money(1240000),
    youAreOwed: Money(420000),
  ),
  MockGroup(
    id: 'g3',
    name: 'Office Lunch',
    members: 4,
    icon: Icons.fastfood,
    totalSpent: Money(680000),
    youOwe: Money(85000),
  ),
];

const List<MockActivity> mockActivities = [
  MockActivity(
    id: 'a1',
    title: 'Sana added Dinner @ Kolachi',
    subtitle: 'Today, 8:45 PM',
    icon: Icons.restaurant,
    iconColor: Color(0xFF0A3D2E),
    iconBackground: Color(0xFFE6F0EC),
    amount: Money(-150000),
    dateLabel: 'Today',
  ),
  MockActivity(
    id: 'a2',
    title: 'You added Uber to Airport',
    subtitle: 'Today, 7:30 PM',
    icon: Icons.directions_car,
    iconColor: Color(0xFF0E7490),
    iconBackground: Color(0xFFE0F2FE),
    amount: Money(70000),
    isInflow: true,
    dateLabel: 'Today',
  ),
  MockActivity(
    id: 'a3',
    title: 'You settled with Ali Raza',
    subtitle: 'Yesterday, 9:10 PM',
    icon: Icons.swap_horiz,
    iconColor: Color(0xFF16A34A),
    iconBackground: Color(0xFFE7F6EC),
    amount: Money(450000),
    isInflow: true,
    dateLabel: 'Yesterday',
  ),
  MockActivity(
    id: 'a4',
    title: 'Zara added Groceries',
    subtitle: 'Yesterday, 6:12 PM',
    icon: Icons.shopping_cart_outlined,
    iconColor: Color(0xFFB45309),
    iconBackground: Color(0xFFFEF3E2),
    amount: Money(-85000),
    dateLabel: 'Yesterday',
  ),
  MockActivity(
    id: 'a5',
    title: 'Omar paid for Movie tickets',
    subtitle: '2 days ago, 10:20 PM',
    icon: Icons.movie_outlined,
    iconColor: Color(0xFF7C3AED),
    iconBackground: Color(0xFFF3E8FF),
    amount: Money(-60000),
    dateLabel: 'This week',
  ),
  MockActivity(
    id: 'a6',
    title: 'Sara added Fuel for Naran trip',
    subtitle: '3 days ago, 4:05 PM',
    icon: Icons.local_gas_station,
    iconColor: Color(0xFF0A3D2E),
    iconBackground: Color(0xFFE6F0EC),
    amount: Money(-320000),
    dateLabel: 'This week',
  ),
];

const List<MockFriend> mockFriends = [
  MockFriend(id: 'f1', name: 'Ali Raza', initials: 'AR', youOwe: Money(450000)),
  MockFriend(
    id: 'f2',
    name: 'Sara Khan',
    initials: 'SK',
    owesYou: Money(800000),
  ),
  MockFriend(
    id: 'f3',
    name: 'Maha Tariq',
    initials: 'MT',
    owesYou: Money(420000),
  ),
];

/// People participating in the receipt split.
const List<ReceiptPerson> receiptPeople = [
  ReceiptPerson(name: 'You', initials: 'A'),
  ReceiptPerson(name: 'Zara', initials: 'Z'),
  ReceiptPerson(name: 'Omar', initials: 'O'),
];

/// Scanned receipt items. Totals sum to PKR 14,550.
const List<ReceiptItem> receiptItems = [
  ReceiptItem(
    id: 'i1',
    name: 'Chicken Karahi (Half)',
    quantity: 1,
    total: 240000,
    assignedTo: 'You',
  ),
  ReceiptItem(
    id: 'i2',
    name: 'Mint Margarita',
    quantity: 2,
    total: 120000,
    unitPrice: 60000,
    assignedTo: 'You',
  ),
  ReceiptItem(
    id: 'i3',
    name: 'Garlic Naan',
    quantity: 4,
    total: 60000,
    unitPrice: 15000,
    assignedTo: 'You',
  ),
  ReceiptItem(
    id: 'i4',
    name: 'Chicken Biryani',
    quantity: 2,
    total: 180000,
    unitPrice: 90000,
    assignedTo: 'Zara',
  ),
  ReceiptItem(
    id: 'i5',
    name: 'Kulfi Falooda',
    quantity: 1,
    total: 40000,
    assignedTo: 'Zara',
  ),
  ReceiptItem(
    id: 'i6',
    name: 'Zarda',
    quantity: 1,
    total: 100000,
    assignedTo: 'Zara',
  ),
  ReceiptItem(id: 'i7', name: 'Mutton Ribs', quantity: 1, total: 380000),
  ReceiptItem(
    id: 'i8',
    name: 'Cold Drinks',
    quantity: 3,
    total: 75000,
    unitPrice: 25000,
  ),
  ReceiptItem(
    id: 'i9',
    name: 'Kolachi BBQ Platter',
    quantity: 1,
    total: 260000,
  ),
];

/// Total bill of the scanned receipt, in minor units.
const int receiptTotalMinorUnits = 1455000;

/// Net balance summary for the home dashboard (in minor units).
const int netBalanceMinorUnits = -125000;
const int youOweMinorUnits = 245000;
const int youAreOwedMinorUnits = 120000;
