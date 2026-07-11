import { promises as fs } from "fs";
import path from "path";

export interface Tx {
  id: string;
  type: "sell" | "buy";
  gb: number;
  price: number;
  counterparty: string;
  at: string;
  createdAt: string;
  status: "confirmed" | "mining";
}

export interface UserRecord {
  username: string;
  password: string;
  nodeName: string;
  address: string;
  balanceDc: number;
  usedGb: number;
  planGb: number;
  balanceGb: number;
  autoShare: boolean;
  throttlePercent: number;
  isHotspotActive: boolean;
  sharedAmount: number;
  lastActiveCheck: string | null;
  speedMbps: number;
  pingMs: number;
  txs: Tx[];
}

export interface Peer {
  id: string;
  seller: string;
  addr: string;
  gb: number;
  pricePerGb: number;
  rating: number;
  distance: string;
  ping: number;
  x: number;
  y: number;
  balanceDc: number;
  usedGb: number;
  planGb: number;
}

export interface DbSchema {
  users: Record<string, UserRecord>;
  peers: Peer[];
}

const DB_FILE = path.join(process.cwd(), "db.json");

const DEFAULT_PEERS: Peer[] = [
  {
    id: "l1",
    seller: "Aarav",
    addr: "0x89F...7C2",
    gb: 3.0,
    pricePerGb: 1.2,
    rating: 4.8,
    distance: "12m",
    ping: 14,
    x: 30,
    y: 40,
    balanceDc: 85.5,
    usedGb: 0.5,
    planGb: 3.5,
  },
  {
    id: "l2",
    seller: "Priya",
    addr: "0xB0D...1F4",
    gb: 1.5,
    pricePerGb: 1.8,
    rating: 4.9,
    distance: "24m",
    ping: 22,
    x: 75,
    y: 35,
    balanceDc: 42.1,
    usedGb: 0.5,
    planGb: 2.0,
  },
  {
    id: "l3",
    seller: "Rahul",
    addr: "0x77E...C10",
    gb: 5.0,
    pricePerGb: 1.0,
    rating: 4.6,
    distance: "42m",
    ping: 35,
    x: 25,
    y: 70,
    balanceDc: 210.4,
    usedGb: 1.0,
    planGb: 6.0,
  },
  {
    id: "l4",
    seller: "Neha",
    addr: "0x41A...9E8",
    gb: 0.8,
    pricePerGb: 2.2,
    rating: 5.0,
    distance: "31m",
    ping: 18,
    x: 65,
    y: 75,
    balanceDc: 18.9,
    usedGb: 1.2,
    planGb: 2.0,
  },
];

const DEFAULT_DB: DbSchema = {
  users: {},
  peers: DEFAULT_PEERS,
};

export function createNewUser(username: string, password?: string): UserRecord {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const hex = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .toUpperCase()
    .padStart(6, "0");
  return {
    username,
    password: password || "",
    nodeName: `Node-${
      username
        .replace(/[^a-zA-Z0-9]/g, "")
        .substring(0, 4)
        .toUpperCase() || "MOBILE"
    }-${suffix}`,
    address: `0x${hex}...${Math.floor(Math.random() * 999)
      .toString()
      .padStart(3, "0")}`,
    balanceDc: 100.0,
    usedGb: 8.4,
    planGb: 15.0,
    balanceGb: 6.6,
    autoShare: true,
    throttlePercent: 100,
    isHotspotActive: false,
    sharedAmount: 0,
    lastActiveCheck: null,
    speedMbps: 64.2,
    pingMs: 24,
    txs: [],
  };
}

export async function getOrCreateUser(mobileNumber: string): Promise<UserRecord> {
  const db = await readDb();
  const key = mobileNumber.toLowerCase().trim();
  if (!db.users[key]) {
    db.users[key] = createNewUser(key);
    await writeDb(db);
  }
  return db.users[key];
}

export async function readDb(): Promise<DbSchema> {
  try {
    const data = await fs.readFile(DB_FILE, "utf-8");
    const parsed = JSON.parse(data);
    // Migration: handle old single-user format (has top-level "user" key)
    if (parsed.user && !parsed.users) {
      await writeDb(DEFAULT_DB);
      return DEFAULT_DB;
    }
    return { ...DEFAULT_DB, ...parsed };
  } catch {
    await writeDb(DEFAULT_DB);
    return DEFAULT_DB;
  }
}

export async function writeDb(db: DbSchema): Promise<void> {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf-8");
}

export interface UserStateResult {
  user: UserRecord;
  peers: Peer[];
}

export async function getSyncedStateForUser(username: string): Promise<UserStateResult> {
  const db = await readDb();
  const user = db.users[username];
  if (!user) throw new Error("User not found");

  let updated = false;

  // 1. Process hotspot ticking
  if (user.isHotspotActive && user.lastActiveCheck) {
    const now = new Date();
    const lastCheck = new Date(user.lastActiveCheck);
    const elapsedMs = now.getTime() - lastCheck.getTime();
    if (elapsedMs > 0) {
      const rate = 0.01 / 3000;
      const sharedIncrement = elapsedMs * rate;
      if (sharedIncrement > 0) {
        const actualIncrement = Math.min(sharedIncrement, user.balanceGb);
        user.sharedAmount = +(user.sharedAmount + actualIncrement).toFixed(2);
        user.balanceGb = +(user.balanceGb - actualIncrement).toFixed(2);
        user.usedGb = +(user.usedGb + actualIncrement).toFixed(2);
        if (user.balanceGb <= 0) {
          user.isHotspotActive = false;
          user.lastActiveCheck = null;
        } else {
          user.lastActiveCheck = now.toISOString();
        }
        updated = true;
      }
    }
  }

  // 2. Process mining confirmations
  user.txs = user.txs.map((tx) => {
    if (tx.status === "mining") {
      const elapsedMs = Date.now() - new Date(tx.createdAt).getTime();
      if (elapsedMs >= 5000) {
        tx.status = "confirmed";
        if (tx.type === "sell") {
          user.balanceDc = +(user.balanceDc + tx.price).toFixed(2);
        }
        updated = true;
      }
    }
    return tx;
  });

  if (updated) {
    db.users[username] = user;
    await writeDb(db);
  }

  return { user, peers: db.peers };
}
