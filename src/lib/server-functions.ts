import { createServerFn } from "@tanstack/react-start";
import { readDb, writeDb, createNewUser, getSyncedStateForUser, getOrCreateUser } from "./db";
import twilio from "twilio";

// Memory storage for OTP verification codes
const ACTIVE_OTPS: Record<string, string> = {};

// ─── AUTH ──────────────────────────────────────────────────────────────────

export const sendOtpCode = createServerFn({ method: "POST" })
  .validator((payload: { mobileNumber: string }) => payload)
  .handler(async ({ data }) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    ACTIVE_OTPS[data.mobileNumber] = code;

    // Twilio Production Config Variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken && fromNumber) {
      try {
        console.log(`[SMS Gateway] Attempting real SMS to ${data.mobileNumber} via Twilio...`);
        const client = twilio(accountSid, authToken);
        await client.messages.create({
          body: `Your DataSwap verification code is: ${code}`,
          from: fromNumber,
          to: data.mobileNumber,
        });
        console.log(`[SMS Gateway] Real SMS dispatched successfully to ${data.mobileNumber}`);
      } catch (err: any) {
        console.error(`[SMS Gateway] Twilio dispatch failure:`, err.message);
        // Fallback gracefully so development remains testable
      }
    } else {
      console.log(
        `[SMS Gateway] Twilio config not found in process.env. Simulating OTP code: ${code}`,
      );
    }

    return { success: true, otp: code };
  });

export const verifyOtpAndLogin = createServerFn({ method: "POST" })
  .validator((payload: { mobileNumber: string; otpCode: string }) => payload)
  .handler(async ({ data }) => {
    const expected = ACTIVE_OTPS[data.mobileNumber];
    // Allow the generated code OR "123456" as a universal master code for easy testing
    if (data.otpCode !== "123456" && (!expected || expected !== data.otpCode)) {
      throw new Error("Invalid verification code. Please check and try again.");
    }
    // Delete verification token after successful verify
    delete ACTIVE_OTPS[data.mobileNumber];

    // Get existing profile or create a fresh one for new signups
    const user = await getOrCreateUser(data.mobileNumber);
    return { success: true, username: data.mobileNumber, nodeName: user.nodeName };
  });

// ─── STATE ─────────────────────────────────────────────────────────────────

export const getServerState = createServerFn({ method: "GET" })
  .validator((username: string) => username)
  .handler(async ({ data: username }) => {
    if (!username) throw new Error("No user session");
    return await getSyncedStateForUser(username);
  });

// ─── MUTATIONS ─────────────────────────────────────────────────────────────

export const toggleHotspotState = createServerFn({ method: "POST" })
  .validator((payload: { username: string; active: boolean }) => payload)
  .handler(async ({ data }) => {
    const db = await readDb();
    const user = db.users[data.username];
    if (!user) throw new Error("User not found");
    user.isHotspotActive = data.active;
    user.lastActiveCheck = data.active ? new Date().toISOString() : null;
    db.users[data.username] = user;
    await writeDb(db);
    return await getSyncedStateForUser(data.username);
  });

export const dispatchSellOrder = createServerFn({ method: "POST" })
  .validator((payload: { username: string; gb: number; price: number }) => payload)
  .handler(async ({ data }) => {
    const db = await readDb();
    const user = db.users[data.username];
    if (!user) throw new Error("User not found");
    if (data.gb <= 0 || data.gb > user.balanceGb)
      throw new Error("Insufficient data balance to sell");
    user.balanceGb = +(user.balanceGb - data.gb).toFixed(2);
    user.usedGb = Math.min(user.planGb, +(user.usedGb + data.gb).toFixed(2));
    user.txs = [
      {
        id: crypto.randomUUID(),
        type: "sell",
        gb: data.gb,
        price: data.price,
        counterparty: "L2 Grid Pool",
        at: "just now",
        createdAt: new Date().toISOString(),
        status: "mining",
      },
      ...user.txs,
    ];
    db.users[data.username] = user;
    await writeDb(db);
    return await getSyncedStateForUser(data.username);
  });

export const dispatchBuyOrder = createServerFn({ method: "POST" })
  .validator((payload: { username: string; gb: number; price: number; seller: string }) => payload)
  .handler(async ({ data }) => {
    const db = await readDb();
    const user = db.users[data.username];
    if (!user) throw new Error("User not found");
    const totalCost = +(data.price + 0.05).toFixed(2);
    if (user.balanceDc < totalCost) throw new Error("Insufficient DC balance");
    user.balanceDc = +(user.balanceDc - totalCost).toFixed(2);
    user.balanceGb = +(user.balanceGb + data.gb).toFixed(2);
    user.txs = [
      {
        id: crypto.randomUUID(),
        type: "buy",
        gb: data.gb,
        price: data.price,
        counterparty: data.seller,
        at: "just now",
        createdAt: new Date().toISOString(),
        status: "confirmed",
      },
      ...user.txs,
    ];
    db.users[data.username] = user;
    await writeDb(db);
    return await getSyncedStateForUser(data.username);
  });

