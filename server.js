const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const cookieSession = require("cookie-session");
const Database = require("better-sqlite3");
const { OAuth2Client } = require("google-auth-library");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new Database(
  path.join(__dirname, "varvatovision.db")
);

const PORT = Number(process.env.PORT || 3000);

const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "CHANGE-ME-IN-PRODUCTION";

const APP_ORIGIN =
  process.env.APP_ORIGIN ||
  `http://localhost:${PORT}`;

const googleClient =
  new OAuth2Client(GOOGLE_CLIENT_ID);


// ============================================================
// Database
// ============================================================

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    picture TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    user_id INTEGER NOT NULL,
    contact_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY(user_id, contact_id),

    FOREIGN KEY(user_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY(contact_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(sender_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY(receiver_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    caller_id INTEGER NOT NULL,
    callee_id INTEGER,
    status TEXT NOT NULL DEFAULT 'started',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,

    FOREIGN KEY(caller_id)
      REFERENCES users(id)
      ON DELETE CASCADE,

    FOREIGN KEY(callee_id)
      REFERENCES users(id)
      ON DELETE SET NULL
  );
`);


// ============================================================
// Express configuration
// ============================================================

app.use(express.json());

app.use(
  cookieSession({
    name: "varvatovision_session",

    keys: [
      SESSION_SECRET
    ],

    httpOnly: true,

    sameSite: "lax",

    secure:
      process.env.NODE_ENV === "production",

    maxAge:
      1000 *
      60 *
      60 *
      24 *
      30
  })
);


// ============================================================
// Frontend
// ============================================================

// Put index.html, app.js, style.css, etc.
// inside the "public" folder.

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


// ============================================================
// Authentication middleware
// ============================================================

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: "You must sign in with Google first."
    });
  }

  const user = db
    .prepare(`
      SELECT
        id,
        name,
        email,
        picture
      FROM users
      WHERE id = ?
    `)
    .get(req.session.userId);

  if (!user) {
    req.session = null;

    return res.status(401).json({
      error: "Your session is no longer valid."
    });
  }

  req.user = user;

  next();
}


// ============================================================
// Public configuration
// ============================================================

app.get("/api/config", (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID
  });
});


// ============================================================
// Google Sign-In
// ============================================================

app.post(
  "/api/auth/google",
  async (req, res) => {
    try {
      const credential =
        req.body?.credential;

      if (!credential) {
        return res.status(400).json({
          error:
            "Google credential was not provided."
        });
      }

      if (!GOOGLE_CLIENT_ID) {
        console.error(
          "GOOGLE_CLIENT_ID is not configured."
        );

        return res.status(500).json({
          error:
            "Google Sign-In is not configured on the server."
        });
      }

      // Verify the Google ID token.
      const ticket =
        await googleClient.verifyIdToken({
          idToken: credential,
          audience: GOOGLE_CLIENT_ID
        });

      const payload =
        ticket.getPayload();

      if (!payload) {
        return res.status(401).json({
          error:
            "Google returned an invalid account."
        });
      }

      const googleSub =
        payload.sub;

      const name =
        payload.name ||
        payload.email ||
        "Google User";

      const email =
        payload.email;

      const picture =
        payload.picture || null;

      if (!googleSub || !email) {
        return res.status(401).json({
          error:
            "Google account information is incomplete."
        });
      }

      // Find an existing account.
      let user =
        db
          .prepare(`
            SELECT
              id,
              google_sub,
              name,
              email,
              picture
            FROM users
            WHERE google_sub = ?
          `)
          .get(googleSub);

      if (user) {
        // Update account information.
        db.prepare(`
          UPDATE users
          SET
            name = ?,
            email = ?,
            picture = ?,
            last_seen = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          name,
          email,
          picture,
          user.id
        );

        user =
          db
            .prepare(`
              SELECT
                id,
                name,
                email,
                picture
              FROM users
              WHERE id = ?
            `)
            .get(user.id);

      } else {

        // Make sure the email isn't already
        // attached to another Google account.
        const existingEmail =
          db
            .prepare(`
              SELECT id
              FROM users
              WHERE email = ?
            `)
            .get(email);

        if (existingEmail) {
          return res.status(409).json({
            error:
              "A varvatoVision account already exists with this email."
          });
        }

        const result =
          db.prepare(`
            INSERT INTO users (
              google_sub,
              name,
              email,
              picture
            )
            VALUES (?, ?, ?, ?)
          `).run(
            googleSub,
            name,
            email,
            picture
          );

        user =
          db
            .prepare(`
              SELECT
                id,
                name,
                email,
                picture
              FROM users
              WHERE id = ?
            `)
            .get(result.lastInsertRowid);
      }

      // Create the varvatoVision session.
      req.session.userId =
        user.id;

      req.session.googleSub =
        googleSub;

      res.json({
        ok: true,
        user
      });

    } catch (error) {
      console.error(
        "Google authentication error:",
        error
      );

      res.status(401).json({
        error:
          "Google Sign-In failed. The Google credential could not be verified."
      });
    }
  }
);


