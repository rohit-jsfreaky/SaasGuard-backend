/**
 * OpenAPI/Swagger Configuration
 * Comprehensive API documentation for SaaS Guard
 */

import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "SaaS Guard API",
      version: "1.0.0",
      description: `
# SaaS Guard - Feature Flag & Permission Management System

A comprehensive backend system for managing feature flags, permissions, and usage limits in SaaS applications.

## Core Concepts

- **Features**: Atomic capabilities that can be enabled/disabled (e.g., "create_post", "export_data")
- **Plans**: Bundles of features with usage limits (e.g., "Free", "Pro", "Enterprise")
- **Roles**: Organization-level permission groups that grant additional features
- **Overrides**: User-level exceptions that bypass plan/role restrictions
- **Usage**: Tracking of feature consumption against limits

## Permission Priority

When resolving permissions, the system uses this priority:
1. **Overrides** (highest) - User-specific exceptions
2. **Roles** - Additive permissions from role assignments
3. **Plan** - Base features from user's subscription
4. **Default** (lowest) - System defaults

## Authentication

All API endpoints require authentication via Clerk. Include the session token in the Authorization header:

\`\`\`
Authorization: Bearer <clerk_session_token>
\`\`\`
      `,
      contact: {
        name: "SaaS Guard Support",
        email: "support@saasguard.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
      {
        url: "https://api.saasguard.com",
        description: "Production server",
      },
    ],
    tags: [
      { name: "Health", description: "API health and status endpoints" },
      { name: "Permissions", description: "User permission resolution" },
      { name: "Features", description: "Feature registry management" },
      { name: "Plans", description: "Plan management and limits" },
      { name: "Roles", description: "Role and permission management" },
      { name: "Overrides", description: "User override management" },
      { name: "Usage", description: "Usage tracking and limits" },
      { name: "Admin", description: "Admin dashboard and management" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Clerk session token",
        },
      },
      schemas: {
        // Common response wrapper
        ApiResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
            message: { type: "string" },
          },
        },
        ApiError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                details: { type: "object" },
              },
            },
          },
        },
        // Feature
        Feature: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            name: { type: "string", example: "Create Posts" },
            slug: { type: "string", example: "create_post" },
            description: {
              type: "string",
              example: "Allows users to create new posts",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        // Plan
        Plan: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            name: { type: "string", example: "Pro Plan" },
            slug: { type: "string", example: "pro" },
            description: { type: "string", example: "Professional tier plan" },
            price: { type: "number", example: 29.99 },
            billingCycle: {
              type: "string",
              enum: ["monthly", "yearly"],
              example: "monthly",
            },
            isActive: { type: "boolean", example: true },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        // Role
        Role: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            name: { type: "string", example: "Editor" },
            slug: { type: "string", example: "editor" },
            description: {
              type: "string",
              example: "Can edit and manage content",
            },
            organizationId: { type: "integer", example: 1 },
            isSystemRole: { type: "boolean", example: false },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        // Override
        Override: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            userId: { type: "integer", example: 1 },
            featureSlug: { type: "string", example: "api_calls" },
            overrideType: {
              type: "string",
              enum: ["feature_enable", "feature_disable", "limit_increase"],
              example: "limit_increase",
            },
            value: { type: "string", example: "1000" },
            reason: { type: "string", example: "Enterprise customer request" },
            expiresAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        // Permission Map
        PermissionMap: {
          type: "object",
          properties: {
            features: {
              type: "object",
              additionalProperties: { type: "boolean" },
              example: {
                create_post: true,
                delete_post: true,
                export_data: false,
              },
            },
            limits: {
              type: "object",
              additionalProperties: {
                type: "object",
                properties: {
                  max: { type: "integer" },
                  used: { type: "integer" },
                  remaining: { type: "integer" },
                  exceeded: { type: "boolean" },
                },
              },
              example: {
                api_calls: {
                  max: 1000,
                  used: 250,
                  remaining: 750,
                  exceeded: false,
                },
              },
            },
            resolvedAt: { type: "string", format: "date-time" },
            userId: { type: "integer", example: 1 },
            orgId: { type: "integer", example: 1 },
            cached: { type: "boolean", example: false },
          },
        },
        // Usage
        Usage: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            userId: { type: "integer", example: 1 },
            featureSlug: { type: "string", example: "api_calls" },
            currentUsage: { type: "integer", example: 250 },
            billingPeriodStart: { type: "string", format: "date-time" },
            billingPeriodEnd: { type: "string", format: "date-time" },
            lastResetAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        // Limit Info
        LimitInfo: {
          type: "object",
          properties: {
            max: { type: "integer", example: 1000 },
            used: { type: "integer", example: 250 },
            remaining: { type: "integer", example: 750 },
            exceeded: { type: "boolean", example: false },
          },
        },
        // Pagination
        Pagination: {
          type: "object",
          properties: {
            total: { type: "integer", example: 100 },
            limit: { type: "integer", example: 50 },
            offset: { type: "integer", example: 0 },
            hasMore: { type: "boolean", example: true },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: "Authentication required",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
              example: {
                success: false,
                error: {
                  code: "UNAUTHORIZED",
                  message: "Authentication required",
                },
              },
            },
          },
        },
        Forbidden: {
          description: "Feature not available or insufficient permissions",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
              example: {
                success: false,
                error: {
                  code: "FORBIDDEN",
                  message:
                    'Feature "export_data" is not available in your plan',
                  details: { feature: "export_data" },
                },
              },
            },
          },
        },
        RateLimited: {
          description: "Usage limit exceeded",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
              example: {
                success: false,
                error: {
                  code: "LIMIT_EXCEEDED",
                  message:
                    'You\'ve reached your usage limit for "api_calls" this month',
                  details: {
                    feature: "api_calls",
                    limit: {
                      max: 1000,
                      used: 1000,
                      remaining: 0,
                      exceeded: true,
                    },
                  },
                },
              },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
              example: {
                success: false,
                error: { code: "NOT_FOUND", message: "Resource not found" },
              },
            },
          },
        },
        ValidationError: {
          description: "Invalid input",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
              example: {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: "Invalid input",
                  details: { slug: ["Invalid slug format"] },
                },
              },
            },
          },
        },
        ServerError: {
          description: "Internal server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" },
              example: {
                success: false,
                error: {
                  code: "INTERNAL_ERROR",
                  message: "An unexpected error occurred",
                },
              },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      // Health endpoints
      "/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          description: "Check if the API is running",
          security: [],
          responses: {
            "200": {
              description: "API is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: {
                        type: "object",
                        properties: {
                          status: { type: "string" },
                          timestamp: { type: "string" },
                          environment: { type: "string" },
                        },
                      },
                    },
                  },
                  example: {
                    success: true,
                    data: {
                      status: "healthy",
                      timestamp: "2024-01-15T10:30:00.000Z",
                      environment: "development",
                    },
                  },
                },
              },
            },
          },
        },
      },
      // Permission endpoints
      "/api/v1/me/permissions": {
        get: {
          tags: ["Permissions"],
          summary: "Get my permissions",
          description:
            "Resolve and return the current user's permission map including all features and limits",
          responses: {
            "200": {
              description: "Permission map resolved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { $ref: "#/components/schemas/PermissionMap" },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "500": { $ref: "#/components/responses/ServerError" },
          },
        },
      },
      "/api/v1/me/permissions/check/{featureSlug}": {
        get: {
          tags: ["Permissions"],
          summary: "Check specific permission",
          description:
            "Check if the current user can perform a specific feature",
          parameters: [
            {
              name: "featureSlug",
              in: "path",
              required: true,
              schema: { type: "string" },
              example: "create_post",
            },
          ],
          responses: {
            "200": {
              description: "Permission check result",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: {
                      allowed: true,
                      reason: 'Feature "create_post" is enabled',
                      limit: {
                        max: 100,
                        used: 25,
                        remaining: 75,
                        exceeded: false,
                      },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": { $ref: "#/components/responses/Forbidden" },
            "429": { $ref: "#/components/responses/RateLimited" },
          },
        },
      },
      // Feature endpoints
      "/api/v1/admin/features": {
        get: {
          tags: ["Features"],
          summary: "List all features",
          description: "Get paginated list of all features in the registry",
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 50 },
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
            },
            { name: "search", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "List of features",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: {
                      features: [
                        {
                          id: 1,
                          name: "Create Posts",
                          slug: "create_post",
                          description: "Create new posts",
                        },
                        {
                          id: 2,
                          name: "Delete Posts",
                          slug: "delete_post",
                          description: "Delete posts",
                        },
                      ],
                      pagination: {
                        total: 25,
                        limit: 50,
                        offset: 0,
                        hasMore: false,
                      },
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
        post: {
          tags: ["Features"],
          summary: "Create a feature",
          description: "Add a new feature to the registry",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "slug"],
                  properties: {
                    name: { type: "string", example: "Export Data" },
                    slug: { type: "string", example: "export_data" },
                    description: {
                      type: "string",
                      example: "Export data to CSV",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Feature created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { $ref: "#/components/schemas/Feature" },
                    },
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/ValidationError" },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      // Plan endpoints
      "/api/v1/admin/plans": {
        get: {
          tags: ["Plans"],
          summary: "List all plans",
          description: "Get all subscription plans",
          responses: {
            "200": {
              description: "List of plans",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: {
                      plans: [
                        {
                          id: 1,
                          name: "Free",
                          slug: "free",
                          price: 0,
                          billingCycle: "monthly",
                        },
                        {
                          id: 2,
                          name: "Pro",
                          slug: "pro",
                          price: 29.99,
                          billingCycle: "monthly",
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ["Plans"],
          summary: "Create a plan",
          description: "Create a new subscription plan",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "slug"],
                  properties: {
                    name: { type: "string", example: "Enterprise" },
                    slug: { type: "string", example: "enterprise" },
                    description: {
                      type: "string",
                      example: "Enterprise-level features",
                    },
                    price: { type: "number", example: 99.99 },
                    billingCycle: {
                      type: "string",
                      enum: ["monthly", "yearly"],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": { description: "Plan created" },
            "400": { $ref: "#/components/responses/ValidationError" },
          },
        },
      },
      // Override endpoints
      "/api/v1/admin/overrides": {
        post: {
          tags: ["Overrides"],
          summary: "Create an override",
          description: "Create a user-level permission override",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userId", "featureSlug", "overrideType"],
                  properties: {
                    userId: { type: "integer", example: 1 },
                    featureSlug: { type: "string", example: "api_calls" },
                    overrideType: {
                      type: "string",
                      enum: [
                        "feature_enable",
                        "feature_disable",
                        "limit_increase",
                      ],
                      example: "limit_increase",
                    },
                    value: { type: "string", example: "5000" },
                    reason: {
                      type: "string",
                      example: "Enterprise customer upgrade",
                    },
                    expiresAt: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Override created",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      data: { $ref: "#/components/schemas/Override" },
                    },
                  },
                },
              },
            },
            "400": { $ref: "#/components/responses/ValidationError" },
            "401": { $ref: "#/components/responses/Unauthorized" },
          },
        },
      },
      // Usage endpoints
      "/api/v1/admin/usage/record": {
        post: {
          tags: ["Usage"],
          summary: "Record usage",
          description: "Record feature usage for a user",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["userId", "featureSlug"],
                  properties: {
                    userId: { type: "integer", example: 1 },
                    featureSlug: { type: "string", example: "api_calls" },
                    amount: { type: "integer", example: 1 },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Usage recorded",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: { featureSlug: "api_calls", newUsage: 251 },
                    message: "Usage recorded",
                  },
                },
              },
            },
          },
        },
      },
      // Admin Dashboard
      "/api/v1/admin/organizations/{orgId}/dashboard": {
        get: {
          tags: ["Admin"],
          summary: "Get organization dashboard",
          description: "Get comprehensive analytics for an organization",
          parameters: [
            {
              name: "orgId",
              in: "path",
              required: true,
              schema: { type: "integer" },
              example: 1,
            },
          ],
          responses: {
            "200": {
              description: "Dashboard data",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    data: {
                      totalUsers: 150,
                      totalRoles: 5,
                      totalFeatures: 25,
                      planDistribution: { Free: 90, Pro: 45, Enterprise: 15 },
                      topFeatures: [
                        {
                          feature: "create_post",
                          usageCount: 1500,
                          usagePercent: 85,
                        },
                        {
                          feature: "api_calls",
                          usageCount: 1200,
                          usagePercent: 70,
                        },
                      ],
                      activeOverridesCount: 12,
                    },
                  },
                },
              },
            },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": { $ref: "#/components/responses/Forbidden" },
          },
        },
      },
    },
  },
  apis: [], // We're using inline docs
};

export const swaggerSpec = swaggerJsdoc(options);
