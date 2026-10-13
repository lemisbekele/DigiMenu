# Project Requirements

## Complete Migration from Firebase to Supabase

- Completely remove Firebase from the application.
- Remove all Firebase-related code, packages, configurations, environment variables, services, SDKs, listeners, rules, storage integrations, authentication logic, cloud functions, and references.
- Eliminate any dependency on:
  - Firebase Authentication
  - Firestore
  - Firebase Storage
  - Firebase Cloud Messaging
  - Firebase Functions
  - Firebase Analytics
  - Firebase Hosting

## Supabase as the Single Backend

Use Supabase as the sole backend platform for:

- Authentication
- Database
- File Storage
- Real-time subscriptions
- Role-based access control
- Notifications infrastructure
- Audit logs
- User management

## Authentication

- Use Supabase Auth exclusively.
- Implement:
  - Email and password login
  - Session persistence
  - Password reset
  - Account activation/deactivation
  - Secure logout
  - Automatic session refresh
- Use a single universal login page.
- Do not display role selectors, role dropdowns, or multiple login portals.
- After login:
  1. Authenticate with Supabase Auth.
  2. Retrieve the user's assigned role from the database.
  3. Validate permissions.
  4. Redirect automatically to the correct dashboard.

## RBAC Integration

- Store user roles in Supabase tables.
- Implement Row Level Security (RLS) policies for all protected data.
- Enforce permissions on:
  - Frontend routes
  - Backend queries
  - API endpoints
  - Storage access
  - Real-time channels
- Users must never be able to change their own role.

## Database

- Ensure all application data is fully migrated to Supabase PostgreSQL.
- Normalize tables and relationships where appropriate.
- Create indexes for frequently queried fields.
- Optimize queries for performance and scalability.

## File Storage

- Use Supabase Storage exclusively.
- Remove any Firebase Storage uploads.
- Apply client-side image optimization before upload:
  - Compression
  - Metadata cleanup
  - Thumbnail generation where needed
  - Format optimization
- Maintain high visual quality while reducing file size.

## Real-Time Features

Use Supabase Realtime for:

- New orders
- Order status changes
- Inventory updates
- Notifications
- Staff activity updates
- Dashboard updates
- Chat or messaging features
- Attendance and scheduling updates

## Notifications

- Replace any Firebase notification implementation.
- Build notifications using Supabase-compatible infrastructure.
- Support:
  - In-app notifications
  - Background notifications
  - Notification history
  - Read/unread states
  - Real-time delivery

## User Management

- Administrators should be able to create and manage users through Supabase.
- Allow:
  - User creation
  - Role assignment
  - Role updates
  - User activation/deactivation
  - Password resets
  - User search and filtering

## Cleanup & Validation

Perform a complete audit and verify:

- No Firebase package remains installed.
- No Firebase environment variables remain.
- No Firebase imports remain.
- No Firebase configuration files remain.
- All authentication flows work through Supabase.
- All CRUD operations use Supabase.
- All storage operations use Supabase.
- All real-time features use Supabase.
- All RBAC permissions use Supabase and RLS policies.
- All dashboards, reports, notifications, and uploads function correctly.
- The application builds successfully without any Firebase dependency.
- There are no broken references, unused files, migration leftovers, or runtime errors related to Firebase.
