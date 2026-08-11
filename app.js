async function signOut() {
  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST"
      }
    );
  } finally {
    location.reload();
  }
}    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}


// ========================================
// Startup
// ========================================

document.addEventListener("DOMContentLoaded", async () => {

  bindNavigation();

  const menuButton = $("menuBtn");

  if (menuButton) {
    menuButton.onclick = () => {
      $("sidebar")?.classList.toggle("open");
    };
  }


  $("start")?.addEventListener("click", startCall);

  $("start2")?.addEventListener("click", startCall);

  $("startCall")?.addEventListener("click", startCall);


  $("close")?.addEventListener("click", endCall);

  $("end")?.addEventListener("click", endCall);

  $("mute")?.addEventListener("click", toggleMute);

  $("camera")?.addEventListener("click", toggleCamera);

  $("screen")?.addEventListener("click", shareScreen);

  $("copy")?.addEventListener("click", copyLink);


  $("addContact")?.addEventListener(
    "submit",
    addContact
  );


  $("sendMessage")?.addEventListener(
    "submit",
    sendMessage
  );


  $("signout")?.addEventListener(
    "click",
    signOut
  );


  await loadConfig();

  await loadMe();

  connectSocket();
});


// ========================================
// Navigation
// ========================================

function bindNavigation() {

  document.querySelectorAll(".nav").forEach(button => {

    button.addEventListener("click", () => {
      showPage(button.dataset.page);
    });

  });


  document.querySelectorAll("[data-go]").forEach(button => {

    button.addEventListener("click", () => {
      showPage(button.dataset.go);
    });

  });
}


function showPage(name) {

  document.querySelectorAll(".page").forEach(page => {
    page.classList.remove("active");
  });


  const page = $(name);

  if (page) {
    page.classList.add("active");
  }


  document.querySelectorAll(".nav").forEach(button => {

    button.classList.toggle(
      "active",
      button.dataset.page === name
    );

  });


  if ($("title")) {

    const titles = {
      home: "Home",
      contacts: "Contacts",
      calls: "Video Calls",
      messages: "Messages",
      history: "Call History",
      meetings: "Meetings",
      favorites: "Favorites",
      settings: "Settings"
    };

    $("title").textContent =
      titles[name] || "varvatoVision";
  }


  $("sidebar")?.classList.remove("open");


  if (name === "contacts") {
    loadContacts();
  }

  if (name === "messages") {
    loadMessageContacts();
  }

  if (name === "history") {
    loadHistory();
  }

  if (name === "favorites") {
    loadFavorites();
  }

  if (name === "settings") {
    updateSettings();
  }
}


// ========================================
// API helper
// ========================================

async function api(url, options = {}) {

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });


  const data =
    await response.json().catch(() => ({}));


  if (!response.ok) {

    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }


  return data;
}


// ========================================
// Google Sign-In
// ========================================

async function loadConfig() {

  try {

    cfg = await api("/api/config");

    waitForGoogle();

  } catch (error) {

    console.error(
      "Could not load configuration:",
      error
    );

  }
}


function waitForGoogle() {

  if (
    window.google &&
    window.google.accounts &&
    window.google.accounts.id
  ) {

    initGoogle();

    return;
  }


  setTimeout(waitForGoogle, 250);
}


function initGoogle() {

  if (!cfg?.googleClientId) {

    console.error(
      "Google Sign-In is unavailable: " +
      "googleClientId was not provided by the server."
    );

    return;
  }


  if (!window.google?.accounts?.id) {

    console.error(
      "Google Identity Services has not loaded."
    );

    return;
  }


  google.accounts.id.initialize({

    client_id: cfg.googleClientId,

    callback: googleCredential,

    auto_select: false,

    cancel_on_tap_outside: true

  });


  const button = $("googleButton");

  if (!button) {
    return;
  }


  button.innerHTML = "";


  google.accounts.id.renderButton(
    button,
    {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      logo_alignment: "left"
    }
  );
}


// ========================================
// Google credential
// ========================================

async function googleCredential(response) {

  if (!response?.credential) {

    console.error(
      "Google did not return a credential."
    );

    return;
  }


  try {

    const result = await api(
      "/api/auth/google",
      {
        method: "POST",

        body: JSON.stringify({
          credential: response.credential
        })
      }
    );


    user =
      result.user ||
      result;


    updateUserUI();

    await loadContacts();

    await loadHistory();

    await loadFavorites();

    connectSocket();


  } catch (error) {

    console.error(
      "Google sign-in failed:",
      error
    );

    alert(
      "Google sign-in failed: " +
      error.message
    );
  }
}


// ========================================
// Current user
// ========================================

async function loadMe() {

  try {

    const result = await api("/api/me");

    user = result.user || result;

    updateUserUI();


  } catch (error) {

    user = null;

    updateUserUI();

    console.log(
      "No signed-in user."
    );
  }
}


function updateUserUI() {

  const name = $("name");
  const email = $("email");
  const avatar = $("avatar");
  const signout = $("signout");
  const settings = $("settingsAccount");


  if (!user) {

    if (name) {
      name.textContent = "Guest";
    }

    if (email) {
      email.textContent = "Sign in with Google";
    }

    if (avatar) {
      avatar.innerHTML = "?";
    }

    signout?.classList.add("hidden");

    if (settings) {
      settings.textContent =
        "Not signed in.";
    }

    return;
  }


  const displayName =
    user.name ||
    user.given_name ||
    "Google User";


  if (name) {
    name.textContent = displayName;
  }


  if (email) {
    email.textContent =
      user.email || "";
  }


  if (avatar) {

    if (user.picture) {

      avatar.innerHTML =
        `<img src="${esc(user.picture)}" alt="">`;

    } else {

      avatar.textContent =
        initials(displayName);
    }
  }


  signout?.classList.remove("hidden");


  if (settings) {

    settings.innerHTML = `
      <div class="row">
        <div class="avatar">
          ${esc(initials(displayName))}
        </div>

        <div>
          <b>${esc(displayName)}</b>
          <small>${esc(user.email || "")}</small>
        </div>
      </div>
    `;
  }
}


