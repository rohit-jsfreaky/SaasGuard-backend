# SaaS Guard Backend

Centralized permission and entitlement engine for SaaS applications.

## Tech Stack

- Node.js (>=18.0.0)
- Express.js
- PostgreSQL
- Drizzle ORM
- Redis (Upstash)
- Clerk Auth
- JavaScript (ES Modules)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example`:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
   - `DATABASE_URL`: PostgreSQL connection string
   - `REDIS_URL`: Redis connection string
   - `CLERK_SECRET_KEY`: Your Clerk secret key (required for authentication)

## Development

Run the development server with nodemon:
```bash
npm run dev
```

The server will start on port 3000 (or the port specified in your `.env` file).

## Health Check

Once the server is running, you can check the health endpoint:
```bash
curl http://localhost:3000/health
```

## Project Structure

```
├── config/           # Configuration files (env, db)
├── constants/        # Application constants
├── controllers/      # Route controllers (use asyncHandler)
├── db/              # Database schemas and migrations
├── middlewares/     # Express middlewares (auth, error-handler, etc.)
├── models/          # Data models
├── routes/          # Route definitions
├── services/        # Business logic services
├── utilities/       # Utility functions (logger, errors, validators, async-handler)
└── index.js         # Application entry point
```

## Key Features

### Async Handler
All controllers use the `asyncHandler` wrapper to automatically handle errors. No need for try-catch blocks:

```javascript
import asyncHandler from '../utilities/async-handler.js';

export const getUsers = asyncHandler(async (req, res) => {
  const users = await usersService.getAll();
  res.json({ success: true, data: users });
});
```

### Clerk Authentication
- Uses `@clerk/express` package for authentication
- Clerk user IDs are **strings**, not integers
- Access user via `req.userId` or `req.user` (set by auth middleware)
- See `controllers/example.controller.js` for usage examples

### Error Handling
- Custom error classes in `utilities/errors.js`
- Global error handler middleware catches all errors
- Consistent error response format

## Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm run db:generate` - Generate database migrations
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio

## License

ISC

