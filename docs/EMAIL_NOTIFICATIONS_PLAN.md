# Southbound Coaching — Email System Replacement & Notification Architecture

## Purpose

This document captures the recommended plan for replacing EmailJS in Southbound Coaching with a server-side email system that is more secure, reliable, and scalable.

The core recommendation is:

**Southbound app → Firebase backend → email provider → recipient**

The browser should never contain SMTP passwords, email-provider API secrets, or other private credentials.

---

# 1. Why replace EmailJS?

Southbound currently sends email from browser-side JavaScript through EmailJS.

Current file:

`js/emailNotify.js`

The current implementation:
- Loads the EmailJS browser SDK from jsDelivr.
- Contains the EmailJS service/template/public-key configuration.
- Provides shared helper functions for email notifications.
- Uses separate templates for coach alerts and client updates.

Current notification helpers include:
- `sendBookingRequestEmail`
- `sendApplicationEmail`
- `sendInquiryEmail`
- `sendCheckinSubmittedEmail`
- `sendBookingResponseEmail`
- `sendCheckinReviewedEmail`

The current setup works, but it ties a core business function to a third-party browser-side service.

The goal is to move email delivery behind the Southbound backend so that:
- credentials stay private,
- email sending is not dependent on a user's browser session,
- failures can be handled centrally,
- notification logic can grow with the coaching platform,
- future in-app/email/push notifications can share one event system.

---

# 2. Recommended architecture

## Recommended stack

### Frontend
Southbound's existing HTML/CSS/JavaScript app.

### Backend
Firebase Cloud Functions.

### Email delivery
Resend.

### Database/event source
Firebase Firestore.

The basic architecture becomes:

**Southbound Client**
→ writes/updates Firestore
→ **Firebase Cloud Function**
→ **Resend**
→ email recipient

This is preferable to having the browser directly send the email.

---

# 3. Why Firebase Cloud Functions?

Southbound already uses Firebase for authentication and Firestore.

That means Cloud Functions fit the existing architecture without requiring a completely separate backend.

Cloud Functions can:
- react to Firestore changes,
- validate information,
- generate email content,
- call an external email API,
- keep API keys/secrets out of browser code,
- centralize notification logic.

Firebase Cloud Functions require the Blaze billing plan for deployed functions.

Firebase documentation:
https://firebase.google.com/docs/functions/quotas

Firebase notes that Blaze includes a no-cost tier for many Cloud Functions resources, although usage beyond the applicable free allowances can generate charges.

---

# 4. Why Resend?

Resend is a modern transactional email API designed for application-generated email.

Southbound could use it for:
- coach notifications,
- client notifications,
- booking confirmations,
- check-in notifications,
- plan publication notices,
- account/application notifications,
- future transactional email.

Potential Southbound sender:

`notifications@southboundcoaching.com`

or another branded address under the Southbound Coaching domain.

Resend API:
https://resend.com/features/email-api

API keys should remain server-side.

---

# 5. Important security rule

Never put any of the following in frontend JavaScript:

- Resend API key
- SMTP username/password
- Gmail OAuth secrets
- Firebase service-account credentials
- private backend credentials

The frontend is public.

Anyone who can load the Southbound site can inspect browser JavaScript.

Private email credentials belong in Firebase/Google-managed server-side secrets.

---

# 6. Event-driven email is better than browser-triggered email

A major improvement would be to make email a consequence of a successful application event.

For example:

### Current style

Browser:
1. Save check-in.
2. Attempt email.
3. Hope both succeed.

### Recommended style

Application:
1. Save check-in.
2. Server detects the new/updated Firestore record.
3. Cloud Function creates/sends the notification.
4. Email failure can be logged/retried independently.

This separates the core business action from the notification.

A client should not lose the fact that a check-in was submitted simply because an email provider temporarily failed.

---

# 7. Suggested notification event model

Southbound can eventually standardize its notification events.

Possible event types:

- `PLAN_PUBLISHED`
- `CHECKIN_SUBMITTED`
- `CHECKIN_REVIEWED`
- `BOOKING_REQUESTED`
- `BOOKING_APPROVED`
- `BOOKING_DECLINED`
- `WORKOUT_ASSIGNED`
- `WORKOUT_COMPLETED`
- `WORKOUT_MISSED`
- `MESSAGE_RECEIVED`
- `APPLICATION_RECEIVED`
- `ACCOUNT_APPROVED`

These events can later feed multiple delivery channels:

**One event**
→ In-App Notification
→ Email
→ Push Notification

This would prevent the application from having separate logic scattered throughout the codebase for every communication method.

---

# 8. Long-term notification architecture

A mature version of Southbound could use:

`notificationEvents/{eventId}`

with fields such as:

