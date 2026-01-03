import { eq, desc, and, sql } from "drizzle-orm";
import db from "../config/db.js";
import logger from "../utilities/logger.js";

/**
 * AuditService - Logs admin operations for compliance and auditing
 * Stores audit logs in memory for now (can be extended to database)
 */
class AuditService {
  constructor() {
    // In-memory storage (for demo - production should use database)
    this.logs = [];
    this.maxLogs = 10000; // Limit in-memory storage
  }

  /**
   * Log an admin action
   * @param {string} action - Action type (e.g., 'create_role', 'assign_plan')
   * @param {Object} actor - User performing the action { id, email, clerkId }
   * @param {Object} resource - Resource affected { type, id, name }
   * @param {Object} changes - What changed { before, after }
   * @param {Object} context - Additional context { organizationId, ip, userAgent }
   * @returns {Promise<Object>} Audit log entry
   */
  async logAction(action, actor, resource, changes = {}, context = {}) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      action,
      actor: {
        id: actor.id,
        email: actor.email,
        clerkId: actor.clerkId,
      },
      resource: {
        type: resource.type,
        id: resource.id,
        name: resource.name,
      },
      changes: {
        before: changes.before || null,
        after: changes.after || null,
      },
      context: {
        organizationId: context.organizationId,
        ip: context.ip,
        userAgent: context.userAgent,
      },
      timestamp: new Date().toISOString(),
    };

    // Add to in-memory logs
    this.logs.unshift(entry);

    // Trim if exceeds max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    logger.info(
      {
        auditId: entry.id,
        action,
        actorId: actor.id,
        resourceType: resource.type,
        resourceId: resource.id,
      },
      "Audit log entry created"
    );

    return entry;
  }

  /**
   * Log role assignment
   */
  async logRoleAssignment(
    actor,
    targetUser,
    role,
    organizationId,
    context = {}
  ) {
    return this.logAction(
      "assign_role",
      actor,
      { type: "user_role", id: targetUser.id, name: targetUser.email },
      { after: { roleId: role.id, roleName: role.name } },
      { ...context, organizationId }
    );
  }

  /**
   * Log role removal
   */
  async logRoleRemoval(actor, targetUser, role, organizationId, context = {}) {
    return this.logAction(
      "remove_role",
      actor,
      { type: "user_role", id: targetUser.id, name: targetUser.email },
      { before: { roleId: role.id, roleName: role.name } },
      { ...context, organizationId }
    );
  }

  /**
   * Log plan assignment
   */
  async logPlanAssignment(
    actor,
    targetUser,
    plan,
    organizationId,
    context = {}
  ) {
    return this.logAction(
      "assign_plan",
      actor,
      { type: "user_plan", id: targetUser.id, name: targetUser.email },
      { after: { planId: plan.id, planName: plan.name } },
      { ...context, organizationId }
    );
  }

  /**
   * Log override creation
   */
  async logOverrideCreation(actor, override, organizationId, context = {}) {
    return this.logAction(
      "create_override",
      actor,
      { type: "override", id: override.id, name: override.featureSlug },
      { after: override },
      { ...context, organizationId }
    );
  }

  /**
   * Log organization update
   */
  async logOrganizationUpdate(actor, organization, changes, context = {}) {
    return this.logAction(
      "update_organization",
      actor,
      { type: "organization", id: organization.id, name: organization.name },
      changes,
      { ...context, organizationId: organization.id }
    );
  }

  /**
   * Log admin added
   */
  async logAdminAdded(actor, newAdmin, organizationId, context = {}) {
    return this.logAction(
      "add_admin",
      actor,
      { type: "admin", id: newAdmin.id, name: newAdmin.email },
      { after: { isAdmin: true } },
      { ...context, organizationId }
    );
  }

  /**
   * Log admin removed
   */
  async logAdminRemoved(actor, removedAdmin, organizationId, context = {}) {
    return this.logAction(
      "remove_admin",
      actor,
      { type: "admin", id: removedAdmin.id, name: removedAdmin.email },
      { before: { isAdmin: true }, after: { isAdmin: false } },
      { ...context, organizationId }
    );
  }

  /**
   * Get audit logs with filtering and pagination
   * @param {Object} filters - { organizationId, action, userId, limit, offset }
   * @returns {Promise<Object>} { logs: [], total, limit, offset, hasMore }
   */
  async getAuditLogs(filters = {}) {
    const { organizationId, action, userId, limit = 50, offset = 0 } = filters;

    let filtered = [...this.logs];

    // Apply filters
    if (organizationId) {
      filtered = filtered.filter(
        (log) => log.context.organizationId === organizationId
      );
    }
    if (action) {
      filtered = filtered.filter((log) => log.action === action);
    }
    if (userId) {
      filtered = filtered.filter(
        (log) => log.actor.id === userId || log.resource.id === userId
      );
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      logs: paginated,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Clear old logs (for maintenance)
   * @param {number} daysOld - Delete logs older than this many days
   */
  async clearOldLogs(daysOld = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const cutoffStr = cutoff.toISOString();

    const beforeCount = this.logs.length;
    this.logs = this.logs.filter((log) => log.timestamp >= cutoffStr);
    const deletedCount = beforeCount - this.logs.length;

    logger.info({ deletedCount, daysOld }, "Old audit logs cleared");

    return deletedCount;
  }
}

const auditService = new AuditService();
export default auditService;
