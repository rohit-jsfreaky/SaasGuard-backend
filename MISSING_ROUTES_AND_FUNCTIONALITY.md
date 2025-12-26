# Missing Routes and Functionality Analysis

## Executive Summary

This document identifies all missing routes, endpoints, and functionality needed before frontend integration. The analysis covers the entire codebase including routes, controllers, services, and database schema.

---

## 🔴 CRITICAL: User-Organization Relationship Issue

### Problem
The database schema shows a **complex relationship** between users and organizations:

1. **Direct Relationship**: Users have a `orgId` field (one primary organization)
2. **Indirect Relationships**: Users can belong to multiple organizations through:
   - `userRoles` table (roles in different orgs)
   - `userPlans` table (plans in different orgs)

### Current State
- ✅ User has one primary organization (`users.orgId`)
- ✅ User can have roles in multiple organizations (`userRoles.organizationId`)
- ✅ User can have plans in multiple organizations (`userPlans.organizationId`)
- ❌ **NO route to get all organizations a user belongs to**
- ❌ **NO route to switch organization context**
- ❌ **NO route to list all organizations**

### Missing Routes

#### 1. Get User's Organizations
```
GET /api/v1/me/organizations
GET /api/v1/users/:userId/organizations
```
**Purpose**: Get all organizations where user has:
- Primary membership (users.orgId)
- Roles assigned (userRoles)
- Plans assigned (userPlans)

**Response**: Array of organizations with membership type and context

#### 2. Switch Organization Context
```
POST /api/v1/me/organizations/:orgId/switch
```
**Purpose**: Change user's primary organization context
**Note**: This might update `users.orgId` or just set session context

#### 3. List All Organizations (Admin)
```
GET /api/v1/admin/organizations
```
**Purpose**: List all organizations with pagination
**Filters**: name, slug, createdBy, date range

---

## 📋 Missing Organization Routes

### Current Routes ✅
- ✅ `POST /api/v1/admin/organizations` - Create organization
- ✅ `GET /api/v1/admin/organizations/:orgId` - Get organization
- ✅ `PUT /api/v1/admin/organizations/:orgId` - Update organization
- ✅ `GET /api/v1/admin/organizations/:orgId/members` - List members
- ✅ `GET /api/v1/admin/organizations/:orgId/overview` - Get overview

### Missing Routes ❌

#### 1. Delete Organization
```
DELETE /api/v1/admin/organizations/:orgId
```
**Service Method**: `organizationService.deleteOrganization()` exists
**Status**: Service ready, route missing

#### 2. List All Organizations
```
GET /api/v1/admin/organizations
```
**Query Params**: 
- `limit`, `offset` (pagination)
- `search` (name/slug search)
- `createdBy` (filter by creator)
- `sortBy`, `sortOrder`

**Service Method**: Needs to be created
**Status**: Service method missing, route missing

#### 3. Search Organizations
```
GET /api/v1/admin/organizations/search?q=query
```
**Purpose**: Search organizations by name or slug

#### 4. Get Organization by Slug
```
GET /api/v1/admin/organizations/slug/:slug
```
**Service Method**: `organizationService.getOrganizationBySlug()` exists
**Status**: Service ready, route missing

#### 5. Add User to Organization
```
POST /api/v1/admin/organizations/:orgId/members
Body: { userId: string }
```
**Service Method**: `organizationService.addUserToOrganization()` exists
**Status**: Service ready, route missing

#### 6. Remove User from Organization
```
DELETE /api/v1/admin/organizations/:orgId/members/:userId
```
**Service Method**: `organizationService.removeUserFromOrganization()` exists
**Status**: Service ready, route missing

#### 7. Get Organization Statistics
```
GET /api/v1/admin/organizations/:orgId/stats
```
**Response**: 
- Total users
- Total roles
- Total plans
- Active overrides count
- Total usage across all features

---

## 👤 Missing User Routes

### Current Routes ✅
- ✅ `GET /api/v1/me` - Get current user context
- ✅ `GET /api/v1/admin/users/:userId` - Get user details
- ✅ `GET /api/v1/admin/organizations/:orgId/users` - List users in org
- ✅ `GET /api/v1/admin/users/:userId/roles` - Get user roles
- ✅ `POST /api/v1/admin/users/:userId/roles/:roleId` - Assign role
- ✅ `DELETE /api/v1/admin/users/:userId/roles/:roleId` - Remove role
- ✅ `GET /api/v1/admin/users/:userId/usage` - Get user usage
- ✅ `GET /api/v1/admin/users/:userId/permissions` - Get permissions

