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

Firebase Emulators may be started with `firebase emulators:start` after the emulator suite has been configured for the project.

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

Not included in Phase 2: attendance, teacher-to-class assignment, subjects, timetables, marks/results, reporting, SMS, and Ethiopian calendar conversion. Teacher assignments and academic activities are planned for Phase 3.

## Phase 1 Scope

Phase 1 provides authentication, role assignment, protected routes, and admin user administration. Phase 2 adds student, parent, and class management. Attendance, results, SMS, and reports remain out of scope.