// ========================================
// Sign out
// ========================================

async function signOut() {

  try {

    await api(
      "/api/auth/logout",
      {
        method: "POST"
      }
    );

  } catch (error) {

    console.error(
      "Sign out request failed:",
      error
    );
  }


  user = null;

  contacts = [];

  activeContact = null;


  if (window.google?.accounts?.id) {

    google.accounts.id.disableAutoSelect();
  }


  updateUserUI();

  renderContacts([]);

  renderFavorites([]);

  renderHistory([]);


  showPage("home");
}


// ========================================
// Socket.IO
// ========================================

function connectSocket() {

  if (!user) {
    return;
  }


  if (socket) {

    if (socket.connected) {
      return;
    }

    socket.disconnect();
  }


  if (!window.io) {

    console.warn(
      "Socket.IO client has not loaded."
    );

    return;
  }


  socket = io({
    withCredentials: true
  });


  socket.on("connect", () => {

    console.log(
      "varvatoVision socket connected:",
      socket.id
    );

  });


  socket.on("connect_error", error => {

    console.error(
      "Socket connection error:",
      error
    );

  });


  socket.on("message", message => {

    handleIncomingMessage(message);

  });


  socket.on("incoming-call", data => {

    handleIncomingCall(data);

  });


  socket.on("call-ended", () => {

    endCall(false);

  });
}


// ========================================
// Contacts
// ========================================

async function loadContacts() {

  if (!user) {
    return;
  }


  try {

    const result =
      await api("/api/contacts");


    contacts =
      result.contacts ||
      result ||
      [];


    renderContacts(contacts);

    renderFavorites(
      contacts.filter(
        contact =>
          contact.favorite ||
          contact.is_favorite
      )
    );


  } catch (error) {

    console.error(
      "Could not load contacts:",
      error
    );

  }
}


function renderContacts(list) {

  const container = $("contactsList");

  if (!container) {
    return;
  }


  if (!user) {

    container.innerHTML =
      `<div class="empty">
        Sign in to manage contacts.
      </div>`;

    return;
  }


  if (!list.length) {

    container.innerHTML =
      `<div class="empty">
        No contacts yet.
      </div>`;

    return;
  }


  container.innerHTML =
    list.map(contact => {

      const displayName =
        contact.name ||
        contact.email ||
        "Contact";


      return `
        <div class="row">

          <div class="avatar">
            ${
              contact.picture
                ? `<img src="${esc(contact.picture)}" alt="">`
                : esc(initials(displayName))
            }
          </div>

          <div>
            <b>${esc(displayName)}</b>
            <small>${esc(contact.email || "")}</small>
          </div>

          <button
            data-contact-call="${esc(contact.id || "")}"
            title="Call"
          >
            ☎
          </button>

        </div>
      `;

    }).join("");


  container
    .querySelectorAll("[data-contact-call]")
    .forEach(button => {

      button.onclick = () => {

        const id =
          button.dataset.contactCall;

        const contact =
          contacts.find(
            item =>
              String(item.id) === String(id)
          );

        if (contact) {
          startCall(contact);
        }

      };

    });
}


async function addContact(event) {

  event.preventDefault();


  if (!user) {

    showContactNotice(
      "Sign in with Google first."
    );

    return;
  }


  const input = $("contactEmail");

  const email =
    input?.value.trim();


  if (!email) {
    return;
  }


  try {

    await api(
      "/api/contacts",
      {
        method: "POST",

        body: JSON.stringify({
          email
        })
      }
    );


    input.value = "";

    showContactNotice(
      "Contact added."
    );


    await loadContacts();


  } catch (error) {

    showContactNotice(
      error.message
    );
  }
}


function showContactNotice(message) {

  const notice =
    $("contactNotice");

  if (!notice) {
    return;
  }


  notice.textContent =
    message;


  setTimeout(() => {

    if (notice.textContent === message) {
      notice.textContent = "";
    }

  }, 4000);
}


// ========================================
// Favorites
// ========================================

async function loadFavorites() {

  if (!user) {
    return;
  }


  try {

    const result =
      await api("/api/favorites");


    const list =
      result.favorites ||
      result ||
      [];


    renderFavorites(list);


  } catch (error) {

    console.error(
      "Could not load favorites:",
      error
    );


    renderFavorites(
      contacts.filter(
        contact =>
          contact.favorite ||
          contact.is_favorite
      )
    );
  }
}


