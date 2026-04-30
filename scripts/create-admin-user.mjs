import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    out[key] = value;
    if (value !== "true") i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const email = String(args.email ?? "").trim();
  const password = String(args.password ?? "").trim();
  const role = String(args.role ?? "admin").trim();

  if (!email || !password) {
    throw new Error("Usage: node --env-file=.env.local scripts/create-admin-user.mjs --email <email> --password <password> [--role admin]");
  }

  if (!["admin", "moderator", "support"].includes(role)) {
    throw new Error("role must be one of: admin, moderator, support");
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY in environment.");
  }

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

  const auth = getAuth(app);
  const db = getFirestore(app);

  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true, disabled: false });
    console.log(`Updated existing user: ${user.uid}`);
  } catch {
    user = await auth.createUser({ email, password, emailVerified: true, disabled: false });
    console.log(`Created user: ${user.uid}`);
  }

  await auth.setCustomUserClaims(user.uid, { role });

  await db.collection("users").doc(user.uid).set(
    {
      email,
      status: "active",
      role,
      isVerified: true,
      verificationStatus: "verified",
      verifiedAt: new Date().toISOString(),
      verificationSource: "bootstrap_script",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log(`Assigned custom claim role=${role} for ${email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
