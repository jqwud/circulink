# Certificates

Certificates recognise residents who keep things in use over time. They are **recognition only**: no cash value, no goods, and not academic credit. Points stay what they were: proof of weighed items.

## Levels

The numbers live in `CERTIFICATE_LEVELS` in `server/src/rules.js`. Only **confirmed** points count, so pending or flagged points never qualify anyone.

| Level | Confirmed points | Received drop-offs | Different months | Issued |
|---|---|---|---|---|
| Certificate of Participation | 100 | 3 | 1 | At once, when the resident claims it |
| Certificate of Recognition | 500 | 8 | 3 | At once, when the resident claims it |
| Circular Champion | 2,000 | 15 | 6 | After an admin approves the request |

The drop-off and month minimums reward a habit. One large delivery made to qualify is not enough.

## Who signs

Two people sign every certificate:

1. **The head of the hub** where the resident kept the most kg in use: the school principal or the punong barangay. Admins enter the name and position under *Hubs and recyclers → Edit hub*. Without a name, the position is printed above an empty signature line.
2. **The CircuLink programme lead**, set by `CERTIFICATE_LEAD_NAME` and `CERTIFICATE_LEAD_TITLE` in `.env` or `docker.env`.

## Life cycle

- **Claiming.** In the app, the resident opens *Me → My certificates* and claims a level they qualify for. Before claiming, they agree that their name will be on the certificate.
- **Admin decisions.** In the portal, admins open *Certificates*. They can approve or decline a champion request, giving a reason when they decline. They can revoke an issued certificate, for example after an upheld flag, again with a reason. The resident is notified each time.
- **After a decision.** A resident can ask again after a decline. A revoked certificate cannot be claimed again.

## Checking a certificate

Every certificate has a code like `CL-7K3M-2QPA`.

- **For people:** `/certificates/<code>` is a printable page; use the browser's *Print → Save as PDF*.
- **For programs:** `/api/certificates/<code>` returns the same facts as JSON.

Both show only the name, the level, the hub, the kg kept, the months and the dates, plus whether the certificate is still valid. Pending and declined requests are not certificates, so their codes are not found.