### Missing Routes ❌

#### 1. Delete User
```
DELETE /api/v1/admin/users/:userId
```
**Service Method**: `userService.deleteUser()` exists
**Status**: Service ready, route missing

#### 2. Update User Profile
```
PUT /api/v1/me
PUT /api/v1/admin/users/:userId
Body: { email?: string, orgId?: number }
```
**Service Method**: `userService.updateUser()` exists
**Status**: Service ready, route missing

#### 3. Get User Profile (Enhanced)
```
GET /api/v1/me/profile
```
**Response**: Full user profile with:
- User details
- Primary organization
- All organizations user belongs to
- Current plan
- Active roles across all orgs
- Usage summary

#### 4. Search Users
```
GET /api/v1/admin/users/search?q=query
GET /api/v1/admin/users/search?email=email
```
**Purpose**: Search users by email, name, or ID

#### 5. List All Users (Admin)
```
GET /api/v1/admin/users
```
**Query Params**: 
- `limit`, `offset`
- `orgId` (filter by organization)
- `search` (email search)
- `sortBy`, `sortOrder`

**Service Method**: Needs to be created
**Status**: Service method missing, route missing

#### 6. Get User by Email
```
GET /api/v1/admin/users/email/:email
```
**Service Method**: `userService.getUserByEmail()` exists
**Status**: Service ready, route missing

---

## 📦 Missing User Plan Routes

### Current Routes ✅
- ❌ **NONE** - User plan routes are completely missing!

### Service Methods Available ✅
- ✅ `userPlanService.assignPlanToUser()`
- ✅ `userPlanService.getUserPlanInOrganization()`
- ✅ `userPlanService.getUserPlansForOrganization()`
- ✅ `userPlanService.deactivateUserPlanInOrganization()`
- ✅ `userPlanService.removeUserPlanInOrganization()`
- ✅ `userPlanService.getUsersOnPlan()`
- ✅ `userPlanService.getPlanStats()`
- ✅ `userPlanService.updateUserPlan()`
- ✅ `userPlanService.deleteUserPlan()`

### Missing Routes ❌ (ALL OF THEM)

#### 1. Assign Plan to User
```
POST /api/v1/admin/users/:userId/plans
Body: { planId: number, organizationId: number }
```
**Purpose**: Assign a plan to a user in an organization

#### 2. Get User's Plan in Organization
```
GET /api/v1/admin/users/:userId/plans?orgId=123
GET /api/v1/me/plan?orgId=123
```
**Purpose**: Get current active plan for user in organization

#### 3. Get User's Plan History
```
GET /api/v1/admin/users/:userId/plans/history?orgId=123
```
**Purpose**: Get all plans (including inactive) for user in organization

#### 4. Update User Plan
```
PUT /api/v1/admin/users/:userId/plans/:planId
Body: { isActive?: boolean, planId?: number }
```
**Purpose**: Update user plan (change plan or activate/deactivate)

#### 5. Remove Plan from User
```
DELETE /api/v1/admin/users/:userId/plans/:planId?orgId=123
```
**Purpose**: Remove plan assignment from user

#### 6. Deactivate User Plan
```
POST /api/v1/admin/users/:userId/plans/:planId/deactivate?orgId=123
```
**Purpose**: Deactivate user's plan without deleting

#### 7. Get Plan Statistics
```
GET /api/v1/admin/plans/:planId/stats
```
**Response**: 
- Total users on plan
- Active users on plan
- Usage statistics

#### 8. Get Users on Plan
```
GET /api/v1/admin/plans/:planId/users
```
**Query Params**: `limit`, `offset`
**Purpose**: List all users assigned to a plan

---

## 🎯 Missing Plan Routes

### Current Routes ✅
- ✅ `POST /api/v1/admin/plans` - Create plan
- ✅ `GET /api/v1/admin/plans` - List plans
- ✅ `GET /api/v1/admin/plans/:id` - Get plan
- ✅ `PUT /api/v1/admin/plans/:id` - Update plan
- ✅ `DELETE /api/v1/admin/plans/:id` - Delete plan
- ✅ `POST /api/v1/admin/plans/:id/features` - Add feature
- ✅ `GET /api/v1/admin/plans/:id/features` - Get features
- ✅ `DELETE /api/v1/admin/plans/:id/features/:featureId` - Remove feature
- ✅ `POST /api/v1/admin/plans/:id/limits` - Set limit
- ✅ `GET /api/v1/admin/plans/:id/limits` - Get limits
- ✅ `DELETE /api/v1/admin/plans/:id/limits/:featureSlug` - Remove limit