// ============================================================
// Current user
// ============================================================

app.get(
  "/api/me",
  (req, res) => {

    if (
      !req.session ||
      !req.session.userId
    ) {
      return res.json({
        user: null
      });
    }

    const user =
      db
        .prepare(`
          SELECT
            id,
            name,
            email,
            picture
          FROM users
          WHERE id = ?
        `)
        .get(req.session.userId);

    if (!user) {
      req.session = null;

      return res.json({
        user: null
      });
    }

    res.json({
      user
    });
  }
);


// ============================================================
// Logout
// ============================================================

app.post(
  "/api/auth/logout",
  (req, res) => {

    req.session = null;

    res.json({
      ok: true
    });
  }
);


// ============================================================
// Contacts
// ============================================================

app.get(
  "/api/contacts",
  requireAuth,
  (req, res) => {

    const contacts =
      db
        .prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.picture
          FROM contacts c
          JOIN users u
            ON u.id = c.contact_id
          WHERE c.user_id = ?
          ORDER BY u.name COLLATE NOCASE
        `)
        .all(req.user.id);

    res.json({
      contacts
    });
  }
);


app.post(
  "/api/contacts",
  requireAuth,
  (req, res) => {

    const email =
      String(
        req.body?.email || ""
      )
        .trim()
        .toLowerCase();

    if (!email) {
      return res.status(400).json({
        error:
          "Enter a Google email address."
      });
    }

    const contact =
      db
        .prepare(`
          SELECT
            id,
            name,
            email,
            picture
          FROM users
          WHERE lower(email) = ?
        `)
        .get(email);

    if (!contact) {
      return res.status(404).json({
        error:
          "That person has not signed in to varvatoVision yet."
      });
    }

    if (contact.id === req.user.id) {
      return res.status(400).json({
        error:
          "You cannot add yourself as a contact."
      });
    }

    db.prepare(`
      INSERT OR IGNORE INTO contacts (
        user_id,
        contact_id
      )
      VALUES (?, ?)
    `).run(
      req.user.id,
      contact.id
    );

    // Make contacts mutual.
    db.prepare(`
      INSERT OR IGNORE INTO contacts (
        user_id,
        contact_id
      )
      VALUES (?, ?)
    `).run(
      contact.id,
      req.user.id
    );

    res.json({
      ok: true,
      contact
    });
  }
);


// ============================================================
// Messages
// ============================================================

app.get(
  "/api/messages/:contactId",
  requireAuth,
  (req, res) => {

    const contactId =
      Number(req.params.contactId);

    if (!Number.isInteger(contactId)) {
      return res.status(400).json({
        error: "Invalid contact."
      });
    }

    const messages =
      db
        .prepare(`
          SELECT
            id,
            sender_id,
            receiver_id,
            body,
            created_at
          FROM messages
          WHERE
            (
              sender_id = ?
              AND receiver_id = ?
            )
            OR
            (
              sender_id = ?
              AND receiver_id = ?
            )
          ORDER BY id ASC
        `)
        .all(
          req.user.id,
          contactId,
          contactId,
          req.user.id
        );

    res.json({
      messages
    });
  }
);


app.post(
  "/api/messages",
  requireAuth,
  (req, res) => {

    const receiverId =
      Number(req.body?.receiverId);

    const body =
      String(
        req.body?.body || ""
      ).trim();

    if (
      !Number.isInteger(receiverId) ||
      !body
    ) {
      return res.status(400).json({
        error:
          "A receiver and message are required."
      });
    }

    if (body.length > 10000) {
      return res.status(400).json({
        error:
          "Message is too long."
      });
    }

    const receiver =
      db
        .prepare(`
          SELECT id, name
          FROM users
          WHERE id = ?
        `)
        .get(receiverId);

    if (!receiver) {
      return res.status(404).json({
        error:
          "That user does not exist."
      });
    }

    const result =
      db.prepare(`
        INSERT INTO messages (
          sender_id,
          receiver_id,
          body
        )
        VALUES (?, ?, ?)
      `).run(
        req.user.id,
        receiverId,
        body
      );

    const message =
      db
        .prepare(`
          SELECT
            id,
            sender_id,
            receiver_id,
            body,
            created_at
          FROM messages
          WHERE id = ?
        `)
        .get(result.lastInsertRowid);

    // Notify recipient through Socket.IO.
    const recipientSocket =
      onlineUsers.get(receiverId);

    if (recipientSocket) {
      io.to(recipientSocket).emit(
        "message:new",
        message
      );
    }

    res.json({
      ok: true,
      message
    });
  }
);


// ============================================================
// Calls
// ============================================================

app.get(
  "/api/calls",
  requireAuth,
  (req, res) => {

    const calls =
      db
        .prepare(`
          SELECT
            c.id,
            c.room_id,
            c.caller_id,
            c.callee_id,
            c.status,
            c.started_at,
            c.ended_at,

            caller.name AS caller_name,
            callee.name AS callee_name

          FROM calls c

          JOIN users caller
            ON caller.id = c.caller_id

          LEFT JOIN users callee
            ON callee.id = c.callee_id

          WHERE
            c.caller_id = ?
            OR c.callee_id = ?

          ORDER BY c.id DESC
        `)
        .all(
          req.user.id,
          req.user.id
        );

    res.json({
      calls
    });
  }
);


app.post(
  "/api/calls",
  requireAuth,
  (req, res) => {

    const calleeId =
      req.body?.calleeId == null
        ? null
        : Number(req.body.calleeId);

    if (
      calleeId !== null &&
      !Number.isInteger(calleeId)
    ) {
      return res.status(400).json({
        error:
          "Invalid caller ID."
      });
    }

    if (
      calleeId !== null &&
      calleeId === req.user.id
    ) {
      return res.status(400).json({
        error:
          "You cannot call yourself."
      });
    }

    if (calleeId !== null) {
      const callee =
        db
          .prepare(`
            SELECT id
            FROM users
            WHERE id = ?
          `)
          .get(calleeId);

      if (!callee) {
        return res.status(404).json({
          error:
            "The person you are trying to call does not exist."
        });
      }
    }

    const roomId =
      crypto.randomBytes(8)
        .toString("hex");

    const result =
      db.prepare(`
        INSERT INTO calls (
          room_id,
          caller_id,
          callee_id,
          status
        )
        VALUES (?, ?, ?, 'started')
      `).run(
        roomId,
        req.user.id,
        calleeId
      );

    const callId =
      result.lastInsertRowid;

    // Tell the recipient that someone
    // is calling them.
    if (calleeId !== null) {

      const recipientSocket =
        onlineUsers.get(calleeId);

      if (recipientSocket) {

        io.to(recipientSocket)
          .emit(
            "call:incoming",
            {
              roomId,
              callId,
              caller: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email
              }
            }
          );
      }
    }

    res.json({
      ok: true,
      roomId,
      callId
    });
  }
);


app.patch(
  "/api/calls/:id/end",
  requireAuth,
  (req, res) => {

    const id =
      Number(req.params.id);

    const call =
      db
        .prepare(`
          SELECT *
          FROM calls
          WHERE id = ?
        `)
        .get(id);

    if (!call) {
      return res.status(404).json({
        error:
          "Call not found."
      });
    }

    if (
      call.caller_id !== req.user.id &&
      call.callee_id !== req.user.id
    ) {
      return res.status(403).json({
        error:
          "You cannot modify this call."
      });
    }

    db.prepare(`
      UPDATE calls
      SET
        status = 'ended',
        ended_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    res.json({
      ok: true
    });
  }
);


