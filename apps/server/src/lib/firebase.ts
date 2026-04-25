import admin from "firebase-admin";

type ServiceAccountLike = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

type FirestoreDocData = Record<string, unknown>;

function stripWrappingQuotes(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith("\"") && v.endsWith("\"")) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function normalizePrivateKey(raw: string): string {
  // Common: copy/paste into env results in `\n` sequences.
  const unescaped = stripWrappingQuotes(raw).replace(/\\n/g, "\n").trim();
  return unescaped;
}

function parseServiceAccountFromEnv(): ServiceAccountLike | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const rawB64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();

  // Be forgiving: many people paste the raw JSON into the *_BASE64 field by mistake.
  // If it looks like JSON, treat it as JSON.
  const rawB64Unwrapped = rawB64 ? stripWrappingQuotes(rawB64) : null;
  const decodedB64 =
    rawB64Unwrapped && !rawB64Unwrapped.trim().startsWith("{")
      ? Buffer.from(rawB64Unwrapped, "base64").toString("utf8")
      : null;

  const raw =
    rawJson ??
    (rawB64Unwrapped?.trim().startsWith("{") ? rawB64Unwrapped : null) ??
    decodedB64;

  if (!raw) return null;

  try {
    const parsed = JSON.parse(stripWrappingQuotes(raw)) as ServiceAccountLike;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

const databaseURL = process.env.FIREBASE_DATABASE_URL?.trim();
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();

const fromServiceAccount = parseServiceAccountFromEnv();
const projectId = (fromServiceAccount?.project_id ?? process.env.FIREBASE_PROJECT_ID)?.trim();
const clientEmail = (fromServiceAccount?.client_email ?? process.env.FIREBASE_CLIENT_EMAIL)?.trim();
const privateKeyRaw =
  fromServiceAccount?.private_key ??
  process.env.FIREBASE_PRIVATE_KEY ??
  // Alias: common naming in other repos / guides.
  process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;
const privateKey = privateKeyRaw ? normalizePrivateKey(privateKeyRaw) : undefined;

const firebaseConfigured = Boolean(projectId && clientEmail && privateKey && databaseURL);

function makeLocalFirestore() {
  const collections = new Map<string, Map<string, FirestoreDocData>>();

  const getCollection = (name: string) => {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name)!;
  };

  const makeDocRef = (collectionName: string, id: string) => {
    const col = getCollection(collectionName);
    return {
      async get() {
        const data = col.get(id);
        return {
          exists: data !== undefined,
          id,
          data: () => (data ? { ...data } : undefined),
          ref: this,
        };
      },
      async set(data: FirestoreDocData, opts?: { merge?: boolean }) {
        if (opts?.merge) {
          const prev = col.get(id) ?? {};
          col.set(id, { ...(prev as FirestoreDocData), ...(data as FirestoreDocData) });
        } else {
          col.set(id, { ...(data as FirestoreDocData) });
        }
      },
      async update(data: FirestoreDocData) {
        const prev = col.get(id) ?? {};
        col.set(id, { ...(prev as FirestoreDocData), ...(data as FirestoreDocData) });
      },
      async delete() {
        col.delete(id);
      },
      collection(sub: string) {
        // Minimal: represent subcollections as `${collectionName}/${id}/${sub}`
        return makeCollectionRef(`${collectionName}/${id}/${sub}`);
      },
    };
  };

  const makeCollectionRef = (name: string) => {
    const col = getCollection(name);
    return {
      doc(id: string) {
        return makeDocRef(name, id);
      },
      async add(data: FirestoreDocData) {
        const id = `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
        col.set(id, { ...(data as FirestoreDocData) });
        return makeDocRef(name, id);
      },
      where() {
        // Extremely minimal query stub: return empty result set
        return {
          where() {
            return this;
          },
          limit() {
            return this;
          },
          async get() {
            return { empty: true, docs: [] as any[] };
          },
        };
      },
      limit() {
        return this;
      },
      async get() {
        return {
          empty: col.size === 0,
          docs: Array.from(col.entries()).map(([id, data]) => ({
            id,
            data: () => ({ ...data }),
            ref: makeDocRef(name, id),
          })),
        };
      },
      count() {
        return {
          async get() {
            return { data: () => ({ count: col.size }) };
          },
        };
      },
    };
  };

  return {
    collection(name: string) {
      return makeCollectionRef(name);
    },
    batch() {
      const ops: Array<() => Promise<void>> = [];
      return {
        delete(ref: any) {
          ops.push(() => ref.delete());
        },
        async commit() {
          for (const op of ops) await op();
        },
      };
    },
    async recursiveDelete(_ref: any) {
      // no-op in local mode
    },
  };
}

function makeLocalRtdb() {
  const data = new Map<string, any>();
  const get = (path: string) => data.get(path);
  const set = (path: string, value: any) => data.set(path, value);
  const remove = (path: string) => data.delete(path);

  const deepMerge = (target: any, patch: any) => {
    if (!patch || typeof patch !== "object") return patch;
    const out = (target && typeof target === "object") ? { ...target } : {};
    for (const [k, v] of Object.entries(patch)) out[k] = v;
    return out;
  };

  return {
    ref(path: string) {
      return {
        async get() {
          const val = get(path);
          return { exists: () => val !== undefined, val: () => val };
        },
        async once(_event: string) {
          const val = get(path);
          return { val: () => val };
        },
        async set(value: any) {
          set(path, value);
        },
        async update(patch: Record<string, any>) {
          if (path === "/") {
            // emulate multi-path updates
            for (const [k, v] of Object.entries(patch)) {
              set(k.startsWith("/") ? k : `/${k}`, v);
            }
            return;
          }
          const prev = get(path);
          set(path, deepMerge(prev, patch));
        },
        async remove() {
          remove(path);
        },
      };
    },
  };
}

function makeLocalStorage() {
  return {
    bucket() {
      return {
        file(_path: string) {
          return {
            async save() {
              return;
            },
            async exists() {
              return [false] as const;
            },
            async getMetadata() {
              return [{ contentType: "application/octet-stream" }] as const;
            },
            createReadStream() {
              throw new Error("Local storage not implemented");
            },
          };
        },
      };
    },
  };
}

function makeLocalAuth() {
  return {
    async verifyIdToken(_token: string) {
      return { uid: "local-user" };
    },
    async getUser(_uid: string) {
      return { email: "local@example.com" };
    },
    async deleteUser(_uid: string) {
      return;
    },
  };
}

if (firebaseConfigured) {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        databaseURL,
        storageBucket,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown Firebase init error";
      throw new Error(
        [
          `Firebase Admin init failed: ${message}`,
          "",
          "Most common cause: FIREBASE_PRIVATE_KEY is not valid PEM (missing header/footer) or contains literal newlines instead of \\n.",
          "Recommended: set FIREBASE_SERVICE_ACCOUNT_JSON (or _BASE64) from the downloaded service account key JSON.",
        ].join("\n"),
      );
    }
  }
}

export const isFirebaseConfigured = firebaseConfigured;
export const auth: any = firebaseConfigured ? admin.auth() : makeLocalAuth();
export const firestore: any = firebaseConfigured ? admin.firestore() : makeLocalFirestore();
export const rtdb: any = firebaseConfigured ? admin.database() : makeLocalRtdb();
export const storage: any = firebaseConfigured ? admin.storage() : makeLocalStorage();
