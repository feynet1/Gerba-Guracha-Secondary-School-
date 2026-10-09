# School Management System

The frontend is a React + Vite single-page application deployed on Vercel. Firebase provides Authentication, Firestore, and Cloud Functions; Firebase Hosting is not used for the frontend.

## Prerequisites

- Node.js 22 LTS or newer (the deployed Cloud Functions runtime and installed Admin SDK require Node 22)
- npm 10 or newer
- Firebase CLI for Firebase backend services
- A Firebase project with Authentication, Firestore, and Cloud Functions enabled
- GitHub and Vercel accounts for hosted deployment

## Installation

```bash
npm install
cd functions
npm install
cd ..
```

## Environment Configuration

Create a local `.env` from `.env.example` and enter the Firebase web app configuration values:

```bash
copy .env.example .env
```

On macOS/Linux, use `cp .env.example .env`. Vite reads `.env` during development and build. Do not commit `.env` or `.env.local`; they are ignored by Git. Values beginning with `VITE_` are included in the browser bundle and must never contain private keys, service-account credentials, or other server secrets.

Required variables:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

## Firebase Console Configuration

1. Create or select the Firebase project.
2. Enable Authentication and the Email/Password sign-in method.
3. Enable Firestore and Cloud Functions.
4. In Firebase Authentication settings, add the deployed Vercel domain (for example, `your-project.vercel.app`) under **Authorized domains**. Add a custom domain there too if one is configured later.
5. Use the Firebase web app configuration in local `.env` and Vercel environment variables.

## Initial Admin Bootstrap

The first app administrator must be set up once from a trusted computer. This is separate from Firebase Console project ownership and is not a public frontend page.

1. In Firebase Console, enable **Authentication → Sign-in method → Email/Password**.
2. Under **Authentication → Users**, create the account to promote.
3. Install the Google Cloud CLI and authenticate with an account that has Firebase Authentication and Firestore administrative permissions:
   ```powershell
   gcloud auth application-default login
   gcloud config set project gerba-guracha-secondary-school
   ```
4. From the `functions` folder, run the bootstrap script with the account's email:
   ```powershell
   cd "C:\Intel\PROJECT WEB-BASED\SCHOOL MANAGEMENT SYSTEM\functions"
   npm install
   node .\bootstrap-admin.cjs account@example.com
   ```

The script assigns the Firebase Custom Claim `role: admin` and creates or updates `users/{uid}`. It refuses to promote another account if an admin already exists, and refuses to replace a different existing role. It never handles or stores the account password. After success, sign in again so Firebase refreshes the ID token and the app can read the new claim.

Do not expose a public endpoint for first-admin setup or commit service-account credentials. The script is safe to keep in the repository because it contains no credentials and requires private Application Default Credentials on the machine running it.

## Roles and Authentication

Roles are enforced through Firebase Authentication Custom Claims:

- `admin`
- `director`
- `teacher`
- `registrar`
- `student`
- `parent`

The client reads claims via `getIdTokenResult()`. Frontend route guards provide navigation behavior only; Firestore rules and Cloud Functions remain the backend authorization boundary.

## Local Development and Tests

```bash
npm run dev
npm test
```

To preview a production build locally:

```bash
npm run build
npm run preview
```

### Free local Firebase Emulator development

Cloud Functions cannot be deployed to the Spark plan, but you can run the app's Auth, Firestore, and callable Functions locally without upgrading. Emulator data is local to your computer and does not appear in the live Firebase project.

1. Ensure the normal Firebase web-app settings are present in `.env` or `.env.local`. Emulator mode overrides the project ID to `demo-phase3` and only connects services to localhost.
2. In a terminal at the repository root, start Auth, Firestore, Functions, and the Emulator UI:

   ```powershell
   $env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-25.0.4.101-hotspot'
   $env:Path = "$env:JAVA_HOME\bin;$env:Path"
   npm.cmd run emulators
   ```

   Java must be installed; adjust `JAVA_HOME` if its installation path differs. The script uses Node 22 for the Functions emulator (downloading the runtime through npm on first use if needed) and allows extra time for initial Functions discovery. Emulator data is temporary unless explicitly exported.