// ============================================================
// Socket.IO
// ============================================================

// user ID → socket ID
const onlineUsers =
  new Map();

// socket ID → user ID
const socketUsers =
  new Map();


io.on("connection", socket => {

  console.log(
    "Socket connected:",
    socket.id
  );


  // ------------------------------------------
  // Identify logged-in user
  // ------------------------------------------

  socket.on(
    "identify",
    userId => {

      const id =
        Number(userId);

      if (!Number.isInteger(id)) {
        return;
      }

      const user =
        db
          .prepare(`
            SELECT id
            FROM users
            WHERE id = ?
          `)
          .get(id);

      if (!user) {
        return;
      }

      onlineUsers.set(
        id,
        socket.id
      );

      socketUsers.set(
        socket.id,
        id
      );

      console.log(
        `User ${id} connected through Socket.IO.`
      );
    }
  );


  // ------------------------------------------
  // Join video room
  // ------------------------------------------

  socket.on(
    "join-room",
    ({ roomId }) => {

      if (!roomId) return;

      socket.join(roomId);

      const room =
        io.sockets.adapter.rooms.get(
          roomId
        );

      const count =
        room ? room.size : 0;

      console.log(
        `Socket ${socket.id} joined ${roomId}. Users: ${count}`
      );

      if (count === 1) {

        socket.emit(
          "waiting"
        );

      } else if (count === 2) {

        io.to(roomId).emit(
          "ready"
        );
      }
    }
  );


  // ------------------------------------------
  // WebRTC offer
  // ------------------------------------------

  socket.on(
    "offer",
    ({ roomId, offer }) => {

      socket.to(roomId).emit(
        "offer",
        { offer }
      );
    }
  );


  // ------------------------------------------
  // WebRTC answer
  // ------------------------------------------

  socket.on(
    "answer",
    ({ roomId, answer }) => {

      socket.to(roomId).emit(
        "answer",
        { answer }
      );
    }
  );


  // ------------------------------------------
  // ICE candidates
  // ------------------------------------------

  socket.on(
    "ice-candidate",
    ({ roomId, candidate }) => {

      socket.to(roomId).emit(
        "ice-candidate",
        { candidate }
      );
    }
  );


  // ------------------------------------------
  // Leave video room
  // ------------------------------------------

  socket.on(
    "leave-room",
    roomId => {

      if (!roomId) return;

      socket.leave(roomId);

      socket.to(roomId).emit(
        "peer-left"
      );
    }
  );


  // ------------------------------------------
  // Disconnect
  // ------------------------------------------

  socket.on(
    "disconnect",
    () => {

      const userId =
        socketUsers.get(socket.id);

      if (userId) {

        const currentSocket =
          onlineUsers.get(userId);

        if (
          currentSocket === socket.id
        ) {
          onlineUsers.delete(
            userId
          );
        }

        socketUsers.delete(
          socket.id
        );
      }

      console.log(
        "Socket disconnected:",
        socket.id
      );
    }
  );
});