### Missing Routes ❌

#### 1. Search Plans
```
GET /api/v1/admin/plans/search?q=query
```
**Purpose**: Search plans by name or slug

#### 2. Get Plans by Organization
```
GET /api/v1/admin/organizations/:orgId/plans
```
**Purpose**: List all plans for an organization
**Note**: Plans have `organizationId` field, but no route to filter by org

#### 3. Get Plan by Slug
```
GET /api/v1/admin/plans/slug/:slug
```
**Purpose**: Get plan by slug instead of ID

#### 4. Duplicate/Copy Plan
```
POST /api/v1/admin/plans/:id/duplicate
Body: { name?: string, slug?: string, organizationId?: number }
```
**Purpose**: Create a copy of a plan with all features and limits

---

## 🔐 Missing Role Routes

### Current Routes ✅
- ✅ `POST /api/v1/admin/organizations/:orgId/roles` - Create role
- ✅ `GET /api/v1/admin/organizations/:orgId/roles` - List roles
- ✅ `GET /api/v1/admin/roles/:id` - Get role
- ✅ `PUT /api/v1/admin/roles/:id` - Update role
- ✅ `DELETE /api/v1/admin/roles/:id` - Delete role
- ✅ `POST /api/v1/admin/roles/:id/permissions` - Grant permission
- ✅ `GET /api/v1/admin/roles/:id/permissions` - Get permissions
- ✅ `DELETE /api/v1/admin/roles/:id/permissions/:featureSlug` - Revoke permission

### Missing Routes ❌

#### 1. Search Roles
```
GET /api/v1/admin/organizations/:orgId/roles/search?q=query
```
**Purpose**: Search roles by name or slug

#### 2. Get Role by Slug
```
GET /api/v1/admin/organizations/:orgId/roles/slug/:slug
```
**Purpose**: Get role by slug instead of ID

#### 3. Bulk Grant Permissions
```
POST /api/v1/admin/roles/:id/permissions/bulk
Body: { featureSlugs: string[] }
```
**Purpose**: Grant multiple permissions at once

#### 4. Bulk Revoke Permissions
```
DELETE /api/v1/admin/roles/:id/permissions/bulk
Body: { featureSlugs: string[] }
```
**Purpose**: Revoke multiple permissions at once

---

## 🎛️ Missing Feature Routes

### Current Routes ✅
- ✅ `POST /api/v1/admin/features` - Create feature
- ✅ `GET /api/v1/admin/features` - List features
- ✅ `GET /api/v1/admin/features/search` - Search features
- ✅ `GET /api/v1/admin/features/:id` - Get feature
- ✅ `PUT /api/v1/admin/features/:id` - Update feature
- ✅ `DELETE /api/v1/admin/features/:id` - Delete feature

### Missing Routes ❌

#### 1. Get Feature by Slug
```
GET /api/v1/admin/features/slug/:slug
```
**Purpose**: Get feature by slug instead of ID

#### 2. Feature Statistics
```
GET /api/v1/admin/features/:id/stats
GET /api/v1/admin/features/:slug/stats
```
**Response**:
- Total plans using this feature
- Total users with access
- Total usage across all users
- Average usage per user

---

## 📊 Missing Usage Routes

### Current Routes ✅
- ✅ `POST /api/v1/admin/users/:userId/usage/:featureSlug` - Record usage
- ✅ `GET /api/v1/admin/users/:userId/usage` - Get user usage
- ✅ `GET /api/v1/admin/users/:userId/usage/:featureSlug` - Get feature usage
- ✅ `POST /api/v1/admin/users/:userId/usage/:featureSlug/reset` - Reset usage
- ✅ `POST /api/v1/admin/users/:userId/usage/reset-all` - Reset all usage
- ✅ `POST /api/v1/admin/usage/reset-all` - Reset all monthly usage
- ✅ `GET /api/v1/admin/usage/stats/:featureSlug` - Get feature stats

### Missing Routes ❌

#### 1. Get Usage by Organization
```
GET /api/v1/admin/organizations/:orgId/usage
```
**Purpose**: Get aggregated usage for all users in organization

#### 2. Get Usage by Plan
```
GET /api/v1/admin/plans/:planId/usage
```
**Purpose**: Get aggregated usage for all users on a plan

