import { getPool } from "../db/pool.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export interface SupportWaitlistHit {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

export interface SupportUserHit {
  id: string;
  displayName: string | null;
  accountState: string;
  matchReasons: Array<"uuid" | "auth_identity" | "contact_email" | "display_name">;
}

export interface SupportSearchResult {
  query: string;
  waitlist: SupportWaitlistHit[];
  users: SupportUserHit[];
}

export interface SupportJourneyRole {
  journeyId: string;
  journeyStatus: string;
  role: "student" | "supervisor";
  collaboratorStatus: string | null;
  otherPartyLabel: string;
}

export interface SupportUserView {
  id: string;
  accountState: string;
  displayName: string | null;
  contactEmail: string | null;
  createdAt: string;
  identities: Array<{ provider: string; providerSubject: string; email: string | null }>;
  journeys: SupportJourneyRole[];
  journeyCount: number;
  driveCount: number;
  completedDriveCount: number;
  observationCount: number;
  relatedWaitlist: SupportWaitlistHit[];
}

function mapWaitlist(row: Record<string, unknown>): SupportWaitlistHit {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: String(row.role),
    status: String(row.status),
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function searchSupport(rawQuery: string): Promise<SupportSearchResult> {
  const query = rawQuery.trim();
  if (!query) {
    return { query, waitlist: [], users: [] };
  }

  const waitlist: SupportWaitlistHit[] = [];
  const usersById = new Map<string, SupportUserHit>();

  function addUser(
    row: { id: string; display_name: string | null; account_state: string },
    reason: SupportUserHit["matchReasons"][number],
  ) {
    const existing = usersById.get(row.id);
    if (existing) {
      if (!existing.matchReasons.includes(reason)) existing.matchReasons.push(reason);
      return;
    }
    usersById.set(row.id, {
      id: row.id,
      displayName: row.display_name,
      accountState: row.account_state,
      matchReasons: [reason],
    });
  }

  if (looksLikeEmail(query)) {
    const email = query.toLowerCase();
    const signups = await getPool().query(
      `SELECT id, name, email, role, status, created_at
       FROM interest_signups
       WHERE email_normalized = $1
       ORDER BY created_at DESC
       LIMIT 25`,
      [email],
    );
    waitlist.push(...signups.rows.map((row) => mapWaitlist(row as Record<string, unknown>)));

    const byEmail = await getPool().query(
      `SELECT u.id, u.display_name, u.account_state,
              (u.contact_email_normalized = $1) AS via_contact,
              EXISTS (
                SELECT 1 FROM auth_identities a
                WHERE a.user_id = u.id
                  AND (
                    a.email_normalized = $1
                    OR (a.provider = 'email_magic_link' AND lower(a.provider_subject) = $1)
                  )
              ) AS via_identity
       FROM users u
       WHERE u.contact_email_normalized = $1
          OR EXISTS (
            SELECT 1 FROM auth_identities a
            WHERE a.user_id = u.id
              AND (
                a.email_normalized = $1
                OR (a.provider = 'email_magic_link' AND lower(a.provider_subject) = $1)
              )
          )
       LIMIT 25`,
      [email],
    );
    for (const row of byEmail.rows) {
      if (row.via_identity) addUser(row, "auth_identity");
      if (row.via_contact) addUser(row, "contact_email");
    }
  }

  if (isUuid(query)) {
    const byId = await getPool().query(
      `SELECT id, display_name, account_state FROM users WHERE id = $1`,
      [query],
    );
    for (const row of byId.rows) {
      addUser(row, "uuid");
    }
  }

  const exactSubject = await getPool().query(
    `SELECT u.id, u.display_name, u.account_state, a.provider
     FROM auth_identities a
     JOIN users u ON u.id = a.user_id
     WHERE a.provider_subject = $1
        OR (a.provider = 'email_magic_link' AND lower(a.provider_subject) = lower($1))
     LIMIT 25`,
    [query],
  );
  for (const row of exactSubject.rows) {
    addUser(row, "auth_identity");
  }

  if (!isUuid(query) && query.length >= 2) {
    const nameHits = await getPool().query(
      `SELECT id, display_name, account_state
       FROM users
       WHERE display_name ILIKE $1 ESCAPE '\\'
         AND account_state <> 'deleted'
       ORDER BY created_at DESC
       LIMIT 25`,
      [`%${escapeLike(query)}%`],
    );
    for (const row of nameHits.rows) {
      addUser(row, "display_name");
    }
  }

  return { query, waitlist, users: [...usersById.values()] };
}

function actorLabel(accountState: string, role: "student" | "supervisor", displayName: string | null): string {
  if (accountState === "deleted") {
    return role === "supervisor" ? "Tidigare handledare" : "Tidigare elev";
  }
  return displayName?.trim() || (role === "supervisor" ? "Handledare" : "Elev");
}

export async function getSupportUserView(userId: string): Promise<SupportUserView | null> {
  const userResult = await getPool().query(
    `SELECT id, display_name, contact_email, account_state, created_at FROM users WHERE id = $1`,
    [userId],
  );
  const user = userResult.rows[0] as
    | {
        id: string;
        display_name: string | null;
        contact_email: string | null;
        account_state: string;
        created_at: Date | string;
      }
    | undefined;
  if (!user) return null;

  const identities = await getPool().query(
    `SELECT provider, provider_subject, email
     FROM auth_identities
     WHERE user_id = $1
     ORDER BY created_at`,
    [userId],
  );

  const studentJourneys = await getPool().query(
    `SELECT j.id, j.status
     FROM driving_journeys j
     WHERE j.student_user_id = $1
     ORDER BY j.created_at`,
    [userId],
  );

  const supervisorJourneys = await getPool().query(
    `SELECT j.id, j.status, jc.status AS collaborator_status,
            su.display_name AS student_display_name,
            su.account_state AS student_account_state
     FROM journey_collaborators jc
     JOIN driving_journeys j ON j.id = jc.journey_id
     JOIN users su ON su.id = j.student_user_id
     WHERE jc.user_id = $1 AND jc.role = 'supervisor'
     ORDER BY jc.created_at`,
    [userId],
  );

  const journeys: SupportJourneyRole[] = [
    ...studentJourneys.rows.map((row) => ({
      journeyId: String(row.id),
      journeyStatus: String(row.status),
      role: "student" as const,
      collaboratorStatus: null,
      otherPartyLabel: user.account_state === "deleted" ? "Tidigare elev" : "Elevresa",
    })),
    ...supervisorJourneys.rows.map((row) => ({
      journeyId: String(row.id),
      journeyStatus: String(row.status),
      role: "supervisor" as const,
      collaboratorStatus: String(row.collaborator_status),
      otherPartyLabel: actorLabel(
        String(row.student_account_state),
        "student",
        row.student_display_name == null ? null : String(row.student_display_name),
      ),
    })),
  ];

  const counts = await getPool().query(
    `SELECT
       (SELECT count(*)::int FROM driving_journeys WHERE student_user_id = $1)
         + (SELECT count(*)::int FROM journey_collaborators WHERE user_id = $1) AS journeys,
       (SELECT count(*)::int FROM drives
         WHERE started_by_user_id = $1 OR supervisor_user_id = $1) AS drives,
       (SELECT count(*)::int FROM drives
         WHERE ended_at IS NOT NULL
           AND (started_by_user_id = $1 OR supervisor_user_id = $1)) AS completed_drives,
       (SELECT count(*)::int FROM drive_observations o
         WHERE o.observer_user_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM drive_observations newer
             WHERE newer.supersedes_observation_id = o.id
               AND newer.journey_id = o.journey_id
           )) AS observations`,
    [userId],
  );

  const identityEmails = identities.rows.flatMap((row) => {
    const values: string[] = [];
    if (row.email) values.push(String(row.email).toLowerCase());
    if (row.provider === "email_magic_link") {
      values.push(String(row.provider_subject).toLowerCase());
    }
    return values;
  });
  if (user.contact_email) identityEmails.push(user.contact_email.toLowerCase());

  let relatedWaitlist: SupportWaitlistHit[] = [];
  if (identityEmails.length > 0) {
    const signups = await getPool().query(
      `SELECT id, name, email, role, status, created_at
       FROM interest_signups
       WHERE email_normalized = ANY($1)
       ORDER BY created_at DESC`,
      [identityEmails],
    );
    relatedWaitlist = signups.rows.map((row) => mapWaitlist(row as Record<string, unknown>));
  }

  const deleted = user.account_state === "deleted";

  return {
    id: user.id,
    accountState: user.account_state,
    displayName: deleted ? null : user.display_name,
    contactEmail: deleted || user.contact_email == null ? null : user.contact_email,
    createdAt: new Date(String(user.created_at)).toISOString(),
    identities: deleted
      ? []
      : identities.rows.map((row) => ({
          provider: String(row.provider),
          providerSubject: String(row.provider_subject),
          email: row.email == null ? null : String(row.email),
        })),
    journeys,
    journeyCount: Number(counts.rows[0]?.journeys ?? 0),
    driveCount: Number(counts.rows[0]?.drives ?? 0),
    completedDriveCount: Number(counts.rows[0]?.completed_drives ?? 0),
    observationCount: Number(counts.rows[0]?.observations ?? 0),
    relatedWaitlist,
  };
}

export function supportUserHeading(view: SupportUserView): string {
  if (view.accountState === "deleted") {
    const supervisor = view.journeys.some((journey) => journey.role === "supervisor");
    if (supervisor) return "Tidigare handledare";
    if (view.journeys.some((journey) => journey.role === "student")) return "Tidigare elev";
    return "Tidigare användare";
  }
  return view.displayName?.trim() || "Produktanvändare";
}