- `type`
- `clientUid`
- `coachUid`
- `recipientUid`
- `recipientEmail`
- `recipientName`
- `payload`
- `createdAt`
- `status`
- `emailStatus`
- `sentAt`
- `error`
- `attempts`

The exact Firestore schema should be finalized after reviewing Southbound's current data structures.

Do not introduce a new schema blindly. Existing data shapes and cloud-sync behavior should be inspected first.

---

# 9. Initial implementation plan

The migration should be incremental.

## Phase 1 — Backend foundation

Create a Firebase Functions project inside the existing Southbound repository.

Suggested structure:

```text
functions/
  src/
    index.js
    email/
      sendEmail.js
      templates.js
      notificationHandlers.js
  package.json
```

The exact structure can be adjusted to match the repository's current conventions.

The important thing is separation between:
- event handling,
- email sending,
- templates.

---

# 10. Phase 2 — Add Resend

Create a Resend account and verify the Southbound sending domain.

Recommended sender:

`notifications@southboundcoaching.com`

The sender identity should be a Southbound domain rather than a personal Gmail address.

Resend should be configured with the minimum required API permissions.

API key documentation:
https://resend.com/changelog/new-api-key-permissions

The Resend API key must be stored as a server-side secret.

---

# 11. Phase 3 — Create branded email templates

Southbound email should feel like Southbound.

Email design should use the established brand system.

Current Southbound brand direction includes:

- forest green
- sage
- tan
- cream
- stone
- Southbound SB mark
- clean athletic typography
- premium but approachable presentation

Emails should include:
- Southbound branding
- clear subject line
- short useful message
- primary action when appropriate
- minimal clutter
- mobile-friendly layout
- plain-text fallback
- Southbound contact information where appropriate

Do not rely on browser CSS or app stylesheets for email rendering. Email templates should be self-contained.

---

# 12. Initial email templates

## Coach alert

Used when something requires Eddie's attention.

Examples:

### New inquiry
Subject:
`New Southbound inquiry`

### New application
Subject:
`New Southbound application`

### New booking request
Subject:
`New booking request`

### New client check-in
Subject:
`New client check-in`

The coach email should summarize the useful information and provide a direct link to the relevant Southbound page.

---

## Client update

Used when an action has been completed by the coach/system.

Examples:

### Check-in reviewed
Subject:
`Your Southbound check-in has been reviewed`

### Booking approved
Subject:
`Your Southbound booking is confirmed`

### New plan published
Subject:
`Your new Southbound training plan is ready`

The email should link back to the Southbound app.

---

# 13. Phase 4 — Refactor `js/emailNotify.js`

Current file:

`js/emailNotify.js`

The migration should preserve the existing call sites as much as reasonably possible.

The long-term goal is that application code can still call clear functions such as:

```javascript
sendBookingRequestEmail(...)
sendApplicationEmail(...)
sendInquiryEmail(...)
sendCheckinSubmittedEmail(...)
sendBookingResponseEmail(...)
sendCheckinReviewedEmail(...)
```

but those functions no longer send through EmailJS.

Instead, the notification layer should either:

### Option A — create a Firestore notification/event record

or

### Option B — call a secure Firebase HTTPS/callable function

For Southbound's architecture, the event-driven Firestore approach is attractive because Firestore is already central to the application.

---

# 14. Preferred implementation pattern

Example:

Client submits a check-in.

Frontend:
```text
check-in saved successfully
        ↓
Firestore record exists
```

Backend:
```text
Cloud Function detects event
        ↓
validates data
        ↓
builds email
        ↓
calls Resend
        ↓
records result
```

The UI can immediately tell the client:

**Check-in submitted.**

Email delivery then becomes a backend responsibility.

---

# 15. Email failure behavior

Email failures should never silently destroy the underlying Southbound action.

For example:

If a client submits a check-in and email fails:

The check-in should still exist.

The system can:
- log the email failure,
- record the failed notification,
- retry where appropriate,
- allow the coach dashboard to surface the issue later.

A notification system should be treated as a delivery layer, not the source of truth for the business action.

---

# 16. Security considerations

Firestore rules need to ensure clients cannot forge privileged notification requests.

Do not create a client-writable mail collection where a client can simply specify:

`to = coach@southboundcoaching.com`

and arbitrary email content unless the write path is strongly validated.

Preferred pattern:

**Trusted application event**
→ server-side validation
→ server-generated notification

If a mail/event collection must be client-writable, Firestore rules should validate:
- authenticated user,
- allowed event type,
- permitted recipient,
- permitted fields,
- allowed document shape.

Cloud Function logic should perform its own validation too.

Security rules are not automatically deployed just because they exist in the repository.

When Firestore rules change, publish the rules through:

**Firebase Console → Firestore Database → Rules → Publish**

---

# 17. Email provider alternatives

