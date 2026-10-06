# School Management System

The frontend is a React + Vite single-page application deployed on Vercel. Firebase provides Authentication, Firestore, and Cloud Functions; Firebase Hosting is not used for the frontend.

## Prerequisites

- Node.js 20 LTS or newer
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

Phase 1 requires an authorized admin account before admin-only functions can be used. Create the initial admin only from a trusted environment with Firebase Admin SDK or a one-time server-side process. Do not create a public endpoint for admin bootstrap or commit service-account credentials.

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

The administrative callable functions require an authenticated caller with the `admin` custom claim and validate requested roles.

## Firestore Security

Firestore rules deny access by default and provide narrowly scoped access to `users/{uid}`. A profile role field is informational; custom claims are authoritative. Clients cannot change their own role.

## Phase 1 Scope

This project includes authentication, role assignment, protected routes, and basic admin user administration. It does not implement student management, classes, attendance, results, SMS, or reports.
