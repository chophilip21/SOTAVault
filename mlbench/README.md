This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Prerequisites

- Node.js installed
- Firebase emulators running (for local development)
- Backend Docker container running on port 8080 (for local development)

### Environment Setup

1. Copy the example environment file:
```bash
cp .env.local.example .env.local
```

2. Update `.env.local` with your configuration:
   - Firebase API keys and project ID
   - Backend URL (defaults to `http://localhost:8080` for local)
   - Firebase Auth Emulator host (defaults to `127.0.0.1:9099` for local)

### Running Locally

1. Start Firebase emulators:
```bash
firebase emulators:start
```

2. Start the backend Docker container (port 8080)

3. Install dependencies and run the development server:
```bash
npm install
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Environment Configuration

The application uses environment-based configuration:
- **Local Development** (`npm run dev`): Uses `.env.local` file
  - Firebase Auth Emulator: `127.0.0.1:9099`
  - Backend API: `http://localhost:8080`
- **Production**: Uses production environment variables

All ports and URLs are configurable via environment variables - nothing is hardcoded.

### Authentication

The login/signup flow uses Firebase Authentication:
- Click the "Login" button in the header to open the auth modal
- Toggle between Login and Sign Up modes
- In local development, authentication uses the Firebase Auth Emulator