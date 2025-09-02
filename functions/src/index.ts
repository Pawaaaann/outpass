import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import nodemailer from "nodemailer";
import Twilio from "twilio";
import QRCode from "qrcode";
import { randomBytes } from "crypto";
import * as querystring from "querystring";

admin.initializeApp();

// Derive approver sequence from request data
function computeApproverSequence(data: any): string[] {
  const isDayScholar = !!data?.isDayScholar;
  const isEmergency = (data?.leaveType || "").toString().toLowerCase() === "emergency";
  // Special case: day scholar emergency -> Mentor → HOD → Warden (skip principal)
  if (isDayScholar && isEmergency) {
    return ["mentor", "hod", "warden"];
  }
  // Default flow: Mentor → HOD → Principal → Warden
  return ["mentor", "hod", "principal", "warden"];
}

function nextApproverRoleFromData(data: any, approvals: any[]): string | null {
  const seq = computeApproverSequence(data);
  const done = approvals?.length || 0;
  return done < seq.length ? seq[done] : null;
}

// Helpers to load config and send messages
function getConfig() {
  const cfg = functions.config?.() || (functions as any).config?.() || {};
  const smtp = cfg.smtp || {};
  const twilio = cfg.twilio || {};
  const app = cfg.app || {};
  return { smtp, twilio, app } as any;
}

async function sendParentEmail(to: string, subject: string, html: string) {
  const { smtp } = getConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port || 587),
    secure: Boolean(smtp.secure || false),
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });

  await transporter.sendMail({ from: smtp.from || smtp.user, to, subject, html });
}

async function sendParentSms(to: string, body: string) {
  const { twilio } = getConfig();
  const client = Twilio(twilio.sid, twilio.token);
  if (twilio.from) {
    await client.messages.create({ to, from: twilio.from, body });
  }
}

async function sendParentWhatsapp(to: string, body: string) {
  const { twilio } = getConfig();
  const client = Twilio(twilio.sid, twilio.token);
  if (twilio.whatsapp_from) {
    const toAddr = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    await client.messages.create({ to: toAddr, from: `whatsapp:${twilio.whatsapp_from}`, body });
  }
}

// Helper: generate short numeric approval code
function generateApprovalCode(): string {
  const code = Math.floor(100000 + Math.random() * 900000); // 6-digit
  return String(code);
}

// On create: normalize and set timestamps/defaults
export const onLeaveRequestCreate = functions.firestore
  .document("leaveRequests/{id}")
  .onCreate(async (snap: any) => {
    const data = snap.data();
    const approvals = Array.isArray(data.approvals) ? data.approvals : [];
    const next = nextApproverRoleFromData(data, approvals) || "mentor";
    // Enrich with student's department for role-based dashboards (e.g., HOD)
    let department: string | null = null;
    try {
      const studentRef: any = data.studentId;
      let studentSnap: any = null;
      if (typeof studentRef === 'string') studentSnap = await admin.firestore().doc(`users/${studentRef}`).get();
      else studentSnap = await (studentRef as any).get();
      if (studentSnap?.exists) {
        department = (studentSnap.data()?.department || '').toString();
      }
    } catch (e) {
      console.warn('Could not resolve student department on create:', e);
    }

    await snap.ref.set(
      {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: data.status || "pending",
        approvals,
        nextApproverRole: next,
        // Store department for efficient querying in dashboards
        ...(department ? { department } : {}),
      },
      { merge: true }
    );
  });