// ============================================================
// SPA fallback
// ============================================================

app.get(
  "*",
  (req, res, next) => {

    // Don't intercept API requests.
    if (
      req.path.startsWith("/api/")
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);


// ============================================================
// Start server
// ============================================================

server.listen(
  PORT,
  () => {

    console.log("");
    console.log(
      "========================================"
    );

    console.log(
      "      varvatoVision Video Phone"
    );

    console.log(
      "========================================"
    );

    console.log(
      `Server: ${APP_ORIGIN}`
    );

    console.log(
      `Port: ${PORT}`
    );

    console.log(
      `Google Sign-In: ${
        GOOGLE_CLIENT_ID
          ? "CONFIGURED"
          : "NOT CONFIGURED"
      }`
    );

    console.log(
      "========================================"
    );

    console.log("");
  }
);  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT
);
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_id INTEGER NOT NULL,
  callee_id INTEGER,
  room_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT
);
`);

app.use(express.json({limit: "32kb"}));
app.use(cookieSession({
  name: "vv_session",
  keys: [SESSION_SECRET],
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 24 * 30
}));

app.use(express.static(__dirname));

function publicUser(row) {
  if (!row) return null;
  return {id: row.id, name: row.name, email: row.email, picture: row.picture};
}
function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({error: "Sign in required."});
  next();
}
function getUser(id) {
  return db.prepare("SELECT id,name,email,picture FROM users WHERE id=?").get(id);
}

app.get("/api/config", (req, res) => {
  res.json({googleClientId: GOOGLE_CLIENT_ID, appOrigin: APP_ORIGIN});
});

app.get("/api/me", (req, res) => {
  res.json({user: req.session.userId ? publicUser(getUser(req.session.userId)) : null});
});

app.post("/api/auth/google", async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) return res.status(500).json({error: "Google sign-in is not configured on the server."});
    const credential = req.body?.credential;
    if (!credential) return res.status(400).json({error: "Missing Google credential."});

    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({idToken: credential, audience: GOOGLE_CLIENT_ID});
    const p = ticket.getPayload();
    if (!p?.sub || !p.email || p.email_verified !== true) {
      return res.status(401).json({error: "Google account could not be verified."});
    }

    let user = db.prepare("SELECT * FROM users WHERE google_sub=?").get(p.sub);
    if (!user) {
      const existing = db.prepare("SELECT * FROM users WHERE email=?").get(p.email);
      if (existing) {
        db.prepare("UPDATE users SET google_sub=?,name=?,picture=?,last_seen=CURRENT_TIMESTAMP WHERE id=?")
          .run(p.sub, p.name || p.email.split("@")[0], p.picture || null, existing.id);
        user = getUser(existing.id);
      } else {
        const result = db.prepare("INSERT INTO users(google_sub,name,email,picture) VALUES(?,?,?,?)")
          .run(p.sub, p.name || p.email.split("@")[0], p.email, p.picture || null);
        user = getUser(result.lastInsertRowid);
      }
    } else {
      db.prepare("UPDATE users SET name=?,picture=?,last_seen=CURRENT_TIMESTAMP WHERE id=?")
        .run(p.name || user.name, p.picture || user.picture, user.id);
      user = getUser(user.id);
    }

    req.session.userId = user.id;
    res.json({user: publicUser(user)});
  } catch (err) {
    console.error(err);
    res.status(401).json({error: "Invalid Google credential."});
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ok: true});
});

app.get("/api/contacts", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.name,u.email,u.picture
    FROM contacts c JOIN users u ON u.id=c.contact_id
    WHERE c.user_id=? ORDER BY u.name
  `).all(req.session.userId);
  res.json({contacts: rows});
});

