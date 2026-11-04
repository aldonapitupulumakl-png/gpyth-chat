// ============================================
// GPYTH CHAT — APP.JS
// Firebase init + logika semua halaman
// ============================================

import { firebaseConfig } from './firebase-config.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth, signInAnonymously, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, onSnapshot,
  query, orderBy, serverTimestamp, doc, getDoc,
  updateDoc, arrayUnion, arrayRemove, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --------------------------------------------
// CEK LOGIN (gacha ID harus ada)
// --------------------------------------------
const gachaId = localStorage.getItem('gpyth_id');

if (!gachaId) {
  window.location.replace('index.html');
} else {
  boot();
}

// --------------------------------------------
// BOOT
// --------------------------------------------
function boot() {
  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  let currentUser = null;

  // Sign in anonymous
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      initPage();
    }
  });

  signInAnonymously(auth).catch((err) => {
    console.error('Auth error:', err);
    alert('Gagal login ke Firebase. Cek firebase-config.js lu.');
  });

  // --------------------------------------------
  // PAGE DETECTION
  // --------------------------------------------
  function initPage() {
    if (document.getElementById('feed'))         initHomePage();
    if (document.getElementById('chatMessages')) initChatPage();
  }

  // --------------------------------------------
  // HOME PAGE (Threads + Polling)
  // --------------------------------------------
  function initHomePage() {
    const myIdEl     = document.getElementById('myId');
    const postTextEl = document.getElementById('postText');
    const postBtn    = document.getElementById('postBtn');
    const pollToggle = document.getElementById('pollToggle');
    const feedEl     = document.getElementById('feed');
    const emptyFeed  = document.getElementById('emptyFeed');
    const logoutBtn  = document.getElementById('logoutBtn');

    myIdEl.textContent = `#${gachaId}`;

    // Toggle polling mode
    let isPollMode = false;
    pollToggle.addEventListener('click', () => {
      isPollMode = !isPollMode;
      pollToggle.classList.toggle('active', isPollMode);
      pollToggle.textContent = isPollMode ? '📊 Polling AKTIF' : '📊 Bikin Polling';
      postTextEl.placeholder = isPollMode
        ? 'Tulis pertanyaan polling (jawaban: Iya / Tidak)...'
        : 'Apa yang lagi dipikirin?';
    });

    // Enable/disable tombol post
    postTextEl.addEventListener('input', () => {
      postBtn.disabled = postTextEl.value.trim().length === 0;
    });

    // Submit post
    postBtn.addEventListener('click', async () => {
      const text = postTextEl.value.trim();
      if (!text || !currentUser) return;

      postBtn.disabled = true;
      postBtn.textContent = '...';

      try {
        const data = {
          authorUid: currentUser.uid,
          authorId: gachaId,
          text: text,
          type: isPollMode ? 'poll' : 'text',
          likes: [],
          createdAt: serverTimestamp()
        };
        if (isPollMode) data.poll = { yes: [], no: [] };

        await addDoc(collection(db, 'posts'), data);

        postTextEl.value = '';
        postBtn.textContent = 'Post';
        postBtn.disabled = true;

        if (isPollMode) {
          isPollMode = false;
          pollToggle.classList.remove('active');
          pollToggle.textContent = '📊 Bikin Polling';
          postTextEl.placeholder = 'Apa yang lagi dipikirin?';
        }
      } catch (err) {
        console.error('Post error:', err);
        alert('Gagal posting. Coba lagi.');
        postBtn.disabled = false;
        postBtn.textContent = 'Post';
      }
    });

    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (!confirm('Logout dan gacha ID baru?')) return;
        try { await signOut(auth); } catch (e) { console.error(e); }
        localStorage.removeItem('gpyth_id');
        window.location.href = 'index.html';
      });
    }

    // Listen posts realtime
    const q = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    onSnapshot(q, (snap) => {
      feedEl.querySelectorAll('.post-card').forEach(el => el.remove());

      if (snap.empty) {
        emptyFeed.style.display = 'block';
        return;
      }
      emptyFeed.style.display = 'none';

      snap.forEach((d) => {
        feedEl.appendChild(renderPost(d.id, d.data()));
      });
    });

    // ------- Render 1 post -------
    function renderPost(postId, post) {
      const el = document.createElement('article');
      el.className = 'post-card';

      const likes      = post.likes || [];
      const likedByMe  = likes.includes(currentUser.uid);
      const timeAgo    = formatTimeAgo(post.createdAt?.toDate?.() || new Date());

      el.innerHTML = `
        <div class="post-header">
          <div class="post-avatar">#${post.authorId}</div>
          <div class="post-meta">
            <span class="post-author">Anon #${post.authorId}</span>
            <span class="post-time">${timeAgo}</span>
          </div>
        </div>
        <div class="post-body">
          <p class="post-text">${escapeHtml(post.text)}</p>
          ${post.type === 'poll' ? renderPoll(post) : ''}
        </div>
        <div class="post-actions">
          <button class="action-btn like-btn ${likedByMe ? 'liked' : ''}">
            ${likedByMe ? '❤️' : '🤍'} <span>${likes.length}</span>
          </button>
        </div>
      `;

      // Like
      el.querySelector('.like-btn').addEventListener('click', () => {
        toggleLike(postId);
      });

      // Vote poll
      if (post.type === 'poll') {
        el.querySelectorAll('.poll-option').forEach(btn => {
          btn.addEventListener('click', () => votePoll(postId, btn.dataset.choice));
        });
      }

      return el;
    }

    // ------- Render polling -------
    function renderPoll(post) {
      const poll = post.poll || { yes: [], no: [] };
      const yes  = poll.yes || [];
      const no   = poll.no  || [];
      const total = yes.length + no.length;
      const yesPct = total === 0 ? 0 : Math.round((yes.length / total) * 100);
      const noPct  = 100 - yesPct;

      const hasVoted =
        yes.includes(currentUser.uid) || no.includes(currentUser.uid);

      if (hasVoted) {
        return `
          <div class="poll">
            <div class="poll-results">
              <div class="poll-bar-row">
                <span class="poll-label">Iya</span>
                <div class="poll-bar"><div class="poll-fill yes" style="width:${yesPct}%"></div></div>
                <span class="poll-pct">${yesPct}%</span>
              </div>
              <div class="poll-bar-row">
                <span class="poll-label">Tidak</span>
                <div class="poll-bar"><div class="poll-fill no" style="width:${noPct}%"></div></div>
                <span class="poll-pct">${noPct}%</span>
              </div>
              <span class="poll-total">${total} vote</span>
            </div>
          </div>
        `;
      }
      return `
        <div class="poll">
          <div class="poll-options">
            <button class="poll-option" data-choice="yes">👍 Iya</button>
            <button class="poll-option" data-choice="no">👎 Tidak</button>
          </div>
          <span class="poll-total">${total} vote · belum vote</span>
        </div>
      `;
    }

    // ------- Toggle like -------
    async function toggleLike(postId) {
      const ref  = doc(db, 'posts', postId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const likes = snap.data().likes || [];
      if (likes.includes(currentUser.uid)) {
        await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
      } else {
        await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
      }
    }

    // ------- Vote poll -------
    async function votePoll(postId, choice) {
      const ref  = doc(db, 'posts', postId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const poll = snap.data().poll || { yes: [], no: [] };
      const yes  = poll.yes || [];
      const no   = poll.no  || [];
      if (yes.includes(currentUser.uid) || no.includes(currentUser.uid)) return;

      const field = choice === 'yes' ? 'poll.yes' : 'poll.no';
      await updateDoc(ref, { [field]: arrayUnion(currentUser.uid) });
    }
  }

  // --------------------------------------------
  // CHAT PAGE (Global Chat)
  // --------------------------------------------
  function initChatPage() {
    const myIdEl     = document.getElementById('myId');
    const form       = document.getElementById('chatForm');
    const input      = document.getElementById('chatInput');
    const messages   = document.getElementById('chatMessages');
    const emptyChat  = document.getElementById('emptyChat');

    myIdEl.textContent = `#${gachaId}`;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || !currentUser) return;

      input.value = '';
      try {
        await addDoc(collection(db, 'messages'), {
          authorUid: currentUser.uid,
          authorId: gachaId,
          text: text,
          createdAt: serverTimestamp()
        });
        messages.scrollTop = messages.scrollHeight;
      } catch (err) {
        console.error('Send error:', err);
        alert('Gagal kirim pesan.');
      }
    });

    const q = query(
      collection(db, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(200)
    );

    onSnapshot(q, (snap) => {
      messages.querySelectorAll('.msg').forEach(el => el.remove());

      if (snap.empty) {
        emptyChat.style.display = 'block';
        return;
      }
      emptyChat.style.display = 'none';

      const nearBottom =
        messages.scrollHeight - messages.scrollTop - messages.clientHeight < 150;

      snap.forEach((d) => {
        const msg = d.data();
        const isMe = msg.authorUid === currentUser.uid;
        const el = document.createElement('div');
        el.className = `msg ${isMe ? 'me' : 'them'}`;
        el.innerHTML = `
          ${!isMe ? `<span class="msg-author">#${msg.authorId}</span>` : ''}
          <div class="msg-bubble">${escapeHtml(msg.text)}</div>
          <span class="msg-time">${formatTime(msg.createdAt?.toDate?.() || new Date())}</span>
        `;
        messages.appendChild(el);
      });

      if (nearBottom || snap.size <= 1) {
        messages.scrollTop = messages.scrollHeight;
      }
    });
  }

  // --------------------------------------------
  // HELPERS
  // --------------------------------------------
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatTimeAgo(date) {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60)    return 'baru aja';
    if (diff < 3600)  return `${Math.floor(diff/60)}m`;
    if (diff < 86400) return `${Math.floor(diff/3600)}j`;
    if (diff < 604800) return `${Math.floor(diff/86400)}h`;
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  }

  function formatTime(date) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
}