3. In another PowerShell terminal, create a local-only administrator (choose a password for emulator testing):

   ```powershell
   $env:LOCAL_ADMIN_PASSWORD = 'ChooseYourOwnLocalPassword'
   node .\functions\bootstrap-emulator-admin.cjs feymesay@gmail.com
   Remove-Item Env:LOCAL_ADMIN_PASSWORD
   ```

   This helper is hard-wired to the demo project and local Auth/Firestore emulators; it does not use production credentials or contact the live project.
4. In a third terminal, run the Vite app in emulator mode:

   ```powershell
   npm.cmd run dev:emulator
   ```

5. Sign in using the local admin email and password. Emulator UI is available at `http://127.0.0.1:4000`.

Normal `npm run dev` mode is unchanged. Only `npm run dev:emulator` enables emulator connections, and only in Vite development mode. The browser connects to Auth `9099`, Firestore `8080`, and Functions `5001`.

## GitHub to Vercel Deployment

1. Push the project to the GitHub repository.
2. In Vercel, choose **New Project → Import Git Repository** and select the project repository.
3. Configure the project as follows:
   - Framework preset: **Vite**
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `dist`
4. In Vercel **Project Settings → Environment Variables**, add all six `VITE_FIREBASE_*` values above for Production, Preview, and Development as appropriate. Do not enter Admin SDK or private credentials.
5. Deploy. Vercel builds and serves the `dist/` output and creates Preview deployments for branches and pull requests. Pushes to the production branch trigger Production deployments.

`vercel.json` rewrites frontend paths to `/index.html` without changing the browser URL, so direct navigation and refreshes for routes such as `/login` and `/admin/users` reach the React Router app.

## Firebase Backend Deployment