export const updateSettingsState = createServerFn({ method: "POST" })
  .validator(
    (payload: {
      username: string;
      nodeName: string;
      autoShare: boolean;
      throttlePercent: number;
    }) => payload,
  )
  .handler(async ({ data }) => {
    const db = await readDb();
    const user = db.users[data.username];
    if (!user) throw new Error("User not found");
    user.nodeName = data.nodeName;
    user.autoShare = data.autoShare;
    user.throttlePercent = data.throttlePercent;
    db.users[data.username] = user;
    await writeDb(db);
    return await getSyncedStateForUser(data.username);
  });

export const updateSpeedTestState = createServerFn({ method: "POST" })
  .validator((payload: { username: string; speedMbps: number; pingMs: number }) => payload)
  .handler(async ({ data }) => {
    const db = await readDb();
    const user = db.users[data.username];
    if (!user) throw new Error("User not found");
    user.speedMbps = data.speedMbps;
    user.pingMs = data.pingMs;
    db.users[data.username] = user;
    await writeDb(db);
    return await getSyncedStateForUser(data.username);
  });

export const resetNodeState = createServerFn({ method: "POST" })
  .validator((username: string) => username)
  .handler(async ({ data: username }) => {
    const db = await readDb();
    const user = db.users[username];
    if (!user) throw new Error("User not found");
    user.balanceDc = 100.0;
    user.usedGb = 1.2;
    user.planGb = 2.0;
    user.balanceGb = 0.8;
    user.autoShare = true;
    user.throttlePercent = 100;
    user.isHotspotActive = false;
    user.sharedAmount = 0;
    user.lastActiveCheck = null;
    user.txs = [];
    db.users[username] = user;
    await writeDb(db);
    return await getSyncedStateForUser(username);
  });

export const executeP2PSwap = createServerFn({ method: "POST" })
  .validator(
    (payload: { username: string; amountGb: number; direction: "sell" | "buy"; peerId: string }) =>
      payload,
  )
  .handler(async ({ data }) => {
    const db = await readDb();
    const user = db.users[data.username];
    if (!user) throw new Error("User not found");
    const peer = db.peers.find((p) => p.id === data.peerId);
    if (!peer) throw new Error("Peer not found");
    const price = +(data.amountGb * peer.pricePerGb).toFixed(2);

    if (data.direction === "sell") {
      if (user.balanceGb < data.amountGb)
        throw new Error(`Insufficient excess. You have ${user.balanceGb} GB available.`);
      if (peer.balanceDc < price)
        throw new Error(`${peer.seller} has insufficient DataCoins (${peer.balanceDc} DC).`);

      user.balanceGb = +(user.balanceGb - data.amountGb).toFixed(2);
      user.usedGb = Math.min(user.planGb, +(user.usedGb + data.amountGb).toFixed(2));
      user.balanceDc = +(user.balanceDc + price).toFixed(2);
      peer.gb = +(peer.gb + data.amountGb).toFixed(2);
      peer.usedGb = Math.max(0, +(peer.usedGb - data.amountGb).toFixed(2));
      peer.balanceDc = +(peer.balanceDc - price).toFixed(2);
      user.txs = [
        {
          id: crypto.randomUUID(),
          type: "sell",
          gb: data.amountGb,
          price,
          counterparty: peer.seller,
          at: "just now",
          createdAt: new Date().toISOString(),
          status: "confirmed",
        },
        ...user.txs,
      ];
    } else {
      const totalCost = +(price + 0.05).toFixed(2);
      if (peer.gb < data.amountGb) throw new Error(`${peer.seller} only has ${peer.gb} GB excess.`);
      if (user.balanceDc < totalCost)
        throw new Error(
          `Insufficient DataCoins. Need ${totalCost} DC, you have ${user.balanceDc} DC.`,
        );

      user.balanceGb = +(user.balanceGb + data.amountGb).toFixed(2);
      user.usedGb = Math.max(0, +(user.usedGb - data.amountGb).toFixed(2));
      user.balanceDc = +(user.balanceDc - totalCost).toFixed(2);
      peer.gb = +(peer.gb - data.amountGb).toFixed(2);
      peer.usedGb = Math.min(peer.planGb, +(peer.usedGb + data.amountGb).toFixed(2));
      peer.balanceDc = +(peer.balanceDc + price).toFixed(2);
      user.txs = [
        {
          id: crypto.randomUUID(),
          type: "buy",
          gb: data.amountGb,
          price,
          counterparty: peer.seller,
          at: "just now",
          createdAt: new Date().toISOString(),
          status: "confirmed",
        },
        ...user.txs,
      ];
    }

    db.users[data.username] = user;
    await writeDb(db);
    return await getSyncedStateForUser(data.username);
  });