function renderFavorites(list) {

  const container =
    $("favoriteList");


  if (!container) {
    return;
  }


  if (!list.length) {

    container.innerHTML =
      `<div class="empty">
        No favorite contacts.
      </div>`;

    return;
  }


  container.innerHTML =
    list.map(contact => {

      const displayName =
        contact.name ||
        contact.email ||
        "Contact";


      return `
        <div class="row">

          <div class="avatar">
            ${
              contact.picture
                ? `<img src="${esc(contact.picture)}" alt="">`
                : esc(initials(displayName))
            }
          </div>

          <div>
            <b>${esc(displayName)}</b>
            <small>${esc(contact.email || "")}</small>
          </div>

          <button
            data-favorite-call="${esc(contact.id || "")}"
          >
            ☎
          </button>

        </div>
      `;

    }).join("");


  container
    .querySelectorAll("[data-favorite-call]")
    .forEach(button => {

      button.onclick = () => {

        const contact =
          contacts.find(
            item =>
              String(item.id) ===
              String(
                button.dataset.favoriteCall
              )
          );

        if (contact) {
          startCall(contact);
        }

      };

    });
}


// ========================================
// Messages
// ========================================

async function loadMessageContacts() {

  const container =
    $("messageContacts");


  if (!container) {
    return;
  }


  if (!user) {

    container.innerHTML =
      `<div class="empty">
        Sign in first.
      </div>`;

    return;
  }


  if (!contacts.length) {
    await loadContacts();
  }


  if (!contacts.length) {

    container.innerHTML =
      `<div class="empty">
        No contacts yet.
      </div>`;

    return;
  }


  container.innerHTML =
    contacts.map(contact => {

      const displayName =
        contact.name ||
        contact.email ||
        "Contact";


      return `
        <div
          class="message-contact"
          data-message-contact="${esc(contact.id || "")}"
        >

          <b>${esc(displayName)}</b>

          <small>
            ${esc(contact.email || "")}
          </small>

        </div>
      `;

    }).join("");


  container
    .querySelectorAll("[data-message-contact]")
    .forEach(element => {

      element.onclick = () => {

        const contact =
          contacts.find(
            item =>
              String(item.id) ===
              String(
                element.dataset.messageContact
              )
          );


        if (contact) {
          selectContact(contact);
        }

      };

    });
}


async function selectContact(contact) {

  activeContact = contact;


  const head =
    $("chatHead");


  if (head) {

    head.textContent =
      contact.name ||
      contact.email ||
      "Contact";
  }


  document
    .querySelectorAll(".message-contact")
    .forEach(element => {

      element.classList.toggle(
        "active",
        String(
          element.dataset.messageContact
        ) === String(contact.id)
      );

    });


  await loadMessages(contact);
}


async function loadMessages(contact) {

  const container =
    $("chatMessages");


  if (!container) {
    return;
  }


  try {

    const result =
      await api(
        `/api/messages/${encodeURIComponent(contact.id)}`
      );


    const messages =
      result.messages ||
      result ||
      [];


    renderMessages(messages);


  } catch (error) {

    console.error(
      "Could not load messages:",
      error
    );


    container.innerHTML =
      `<div class="empty">
        No messages yet.
      </div>`;
  }
}


function renderMessages(messages) {

  const container =
    $("chatMessages");


  if (!container) {
    return;
  }


  if (!messages.length) {

    container.innerHTML =
      `<div class="empty">
        No messages yet.
      </div>`;

    return;
  }


  container.innerHTML =
    messages.map(message => {

      const mine =
        String(message.sender_id) ===
        String(user?.id);


      return `
        <div class="bubble ${mine ? "mine" : ""}">

          ${esc(message.body || message.text || "")}

          <small>
            ${esc(message.created_at || "")}
          </small>

        </div>
      `;

    }).join("");


  container.scrollTop =
    container.scrollHeight;
}


async function sendMessage(event) {

  event.preventDefault();


  if (!user) {
    alert("Sign in with Google first.");
    return;
  }


  if (!activeContact) {
    alert("Select a contact first.");
    return;
  }


  const input =
    $("messageBody");


  const body =
    input?.value.trim();


  if (!body) {
    return;
  }


  try {

    const result =
      await api(
        "/api/messages",
        {
          method: "POST",

          body: JSON.stringify({
            contact_id:
              activeContact.id,

            body
          })
        }
      );


    input.value = "";


    if (result.message) {

      renderMessages([
        ...(await getCurrentMessages()),
        result.message
      ]);

    } else {

      await loadMessages(activeContact);
    }


    if (socket) {

      socket.emit(
        "message",
        {
          contact_id:
            activeContact.id,

          body
        }
      );
    }


  } catch (error) {

    alert(
      "Could not send message: " +
      error.message
    );
  }
}


async function getCurrentMessages() {

  const container =
    $("chatMessages");


  if (!container) {
    return [];
  }


  return [];
}


function handleIncomingMessage(message) {

  if (
    activeContact &&
    String(message.sender_id) ===
      String(activeContact.id)
  ) {

    loadMessages(activeContact);

  }


  const unread =
    $("unread");


  if (unread) {

    unread.textContent =
      String(
        Number(unread.textContent || 0) + 1
      );
  }
}


// ========================================
// Call History
// ========================================

async function loadHistory() {

  const container =
    $("historyList");


  if (!container) {
    return;
  }


  if (!user) {

    container.innerHTML =
      `<div class="empty">
        Sign in to see call history.
      </div>`;

    return;
  }


  try {

    const result =
      await api("/api/calls/history");


    const history =
      result.calls ||
      result.history ||
      result ||
      [];


    renderHistory(history);


  } catch (error) {

    console.error(
      "Could not load call history:",
      error
    );


    container.innerHTML =
      `<div class="empty">
        No call history yet.
      </div>`;
  }
}


