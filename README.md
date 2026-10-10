# School Management System

React + Vite frontend deployed on Vercel, with Firebase Authentication and Cloud Firestore. The application does not require Firebase Cloud Functions or Firebase Hosting and can use a Firebase Spark project for the supported workflows.

## Requirements and setup

- Node.js 22 LTS or newer and npm
- A Firebase project with Email/Password Authentication and Cloud Firestore enabled
- Firebase CLI for Firestore Rules deployment; emulator scripts use `npm exec` to fetch it when needed
- GitHub and Vercel accounts for hosted deployment

Install and configure the frontend:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Set the six `VITE_FIREBASE_*` values in `.env` and in Vercel project environment settings. These values are public browser configuration, not secrets. Never add Admin SDK credentials, service-account keys, or privileged credentials to the frontend, Vercel environment, or Git repository.

In Firebase Console, enable Email/Password under **Authentication → Sign-in method**, create a Firestore database, and add the Vercel domain under **Authentication → Settings → Authorized domains**. Vercel serves the frontend; this repository does not configure Firebase Hosting.

## First administrator (manual bootstrap)

The first app administrator is created manually by the Firebase project owner. No public bootstrap page, script, or Cloud Function is used.

1. In Firebase Console, open **Authentication → Users → Add user** and create the administrator's email/password account.
2. Copy the new account's UID.
3. Open **Firestore Database → Data**, create a collection named `users`, and create a document whose document ID is exactly that UID.
4. Add these fields with the indicated Firestore types:

   | Field | Type | Value |
   |---|---|---|
   | `uid` | string | The Auth UID |
   | `email` | string | The account email |
   | `displayName` | string | The administrator's name |
   | `role` | string | `admin` |
   | `active` | boolean | `true` |
   | `createdAt` | timestamp | Current time |
   | `updatedAt` | timestamp | Current time |

5. Sign into the Vercel website with that Auth account. Firestore Security Rules authorize access using this protected profile document, not Auth custom claims.

Do not let a user create or edit their own role. Firebase Console project owners can bypass Firestore Rules; keep project-owner access restricted to trusted operators.

Before app-managed school-data writes are enabled, create `systemConfig/sparkMigration` in Firestore Console with the boolean field `ready: true`. Do this only after deploying the Rules/indexes and completing the data/role/lock migration below. For a brand-new empty database with no legacy records, it can be marked ready after the initial admin profile and rules are verified. This document is deliberately not writable by the client and school-data mutations remain denied until it exists and is true.

## Adding staff, students, and families

An administrator must create the person's account under **Firebase Console → Authentication → Users** and set or distribute their password using Firebase's supported account-management workflow. The web application cannot create arbitrary Auth users or set trusted custom claims.

Then open **Admin → User management**, enter the existing Auth UID, email, display name, and role, and provision the Firestore `users/{uid}` profile. Administrators can change roles or disable a profile from that page. A disabled profile has no app role. Create teacher/student/parent school records separately in their relevant pages; linking a record to an account requires an existing profile with the appropriate role. Password resets are handled through the app's Firebase Authentication reset flow.

This two-step workflow is intentional: frontend validation and hidden controls are not a trusted identity or authorization mechanism.

## Roles and data authorization

Supported roles are `admin`, `director`, `teacher`, `registrar`, `student`, and `parent`. Role and active status are read from `users/{uid}`. Firestore Security Rules—not React route guards—authorize data reads and writes. Users may edit limited profile fields but cannot create their own profile or change their role or active status. Only admins can provision other profiles and change roles.

Rules default to deny. They validate document shapes and restrict school data by role. Direct Firestore access can only be used for operations whose authorization and invariants can be checked by Rules. Client-side validation improves error messages, but is not a security boundary. Related records are written in Firestore transactions where the operation requires atomicity.

### Known Spark-plan limitations

Firestore Rules cannot safely implement arbitrary server-side queries or redact fields from a document. The current model also keeps some related data together, so access to a permitted document may expose every field in that document. Review and migrate existing records before granting roles that should not see those fields.

Some multi-document business invariants (including all class count/capacity cases, bidirectional family links, legacy uniqueness locks, and assignment-wide timetable limits) cannot be proven by a transaction alone or fully reconstructed from arbitrary queries in Rules. These should not be described as protected just because the frontend uses a transaction. Where Rules cannot establish the invariant, the safe choices are to redesign the data model around rule-verifiable per-record documents/locks, restrict the operation to a trusted project administrator, or defer that operation until a trusted backend is available. Do not deploy new Rules over production data until its roles and lock documents have been migrated and backed up.

Timetable slot reservations use deterministic `timetableSlotLocks` documents, and the entry plus class/teacher/optional-room locks are written atomically. Rules check that each lock corresponds to the active entry, assigned class/teacher/subject, configured academic year, school day, and lesson-period map (`schoolSettings/timetable.periodsById`). The client must not update/delete a lock independently. Settings are initialized once through the app; edits to schedule-defining settings require a planned migration.

Because Firestore cannot redact fields from a document, full student, parent, and teacher records are currently readable only by admins/registrars or the linked individual. Director access to those full record collections and teacher assignments is intentionally denied until sanitized directory documents are introduced and migrated; class, subject, and timetable read access remains separately rule-controlled. Grant registrar access only to trusted staff because they can read and manage sensitive school records.

Legacy installations used custom claims and hashed lock document IDs. Before deploying the role-document Rules or canonical locks to an existing production database:

1. Export/back up the existing Firestore data.
2. Create and verify a `users/{uid}` profile for every account that should retain access, with correct role and active status.
3. Inventory duplicate admission numbers, class keys, employee IDs, subject codes, assignment keys, and timetable overlaps.
4. Rebuild the deterministic lock documents only after resolving conflicts. Never overwrite a lock to force deployment.
5. Test the migration on an isolated copy and deploy Rules/indexes only after confirming the app's role reads and record access.

The project does not automate production migration or lock reindexing. No migration script should be run against live data without explicit owner approval and a verified backup.

## Local development and tests

Run the app, unit tests, lint, and production build:

```powershell
npm run dev
npm test
npm run lint
npm run build
```

For local Authentication and Firestore emulators, install/run the Firebase CLI and Java:

```powershell
npm run emulators
```

In a second terminal:

```powershell
npm run dev:emulator
```

Emulator mode connects Auth on port `9099` and Firestore on `8080` using the demo project `demo-school-management`; it does not connect to or modify production. The emulator starts without Functions. Run the Firestore Rules suite (it starts and stops the Firestore emulator itself):

```powershell
npm run test:rules
```

The Rules checks cover user role escalation, admin profile provisioning, and competing transactions attempting to reserve the same timetable slot. Passing these focused tests does not certify every business invariant listed under Spark-plan limitations.

## Firebase deployment

Install the Firebase CLI if it is not already available, then deploy only the Firestore Rules and indexes:

```powershell
npm install --global firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

No Cloud Functions deployment is configured or required. The `functions/` folder is retained as legacy reference code and is not used by the frontend or Firebase deployment configuration; do not deploy it as part of this Spark architecture.

## Vercel deployment

1. Import the GitHub repository into Vercel as a Vite project.
2. Use `npm install` as the install command, `npm run build` as the build command, and `dist` as the output directory.
3. Add all six `VITE_FIREBASE_*` web configuration values to Vercel for the intended environments.
4. Deploy, then add the Vercel domain to Firebase Authentication's authorized domains.

`vercel.json` rewrites frontend routes to `index.html` so direct navigation and refreshes continue to work with React Router.