// HTTPS endpoint for parent confirmation via token
export const confirmParent = functions.https.onRequest(async (req: any, res: any) => {
  try {
    const token = (req.query.token as string) || "";
    if (!token) {
      res.status(400).send("Missing token");
      return;
    }

    const notifSnap = await admin.firestore().collection("notifications").where("token", "==", token).limit(1).get();
    if (notifSnap.empty) {
      res.status(404).send("Invalid or expired token");
      return;
    }
    const notifDoc = notifSnap.docs[0];
    const notif = notifDoc.data();

    // Mark notification as confirmed
    await notifDoc.ref.set({ confirmed: true, confirmedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // Update leave request with parent confirmation flag
    try {
      const leaveRef = notif.leaveRequestId; // DocumentReference stored earlier
      await leaveRef.set({ parentConfirmation: { confirmed: true, confirmedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
    } catch (e) {
      console.error("Failed to update leave request on parent confirmation:", e);
    }

    res.status(200).send("Parent confirmation recorded. Thank you.");
  } catch (e) {
    console.error("confirmParent handler error:", e);
    res.status(500).send("Internal error");
  }
});

// Sync Firestore users/{uid}.role to Firebase Auth custom claims
export const onUserRoleWrite = functions.firestore
  .document('users/{uid}')
  .onWrite(async (change: any, context: any) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return;
    const uid = context.params.uid;
    const role = after.role;
    const allowed = ['student','mentor','hod','principal','warden','admin'];
    if (!allowed.includes(role)) {
      console.warn('Invalid role, skipping claims update for uid', uid, 'role', role);
      return;
    }
    try {
      await admin.auth().setCustomUserClaims(uid, { role });
      // Touch a token refresh indicator to let clients refetch token if desired
      await admin.firestore().collection('users').doc(uid).set({ claimsSyncedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      console.log('Set custom claims for', uid, role);
    } catch (e) {
      console.error('Failed to set custom claims for', uid, e);
    }
  });

// On update: enforce approval progression and emit notifications
export const onLeaveRequestUpdate = functions.firestore
  .document("leaveRequests/{id}")
  .onUpdate(async (change: any, context: any) => {
    const before = change.before.data();
    const after = change.after.data();

    // If approvals grew by one, recompute nextApproverRole/status and updatedAt
    const approvalsBefore = before.approvals || [];
    const approvalsAfter = after.approvals || [];
    const approvalsAppended = approvalsAfter.length === approvalsBefore.length + 1;

    const updates: Record<string, any> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };

    if (approvalsAppended) {
      // Enforce strict approval order: mentor -> hod -> principal -> warden (with special cases via computeApproverSequence)
      const expectedNextBefore = nextApproverRoleFromData(before, approvalsBefore);
      const latest = approvalsAfter[approvalsAfter.length - 1] || {};
      if (latest?.role !== expectedNextBefore) {
        console.warn("Out-of-order approval detected; reverting latest approval", {
          expected: expectedNextBefore, actual: latest?.role, id: context.params.id,
        });
        // Revert to previous approvals and keep nextApproverRole unchanged
        await change.after.ref.set({
          approvals: approvalsBefore,
          nextApproverRole: expectedNextBefore,
          orderViolation: {
            at: admin.firestore.FieldValue.serverTimestamp(),
            expected: expectedNextBefore,
            actual: latest?.role || null,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return; // stop further processing
      }
      // Frontend stores approval field as 'status' with values 'approved' | 'rejected'
      const anyRejected = approvalsAfter.some((a: any) => a?.status === "rejected");
      let status: "pending" | "approved" | "rejected" = anyRejected ? "rejected" : "pending";
      const next = nextApproverRoleFromData(after, approvalsAfter);
      if (!next && !anyRejected) status = "approved";
      updates["status"] = status;
      updates["nextApproverRole"] = next;

      // If the latest approval is Mentor-approved, notify parent
      if (latest.role === "mentor" && latest.status === "approved") {
        try {
          const studentRef: any = after.studentId;
          let studentSnap: any = null;
          if (typeof studentRef === "string") studentSnap = await admin.firestore().doc(`users/${studentRef}`).get();
          else studentSnap = await (studentRef as any).get();
          const student = studentSnap.exists ? studentSnap.data() : {} as any;
          const parent = student?.parentContact || {};

          const token = randomBytes(24).toString("hex");
          const notificationRef = await admin.firestore().collection("notifications").add({
            leaveRequestId: change.after.ref,
            type: "parent_approval",
            token,
            studentId: studentSnap.ref,
            parentContact: parent,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          const start = after.startDate?.toDate?.() ? after.startDate.toDate() : new Date(after.startDate);
          const end = after.endDate?.toDate?.() ? after.endDate.toDate() : new Date(after.endDate);
          const { app } = getConfig();
          const baseUrl = app.base_url || "";
          const fnApproveUrl = `${baseUrl}/confirmParent?token=${token}`;

          const subject = `Mentor approved leave for ${student?.name || "your ward"}`;
          const html = `
            <p>Dear Parent,</p>
            <p>The mentor has approved a leave request for <strong>${student?.name || "your ward"}</strong>.</p>
            <ul>
              <li><strong>Dates:</strong> ${start.toDateString()} to ${end.toDateString()}</li>
              <li><strong>Reason:</strong> ${after.reason || "-"}</li>
            </ul>
            <p>Please confirm your acknowledgment by clicking the link below:</p>
            <p><a href="${fnApproveUrl}">Confirm Parent Approval</a></p>
            <p>If you did not request this, you can ignore this message.</p>
          `;
          const smsBody = `Mentor approved leave for ${student?.name || "your ward"} (${start.toDateString()} - ${end.toDateString()}). Reason: ${after.reason || "-"}. Confirm: ${fnApproveUrl}`;

          // Send email
          if (parent?.email) {
            try { await sendParentEmail(parent.email, subject, html); } catch (e) { console.error("Email send failed", e); }
          }
          // Send SMS
          if (parent?.phone) {
            try { await sendParentSms(parent.phone, smsBody); } catch (e) { console.error("SMS send failed", e); }
          }
          // Send WhatsApp if configured and contact provided
          if (parent?.whatsapp) {
            try { await sendParentWhatsapp(parent.whatsapp, smsBody); } catch (e) { console.error("WhatsApp send failed", e); }
          }

          await notificationRef.set({ status: "sent", sentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        } catch (notifyErr) {
          console.error("Failed to notify parent on mentor approval:", notifyErr);
        }
      }

      // If the latest approval is Warden-approved and overall status is approved, generate a QR gate pass
      if (latest.role === "warden" && latest.status === "approved" && (!next && !anyRejected)) {
        try {
          const leaveId = context.params.id;
          const start = after.startDate?.toDate?.() ? after.startDate.toDate() : new Date(after.startDate);
          const end = after.endDate?.toDate?.() ? after.endDate.toDate() : new Date(after.endDate);
          const payload = {
            type: "gate_pass",
            leaveId,
            studentId: typeof after.studentId === "string" ? after.studentId : after.studentId?.id || null,
            registerNumber: after.registerNumber || after.regNo || null,
            validFrom: start?.toISOString?.() || null,
            validTo: end?.toISOString?.() || null,
            issuedAt: new Date().toISOString(),
            checksum: randomBytes(8).toString("hex"),
          } as any;
          const text = JSON.stringify(payload);
          const dataUrl = await QRCode.toDataURL(text, { errorCorrectionLevel: "M", width: 512, margin: 1 });
          updates["gatePass"] = {
            status: "issued",
            qrDataUrl: dataUrl,
            payload,
            issuedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
        } catch (e) {
          console.error("Failed to generate QR gate pass:", e);
          updates["gatePass"] = { status: "failed", error: String(e), at: admin.firestore.FieldValue.serverTimestamp() };
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await change.after.ref.set(updates, { merge: true });
    }

    // If status transitioned, create a notification document
    if (before.status !== after.status && (after.status === "approved" || after.status === "rejected")) {
      try {
        // Resolve student doc
        const studentRef: any = after.studentId;
        let studentSnap: any = null;
        if (typeof studentRef === "string") studentSnap = await admin.firestore().doc(`users/${studentRef}`).get();
        else studentSnap = await (studentRef as any).get();
        const student = studentSnap.exists ? studentSnap.data() : {} as any;
        const parentContact = student?.parentContact || {};

        const start = after.startDate?.toDate?.() ? after.startDate.toDate() : new Date(after.startDate);
        const end = after.endDate?.toDate?.() ? after.endDate.toDate() : new Date(after.endDate);

        const message = after.status === "approved"
          ? `Your ward's leave request (${start.toDateString()} to ${end.toDateString()}) is APPROVED.`
          : `Your ward's leave request (${start.toDateString()} to ${end.toDateString()}) was REJECTED.`;

        await admin.firestore().collection("notifications").add({
          leaveRequestId: change.after.ref,
          parentContact: parentContact || {},
          message,
          status: "sent",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error("Failed to create notification:", e);
      }
    }
  });

// Mentor logs a call attempt to parent; if not answered, send approval message with code
export const logMentorCall = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }
  const callerUid = context.auth.uid;
  try {
    const userSnap = await admin.firestore().collection('users').doc(callerUid).get();
    const role = userSnap.get('role');
    if (role !== 'mentor' && role !== 'admin') {
      throw new functions.https.HttpsError("permission-denied", "Only mentors/admins can log calls");
    }
  } catch (e) {
    if (e instanceof functions.https.HttpsError) throw e;
    throw new functions.https.HttpsError("internal", "Failed to verify role");
  }

  const leaveRequestId: string = data?.leaveRequestId;
  const outcome: string = (data?.outcome || '').toLowerCase(); // 'answered'|'no_answer'|'busy'|'failed'
  const notes: string = data?.notes || '';
  if (!leaveRequestId) throw new functions.https.HttpsError("invalid-argument", "leaveRequestId is required");
  const allowedOutcomes = ['answered','no_answer','busy','failed'];
  if (!allowedOutcomes.includes(outcome)) throw new functions.https.HttpsError("invalid-argument", "Invalid outcome");

  const leaveRef = admin.firestore().collection('leaveRequests').doc(leaveRequestId);
  const leaveSnap = await leaveRef.get();
  if (!leaveSnap.exists) throw new functions.https.HttpsError("not-found", "Leave request not found");
  const leave = leaveSnap.data() || {};

  await leaveRef.collection('callLogs').add({
    by: admin.firestore().doc(`users/${callerUid}`),
    outcome,
    notes,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (outcome !== 'answered') {
    const studentRef: any = (leave as any).studentId;
    let studentSnap: any = null;
    if (typeof studentRef === "string") studentSnap = await admin.firestore().doc(`users/${studentRef}`).get();
    else studentSnap = await (studentRef as any).get();
    const student = studentSnap.exists ? studentSnap.data() : {} as any;
    const parent = student?.parentContact || {};

    const code = generateApprovalCode();
    const token = randomBytes(24).toString("hex");
    const notificationRef = await admin.firestore().collection('notifications').add({
      leaveRequestId: leaveRef,
      type: 'parent_sms_approval',
      token,
      code,
      studentId: studentSnap.ref,
      parentContact: parent,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const start = (leave as any).startDate?.toDate?.() ? (leave as any).startDate.toDate() : new Date((leave as any).startDate);
    const end = (leave as any).endDate?.toDate?.() ? (leave as any).endDate.toDate() : new Date((leave as any).endDate);
    const { app } = getConfig();
    const baseUrl = app.base_url || "";
    const fnApproveUrl = `${baseUrl}/confirmParent?token=${token}`;
    const studentName = student?.name || 'your ward';

    const smsBody = `Mentor tried calling about leave for ${studentName} (${start.toDateString()} - ${end.toDateString()}). Reply YES ${code} to APPROVE, NO ${code} to REJECT. Or tap: ${fnApproveUrl}`;

    try {
      if (parent?.phone) await sendParentSms(parent.phone, smsBody);
      if (parent?.whatsapp) await sendParentWhatsapp(parent.whatsapp, smsBody);
      await notificationRef.set({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error('Failed to send parent SMS/WhatsApp:', e);
      await notificationRef.set({ status: 'failed', error: String(e) }, { merge: true });
      throw new functions.https.HttpsError('internal', 'Failed to send message to parent');
    }
  }

  await leaveRef.set({ lastCallOutcome: outcome, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

// Twilio webhook to capture parent SMS replies like: "YES 123456" or "NO 123456"
export const twilioInboundSms = functions.https.onRequest(async (req: any, res: any) => {
  try {
    // Twilio posts application/x-www-form-urlencoded by default.
    let rawBody: any = req.body || {};
    const ct = (req.headers['content-type'] || '').toString();
    if (!Object.keys(rawBody).length && ct.includes('application/x-www-form-urlencoded') && req.rawBody) {
      const parsed = querystring.parse(req.rawBody.toString('utf8')) as any;
      rawBody = parsed;
    }
    const text: string = (rawBody.Body || rawBody.body || '').toString().trim();
    const from: string = (rawBody.From || rawBody.from || '').toString();
    if (!text) { res.status(400).send('Missing Body'); return; }

    const upper = text.toUpperCase();
    const match = upper.match(/\b(YES|NO)\s+(\d{4,8})\b/);
    if (!match) { res.status(200).send('Unrecognized format. Reply YES <code> or NO <code>.'); return; }
    const decision = match[1] === 'YES' ? 'approved' : 'rejected';
    const code = match[2];

    const notifSnap = await admin.firestore()
      .collection('notifications')
      .where('type', '==', 'parent_sms_approval')
      .where('code', '==', code)
      .limit(1)
      .get();
    if (notifSnap.empty) { res.status(404).send('Code not found'); return; }

    const notifDoc = notifSnap.docs[0];
    const notif = notifDoc.data();
    const leaveRef = notif.leaveRequestId;

    await notifDoc.ref.set({
      confirmed: true,
      parentDecision: decision,
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      from,
      status: 'responded',
    }, { merge: true });

    try {
      await leaveRef.set({
        parentConfirmation: {
          confirmed: true,
          method: 'sms',
          decision,
          from,
          at: admin.firestore.FieldValue.serverTimestamp(),
        }
      }, { merge: true });
    } catch (e) {
      console.error('Failed to update leave with parent SMS decision', e);
    }

    res.status(200).send('Thanks. Your response has been recorded.');
  } catch (e) {
    console.error('twilioInboundSms error', e);
    res.status(500).send('Internal error');
  }
});

// Clean up old notifications (runs daily)
export const cleanupOldNotifications = functions.pubsub
  .schedule("0 2 * * *") // Run at 2 AM daily
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const oldNotifications = await admin
      .firestore()
      .collection("notifications")
      .where("sentAt", "<", thirtyDaysAgo)
      .get();

    const batch = admin.firestore().batch();
    oldNotifications.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Deleted ${oldNotifications.size} old notifications`);
  });

// Generate simple weekly stats
export const generateLeaveStatistics = functions.pubsub
  .schedule("0 9 * * 1") // 9 AM every Monday
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    try {
      const oneWeekAgo = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
      const recentRequests = await admin
        .firestore()
        .collection("leaveRequests")
        .where("createdAt", ">=", oneWeekAgo)
        .get();

      const stats: any = {
        totalRequests: recentRequests.size,
        approvedRequests: 0,
        rejectedRequests: 0,
        pendingRequests: 0,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      recentRequests.forEach((doc: any) => {
        const s = doc.get("status");
        if (s === "approved") stats.approvedRequests++;
        else if (s === "rejected") stats.rejectedRequests++;
        else stats.pendingRequests++;
      });

      await admin.firestore().collection("statistics").add(stats);
      console.log("Weekly statistics generated", stats);
    } catch (error) {
      console.error("Error generating statistics:", error);
    }
  });

// ==========================
// Callable functions (simple)
// ==========================
// Resolve admin email by username (used by AdminLogin on the client)
export const resolveAdminEmail = functions.https.onCall(async (data: any) => {
  const username: string = (data?.username || '').toString().trim().toLowerCase();
  if (!username) {
    throw new functions.https.HttpsError('invalid-argument', 'username is required');
  }
  try {
    const snap = await admin.firestore()
      .collection('users')
      .where('role', '==', 'admin')
      .where('username', '==', username)
      .limit(1)
      .get();
    if (snap.empty) {
      throw new functions.https.HttpsError('not-found', 'admin username not found');
    }
    const email = snap.docs[0].get('email');
    if (!email) {
      throw new functions.https.HttpsError('failed-precondition', 'admin record missing email');
    }
    return { email };
  } catch (e: any) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error('resolveAdminEmail error', e?.stack || e);
    throw new functions.https.HttpsError('internal', 'Failed to resolve admin email');
  }
});
// One-time secure bootstrap endpoint to create/update an admin user
export const bootstrapAdmin = functions.https.onRequest(async (req: any, res: any) => {
  try {
    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'POST') { res.status(405).send('Use POST'); return; }
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const email: string = (body.email || '').toString().trim().toLowerCase();
    const username: string = (body.username || '').toString().trim().toLowerCase();
    const password: string = (body.password || '').toString();
    const token: string = (body.token || '').toString();
    const { app } = getConfig();
    const expected = (app && app.bootstrap_token) ? String(app.bootstrap_token) : '';
    if (!expected || token !== expected) { res.status(401).send('Unauthorized'); return; }
    if (!email || !username || !password) { res.status(400).send('email, username, password required'); return; }

    // Create or update the auth user
    let userRecord: admin.auth.UserRecord | null = null;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (_) { /* not found */ }

    if (!userRecord) {
      userRecord = await admin.auth().createUser({ email, password, emailVerified: true, disabled: false });
    } else {
      // Ensure password is set as requested
      await admin.auth().updateUser(userRecord.uid, { password });
    }

    // Set custom claim role: admin
    await admin.auth().setCustomUserClaims(userRecord.uid, { role: 'admin' });

    // Upsert Firestore user document
    const userRef = admin.firestore().collection('users').doc(userRecord.uid);
    await userRef.set({
      email,
      role: 'admin',
      username,
      department: 'admin',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({ ok: true, uid: userRecord.uid });
  } catch (e) {
    console.error('bootstrapAdmin error', e);
    res.status(500).send('Internal error');
  }
});
export const updateLeaveStatus = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const uid = context.auth.uid;
  try {
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    const role = userSnap.get('role');
    const allowed = ['mentor','hod','principal','warden','admin'];
    if (!allowed.includes(role)) {
      throw new functions.https.HttpsError('permission-denied', 'Insufficient role');
    }

    const leaveRequestId: string = (data?.leaveRequestId || '').toString();
    const status: string = (data?.status || '').toString().toLowerCase();
    const comments: string = (data?.comments || '').toString();
    if (!leaveRequestId) throw new functions.https.HttpsError('invalid-argument', 'leaveRequestId is required');
    if (!['approved','rejected'].includes(status)) throw new functions.https.HttpsError('invalid-argument', 'status must be approved or rejected');

    const ref = admin.firestore().collection('leaveRequests').doc(leaveRequestId);
    await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Leave request not found');
      const data = snap.data() || {} as any;
      const approvals = Array.isArray((data as any).approvals) ? ([...(data as any).approvals] as any[]) : [];

      // Validate approver order unless admin
      const expected = nextApproverRoleFromData(data, approvals);
      if (role !== 'admin' && expected && expected !== role) {
        throw new functions.https.HttpsError('permission-denied', `Out-of-order approval. Expected ${expected}`);
      }

      approvals.push({
        role,
        status,
        comment: comments || '',
        approverUid: uid,
        at: new Date(),
      });

      // Compute next approver and status
      const anyRejected = approvals.some((a: any) => a?.status === "rejected");
      let newStatus: "pending" | "approved" | "rejected" = anyRejected ? "rejected" : "pending";
      const next = nextApproverRoleFromData(data, approvals);
      if (!next && !anyRejected) newStatus = "approved";

      const update: any = {
        approvals,
        comments,
        status: newStatus.toUpperCase(),
        nextApproverRole: next,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastAction: { by: admin.firestore().doc(`users/${uid}`), role, at: admin.firestore.FieldValue.serverTimestamp(), action: status },
      };
      tx.set(ref, update, { merge: true });
    });

    return { ok: true };
  } catch (e: any) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error('updateLeaveStatus error', e?.stack || e);
    const msg = typeof e?.message === 'string' ? e.message : 'Failed to update status';
    throw new functions.https.HttpsError('internal', msg, { code: e?.code, details: e?.toString?.() });
  }
});

export const logParentCall = functions.https.onCall(async (data: any, context: any) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const uid = context.auth.uid;
  try {
    const userSnap = await admin.firestore().collection('users').doc(uid).get();
    const role = userSnap.get('role');
    if (role !== 'mentor' && role !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only mentors/admins can log calls');
    }

    const leaveRequestId: string = (data?.leaveRequestId || '').toString();
    const outcome: string = (data?.outcome || '').toString();
    const notes: string = (data?.notes || '').toString();
    if (!leaveRequestId) throw new functions.https.HttpsError('invalid-argument', 'leaveRequestId is required');
    if (!outcome) throw new functions.https.HttpsError('invalid-argument', 'outcome is required');

    const ref = admin.firestore().collection('leaveRequests').doc(leaveRequestId).collection('parentCalls').doc();
    await ref.set({ by: admin.firestore().doc(`users/${uid}`), outcome, notes, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return { ok: true };
  } catch (e: any) {
    if (e instanceof functions.https.HttpsError) throw e;
    console.error('logParentCall error', e?.stack || e);
    const msg = typeof e?.message === 'string' ? e.message : 'Failed to log parent call';
    throw new functions.https.HttpsError('internal', msg, { code: e?.code, details: e?.toString?.() });
  }
});