#### 3. Usage Analytics/Reports
```
GET /api/v1/admin/usage/analytics
Query Params: 
- startDate, endDate
- orgId (optional)
- planId (optional)
- featureSlug (optional)
```
**Response**: Detailed analytics with trends

#### 4. Export Usage Data
```
GET /api/v1/admin/usage/export?format=csv|json
```
**Purpose**: Export usage data for reporting

---

## 🔄 Missing Override Routes

### Current Routes ✅
- ✅ `POST /api/v1/admin/overrides` - Create user override
- ✅ `GET /api/v1/admin/overrides` - List overrides (by feature)
- ✅ `GET /api/v1/admin/users/:userId/overrides` - Get user overrides
- ✅ `GET /api/v1/admin/overrides/:id` - Get override
- ✅ `PUT /api/v1/admin/overrides/:id` - Update override
- ✅ `DELETE /api/v1/admin/overrides/:id` - Delete override
- ✅ `POST /api/v1/admin/overrides/:id/expire` - Expire override
- ✅ `GET /api/v1/admin/users/:userId/features/:featureSlug/override` - Get user feature override
- ✅ `POST /api/v1/admin/organizations/:orgId/overrides` - Create org override
- ✅ `GET /api/v1/admin/organizations/:orgId/overrides` - Get org overrides
- ✅ `GET /api/v1/admin/organizations/:orgId/overrides/:id` - Get org override
- ✅ `PUT /api/v1/admin/organizations/:orgId/overrides/:id` - Update org override
- ✅ `DELETE /api/v1/admin/organizations/:orgId/overrides/:id` - Delete org override
- ✅ `GET /api/v1/admin/organizations/:orgId/features/:featureSlug/override` - Get org feature override

### Missing Routes ❌

#### 1. Bulk Create Overrides
```
POST /api/v1/admin/overrides/bulk
Body: { 
  overrides: Array<{ userId, featureSlug, overrideType, value, expiresAt }>
}
```
**Purpose**: Create multiple overrides at once

#### 2. Bulk Expire Overrides
```
POST /api/v1/admin/overrides/bulk/expire
Body: { overrideIds: number[] }
```
**Purpose**: Expire multiple overrides at once

---

## 🔑 Missing Permission Routes

### Current Routes ✅
- ✅ `GET /api/v1/me/permissions` - Get my permissions
- ✅ `GET /api/v1/me/permissions/check/:featureSlug` - Check my permission
- ✅ `GET /api/v1/admin/users/:userId/permissions` - Get user permissions
- ✅ `POST /api/v1/admin/users/:userId/permissions/check` - Check multiple permissions
- ✅ `POST /api/v1/admin/users/:userId/permissions/invalidate` - Invalidate cache

### Missing Routes ❌

#### 1. Check Permission for Organization
```
GET /api/v1/admin/organizations/:orgId/permissions/check/:featureSlug
```
**Purpose**: Check if organization has access to feature

#### 2. Get Organization Permissions Summary
```
GET /api/v1/admin/organizations/:orgId/permissions/summary
```
**Response**: Summary of all permissions across all users/roles/plans in org

---

## 📈 Missing Dashboard/Analytics Routes

### Current Routes ✅
- ✅ `GET /api/v1/admin/organizations/:orgId/dashboard` - Get dashboard
- ✅ `GET /api/v1/admin/organizations/:orgId/stats/users` - User stats
- ✅ `GET /api/v1/admin/organizations/:orgId/stats/roles` - Role stats
- ✅ `GET /api/v1/admin/organizations/:orgId/stats/features` - Feature stats

### Missing Routes ❌

#### 1. Global Dashboard (Super Admin)
```
GET /api/v1/admin/dashboard
```
**Response**: 
- Total organizations
- Total users
- Total plans
- Total features
- System-wide usage statistics

#### 2. Organization Comparison
```
GET /api/v1/admin/organizations/compare
Query Params: orgIds=1,2,3
```
**Purpose**: Compare statistics across multiple organizations

#### 3. Usage Trends
```
GET /api/v1/admin/analytics/usage-trends
Query Params: 
- startDate, endDate
- orgId (optional)
- featureSlug (optional)
```
**Response**: Usage trends over time

---

## 🔍 Missing Search & Filter Routes

### Current Routes ✅
- ✅ `GET /api/v1/admin/features/search` - Search features

### Missing Routes ❌