function renderHistory(history) {

  const container =
    $("historyList");


  if (!container) {
    return;
  }


  if (!history.length) {

    container.innerHTML =
      `<div class="empty">
        No calls yet.
      </div>`;

    return;
  }


  container.innerHTML =
    history.map(call => {

      const name =
        call.name ||
        call.email ||
        "Unknown";


      return `
        <div class="row">

          <div class="avatar">
            ${esc(initials(name))}
          </div>

          <div>
            <b>${esc(name)}</b>

            <small>
              ${esc(call.created_at || "")}
            </small>
          </div>

          <button>
            ${call.direction === "incoming" ? "↙" : "↗"}
          </button>

        </div>
      `;

    }).join("");
}


// ========================================
// Video calls
// ========================================

async function startCall(contact = null) {

  if (!user) {

    alert(
      "Sign in with Google before starting a call."
    );

    return;
  }


  roomId =
    crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random()
          .toString(36)
          .slice(2);


  callId = roomId;


  $("callModal")?.classList.remove("hidden");


  if ($("roomCode")) {
    $("roomCode").textContent =
      roomId;
  }


  if ($("callTitle")) {

    $("callTitle").textContent =
      contact?.name
        ? `Call with ${contact.name}`
        : "varvatoVision Call";
  }


  if ($("callStatus")) {
    $("callStatus").textContent =
      "Starting camera...";
  }


  try {

    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });


    const local =
      $("local");


    if (local) {
      local.srcObject =
        localStream;
    }


    if ($("callStatus")) {
      $("callStatus").textContent =
        "Ready";
    }


    if (socket) {

      socket.emit(
        "call-start",
        {
          roomId,
          contactId:
            contact?.id || null
        }
      );
    }


  } catch (error) {

    console.error(
      "Could not access camera:",
      error
    );


    if ($("callStatus")) {
      $("callStatus").textContent =
        "Camera unavailable";
    }


    alert(
      "Could not access your camera/microphone.\n\n" +
      error.message
    );
  }
}


function endCall(sendSocket = true) {

  if (sendSocket && socket && roomId) {

    socket.emit(
      "call-end",
      {
        roomId
      }
    );
  }


  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => track.stop());

    localStream = null;
  }


  const local =
    $("local");


  if (local) {
    local.srcObject = null;
  }


  const remote =
    $("remote");


  if (remote) {
    remote.srcObject = null;
  }


  $("callModal")?.classList.add("hidden");


  roomId = null;
  callId = null;
}


function toggleMute() {

  if (!localStream) {
    return;
  }


  const audioTracks =
    localStream.getAudioTracks();


  audioTracks.forEach(track => {
    track.enabled =
      !track.enabled;
  });


  const muted =
    audioTracks.length &&
    !audioTracks[0].enabled;


  if ($("mute")) {
    $("mute").textContent =
      muted ? "🔇" : "🎤";
  }
}


function toggleCamera() {

  if (!localStream) {
    return;
  }


  const videoTracks =
    localStream.getVideoTracks();


  videoTracks.forEach(track => {
    track.enabled =
      !track.enabled;
  });


  const disabled =
    videoTracks.length &&
    !videoTracks[0].enabled;


  if ($("camera")) {
    $("camera").textContent =
      disabled ? "🚫" : "▣";
  }
}


async function shareScreen() {

  if (!localStream) {
    return;
  }


  if (!navigator.mediaDevices?.getDisplayMedia) {

    alert(
      "Screen sharing is not supported by this browser."
    );

    return;
  }


  try {

    const screenStream =
      await navigator.mediaDevices.getDisplayMedia({
        video: true
      });


    const screenTrack =
      screenStream.getVideoTracks()[0];


    const videoTrack =
      localStream.getVideoTracks()[0];


    if (videoTrack) {
      localStream.removeTrack(videoTrack);
    }


    localStream.addTrack(screenTrack);


    const local =
      $("local");


    if (local) {
      local.srcObject =
        localStream;
    }


    screenTrack.onended = () => {

      localStream.removeTrack(screenTrack);

      if (videoTrack) {
        localStream.addTrack(videoTrack);
      }

      if (local) {
        local.srcObject =
          localStream;
      }

    };


  } catch (error) {

    console.error(
      "Screen sharing failed:",
      error
    );
  }
}


function copyLink() {

  if (!roomId) {
    return;
  }


  const link =
    `${location.origin}${location.pathname}?room=${encodeURIComponent(roomId)}`;


  navigator.clipboard
    ?.writeText(link)
    .then(() => {

      if ($("copy")) {

        const original =
          $("copy").textContent;

        $("copy").textContent =
          "Copied!";

        setTimeout(() => {
          $("copy").textContent =
            original;
        }, 1500);
      }

    })
    .catch(() => {

      prompt(
        "Copy this call link:",
        link
      );

    });
}


// ========================================
// Incoming calls
// ========================================

function handleIncomingCall(data) {

  const accepted =
    confirm(
      "Incoming varvatoVision video call.\n\n" +
      "Accept the call?"
    );


  if (!accepted) {

    socket?.emit(
      "call-rejected",
      data
    );

    return;
  }


  startCall();


  if (data?.roomId) {
    roomId = data.roomId;
  }
}


// ========================================
// Settings
// ========================================

function updateSettings() {

  const container =
    $("settingsAccount");


  if (!container) {
    return;
  }


  if (!user) {

    container.textContent =
      "Not signed in.";

    return;
  }


  container.innerHTML = `
    <div class="row">

      <div class="avatar">
        ${
          user.picture
            ? `<img src="${esc(user.picture)}" alt="">`
            : esc(initials(user.name))
        }
      </div>

      <div>
        <b>${esc(user.name || "Google User")}</b>
        <small>${esc(user.email || "")}</small>
      </div>

    </div>
  `;
}