app.post("/api/contacts", auth, (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const other = db.prepare("SELECT id,name,email,picture FROM users WHERE lower(email)=?").get(email);
  if (!other) return res.status(404).json({error: "That person has not signed in to varvatoVision yet."});
  if (other.id === req.session.userId) return res.status(400).json({error: "You cannot add yourself."});
  const tx = db.transaction(() => {
    db.prepare("INSERT OR IGNORE INTO contacts(user_id,contact_id) VALUES(?,?)").run(req.session.userId, other.id);
    db.prepare("INSERT OR IGNORE INTO contacts(user_id,contact_id) VALUES(?,?)").run(other.id, req.session.userId);
  });
  tx();
  res.json({contact: publicUser(other)});
});

app.get("/api/messages/:contactId", auth, (req, res) => {
  const contactId = Number(req.params.contactId);
  const rows = db.prepare(`
    SELECT m.id,m.sender_id,m.receiver_id,m.body,m.created_at,m.read_at,u.name AS sender_name
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE (m.sender_id=? AND m.receiver_id=?) OR (m.sender_id=? AND m.receiver_id=?)
    ORDER BY m.id ASC LIMIT 200
  `).all(req.session.userId, contactId, contactId, req.session.userId);
  db.prepare("UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE sender_id=? AND receiver_id=? AND read_at IS NULL")
    .run(contactId, req.session.userId);
  res.json({messages: rows});
});