## Firebase Trigger Email extension

Firebase also provides an official Firestore-triggered email extension.

Documentation:
https://firebase.google.com/docs/extensions/official/firestore-send-email

Concept:

Firestore mail document
→ Firebase extension
→ SMTP provider
→ recipient

The extension supports templates and listens to a Firestore collection.

This can reduce custom backend code.

However, it still requires an SMTP delivery service/provider, so it is not actually a complete replacement for the need for an email-delivery provider.

It may be useful for straightforward transactional email, but Southbound's growing notification system may benefit from owning the event/notification logic in Cloud Functions.

---

# 18. Gmail API alternative

Another option is the Gmail API.

Google's documentation supports server-side OAuth and Gmail sending.

Documentation:
https://developers.google.com/workspace/gmail/api/auth/web-server

Sending:
https://developers.google.com/workspace/gmail/api/guides/sending

Scopes:
https://developers.google.com/identity/protocols/oauth2/scopes

This is technically possible, but it is more complicated because of:
- OAuth authorization,
- token management,
- Google account dependencies,
- Gmail sending limitations,
- additional operational complexity.

For a professional transactional-email system, a dedicated email API is generally simpler to integrate.

---

# 19. EmailJS should remain temporarily during migration

Do not immediately delete EmailJS.

The safer migration sequence is:

1. Build server-side email system.
2. Send one notification type through the new system.
3. Test it.
4. Migrate the remaining notification types.
5. Confirm all existing workflows.
6. Remove frontend EmailJS dependency.
7. Remove old EmailJS configuration.
8. Update privacy/documentation.

This reduces the risk of breaking booking, application, inquiry, or check-in workflows.

---

# 20. Recommended migration order

Migrate in this order:

### 1. Application received
Simple notification.

### 2. Inquiry received
Simple notification.

### 3. Booking request
Important coach alert.

### 4. Booking response
Client-facing confirmation/decline.

### 5. Check-in submitted
Coach alert.

### 6. Check-in reviewed
Client notification.

### 7. Plan published
Important future notification.

This order moves from simple to increasingly integrated coaching functionality.

---

# 21. Future coaching notification system

Once the coaching platform is built out, email can become part of a broader communication system.

Example:

## Coach publishes plan

Event:

`PLAN_PUBLISHED`

Southbound can:

1. Update the client's published plan.
2. Show an in-app notification.
3. Send an email.
4. Optionally send a push notification.

The client sees:

**Your next training week is ready.**

The notification links directly to the weekly plan.

---

# 22. Future notification preferences

Clients should eventually have notification settings.

Possible preferences:

### Email
- Coaching updates
- Booking updates
- Check-in reminders
- Plan published
- Important account notices

### Push
- Workout reminders
- Coaching feedback
- Booking reminders
- New plan

### In-app
- Everything relevant to the account

A client should be able to control non-essential notifications while still receiving necessary account/transactional notices.

---

# 23. Southbound domain and sender identity

Because Southbound owns:

`southboundcoaching.com`

the eventual email system can use an official Southbound sender.

Examples:

`notifications@southboundcoaching.com`

`coach@southboundcoaching.com`

`hello@southboundcoaching.com`

Exact addresses can be chosen later.

The key principle is that the domain should make the communication feel like it comes from the platform itself rather than from a third-party tool.

---

# 24. Privacy page update

The current Southbound privacy page references Firebase/EmailJS.

After migration, update:

`privacy.html`

to reflect the actual services used.

The exact wording should match the final implementation rather than being written ahead of the actual architecture.

Potential categories to disclose include:
- Firebase
- Firebase Authentication
- Firestore
- Cloud Functions
- Resend
- any analytics/integration services actually in use

Do not claim that a service is being used until it is actually deployed.

---

# 25. Documentation updates

After migration, update:

`CLAUDE.md`

to document:
- email architecture
- notification flow
- backend functions
- environment/secret handling
- deployment steps
- test procedures
- supported notification types
- Firebase rules requirements

The documentation should explicitly say that email API credentials must never be committed to the public repository.

---

# 26. Testing plan

Before removing EmailJS, test every current email workflow.

## Application

Submit an application.

Verify:
- application data saved
- coach email received
- email formatting works
- email link works

## Inquiry

Submit inquiry.

Verify:
- inquiry saved
- coach email received

## Booking

Submit booking request.

Verify:
- request saved
- coach notified
- approve/deny flow still works
- client receives response

## Check-in

Submit check-in.

Verify:
- check-in saved
- coach notified

## Review

Coach reviews check-in.

Verify:
- feedback saved
- client receives notification

## Failure testing

Temporarily force an email failure.

Verify:
- underlying business data still saves
- failure is recorded/logged
- app does not falsely tell the user the business action failed merely because email failed

---

# 27. Deployment workflow