Deploy Firebase backend resources separately from the Vercel frontend:

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes,functions
```

Do not use Firebase Hosting to deploy the frontend. Firebase configuration in this repository does not configure a Hosting target.

## Cloud Functions

Implemented functions:

- `healthCheck`
- `createUser`
- `setUserRole`
- Phase 2 student, parent, guardian, and class callables (listed below)

User administration requires the `admin` custom claim. Phase 2 mutations require the `admin` or `registrar` claim; read callables require `admin`, `registrar`, or `director`. Student and parent self-service callable reads verify the corresponding role and account-to-record link.

## Firestore Security

Firestore rules use verified custom claims and deny direct client writes to `students`, `parents`, `classes`, admission-number locks, class-key locks, and account-link locks. Admin SDK callable functions perform authorized writes. Admin, registrar, and director can read school records; linked students and parents use narrowly scoped callable profile reads instead of broad collection reads. Teachers have no Phase 2 student access because teacher-to-class assignments do not exist yet. The `users/{uid}` document is informational; custom claims are authoritative, and clients cannot change role claims.

## Phase 2 Student, Parent, and Class Management

### Firestore model

- `students/{studentId}` contains an immutable `admissionNumber`, name fields, `gender`, optional Firestore `dateOfBirth`, `grade`, `classId`, `sectionId`, display `section`, controlled `stream` (`natural`, `social`, or `null`), `parentIds`, contact fields, `enrollmentYear`, `status`, and audit fields (`createdAt`, `createdBy`, `updatedAt`, `updatedBy`). Search-only lowercase name/admission fields support prefix search.
- `parents/{parentId}` contains names, controlled `relationship`, contact details, optional `userId`, `studentIds`, `status`, and audit fields.
- `classes/{classId}` contains derived `name`, `grade`, `section`, controlled `stream`, `academicYear`, `capacity`, `active`, transactional active `studentCount` and total `assignedStudentCount`, and audit fields.
- `admissionNumbers/{sha256}` is a server-only uniqueness lock pointing to a student ID. It prevents duplicate admission numbers under concurrent registration.
- `classKeys/{sha256}` is a server-only uniqueness lock for grade/section/stream/academic-year combinations.
- `accountLinks/{uid}` is a server-only link lock preventing one Auth account from linking to multiple student/parent records.

Grades 9 and 10 require a null stream. Grades 11 and 12 require `natural` or `social`. Class capacity is enforced transactionally for active students. Deactivation frees capacity; reactivation checks capacity again. Records are deactivated rather than physically deleted.

### Routes

- `/students`, `/students/new`, `/students/:studentId`, `/students/:studentId/edit`
- `/classes`, `/classes/:classId`, `/classes/:classId/edit`
- `/parents`, `/parents/:parentId`, `/parents/:parentId/edit`
- `/student/profile` (the linked student's own limited profile)
- `/parent/children` (only children linked to the signed-in parent)

Admin and registrar can manage records. Director access is read-only. Students and parents have only their linked profile views. Search is prefix-based for admission number and names; student results support grade, section, stream, gender, and status filters, with bounded pages. Parent records are paginated; class selection and class lists are capped.

### Cloud Functions

- `createStudent`, `updateStudent`, `assignStudentToClass`, `updateStudentStatus`, `listStudents`, `getStudent`
- `createParent`, `updateParent`, `getParent`, `linkParentToStudent`, `linkParentAccount`, `getMyLinkedStudents`
- `createClass`, `updateClass`, `getClass`
- `linkStudentAccount`, `getMyStudentProfile`

The functions derive actor IDs from the verified callable context, validate controlled values and references, maintain both sides of parent/student links in transactions, and do not trust client audit fields. Parent/student account linking is explicit; parent Auth accounts are not created automatically.

### Indexes and deployment

`firestore.indexes.json` includes the composite indexes used for student grade/status pagination, class roster ordering, class listing, and active-parent ordering. Deploy the backend and rules before using the new routes:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

No new frontend environment variables or private credentials are required. The existing six `VITE_FIREBASE_*` variables remain the only frontend configuration.

### Permissions

| Role | Student/class/parent list and profile | Create/edit/assign/archive |
|---|---|---|
| Admin | All records | All Phase 2 operations |
| Registrar | All records | All Phase 2 operations |
| Director | Read-only | None |
| Teacher | No Phase 2 access until class assignment exists | None |
| Student | Own linked limited profile | None |
| Parent | Linked children only | None |

### Verification and remaining work

The Phase 2 UI uses English and Afaan Oromo translations and responsive Material UI forms/lists. Run `npm.cmd run build`, `npm.cmd run lint`, and `npm.cmd test` on Windows PowerShell systems where script execution policy blocks the `npm.ps1` shim. Firebase Emulator integration/security tests still need to be run against a configured emulator/project before production data is used.

Not included in Phase 2: attendance, marks/results, reporting, SMS, and Ethiopian calendar conversion.

## Phase 3 Staff, Subjects, Assignments, and Timetable

### Firestore collections

- `teachers/{teacherId}` stores a staff profile and optional link to an existing Auth user. Passwords are never stored. `employeeIds/{sha256}` is a server-only lock for employee ID uniqueness. Lowercase search fields support bounded prefix lookups.
- `subjects/{subjectId}` stores a unique code, configurable grade and stream applicability, periods per week, active state, and audit fields. `subjectCodes/{sha256}` enforces unique codes.
- `teacherAssignments/{assignmentId}` is the authoritative teacher/class/subject/year relationship. `teacherAssignmentKeys/{sha256}` prevents duplicate active assignments. `assignmentScheduleUsage/{assignmentId}` transactionally caps scheduled timetable entries at the assignment weekly period count.
- `schoolSettings/timetable` stores the configured academic year, school days, non-overlapping periods and breaks, optional rooms, time zone, optional daily class limit, and active schedule count. Periods use stable IDs and 24-hour `HH:MM` times.
- `timetable/{entryId}` stores a scheduled lesson referencing an active assignment. It records IDs, academic year, configured day/period/time, optional room, active state, and audit fields.
- `timetableSlotLocks/{sha256}` stores active reservations by resource/day/year. Transactions read and update class, teacher, and optional room lock documents so overlapping schedules cannot both commit. Half-open interval overlap uses `newStart < oldEnd && newEnd > oldStart`.

Grades 9 and 10 use the Phase 2 `stream: null` class convention. Grades 11 and 12 use `natural` or `social`. Subject applicability for lower grades is grade-based; stream applicability is enforced for upper grades. Assignments and timetable entries must match the class academic year and configured period times. Break periods cannot be scheduled. Timetable settings cannot change while active lessons exist; deactivate entries first.

### Routes and access

- `/teachers`, `/teachers/new`, `/teachers/:teacherId`, `/teachers/:teacherId/edit`, `/teacher/profile`
- `/subjects`, `/subjects/new`, `/subjects/:subjectId`, `/subjects/:subjectId/edit`
- `/teacher-assignments`, `/teacher-assignments/new`
- `/timetable`, `/timetable/classes/:classId`, `/timetable/teachers/:teacherId`, `/timetable/new`, `/timetable/:entryId/edit`, `/timetable/settings`

Admin manages staff, subjects, assignments, and timetable settings/entries. Director has read-only access to staff (without contact fields), subjects, assignments, and timetables. A teacher can read their own linked profile/assignments/timetable and shared subject information; teachers cannot edit employment or assign themselves. Registrar, student, and parent have no Phase 3 staff/assignment/timetable access.

Teacher linking uses an existing Auth UID and verifies its `teacher` custom claim; it never creates an Auth account. Teacher and subject deactivation preserves historical assignment and timetable documents. New assignments require active teacher/class/subject records. Existing schedule entries must be explicitly deactivated before settings are changed.

### Cloud Functions

Phase 3 adds `createTeacher`, `updateTeacher`, `linkTeacherAccount`, `getTeacher`, `listTeachers`, `getMyTeacherProfile`; `createSubject`, `updateSubject`, `getSubject`, `listSubjects`; `createTeacherAssignment`, `updateTeacherAssignment`, `listTeacherAssignments`; `getTimetableSettings`, `saveTimetableSettings`; and `createTimetableEntry`, `updateTimetableEntry`, `getTimetableEntry`, `deactivateTimetableEntry`, `listTimetable`. Admin SDK writes validate claims, references, status, assignment compatibility, configured periods and rooms, and are protected by transactional unique-key and slot-lock documents.

### Indexes, configuration, and deployment

The required composite indexes for staff status, subject applicability, assignments, and class/teacher timetables are in `firestore.indexes.json`. Firebase may provide an additional index link if a newly introduced filter combination requires another composite index.

Before creating assignments or timetable entries, sign in as an administrator and open **Timetable settings**. Configure the school's academic year exactly as recorded on the Phase 2 classes, select its school days, add each period and break with unique IDs and non-overlapping 24-hour start/end times, optionally enable and list rooms, and set the `Africa/Addis_Ababa` time zone or the school's actual IANA zone. There are no hard-coded production periods or curriculum subjects.

Run frontend and Functions validation:

```bash
npm run lint
npm run test
npm run build
cd functions
npm test
```

Deploy rules, indexes, and Functions (no Firebase Hosting):

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions
```

The frontend uses the existing six `VITE_FIREBASE_*` variables. Phase 3 needs no private client credentials.

### Phase 3 verification

`functions/test/phase3Validation.node.cjs` covers supported grades/streams, subject applicability, time parsing and interval overlap, period uniqueness/overlap, and timetable settings/room constraints. Run the Firestore Rules role checks against a demo project (never production) from the repository root:

```bash
firebase emulators:exec --only auth,firestore --project demo-phase3 "node functions/test/phase3RulesEmulator.cjs"
```

The validation suite passes 7 Node tests, and the Rules emulator test checks 16 role/access cases across admin, director, registrar, teacher, student, parent, and unauthenticated requests.

Phase 4 can add attendance and other academic activity workflows, using these teacher assignments and timetable records as their authorization and schedule foundation.

## Phase 1 Scope

Phase 1 provides authentication, role assignment, protected routes, and admin user administration. Phase 2 adds student, parent, and class management. Attendance, results, SMS, and reports remain out of scope.
