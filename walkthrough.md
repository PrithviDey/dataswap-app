# Walkthrough — Live P2P Dual-Node Exchange Simulator with OTP Login & Telemetry

We have successfully implemented the **OTP Authentication Portal**, **On-Device Data/Speed Telemetry**, and **Dynamic Twilio SMS Dispatcher** integrations. Here's a complete summary of the workspace updates.

---

## 🚀 Key Features Delivered

### 1. Mobile Number + OTP Verification Login

- Replaced passwords and usernames with a modern mobile number verification flow.
- A **Simulated SMS Gateway** generates a 6-digit OTP code and displays it via a persistent web notification toast.
- Added a **master fallback OTP code (`123456`)** for quick development testing on any phone number.
- Automatic account creation: If a phone number is new, a node profile is automatically registered with a default **15.0 GB cellular plan** and **100 DataCoins**.

### 2. Live On-Device Network & Usage Telemetry

- **Actual Network Metrics**: Reads your phone's real download speed (converted to Mbps) and latency (ms) via the browser `navigator.connection` API and reflects it on the dashboard.
- **Session Data Tracker**: Hooks into the HTML5 Performance API to measure the exact size of assets and network resources loaded by your device during the session. As you browse, the dashboard increments your "Used Data" and decrements your "Excess Data" in real time.

### 3. Twilio SMS Production Integration

- Added the official `twilio` client SDK.
- Configured `sendOtpCode` on the backend to dynamically check for Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`).
- If credentials are set (e.g. in a `.env` file or hosting control panel), it automatically switches from simulated toasts to dispatching **real SMS text messages** to the user's phone.

### 4. Layout Height Adjustments

- Fixed a mobile browser clipping issue by setting `.phone-mockup` height rules to `100dvh` (Dynamic Viewport Height). This prevents browser bars from pushing the bottom menu bar off the screen and ensures the **Sign Out** button at the bottom of the Settings tab is fully visible and clickable.

---

## 📂 Modified Files

| File                          | Change                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db.ts`               | Configured default plan stats (15.0 GB plan, 8.4 GB used, 6.6 GB excess) and added `getOrCreateUser` helper.                                             |
| `src/lib/server-functions.ts` | Replaced legacy sign-up/login with `sendOtpCode` (featuring Twilio SDK dispatcher) and `verifyOtpAndLogin` handlers using `{ data }` validation context. |
| `src/routes/login.tsx`        | Built the new step-based OTP phone login screen.                                                                                                         |
| `src/routes/index.tsx`        | Added browser performance observers, `navigator.connection` listeners, and fixedSettings state form element mappings.                                    |
| `src/styles.css`              | Replaced `100vh` height rules with `100dvh` in mobile media queries to handle address-bar overlays.                                                      |

---

## 🧪 Testing the Live System

1. Open **[http://localhost:8080/](http://localhost:8080/)** (redirects to the mobile number input).
2. Enter your phone number (e.g. `+91 98765 43210`).
3. Press **Send Verification Code**.
4. Enter **`123456`** (master testing code) or the verification code shown in the blue toast notification.
5. Tap **Verify & Log In** to access your dashboard.
6. Open **Settings** -> Scroll to the bottom -> Tap **Sign Out** to test node data isolation.