#### 1. Global Search
```
GET /api/v1/admin/search?q=query&type=users|organizations|plans|roles|features
```
**Purpose**: Unified search across all entities

#### 2. Advanced Filters
Many list endpoints need advanced filtering:
- Date range filters
- Status filters (active/inactive)
- Relationship filters (users in org, plans with feature, etc.)

---

## 🛠️ Missing Utility Routes

### Missing Routes ❌

#### 1. Health Check Extended
```
GET /api/v1/health/detailed
```
**Response**: Detailed health check with:
- Database connection status
- Cache status
- Service dependencies
- Performance metrics

#### 2. System Information
```
GET /api/v1/admin/system/info
```
**Response**: 
- API version
- Database version
- Cache status
- Environment info

#### 3. Clear Cache (Admin)
```
POST /api/v1/admin/cache/clear
POST /api/v1/admin/cache/clear/:key
```
**Purpose**: Clear cache manually (for debugging)

---

## 📝 Missing Validation & Error Handling

### Issues Found ❌

1. **Inconsistent Error Codes**: Some routes use different error codes for similar errors
2. **Missing Input Validation**: Some routes don't validate all required fields
3. **Missing Rate Limiting**: No rate limiting on critical endpoints
4. **Missing Request Validation**: Some endpoints accept invalid data types

---

## 🔐 Missing Authorization Routes

### Current State ✅
- ✅ `requireAuth` middleware exists
- ✅ `requireOrgAdmin` middleware exists

### Missing Routes ❌

#### 1. Check Authorization
```
GET /api/v1/me/authorization/check
Query Params: 
- action: string (e.g., "create_plan", "delete_user")
- resourceId?: number
- organizationId?: number
```
**Purpose**: Check if current user can perform an action

#### 2. Get User's Permissions Summary
```
GET /api/v1/me/permissions/summary
```
**Response**: Summary of all permissions across all organizations

---

## 📋 Summary by Priority

### 🔴 CRITICAL (Must Have Before Frontend)
1. **Get User's Organizations** - `GET /api/v1/me/organizations`
2. **List All Organizations** - `GET /api/v1/admin/organizations`
3. **User Plan Routes** - All user plan management routes
4. **Delete Organization** - `DELETE /api/v1/admin/organizations/:orgId`
5. **Delete User** - `DELETE /api/v1/admin/users/:userId`
6. **Update User Profile** - `PUT /api/v1/me`

### 🟡 HIGH PRIORITY (Important for MVP)
1. **Search Organizations** - `GET /api/v1/admin/organizations/search`
2. **Search Users** - `GET /api/v1/admin/users/search`
3. **Get Plans by Organization** - `GET /api/v1/admin/organizations/:orgId/plans`
4. **Organization Statistics** - `GET /api/v1/admin/organizations/:orgId/stats`
5. **Add/Remove User from Organization** - Member management routes

### 🟢 MEDIUM PRIORITY (Nice to Have)
1. **Bulk Operations** - Bulk assign roles, plans, overrides
2. **Advanced Analytics** - Usage trends, comparisons
3. **Export Functionality** - Export usage, users, etc.
4. **Duplicate/Copy Operations** - Duplicate plans, roles

### ⚪ LOW PRIORITY (Future Enhancements)
1. **Global Search** - Unified search across entities
2. **Advanced Filtering** - Complex query builders
3. **System Administration** - Cache management, system info

---

## 📊 Statistics

- **Total Existing Routes**: ~60 routes
- **Total Missing Routes**: ~45+ routes
- **Critical Missing Routes**: 6 routes
- **High Priority Missing Routes**: 5 routes
- **Services Ready but Routes Missing**: 8+ services have methods but no routes

---

## 🎯 Recommendations

1. **Immediate Action**: Implement the 6 critical routes first
2. **Service Layer**: Some services need new methods (e.g., `getUserOrganizations()`)
3. **Database Queries**: Need queries to get organizations from `userRoles` and `userPlans` tables
4. **Frontend Impact**: Without user organizations route, frontend cannot show organization switcher
5. **Testing**: All new routes need validation and error handling

---

## 📝 Notes

- Most services are well-structured and ready
- The async handler pattern is consistent across all routes
- Error handling is centralized and working well
- The main gap is in route coverage, not service logic
- User-organization relationship needs clarification on how to handle multi-org users

---

**Document Generated**: 2025-01-16
**Codebase Version**: Current refactored version
**Analysis Scope**: All routes, controllers, services, and database schema

