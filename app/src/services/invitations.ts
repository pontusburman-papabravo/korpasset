import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { AppError, ForbiddenError, NotFoundError } from "../errors.js";
import { getPool, withTransaction } from "../db/pool.js";
import { config } from "../config.js";
import { createGuestUser, getReusableSessionUserId } from "./users.js";
import { recordProductEventSafe } from "./product-events.js";

export interface InvitationDetails {
  id: string;
  journeyId: string;
  token: string;
  inviteUrl: string;
  expiresAt: Date;
  studentName: string;
}

export interface InvitationPreview {
  invitationId: string;
  journeyId: string;
  studentName: string;
  status: string;
  expiresAt: Date;
  acceptedByUserId: string | null;
  studentUserId: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(
  journeyId: string,
  invitedByUserId: string,
): Promise<InvitationDetails> {
  const journey = await getPool().query(
    `SELECT j.id, j.student_user_id, u.display_name
     FROM driving_journeys j
     JOIN users u ON u.id = j.student_user_id
     WHERE j.id = $1`,
    [journeyId],
  );
  if (journey.rowCount === 0) {
    throw new NotFoundError("Journey not found");
  }
  if (journey.rows[0].student_user_id !== invitedByUserId) {
    throw new ForbiddenError("Only the student can create invitations");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.invitationExpiryDays);

  const result = await getPool().query(
    `INSERT INTO journey_invitations (
       journey_id, invited_by_user_id, role, token_hash, expires_at
     )
     VALUES ($1, $2, 'supervisor', $3, $4)
     RETURNING id, expires_at`,
    [journeyId, invitedByUserId, tokenHash, expiresAt.toISOString()],
  );

  const row = result.rows[0];
  const inviteUrl = `${config.appBaseUrl}/invite/${token}`;

  return {
    id: row.id,
    journeyId,
    token,
    inviteUrl,
    expiresAt: row.expires_at,
    studentName: journey.rows[0].display_name ?? "Eleven",
  };
}

export async function getInvitationByToken(
  token: string,
  client?: pg.PoolClient,
): Promise<InvitationPreview | null> {
  const db = client ?? getPool();
  const tokenHash = hashToken(token);
  const result = await db.query(
    `SELECT i.id, i.journey_id, i.status, i.expires_at, i.accepted_by_user_id,
            j.student_user_id, u.display_name AS student_name
     FROM journey_invitations i
     JOIN driving_journeys j ON j.id = i.journey_id
     JOIN users u ON u.id = j.student_user_id
     WHERE i.token_hash = $1`,
    [tokenHash],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  return {
    invitationId: row.id,
    journeyId: row.journey_id,
    studentName: row.student_name ?? "Eleven",
    status: row.status,
    expiresAt: row.expires_at,
    acceptedByUserId: row.accepted_by_user_id,
    studentUserId: row.student_user_id,
  };
}

export interface AcceptInvitationResult {
  journeyId: string;
  userId: string;
  alreadyAccepted: boolean;
}

export async function acceptInvitation(
  token: string,
  displayName: string,
  sessionUserId: string | null,
): Promise<AcceptInvitationResult> {
  const tokenHash = hashToken(token);

  return withTransaction(async (client) => {
    const inviteResult = await client.query(
      `SELECT i.id, i.journey_id, i.status, i.expires_at, i.accepted_by_user_id,
              j.student_user_id
       FROM journey_invitations i
       JOIN driving_journeys j ON j.id = i.journey_id
       WHERE i.token_hash = $1
       FOR UPDATE OF i`,
      [tokenHash],
    );

    if (inviteResult.rowCount === 0) {
      throw new NotFoundError("Invitation not found");
    }

    const invite = inviteResult.rows[0];
    const reusableUserId = await getReusableSessionUserId(sessionUserId, client);

    if (invite.status === "accepted") {
      if (reusableUserId && invite.accepted_by_user_id === reusableUserId) {
        return {
          journeyId: invite.journey_id,
          userId: reusableUserId,
          alreadyAccepted: true,
        };
      }
      throw new AppError("Invitation already accepted", 409, "already_accepted");
    }

    if (invite.status !== "pending") {
      throw new AppError("Invitation is no longer valid", 410, "invalid_invitation");
    }

    if (new Date(invite.expires_at) <= new Date()) {
      throw new AppError("Invitation has expired", 410, "expired");
    }

    let userId = reusableUserId;
    if (!userId) {
      const user = await createGuestUser(displayName, client);
      userId = user.id;
    } else {
      const current = await client.query(
        `SELECT account_state FROM users WHERE id = $1`,
        [userId],
      );
      const accountState = String(current.rows[0]?.account_state ?? "");
      if (accountState === "guest" && displayName.trim()) {
        await client.query(
          `UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`,
          [userId, displayName.trim()],
        );
      }
    }

    if (invite.student_user_id === userId) {
      throw new ForbiddenError("Student cannot join own journey as supervisor");
    }

    const acceptResult = await client.query(
      `UPDATE journey_invitations
       SET status = 'accepted',
           accepted_at = now(),
           accepted_by_user_id = $2,
           updated_at = now()
       WHERE id = $1
         AND status = 'pending'
         AND expires_at > now()
       RETURNING id`,
      [invite.id, userId],
    );

    if (acceptResult.rowCount === 0) {
      const current = await client.query(
        `SELECT status, accepted_by_user_id FROM journey_invitations WHERE id = $1`,
        [invite.id],
      );
      const row = current.rows[0];
      if (row.status === "accepted" && row.accepted_by_user_id === userId) {
        return {
          journeyId: invite.journey_id,
          userId,
          alreadyAccepted: true,
        };
      }
      throw new AppError("Invitation could not be accepted", 409, "accept_failed");
    }

    await client.query(
      `INSERT INTO journey_collaborators (journey_id, user_id, role, status)
       VALUES ($1, $2, 'supervisor', 'active')
       ON CONFLICT (journey_id, user_id) DO UPDATE SET
         status = 'active',
         role = EXCLUDED.role,
         updated_at = now()`,
      [invite.journey_id, userId],
    );

    const accepted = {
      journeyId: invite.journey_id as string,
      userId,
      alreadyAccepted: false,
    };
    const supervisors = await client.query(
      `SELECT count(*)::int AS count
       FROM journey_collaborators
       WHERE journey_id = $1 AND status = 'active' AND role = 'supervisor'`,
      [accepted.journeyId],
    );
    await recordProductEventSafe(
      {
        name: "supervisor_connected",
        journeyId: accepted.journeyId,
        userId,
        actorRole: "supervisor",
        supervisorCount: Number(supervisors.rows[0]?.count ?? 1),
      },
      undefined,
      client,
    );
    return accepted;
  });
}
