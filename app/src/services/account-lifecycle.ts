import { AppError, NotFoundError } from "../errors.js";
import { getPool, withTransaction } from "../db/pool.js";

export interface AccountDeletionSummary {
  userId: string;
  alreadyDeleted: boolean;
  deleted: {
    displayName: boolean;
    authIdentities: number;
    studentJourneys: number;
    studentDrives: number;
    studentObservations: number;
    studentInvitations: number;
    studentCollaborators: number;
    studentFocusItems: number;
    collaboratorRows: number;
    acceptedInvitations: number;
  };
  tombstoned: {
    userRow: boolean;
  };
  unlinked: {
    historicalDriveAttributions: number;
    historicalObservationAttributions: number;
    productEvents: number;
  };
  retained: {
    waitlistUntouched: true;
    studentHistoryPreserved: boolean;
  };
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

/**
 * Privileged GDPR account-lifecycle. Never `DELETE FROM users`.
 *
 * Elev: owned `driving_journeys` are deleted (CASCADE of journey children).
 * Handledare: keep the student's journey ledger, but unlink every remaining
 * product FK/id that pointed at the deleted user so history cannot be joined
 * back through `users`. Unlink sets the user-id to NULL *and* the matching
 * `*_deleted` flag so a missing actor cannot be confused with a bad insert.
 *
 * Waitlist (`interest_signups`) is a separate PII store and is not touched.
 */
export async function deleteProductAccount(
  userId: string,
): Promise<AccountDeletionSummary> {
  return withTransaction(async (client) => {
    const userResult = await client.query(
      `SELECT id, display_name, account_state
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId],
    );
    const user = userResult.rows[0] as
      | { id: string; display_name: string | null; account_state: string }
      | undefined;
    if (!user) {
      throw new NotFoundError("Användaren hittades inte");
    }

    if (user.account_state === "deleted") {
      throw new AppError("Kontot är redan raderat", 409, "already_deleted");
    }

    const ownedJourneys = await client.query(
      `SELECT id FROM driving_journeys WHERE student_user_id = $1`,
      [userId],
    );
    const journeyIds = ownedJourneys.rows.map((row) => String(row.id));

    let studentDrives = 0;
    let studentObservations = 0;
    let studentInvitations = 0;
    let studentCollaborators = 0;
    let studentFocusItems = 0;

    if (journeyIds.length > 0) {
      const counts = await client.query(
        `SELECT
           (SELECT count(*)::int FROM drives WHERE journey_id = ANY($1)) AS drives,
           (SELECT count(*)::int FROM drive_observations WHERE journey_id = ANY($1)) AS observations,
           (SELECT count(*)::int FROM journey_invitations WHERE journey_id = ANY($1)) AS invitations,
           (SELECT count(*)::int FROM journey_collaborators WHERE journey_id = ANY($1)) AS collaborators,
           (SELECT count(*)::int FROM training_focus_items WHERE journey_id = ANY($1))
             + (SELECT count(*)::int FROM drive_focus_skills WHERE journey_id = ANY($1)) AS focus_items`,
        [journeyIds],
      );
      studentDrives = num(counts.rows[0]?.drives);
      studentObservations = num(counts.rows[0]?.observations);
      studentInvitations = num(counts.rows[0]?.invitations);
      studentCollaborators = num(counts.rows[0]?.collaborators);
      studentFocusItems = num(counts.rows[0]?.focus_items);

      await client.query(
        `DELETE FROM driving_journeys WHERE student_user_id = $1`,
        [userId],
      );
    }

    const identities = await client.query(
      `DELETE FROM auth_identities WHERE user_id = $1 RETURNING id`,
      [userId],
    );

    const removedCollabs = await client.query(
      `DELETE FROM journey_collaborators WHERE user_id = $1 RETURNING id`,
      [userId],
    );

    const removedInvites = await client.query(
      `DELETE FROM journey_invitations
       WHERE accepted_by_user_id = $1 OR invited_by_user_id = $1
       RETURNING id`,
      [userId],
    );

    const remainingDrives = await client.query(
      `SELECT count(*)::int AS count FROM drives
       WHERE supervisor_user_id = $1 OR started_by_user_id = $1`,
      [userId],
    );
    const remainingObservations = await client.query(
      `SELECT count(*)::int AS count FROM drive_observations
       WHERE observer_user_id = $1`,
      [userId],
    );
    const remainingEvents = await client.query(
      `SELECT count(*)::int AS count FROM product_events WHERE user_id = $1`,
      [userId],
    );

    await client.query(
      `UPDATE drives
       SET supervisor_user_id = NULL,
           supervisor_deleted = true
       WHERE supervisor_user_id = $1`,
      [userId],
    );
    await client.query(
      `UPDATE drives
       SET started_by_user_id = NULL,
           started_by_deleted = true
       WHERE started_by_user_id = $1`,
      [userId],
    );
    await client.query(
      `UPDATE drive_observations
       SET observer_user_id = NULL,
           observer_deleted = true
       WHERE observer_user_id = $1`,
      [userId],
    );
    await client.query(
      `UPDATE product_events
       SET user_id = NULL
       WHERE user_id = $1`,
      [userId],
    );

    await client.query(
      `UPDATE users
       SET account_state = 'deleted',
           display_name = NULL,
           contact_email = NULL,
           contact_email_normalized = NULL,
           updated_at = now()
       WHERE id = $1`,
      [userId],
    );

    const unlinkedDrives = num(remainingDrives.rows[0]?.count);
    const unlinkedObservations = num(remainingObservations.rows[0]?.count);

    return {
      userId,
      alreadyDeleted: false,
      deleted: {
        displayName: user.display_name != null,
        authIdentities: identities.rowCount ?? 0,
        studentJourneys: journeyIds.length,
        studentDrives,
        studentObservations,
        studentInvitations,
        studentCollaborators,
        studentFocusItems,
        collaboratorRows: removedCollabs.rowCount ?? 0,
        acceptedInvitations: removedInvites.rowCount ?? 0,
      },
      tombstoned: {
        userRow: true,
      },
      unlinked: {
        historicalDriveAttributions: unlinkedDrives,
        historicalObservationAttributions: unlinkedObservations,
        productEvents: num(remainingEvents.rows[0]?.count),
      },
      retained: {
        waitlistUntouched: true,
        studentHistoryPreserved: unlinkedDrives > 0 || unlinkedObservations > 0,
      },
    };
  });
}

export function formatDeletionAuditSummary(summary: AccountDeletionSummary): string {
  return [
    `raderat: display_name=${summary.deleted.displayName}`,
    `auth_identities=${summary.deleted.authIdentities}`,
    `elevresor=${summary.deleted.studentJourneys}`,
    `elev-drives=${summary.deleted.studentDrives}`,
    `elev-observationer=${summary.deleted.studentObservations}`,
    `inbjudningar=${summary.deleted.studentInvitations}`,
    `collaborators_removed=${summary.deleted.collaboratorRows}`,
    `tombstone: user_row=true`,
    `frikopplat: drive_attribution=${summary.unlinked.historicalDriveAttributions}`,
    `observation_attribution=${summary.unlinked.historicalObservationAttributions}`,
    `product_events=${summary.unlinked.productEvents}`,
    `waitlist_orörd=true`,
    `historik_frikopplad=true`,
  ].join("; ");
}