Southbound has an established preference for safe incremental development.

Recommended workflow:

1. Create a feature branch.
2. Inspect the current repository.
3. Implement backend foundation.
4. Add secrets securely.
5. Add one notification flow.
6. Test locally.
7. Run existing tests.
8. Deploy functions.
9. Test production notification.
10. Migrate remaining flows.
11. Remove EmailJS after verification.
12. Commit.
13. Push the feature branch.
14. Review.
15. Merge only after approval.

Do not make broad unrelated changes during the migration.

---

# 28. Important Southbound repository rules

Continue following the project's existing architecture rules.

### Inspect before editing

Always inspect the current code before changing it.

### Preserve existing data

Do not globally rename legacy EddieOS storage/cache identifiers.

Existing internal identifiers such as:

`eddieos-...`

may remain for backward compatibility.

They should not be shown in client-facing UI.

### Preserve cloud sync

Do not break existing Firebase/localStorage synchronization.

### New localStorage keys

Any new localStorage key should be registered with the current cloud-sync system according to the repository's established pattern.

### Shared components

Continue using:
- shared app header
- shared public header
- existing icon system
- existing design tokens

### Secrets

Never put private email credentials in public JavaScript.

---

# 29. How this fits the larger Southbound platform

The email system should not be treated as an isolated feature.

Southbound is being developed as a full coaching platform.

The larger model is:

**Coach owns the prescription.**

**Client owns the execution/results.**

**Southbound connects the two.**

The communication layer sits on top of this system.

Example:

Coach publishes:
- running workout
- strength session
- fueling guidance

Southbound creates:

`PLAN_PUBLISHED`

Then:

Client gets:
- updated plan
- in-app notification
- email
- eventually push notification

The same architecture can work for:
- check-ins
- missed workouts
- completed workouts
- coaching feedback
- bookings
- training milestones

---

# 30. Relationship to the future coaching architecture

Southbound's broader coaching model is expected to evolve toward:

```text
Coach
  ↓
Published Coaching Plan
  ↓
Scheduled Workouts
  ↓
Client Execution
  ↓
Workout Results
  ↓
Coach Review
  ↓
Plan Update
```

The notification layer can attach to each meaningful event.

For example:

```text
Coach publishes week
        ↓
PLAN_PUBLISHED
        ↓
In-App + Email
```

```text
Client completes check-in
        ↓
CHECKIN_SUBMITTED
        ↓
Coach In-App + Email
```

```text
Coach reviews check-in
        ↓
CHECKIN_REVIEWED
        ↓
Client In-App + Email
```

This creates a connected coaching loop rather than a collection of independent features.

---

# 31. Suggested first production version

The first production version does NOT need to implement the entire future notification engine.

Start with:

### Backend
- Firebase Cloud Functions
- Resend
- server-side secret

### Notifications
- application received
- inquiry received
- booking request
- booking response
- check-in submitted
- check-in reviewed

### Frontend
Keep the existing public function names while changing their implementation.

### Later
Add:
- plan published
- workout assigned
- workout reminders
- coach feedback
- push notifications
- client notification preferences
- notification history

---

# 32. End-state vision

The goal is not simply:

**“Get rid of EmailJS.”**

The real goal is:

**Build a Southbound-owned notification system that can support the entire coaching platform.**

That system should be:

- secure
- reliable
- branded
- scalable
- event-driven
- easy to maintain
- connected to Firestore
- independent of the browser
- capable of supporting email, in-app, and push notifications later

Southbound should ultimately have one notification architecture rather than separate notification logic scattered across individual pages.

---

# 33. Reference documentation

Firebase Trigger Email:
https://firebase.google.com/docs/extensions/official/firestore-send-email

Firebase Trigger Email templates:
https://firebase.google.com/docs/extensions/official/firestore-send-email/templates

Firebase Cloud Functions quotas:
https://firebase.google.com/docs/functions/quotas

Firebase Cloud Functions FAQ:
https://firebase.google.com/docs/functions/faq-and-troubleshooting

Gmail API server-side OAuth:
https://developers.google.com/workspace/gmail/api/auth/web-server

Gmail sending:
https://developers.google.com/workspace/gmail/api/guides/sending

Gmail OAuth scopes:
https://developers.google.com/identity/protocols/oauth2/scopes

Resend Email API:
https://resend.com/features/email-api

Resend API key permissions:
https://resend.com/changelog/new-api-key-permissions

---

# 34. Final recommendation

For Southbound Coaching, the target architecture should be:

**Firebase Cloud Functions + Resend + Firestore-driven notification events**

with EmailJS temporarily retained during migration.

The browser should create/update the actual Southbound data.

The backend should handle notifications.

Resend should handle email delivery.

That gives Southbound a clean foundation for the larger coaching platform being built.
