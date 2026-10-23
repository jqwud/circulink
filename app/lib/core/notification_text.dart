import 'format.dart';

/// The title and body of a notification in the reader's language.
///
/// The server stores the notification's type and its values (`params`); this writes the sentence from them
/// with friendly dates. Rows without params (older ones, and announcements, which staff write themselves)
/// keep the server's own title and body. [tr] translates an English sentence (AppState.tr).
({String title, String body}) notificationText(Map<String, dynamic> n, String Function(String) tr, String lang) {
  final Map<String, dynamic> p = mapOf(n['params']);
  final String fallbackTitle = str(n['title']);
  final String fallbackBody = str(n['body']);
  if (p.isEmpty) return (title: fallbackTitle, body: fallbackBody);

  String fill(String english) {
    String out = tr(english);
    p.forEach((String k, dynamic v) => out = out.replaceAll('{$k}', str(v)));
    out = out.replaceAll('{dates}', fmtRange(str(p['start']), str(p['end']), lang));
    out = out.replaceAll('{end_date}', fmtDate(str(p['end']), lang));
    out = out.replaceAll('{until_date}', fmtDate(str(p['until']), lang));
    return out;
  }

  final bool hall = p['hall'] == true;
  switch (str(n['type'])) {
    case 'request_new':
      return (title: fill('{name} wants to borrow {item}'), body: fill('{dates}. Open Requests to approve or reject.'));
    case 'request_auto':
      return (title: fill('{name} is borrowing {item}'), body: fill(hall ? '{dates}. Hand it over at the barangay hall.' : '{dates}. Hand it over at the pickup point.'));
    case 'request_staff':
      return (title: fill('{name} requested {item}'), body: fill('The barangay will handle approval and handover for this item.'));
    case 'request_approved':
      return (title: fill('Approved: {item}'), body: fill(hall ? 'Pick it up at the barangay hall.' : 'Open the request to call or message the owner and agree on the pickup.'));
    case 'request_rejected':
      final String removed = str(p['removed']);
      if (removed.isNotEmpty) {
        final String why = removed == 'lost'
            ? 'The item was lost. Your credits were returned.'
            : removed == 'owner_left'
                ? 'The owner left Hiraman. Your credits were returned.'
                : 'Your credits were returned.';
        return (title: fill('Item removed: {item}'), body: fill(removed == 'hidden' ? 'The barangay is checking this item. Your credits were returned.' : why));
      }
      return (title: fill('Not approved: {item}'), body: str(p['reason']).isNotEmpty ? str(p['reason']) : fill('Your credits were returned.'));
    case 'request_cancelled':
      return (title: fill('Cancelled: {item}'), body: fill('The borrower cancelled the request.'));
    case 'request_cancelled_by_staff':
      return (title: fill('Cancelled by the barangay: {item}'), body: str(p['reason']));
    case 'item_hidden':
      return (title: fill('Hidden by the barangay: {item}'), body: str(p['reason']));
    case 'item_shown':
      return (title: fill('Visible again: {item}'), body: fill('Neighbors can see and borrow it again.'));
    case 'item_flagged':
      return (title: fill('The barangay is checking: {item}'), body: fill('Neighbors will see it once it has been checked. This keeps everyone safe.'));
    case 'request_dates_changed':
      return (title: fill('New dates for {item}'), body: fill('{dates}. Open Requests to approve or reject.'));
    case 'request_expired':
      final String why = str(p['why']) == 'no_answer' ? 'No answer within {days} days.' : 'It was not picked up by {end_date}.';
      return (title: fill('Request expired: {item}'), body: '${fill(why)}${p['refunded'] == true ? ' ${fill('Your credit was returned.')}' : ''}');
    case 'handover':
      return (title: fill('You have {item}'), body: fill('Please return it by {end_date}. Check in once a day in the app until you return it.'));
    case 'due_tomorrow':
      return (title: fill('Due tomorrow: {item}'), body: fill('Return by {end_date}. Pawsa is counting on you!'));
    case 'due_today':
      return (title: fill('Due today: {item}'), body: fill('Return by {end_date}. Pawsa is counting on you!'));
    case 'overdue':
      return (title: fill('Overdue: {item}'), body: fill('Return by {end_date}. Pawsa is counting on you!'));
    case 'owner_overdue':
      return (title: fill('Not back yet: {item}'), body: fill('It was due on {end_date}. The borrower has been reminded.'));
    case 'checkin_missed':
      return (title: fill('Please check in: {item}'), body: fill('You have not checked in for {days} day(s). Open the request and tap one answer.'));
    case 'checkin_alert':
      return (title: fill('No check-in for {days} days: {item}'), body: fill('The borrower has been reminded. The barangay can see this too.'));
    case 'checkin_problem':
      return (title: fill('{name} reported a problem with {item}'), body: str(p['note']));
    case 'borrower_returned':
      return (title: fill('{name} says {item} is back'), body: fill(hall ? 'The barangay will check it and confirm the return.' : 'Check the item, then tap Confirm return.'));
    case 'credit_earned':
      return (title: fill('+{n} credit'), body: fill('Thank you for lending {item}.'));
    case 'credit_capped':
      return (title: fill('Thanks for lending again'), body: fill('You reached the monthly reward limit for this neighbor, so no credit this time.'));
    case 'late_return':
      return (title: fill('Returned late'), body: fill('{n} credit was taken. Please return on time next time.'));
    case 'return_confirmed':
      return (title: fill('Return confirmed: {item}'), body: fill('Quick question: would you have bought or rented this otherwise?'));
    case 'dispute':
      return (title: fill('Return of {item} needs review'), body: fill('The barangay will contact you to settle this.'));
    case 'dispute_settled':
      final String outcome = switch (str(p['outcome'])) {
        'fine' => 'It was fine after all.',
        'accident' => 'It was an accident.',
        'borrower_fault' => 'The borrower was responsible.',
        _ => 'The item was lost.',
      };
      return (title: fill('Settled: {item}'), body: '${fill(outcome)} ${fill('Your credits: {credits}.')}');
    case 'verified':
      return (title: fill('Welcome to Hiraman!'), body: fill('Your account is verified. You have {n} starter credits.'));
    case 'verification_rejected':
      return (title: fill('Verification needs a fix'), body: str(p['reason']));
    case 'item_removed':
      return (title: fill('Your listing was removed: {item}'), body: str(p['reason']).isNotEmpty ? str(p['reason']) : fill('It did not follow the community rules.'));
    case 'report_resolved':
      return (title: fill('Your report was resolved'), body: str(p['outcome']));
    case 'wanted_offer':
      return (title: fill('{name} can help: {wanted}'), body: fill('Check My Items or message them at the barangay pickup point.'));
    case 'claim_new':
      return (title: fill('{name} claimed {item}'), body: fill('Agree on a pickup time in the messages.'));
    case 'claim_released':
      return (title: fill('{item} is free again'), body: fill('The person who claimed it cannot pick it up. It is offered to others again.'));
    case 'claim_cancelled':
      return (title: fill('The donor cannot give {item}'), body: fill('Sorry. Look for other free items, or post on the Wanted board.'));
    case 'claim_no_show':
      return (title: fill('Missed pickup: {item}'), body: fill('The donor says you did not come, so it is offered to others.'));
    case 'claim_paused':
      return (title: fill('Claiming paused'), body: fill('After missed pickups, you can claim donations again after {until_date}.'));
    case 'donate_paused':
      return (title: fill('Donating paused'), body: fill('After donations with problems, you can give items again after {until_date}.'));
    case 'claim_expired':
      return (title: fill('Reservation ended: {item}'), body: fill('The pickup was not confirmed in time, so it is offered to others again.'));
    case 'donation_given':
      return (title: fill('Given: {item}'), body: fill('Thank you for sharing with your neighbors.'));
    case 'donation_chosen':
      return (title: fill('The barangay chose you for {item}'), body: fill(p['delivery'] == true ? 'Barangay staff will bring it to you.' : 'Agree on a pickup time in the messages.'));
    case 'donation_chosen_donor':
      return (title: fill('The barangay chose a household for {item}'), body: fill(p['delivery'] == true ? 'Please bring it to the barangay hall.' : 'They will agree on a pickup time with you.'));
    case 'donation_not_chosen':
      return (title: fill('{item} went to another household'), body: fill('Thank you for asking. Watch Free to take for more.'));
    case 'donation_unclaimed':
      return (title: fill('Nobody has claimed {item} yet'), body: fill('Keep it listed longer, give it to the Barangay Shelf, or take it down.'));
    case 'donation_withdrawn':
      return (title: fill('Taken down: {item}'), body: fill('Nobody claimed it and there was no answer. You can list it again any time.'));
    case 'donation_to_shelf':
      return (title: fill('{item} is now on the Barangay Shelf'), body: fill('Thank you! Neighbors can borrow it from the barangay hall.'));
    case 'claim_message':
      if (p['staff'] == true) p['name'] = tr('Barangay staff');
      final String filC = str(p['preview_fil']);
      return (title: fill('{name} wrote about {item}'), body: lang == 'fil' && filC.isNotEmpty ? filC : str(p['preview']));
    case 'request_extended':
      return (title: fill('More time for {item}'), body: fill('Please return it by {end_date}.'));
    case 'shelf_paused':
      return (title: fill('Barangay items paused'), body: fill('After late returns, you can borrow Barangay items again after {until_date}.'));
    case 'message':
      if (p['staff'] == true) p['name'] = tr('Barangay staff');
      final String fil = str(p['preview_fil']);
      return (title: fill('{name} wrote about {item}'), body: lang == 'fil' && fil.isNotEmpty ? fil : str(p['preview']));
    default:
      return (title: fallbackTitle, body: fallbackBody);
  }
}