app.post("/api/messages", auth, (req, res) => {
  const receiverId = Number(req.body?.receiverId);
  const body = String(req.body?.body || "").trim();
  if (!receiverId || !body || body.length > 2000) return res.status(400).json({error: "Invalid message."});
  const result = db.prepare("INSERT INTO messages(sender_id,receiver_id,body) VALUES(?,?,?)")
    .run(req.session.userId, receiverId, body);
  const message = db.prepare(`
    SELECT m.id,m.sender_id,m.receiver_id,m.body,m.created_at,m.read_at,u.name AS sender_name
    FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?
  `).get(result.lastInsertRowid);
  io.to(`user:${receiverId}`).emit("message:new", message);
  res.json({message});
});

app.get("/api/calls", auth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, u.name AS caller_name, u2.name AS callee_name
    FROM calls c
    LEFT JOIN users u ON u.id=c.caller_id
    LEFT JOIN users u2 ON u2.id=c.callee_id
    WHERE c.caller_id=? OR c.callee_id=?
    ORDER BY c.id DESC LIMIT 100
  `).all(req.session.userId, req.session.userId);
  res.json({calls: rows});
});

app.post("/api/calls", auth, (req, res) => {
  const calleeId = req.body?.calleeId ? Number(req.body.calleeId) : null;
  const roomId = crypto.randomBytes(6).toString("hex").toUpperCase();
  const result = db.prepare("INSERT INTO calls(caller_id,callee_id,room_id,status) VALUES(?,?,?,?)")
    .run(req.session.userId, calleeId || null, roomId, "started");
  if (calleeId) io.to(`user:${calleeId}`).emit("call:incoming", {roomId, callId: result.lastInsertRowid, caller: publicUser(getUser(req.session.userId))});
  res.json({roomId, callId: result.lastInsertRowid});
});

app.patch("/api/calls/:id/end", auth, (req, res) => {
  db.prepare("UPDATE calls SET status='ended',ended_at=CURRENT_TIMESTAMP WHERE id=? AND (caller_id=? OR callee_id=?)")
    .run(Number(req.params.id), req.session.userId, req.session.userId);
  res.json({ok: true});
});

io.on("connection", socket => {
  socket.on("identify", userId => {
    if (Number.isInteger(userId)) socket.join(`user:${userId}`);
  });

  socket.on("join-room", ({roomId}) => {
    const room = io.sockets.adapter.rooms.get(`call:${roomId}`);
    const count = room ? room.size : 0;
    if (count >= 2) return socket.emit("room-full");
    socket.join(`call:${roomId}`);
    socket.data.roomId = roomId;
    socket.emit(count === 0 ? "waiting" : "ready");
    if (count === 1) socket.to(`call:${roomId}`).emit("ready");
  });

  socket.on("offer", ({roomId, offer}) => socket.to(`call:${roomId}`).emit("offer", {offer}));
  socket.on("answer", ({roomId, answer}) => socket.to(`call:${roomId}`).emit("answer", {answer}));
  socket.on("ice-candidate", ({roomId, candidate}) => socket.to(`call:${roomId}`).emit("ice-candidate", {candidate}));

  socket.on("leave-room", roomId => {
    socket.leave(`call:${roomId}`);
    socket.to(`call:${roomId}`).emit("peer-left");
  });
});

server.listen(PORT, () => console.log(`varvatoVision running at ${APP_ORIGIN}`));