// ========================================
// Keyboard shortcut
// ========================================

document.addEventListener("keydown", event => {

  if (
    event.key === "Escape" &&
    !$("callModal")?.classList.contains("hidden")
  ) {

    endCall();
  }

});
```
    cancel_on_tap_outside: true
  });

  const button = $("googleButton");

  if (!button) {
    console.error(
      "The #googleButton element does not exist."
    );

    return;
  }

  button.innerHTML = "";

  google.accounts.id.renderButton(
    button,
    {
      theme: "outline",
      size: "medium",
      shape: "pill",
      text: "signin_with",
      logo_alignment: "left",
      width: 220
    }
  );
}


// ========================================
// Google credential → varvatoVision server
// ========================================

async function googleCredential(response) {
  if (!response?.credential) {
    alert("Google did not return a login credential.");
    return;
  }

  try {
    const d = await api("/api/auth/google", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        credential: response.credential
      })
    });

    if (!d.user) {
      throw new Error(
        "The server did not return a user account."
      );
    }

    setUser(d.user);

  } catch (error) {
    console.error(
      "Google authentication failed:",
      error
    );

    alert(
      error.message ||
      "Google sign-in failed."
    );
  }
}


// ========================================
// Current logged-in user
// ========================================

async function loadMe() {
  try {
    const d = await api("/api/me");

    if (d.user) {
      setUser(d.user);
    }
  } catch (error) {
    console.error(
      "Could not load current user:",
      error
    );
  }
}


function setUser(u) {
  if (!u) return;

  user = u;

  $("name").textContent =
    u.name || "Google User";

  $("email").textContent =
    u.email || "";

  const avatar = $("avatar");

  if (u.picture) {
    avatar.innerHTML = `
      <img
        src="${esc(u.picture)}"
        alt="Google profile picture"
        style="
          width:100%;
          height:100%;
          object-fit:cover;
          border-radius:50%;
        "
      >
    `;
  } else {
    avatar.textContent =
      (u.name || "U")[0].toUpperCase();
  }

  $("signout").classList.remove("hidden");

  $("googleButton").classList.add("hidden");

  if (socket) {
    socket.emit("identify", u.id);
  } else {
    connectSocket();
  }

  loadContacts();
  loadHistory();
}


// ========================================
// Socket.IO
// ========================================

function connectSocket() {
  if (!window.io) {
    console.error("Socket.IO is not loaded.");
    return;
  }

  socket = io();

  socket.on("connect", () => {
    if (user) {
      socket.emit("identify", user.id);
    }
  });

  socket.on("message:new", m => {
    if (activeContact?.id === m.sender_id) {
      loadMessages(activeContact);
    }

    updateUnread();
  });

  socket.on("call:incoming", c => {
    if (
      confirm(
        `${c.caller.name} is calling you. Join the call?`
      )
    ) {
      openCall(
        c.roomId,
        c.callId,
        c.caller.name
      );
    }
  });
}


// ========================================
// Contacts
// ========================================

async function loadContacts() {
  if (!user) return;

  const d = await api("/api/contacts");

  contacts = d.contacts;

  renderContacts();
}


function renderContacts() {
  $("contactsList").innerHTML =
    contacts.length
      ? contacts.map(c => contactHtml(c)).join("")
      : `
        <div class="empty">
          <p>
            No contacts yet. Add someone by
            their Google email.
          </p>
        </div>
      `;

  $("favoriteList").innerHTML =
    contacts
      .slice(0, 4)
      .map(c => contactHtml(c, true))
      .join("") ||
    `
      <div class="row">
        <p>No contacts yet.</p>
      </div>
    `;

  $("messageContacts").innerHTML =
    contacts.map(c => `
      <div
        class="message-contact"
        data-id="${c.id}"
      >
        <b>${esc(c.name)}</b>
        <small>${esc(c.email)}</small>
      </div>
    `).join("") ||
    `
      <div class="message-contact">
        No contacts yet.
      </div>
    `;

  document
    .querySelectorAll("[data-contact-call]")
    .forEach(button => {
      button.onclick = () =>
        startCall(
          Number(button.dataset.contactCall),
          button.dataset.contactName
        );
    });

  document
    .querySelectorAll(".message-contact")
    .forEach(element => {
      element.onclick = () => {
        const c = contacts.find(
          x =>
            x.id ===
            Number(element.dataset.id)
        );

        if (c) openChat(c);
      };
    });
}


function contactHtml(c, compact = false) {
  return `
    <div class="row">
      <div class="avatar">
        ${esc(
          (c.name || "U")[0].toUpperCase()
        )}
      </div>

      <div>
        <b>${esc(c.name)}</b>
        <small>${esc(c.email)}</small>
      </div>

      <button
        data-contact-call="${c.id}"
        data-contact-name="${esc(c.name)}"
      >
        ▣
      </button>
    </div>
  `;
}


async function addContact(e) {
  e.preventDefault();

  if (!user) {
    return alert(
      "Sign in with Google first."
    );
  }

  try {
    const d = await api("/api/contacts", {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        email: $("contactEmail").value
      })
    });

    $("contactNotice").textContent =
      `Added ${d.contact.name}.`;

    $("contactEmail").value = "";

    loadContacts();

  } catch (err) {
    $("contactNotice").textContent =
      err.message;
  }
}


// ========================================
// Messages
// ========================================

async function loadMessageContacts() {
  if (!user) return;

  await loadContacts();
}


function openChat(c) {
  activeContact = c;

  $("chatHead").textContent = c.name;

  document
    .querySelectorAll(".message-contact")
    .forEach(x =>
      x.classList.toggle(
        "active",
        Number(x.dataset.id) === c.id
      )
    );

  loadMessages(c);
}


async function loadMessages(c) {
  const d = await api(
    `/api/messages/${c.id}`
  );

  $("chatMessages").innerHTML =
    d.messages.map(m => `
      <div
        class="bubble ${
          m.sender_id === user.id
            ? "mine"
            : ""
        }"
      >
        ${esc(m.body)}

        <small>
          ${
            new Date(
              m.created_at.replace(
                " ",
                "T"
              ) + "Z"
            ).toLocaleString()
          }
        </small>
      </div>
    `).join("");

  $("chatMessages").scrollTop =
    $("chatMessages").scrollHeight;
}


async function sendMessage(e) {
  e.preventDefault();

  if (!activeContact) return;

  const body =
    $("messageBody").value.trim();

  if (!body) return;

  await api("/api/messages", {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      receiverId: activeContact.id,
      body
    })
  });

  $("messageBody").value = "";

  loadMessages(activeContact);
}


async function updateUnread() {
  // Kept intentionally simple.
  // Server-backed unread counts can be
  // added next.
}


// ========================================
// Call history
// ========================================

async function loadHistory() {
  if (!user) return;

  const d = await api("/api/calls");

  $("recentCalls").innerHTML =
    d.calls
      .slice(0, 5)
      .map(callRow)
      .join("") ||
    `
      <div class="row">
        <p>No calls yet.</p>
      </div>
    `;

  $("historyList").innerHTML =
    d.calls
      .map(callRow)
      .join("") ||
    `
      <div class="empty">
        <p>No call history yet.</p>
      </div>
    `;
}


function callRow(c) {
  const other =
    c.caller_id === user.id
      ? c.callee_name
      : c.caller_name;

  return `
    <div class="row">
      <div class="avatar">
        ${esc(
          (other || "Room")[0]
            .toUpperCase()
        )}
      </div>

      <div>
        <b>${esc(other || "Video Room")}</b>

        <small>
          ${esc(c.status)}
          ·
          ${
            new Date(
              c.started_at.replace(
                " ",
                "T"
              ) + "Z"
            ).toLocaleString()
          }
        </small>
      </div>
    </div>
  `;
}


// ========================================
// Video calls
// ========================================

async function startCall(
  calleeId = null,
  name = ""
) {
  if (!user) {
    return alert(
      "Sign in with Google first."
    );
  }

  const d = await api("/api/calls", {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      calleeId
    })
  });

  openCall(
    d.roomId,
    d.callId,
    name || "VarvatoVision Call"
  );
}


async function openCall(room, id, name) {
  roomId = room;
  callId = id;

  $("roomCode").textContent = room;

  $("callTitle").textContent =
    name
      ? `Call with ${name}`
      : "VarvatoVision Call";

  $("callStatus").textContent =
    "Starting camera…";

  $("callModal")
    .classList.remove("hidden");

  try {
    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          video: true,
          audio: true
        });

    $("local").srcObject =
      localStream;

    joinRoom();

  } catch (e) {
    $("callStatus").textContent =
      "Camera/microphone permission is required.";
  }
}


function joinRoom() {
  socket ||= io();

  socket.emit(
    "identify",
    user.id
  );

  socket.emit(
    "join-room",
    { roomId }
  );

  socket.off("waiting");
  socket.off("ready");
  socket.off("offer");
  socket.off("answer");
  socket.off("ice-candidate");
  socket.off("peer-left");

  socket.on("waiting", () => {
    $("callStatus").textContent =
      "Waiting for your caller…";
  });

  socket.on("ready", async () => {
    await makePeer();

    const offer =
      await peer.createOffer();

    await peer.setLocalDescription(
      offer
    );

    socket.emit("offer", {
      roomId,
      offer
    });
  });

  socket.on("offer", async ({ offer }) => {
    await makePeer();

    await peer.setRemoteDescription(
      offer
    );

    const answer =
      await peer.createAnswer();

    await peer.setLocalDescription(
      answer
    );

    socket.emit("answer", {
      roomId,
      answer
    });
  });

  socket.on("answer", async ({ answer }) => {
    if (peer) {
      await peer.setRemoteDescription(
        answer
      );
    }
  });

  socket.on(
    "ice-candidate",
    async ({ candidate }) => {
      try {
        if (candidate && peer) {
          await peer.addIceCandidate(
            candidate
          );
        }
      } catch (e) {}
    }
  );

  socket.on("peer-left", () => {
    $("callStatus").textContent =
      "The other caller left.";

    $("remote").srcObject = null;
  });
}


async function makePeer() {
  if (peer) return;

  peer = new RTCPeerConnection({
    iceServers: [
      {
        urls:
          "stun:stun.l.google.com:19302"
      }
    ]
  });

  localStream
    .getTracks()
    .forEach(track =>
      peer.addTrack(
        track,
        localStream
      )
    );

  peer.ontrack = e => {
    $("remote").srcObject =
      e.streams[0];

    $("waiting").style.display =
      "none";

    $("callStatus").textContent =
      "Connected";
  };

  peer.onicecandidate = e => {
    if (e.candidate) {
      socket.emit(
        "ice-candidate",
        {
          roomId,
          candidate: e.candidate
        }
      );
    }
  };
}


function toggleMute() {
  const t =
    localStream?.getAudioTracks()[0];

  if (!t) return;

  t.enabled = !t.enabled;

  $("mute").textContent =
    t.enabled
      ? "🎤"
      : "🔇";
}


function toggleCamera() {
  const t =
    localStream?.getVideoTracks()[0];

  if (!t) return;

  t.enabled = !t.enabled;

  $("camera").textContent =
    t.enabled
      ? "▣"
      : "🚫";
}


async function shareScreen() {
  try {
    const s =
      await navigator.mediaDevices
        .getDisplayMedia({
          video: true
        });

    const sender =
      peer?.getSenders()
        .find(
          x =>
            x.track?.kind === "video"
        );

    if (sender) {
      await sender.replaceTrack(
        s.getVideoTracks()[0]
      );
    }

    $("local").srcObject = s;

    s.getVideoTracks()[0].onended =
      async () => {
        const cam =
          localStream
            ?.getVideoTracks()[0];

        if (cam && sender) {
          await sender.replaceTrack(
            cam
          );

          $("local").srcObject =
            localStream;
        }
      };

  } catch (e) {}
}


async function copyLink() {
  await navigator.clipboard.writeText(
    location.origin +
    "?room=" +
    roomId
  );

  $("copy").textContent =
    "Copied!";

  setTimeout(
    () =>
      $("copy").textContent =
        "Copy call link",
    1200
  );
}


// ========================================
// End call
// ========================================

async function endCall() {
  if (socket && roomId) {
    socket.emit(
      "leave-room",
      roomId
    );
  }

  if (callId) {
    fetch(
      `/api/calls/${callId}/end`,
      {
        method: "PATCH"
      }
    ).catch(() => {});
  }

  peer?.close();
  peer = null;

  localStream
    ?.getTracks()
    .forEach(t => t.stop());

  localStream = null;

  $("local").srcObject = null;
  $("remote").srcObject = null;

  $("callModal")
    .classList.add("hidden");

  loadHistory();
}


// ========================================
// Sign out
// ========================================

async function signOut() {
  try {
    await api(
      "/api/auth/logout",
      {
        method: "POST"
      }
    );
  } finally {
    location.reload();
  }
}
```
  const r = await fetch(url, options);
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
async function loadConfig(){
  cfg = await api("/api/config");
  if(window.google?.accounts?.id) initGoogle(); else setTimeout(() => initGoogle(), 500);
}
function initGoogle(){
  if(!cfg || !window.google?.accounts?.id) return setTimeout(initGoogle,500);
  google.accounts.id.initialize({client_id:cfg.googleClientId,callback:googleCredential});
  google.accounts.id.renderButton($("googleButton"),{theme:"outline",size:"medium",shape:"pill",text:"signin_with"});
}
async function googleCredential(response){
  try{ const d=await api("/api/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({credential:response.credential})}); setUser(d.user); }
  catch(e){ alert(e.message); }
}
async function loadMe(){
  const d=await api("/api/me");
  if(d.user) setUser(d.user);
}
function setUser(u){
  user=u;
  $("name").textContent=u.name;
  $("email").textContent=u.email;
  $("avatar").textContent=(u.name||"U")[0].toUpperCase();
  $("signout").classList.remove("hidden");
  if(socket) socket.emit("identify",u.id); else connectSocket();
  loadContacts(); loadHistory();
}
function connectSocket(){
  if(!window.io) return;
  socket=io();
  socket.on("connect",()=>user&&socket.emit("identify",user.id));
  socket.on("message:new",m=>{ if(activeContact?.id===m.sender_id) loadMessages(activeContact); updateUnread(); });
  socket.on("call:incoming",c=>{ if(confirm(`${c.caller.name} is calling you. Join the call?`)) openCall(c.roomId,c.callId,c.caller.name); });
}
async function loadContacts(){
  if(!user)return;
  const d=await api("/api/contacts"); contacts=d.contacts; renderContacts();
}
function renderContacts(){
  $("contactsList").innerHTML=contacts.length?contacts.map(c=>contactHtml(c)).join(""):`<div class="empty"><p>No contacts yet. Add someone by their Google email.</p></div>`;
  $("favoriteList").innerHTML=contacts.slice(0,4).map(c=>contactHtml(c,true)).join("") || `<div class="row"><p>No contacts yet.</p></div>`;
  $("messageContacts").innerHTML=contacts.map(c=>`<div class="message-contact" data-id="${c.id}"><b>${esc(c.name)}</b><small>${esc(c.email)}</small></div>`).join("") || `<div class="message-contact">No contacts yet.</div>`;
  document.querySelectorAll("[data-contact-call]").forEach(b=>b.onclick=()=>startCall(Number(b.dataset.contactCall),b.dataset.contactName));
  document.querySelectorAll(".message-contact").forEach(el=>el.onclick=()=>{const c=contacts.find(x=>x.id===Number(el.dataset.id)); if(c) openChat(c);});
}
function contactHtml(c, compact=false){ return `<div class="row"><div class="avatar">${esc((c.name||"U")[0].toUpperCase())}</div><div><b>${esc(c.name)}</b><small>${esc(c.email)}</small></div><button data-contact-call="${c.id}" data-contact-name="${esc(c.name)}">▣</button></div>`; }
async function addContact(e){
  e.preventDefault();
  if(!user)return alert("Sign in with Google first.");
  try{const d=await api("/api/contacts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("contactEmail").value})}); $("contactNotice").textContent=`Added ${d.contact.name}.`; $("contactEmail").value=""; loadContacts();}
  catch(err){$("contactNotice").textContent=err.message;}
}
async function loadMessageContacts(){ if(!user)return; await loadContacts(); }
function openChat(c){
  activeContact=c; $("chatHead").textContent=c.name; document.querySelectorAll(".message-contact").forEach(x=>x.classList.toggle("active",Number(x.dataset.id)===c.id)); loadMessages(c);
}
async function loadMessages(c){
  const d=await api(`/api/messages/${c.id}`);
  $("chatMessages").innerHTML=d.messages.map(m=>`<div class="bubble ${m.sender_id===user.id?"mine":""}">${esc(m.body)}<small>${new Date(m.created_at.replace(" ","T")+"Z").toLocaleString()}</small></div>`).join("");
  $("chatMessages").scrollTop=$("chatMessages").scrollHeight;
}
async function sendMessage(e){
  e.preventDefault(); if(!activeContact)return;
  const body=$("messageBody").value.trim(); if(!body)return;
  await api("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({receiverId:activeContact.id,body})});
  $("messageBody").value=""; loadMessages(activeContact);
}
async function updateUnread(){ /* kept intentionally simple; server-backed unread counts can be added next */ }
async function loadHistory(){
  if(!user)return;
  const d=await api("/api/calls");
  $("recentCalls").innerHTML=d.calls.slice(0,5).map(callRow).join("")||`<div class="row"><p>No calls yet.</p></div>`;
  $("historyList").innerHTML=d.calls.map(callRow).join("")||`<div class="empty"><p>No call history yet.</p></div>`;
}
function callRow(c){
  const other=c.caller_id===user.id?c.callee_name:c.caller_name;
  return `<div class="row"><div class="avatar">${esc((other||"Room")[0].toUpperCase())}</div><div><b>${esc(other||"Video Room")}</b><small>${esc(c.status)} · ${new Date(c.started_at.replace(" ","T")+"Z").toLocaleString()}</small></div></div>`;
}
async function startCall(calleeId=null,name=""){
  if(!user)return alert("Sign in with Google first.");
  const d=await api("/api/calls",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({calleeId})});
  openCall(d.roomId,d.callId,name||"VarvatoVision Call");
}
async function openCall(room, id, name){
  roomId=room; callId=id; $("roomCode").textContent=room; $("callTitle").textContent=name?`Call with ${name}`:"VarvatoVision Call"; $("callStatus").textContent="Starting camera…"; $("callModal").classList.remove("hidden");
  try{localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true}); $("local").srcObject=localStream; joinRoom();}
  catch(e){$("callStatus").textContent="Camera/microphone permission is required.";}
}
function joinRoom(){
  socket ||= io(); socket.emit("identify",user.id); socket.emit("join-room",{roomId});
  socket.off("waiting");socket.off("ready");socket.off("offer");socket.off("answer");socket.off("ice-candidate");socket.off("peer-left");
  socket.on("waiting",()=>{$("callStatus").textContent="Waiting for your caller…";});
  socket.on("ready",async()=>{await makePeer();const offer=await peer.createOffer();await peer.setLocalDescription(offer);socket.emit("offer",{roomId,offer});});
  socket.on("offer",async({offer})=>{await makePeer();await peer.setRemoteDescription(offer);const answer=await peer.createAnswer();await peer.setLocalDescription(answer);socket.emit("answer",{roomId,answer});});
  socket.on("answer",async({answer})=>{if(peer)await peer.setRemoteDescription(answer);});
  socket.on("ice-candidate",async({candidate})=>{try{if(candidate&&peer)await peer.addIceCandidate(candidate)}catch(e){}});
  socket.on("peer-left",()=>{$("callStatus").textContent="The other caller left."; $("remote").srcObject=null;});
}
async function makePeer(){
  if(peer)return;
  peer=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
  localStream.getTracks().forEach(t=>peer.addTrack(t,localStream));
  peer.ontrack=e=>{$("remote").srcObject=e.streams[0];$("waiting").style.display="none";$("callStatus").textContent="Connected";};
  peer.onicecandidate=e=>{if(e.candidate)socket.emit("ice-candidate",{roomId,candidate:e.candidate});};
}
function toggleMute(){const t=localStream?.getAudioTracks()[0];if(!t)return;t.enabled=!t.enabled;$("mute").textContent=t.enabled?"🎤":"🔇";}
function toggleCamera(){const t=localStream?.getVideoTracks()[0];if(!t)return;t.enabled=!t.enabled;$("camera").textContent=t.enabled?"▣":"🚫";}
async function shareScreen(){
  try{const s=await navigator.mediaDevices.getDisplayMedia({video:true});const sender=peer?.getSenders().find(x=>x.track?.kind==="video");if(sender)await sender.replaceTrack(s.getVideoTracks()[0]);$("local").srcObject=s;s.getVideoTracks()[0].onended=async()=>{const cam=localStream?.getVideoTracks()[0];if(cam&&sender){await sender.replaceTrack(cam);$("local").srcObject=localStream;}}}catch(e){}
}
async function copyLink(){await navigator.clipboard.writeText(location.origin+"?room="+roomId);$("copy").textContent="Copied!";setTimeout(()=>$("copy").textContent="Copy call link",1200);}
async function endCall(){if(socket&&roomId)socket.emit("leave-room",roomId);if(callId)fetch(`/api/calls/${callId}/end`,{method:"PATCH"}).catch(()=>{});peer?.close();peer=null;localStream?.getTracks().forEach(t=>t.stop());localStream=null;$("local").srcObject=null;$("remote").srcObject=null;$("callModal").classList.add("hidden");loadHistory();}
async function signOut(){await api("/api/auth/logout",{method:"POST"});location.reload();}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
