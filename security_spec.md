# FIND YOUR LOVE — Firestore Security Specification

## 1. Core Data Invariants
1. **PII Isolation**: Email addresses, full legal names, and exact dates of birth live exclusively in `/privateProfiles/{userId}` and are readable only by the owner (`request.auth.uid == userId`) or a verified administrator.
2. **Age Gate (18+)**: `/profiles/{userId}` enforces `age >= 18 && age <= 110` on every create and update.
3. **Privilege & Blue Tick Escalation Prevention**: Users create their own profile strictly with `membershipTier == 'free'`, `accountStatus == 'active'`, and `blueVerified == false`. Only a verified administrator (`isAdmin()`) can promote `membershipTier` to `'premium'`, set `blueVerified` to `true`/`false`, or suspend/restore `accountStatus`.
4. **Separated Free & Premium Membership Databases**: Free and Premium membership records live in separate collections (`/freeMemberships/{userId}` and `/premiumMemberships/{userId}`). Only verified administrators can write to `/premiumMemberships/{userId}`.
5. **Premium Capability Separation**: Premium members receive unlimited messaging, video introductions (`videoIntroUrl`), private photo albums (`/privateAlbums/{userId}`), priority discovery visibility, Country-to-Country & Advanced filters, Gold Premium badge, and full 6-dimension compatibility quizzes. Verified matched members can exchange real-time text, voice notes (`messageType == 'audio'`), photo/file attachments (`image`, `file`), typing indicators (`/matches/{matchId}/typing/{userId}`), and 1-on-1 WebRTC video calls (`/matches/{matchId}/calls/{callId}`), while Free members enforce daily outbound message caps.
6. **Email Verification Gate for Social Actions**: Unverified users cannot like, match, send messages, place calls, block, or submit reports (`request.auth.token.email_verified == true` required).
7. **Mutual Match Integrity**: A document in `/matches/{matchId}` can only be created when BOTH directional likes (`{uidA}_{uidB}` and `{uidB}_{uidA}`) exist with `action == 'like'` in the database/transaction.
8. **Conversation, Typing & Presence Privacy**: Messages, typing indicators, and WebRTC signaling calls in `/matches/{matchId}/messages`, `/matches/{matchId}/typing`, and `/matches/{matchId}/calls` are readable and writable only by the two verified participants of an active match, or an administrator. Only the original sender may delete their own message (`allow delete: if isSignedIn() && resource.data.senderUid == request.auth.uid`), and `/presence/{userId}` is readable only by the owner, matched partners, or an administrator (no `list`).
9. **Deterministic ID & Payload Bounding**: All IDs match `^[a-zA-Z0-9_\-]+$` (<= 128 chars), every string has explicit `.size()` bounds, and every array (`interests` <= 10, `participants` == 2, `photos` <= 4) is strictly bounded.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Assigned Premium**: Creating or updating `/profiles/{uid}` with `membershipTier: "premium"` or creating `/premiumMemberships/{uid}` as a regular user.
2. **Self-Assigned Blue Tick**: Creating or updating `/profiles/{uid}` with `blueVerified: true` as a regular user.
3. **Self-Unsuspend**: Updating `/profiles/{uid}` to set `accountStatus: "active"` when currently `"suspended"`, or changing `accountStatus` at all as a non-admin.
4. **Underage Profile**: Creating `/profiles/{uid}` with `age: 17`.
5. **Shadow Field Injection**: Updating `/profiles/{uid}` with an extra ghost key `{ firstName: "Amina", isAdmin: true }`.
6. **PII Scrape**: A signed-in user calling `get` or `list` on `/privateProfiles/{otherUid}` or `/premiumMemberships/{otherUid}`, or calling `list` on `/presence`.
7. **Admin Spoof (Unverified Email)**: Signing in with `email: "julius.wa.saka7@gmail.com"` where `email_verified: false` and attempting to grant a Blue Tick or read `/reports`.
8. **Unverified Messaging**: An authenticated user with `email_verified: false` attempting to create a document in `/matches/{matchId}/messages/{msgId}`.
9. **Unauthorized Private Album Access or Cross-User Message Deletion**: Creating a private album (`/privateAlbums/{uid}`) as a `'free'` member or deleting another participant's message in `/matches/{matchId}/messages`.
10. **Unilateral Forced Match**: User A creating `/matches/{uidA}_{uidB}` when User B has NOT liked User A (`likes/{uidB}_{uidA}` missing or `'pass'`).
11. **Eavesdropping on Foreign Chat or Private Album**: User C (not in `participants` / not matched) calling `get` or `list` on `/matches/{matchId}/messages`, `/matches/{matchId}/typing`, `/matches/{matchId}/calls`, `/presence/{otherUid}`, or `/privateAlbums/{otherUid}`.
12. **Denial of Wallet / Giant Payload**: Injecting a 10KB string into `bio` or `text`, or a 200-char document ID.
