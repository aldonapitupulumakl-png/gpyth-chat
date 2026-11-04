import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs, addDoc, onSnapshot, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

if (window.location.pathname.includes('main.html')) { initMainApp(); } else { initAuthPage(); }

// ============================================
// AUTH (LOGIN/DAFTAR)
// ============================================
function initAuthPage() {
  const registerForm = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  const btnRegister = document.getElementById('btnRegister');
  const agreeTos = document.getElementById('agreeTos');
  
  agreeTos?.addEventListener('change', () => { btnRegister.disabled = !agreeTos.checked; });
  document.getElementById('goLogin')?.addEventListener('click', (e) => { e.preventDefault(); registerForm.style.display = 'none'; loginForm.style.display = 'block'; });
  document.getElementById('goRegister')?.addEventListener('click', (e) => { e.preventDefault(); loginForm.style.display = 'none'; registerForm.style.display = 'block'; });

  btnRegister?.addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const username = document.getElementById('regUsername').value.trim().toLowerCase().replace(/\s+/g, '');
    const pass = document.getElementById('regPass').value;
    if(!name || !username || pass.length < 6) return alert('Isi data dengan benar!');
    btnRegister.textContent = '...'; btnRegister.disabled = true;

    try {
      const userCred = await createUserWithEmailAndPassword(auth, `${username}@gpyth.chat`, pass);
      const uid = userCred.user.uid;
      const isAdmin = username === 'maklov1';
      
      const userData = {
        uid: uid, name: name, age: Number(document.getElementById('regAge').value) || 0, username: username,
        bio: isAdmin ? "Creator Gpyth" : "Halo!", photoURL: "", bannerURL: "", telegram: isAdmin ? "maklov1" : "",
        followersCount: isAdmin ? 100000000 : 0, followingCount: 0, isVerified: isAdmin, isAdmin: isAdmin, isPremium: isAdmin
      };
      await setDoc(doc(db, 'users', uid), userData);
      
      // Bikin chat HZCS otomatis
      await addDoc(collection(db, 'messages'), {
         participants: [uid, 'hzcs_uid'], text: "Selamat datang di Gpyth Chat! Ada yang bisa dibantu?", createdAt: serverTimestamp()
      });

      window.location.href = 'main.html';
    } catch (err) { alert('Gagal Daftar: ' + err.message); btnRegister.textContent = 'Daftar'; btnRegister.disabled = false; }
  });

  document.getElementById('btnLogin')?.addEventListener('click', async () => {
    const username = document.getElementById('loginUsername').value.trim().toLowerCase();
    const pass = document.getElementById('loginPass').value;
    try { await signInWithEmailAndPassword(auth, `${username}@gpyth.chat`, pass); window.location.href = 'main.html'; }
    catch (err) { alert('Login Gagal: Username/Password salah.'); }
  });
}

// ============================================
// MAIN APP
// ============================================
let currentUserData = { isGuest: true };
let activeDmUser = null;

function initMainApp() {
  // Nav Logic
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const titles = { 'beranda': 'Beranda', 'chat': 'Chat', 'grup': 'Grup', 'profil': 'Profil' };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      tabPanes.forEach(tab => tab.classList.remove('active'));
      document.getElementById(`tab-${item.dataset.tab}`).classList.add('active');
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('pageTitle').textContent = titles[item.dataset.tab];
      
      if(item.dataset.tab === 'beranda') document.getElementById('fabPost').style.display = 'flex';
      else document.getElementById('fabPost').style.display = 'none';

      if(item.dataset.tab === 'profil') {
        if(currentUserData.isGuest) {
          document.getElementById('guestProfilePrompt').style.display = 'block';
          document.getElementById('profileContent').style.display = 'none';
        } else {
          document.getElementById('guestProfilePrompt').style.display = 'none';
          document.getElementById('profileContent').style.display = 'block';
        }
      }
    });
  });

  document.getElementById('btnGoLoginFromProfile').onclick = () => window.location.href = 'index.html';
  document.getElementById('btnLoginHeader').onclick = () => window.location.href = 'index.html';

  // AUTH STATE
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
        currentUserData = docSnap.data();
        currentUserData.isGuest = false;
        
        document.getElementById('btnLoginHeader').style.display = 'none';
        document.getElementById('fabPost').style.display = 'flex';
        document.getElementById('groupHeaderActions').style.display = 'block';
        document.getElementById('joinPrivateBox').style.display = 'block';
        
        if(currentUserData.isAdmin) document.getElementById('btnAdminDashboard').style.display = 'block';

        renderProfile();
        initDmList();
      }
    }
    initFeed();
    initCameraLogic();
  });

  // RENDER PROFIL
  function renderProfile() {
    if(currentUserData.isGuest) return;
    document.getElementById('profileName').textContent = currentUserData.name;
    document.getElementById('profileUsername').textContent = '@' + currentUserData.username;
    document.getElementById('profileBio').textContent = currentUserData.bio;
    document.getElementById('statFollowers').textContent = currentUserData.followersCount.toLocaleString();
    document.getElementById('statFollowing').textContent = currentUserData.followingCount;
    document.getElementById('statAge').textContent = currentUserData.age;
    if(currentUserData.photoURL) document.getElementById('profileAvatar').src = currentUserData.photoURL;
    
    const bannerEl = document.getElementById('profileBanner');
    if(currentUserData.bannerURL) bannerEl.style.backgroundImage = `url(${currentUserData.bannerURL})`;
    else if(currentUserData.isPremium) bannerEl.style.background = "linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6)";
    else bannerEl.style.background = "#222";

    if(currentUserData.isPremium) document.getElementById('verifiedBadge').style.display = 'inline-flex';
    if(currentUserData.telegram) {
      document.getElementById('profileTg').style.display = 'inline-flex';
      document.getElementById('profileTg').innerHTML = `<i class="bi bi-telegram"></i> ${currentUserData.telegram}`;
      document.getElementById('profileTg').href = `https://t.me/${currentUserData.telegram.replace('@', '')}`;
    }
  }

  // FEED (THREADS)
  function initFeed() {
    const feedContainer = document.getElementById('feedContainer');
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
    
    onSnapshot(q, (snap) => {
      feedContainer.innerHTML = '';
      if(snap.empty) { feedContainer.innerHTML = '<p style="text-align:center; padding:20px; color:var(--text-dim);">Belum ada thread.</p>'; return; }

      snap.forEach((docSnap) => {
        const post = docSnap.data();
        const div = document.createElement('div'); div.className = 'post-card';
        div.innerHTML = `
          <div class="post-avatar-col">
            <img src="${post.authorPhoto || 'https://via.placeholder.com/36'}" class="post-avatar" />
            <div class="thread-line"></div>
          </div>
          <div class="post-content">
            <div class="post-user-info">
              <h4>${post.authorUsername} ${post.isVerified ? '<i class="bi bi-patch-check-fill" style="color:var(--premium-gold); font-size:12px;"></i>' : ''}</h4>
              <span style="font-size:12px; color:var(--text-dim);">${new Date(post.createdAt?.toDate() || Date.now()).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
            </div>
            <div class="post-text">${post.text}</div>
            ${post.photoURL ? `<img src="${post.photoURL}" class="post-img" />` : ''}
            <div class="post-actions">
              <i class="bi bi-heart"></i>
              <i class="bi bi-chat"></i>
              <i class="bi bi-repeat"></i>
              <i class="bi bi-send"></i>
            </div>
          </div>
        `;
        feedContainer.appendChild(div);
      });
    });
  }

  // BIKIN POSTINGAN
  document.getElementById('fabPost').addEventListener('click', () => document.getElementById('postModal').classList.add('active'));
  document.getElementById('btnClosePost').onclick = () => document.getElementById('postModal').classList.remove('active');
  document.getElementById('btnSubmitPost').addEventListener('click', async () => {
    const text = document.getElementById('postText').value.trim();
    const file = document.getElementById('postPhoto').files[0];
    if(!text && !file) return;
    
    const btn = document.getElementById('btnSubmitPost'); btn.textContent = '...';
    try {
      let photoURL = "";
      if(file) { const r = ref(storage, `posts/${Date.now()}.jpg`); await uploadBytes(r, file); photoURL = await getDownloadURL(r); }
      await addDoc(collection(db, 'posts'), {
        authorUid: currentUserData.uid, authorUsername: currentUserData.username, authorPhoto: currentUserData.photoURL || "",
        isVerified: currentUserData.isVerified, text: text, photoURL: photoURL, createdAt: serverTimestamp()
      });
      document.getElementById('postModal').classList.remove('active'); document.getElementById('postText').value = '';
    } catch(err) { alert(err.message); }
    finally { btn.textContent = 'Posting'; }
  });

  // LOGIKA KAMERA
  function initCameraLogic() {
    document.getElementById('btnCamera').onclick = () => { if(currentUserData.isGuest) return alert('Login dulu!'); document.getElementById('cameraInput').click(); };
    document.getElementById('cameraInput').onchange = async (e) => {
      const file = e.target.files[0]; if(!file) return;
      const btnCam = document.querySelector('.camera-circle'); btnCam.innerHTML = '<i class="bi bi-hourglass-split"></i>';
      try {
        const r = ref(storage, `chat/${Date.now()}.jpg`); await uploadBytes(r, file); const url = await getDownloadURL(r);
        await addDoc(collection(db, 'global_messages'), { uid: currentUserData.uid, username: currentUserData.username, imageUrl: url, createdAt: serverTimestamp() });
        alert('Foto terkirim!');
      } catch(err) { alert('Gagal.'); }
      finally { btnCam.innerHTML = '<i class="bi bi-camera-fill"></i>'; e.target.value = ''; }
    };
  }

  // DM LIST (TELEGRAM STYLE) & HZCS
  function initDmList() {
    document.getElementById('openHzcsChatBtn').onclick = () => {
      openDmChat('hzcs_uid', 'HZCS (Official)', 'https://via.placeholder.com/40/3b82f6/ffffff?text=H');
    };
    
    // Kalau lu mau bikin chat sama user lain, tinggal tambahin logic di sini nanti.
    // Untuk sekarang fokus ke HZCS dulu biar jalan.
  }

  const dmView = document.getElementById('dmChatView');
  document.getElementById('btnBackFromDm').onclick = () => dmView.classList.remove('active');

  function openDmChat(targetUid, targetName, targetPhoto) {
    activeDmUser = targetUid;
    document.getElementById('dmName').textContent = targetName;
    document.getElementById('dmPhoto').src = targetPhoto;
    dmView.classList.add('active');
    loadDmMessages(targetUid);
  }

  function loadDmMessages(targetUid) {
    const box = document.getElementById('dmChatMessages');
    // Query percakapan antara currentUser dan targetUid
    const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc')); // Sederhananya ambil semua dulu buat MVP
    
    onSnapshot(q, (snap) => {
      box.innerHTML = '';
      snap.forEach((docSnap) => {
        const msg = docSnap.data();
        // Filter manual (karena Firestore array query agak ribet)
        if(msg.participants && msg.participants.includes(currentUserData.uid) && msg.participants.includes(targetUid)) {
          const isMe = msg.senderId === currentUserData.uid;
          const div = document.createElement('div'); div.className = `chat-msg ${isMe ? 'me' : 'them'}`;
          div.innerHTML = `<div class="chat-bubble">${msg.text}</div>`;
          box.appendChild(div);
        }
      });
      box.scrollTop = box.scrollHeight;
    });
  }

  document.getElementById('btnSendDmChat').onclick = async () => {
    const input = document.getElementById('dmChatInput');
    const text = input.value.trim(); if(!text) return;
    input.value = '';
    await addDoc(collection(db, 'messages'), {
      participants: [currentUserData.uid, activeDmUser],
      senderId: currentUserData.uid, text: text, createdAt: serverTimestamp()
    });
  };

  // ADMIN DASHBOARD
  document.getElementById('btnAdminDashboard').onclick = () => document.getElementById('adminDashboardModal').classList.add('active');
  document.getElementById('btnCloseAdmin').onclick = () => document.getElementById('adminDashboardModal').classList.remove('active');

  // Bales sebagai HZCS
  document.getElementById('btnSendHzcsReply').onclick = async () => {
    const targetUsername = document.getElementById('adminReplyTarget').value.trim().toLowerCase().replace('@', '');
    const replyText = document.getElementById('adminReplyText').value.trim();
    if(!targetUsername || !replyText) return alert('Isi username target dan pesan!');

    try {
      const q = query(collection(db, 'users'), where("username", "==", targetUsername));
      const snap = await getDocs(q);
      if(snap.empty) return alert('User tidak ditemukan!');
      
      const targetUid = snap.docs[0].data().uid;
      
      // Kirim sebagai HZCS (hzcs_uid)
      await addDoc(collection(db, 'messages'), {
        participants: [targetUid, 'hzcs_uid'],
        senderId: 'hzcs_uid', text: replyText, createdAt: serverTimestamp()
      });
      alert('Balasan HZCS terkirim!');
      document.getElementById('adminReplyText').value = '';
    } catch(err) { alert(err.message); }
  };

  // EDIT PROFIL (PREMIUM)
  document.getElementById('btnEditProfile').onclick = () => {
    document.getElementById('editName').value = currentUserData.name;
    document.getElementById('editBio').value = currentUserData.bio;
    document.getElementById('editTg').value = currentUserData.telegram || '';
    document.getElementById('editPremium').checked = currentUserData.isPremium || false;
    document.getElementById('editProfileModal').classList.add('active');
  };
  document.getElementById('btnCloseEdit').onclick = () => document.getElementById('editProfileModal').classList.remove('active');

  document.getElementById('btnSaveProfile').onclick = async () => {
    const btn = document.getElementById('btnSaveProfile'); btn.textContent = '...';
    try {
      let updateData = { 
        name: document.getElementById('editName').value, bio: document.getElementById('editBio').value,
        telegram: document.getElementById('editTg').value, isPremium: document.getElementById('editPremium').checked
      };
      if(updateData.isPremium) updateData.isVerified = true;
      
      const fileA = document.getElementById('editAvatar').files[0];
      const fileB = document.getElementById('editBanner').files[0];
      if(fileA) { const r = ref(storage, `avatars/${currentUserData.uid}`); await uploadBytes(r, fileA); updateData.photoURL = await getDownloadURL(r); }
      if(fileB) { const r = ref(storage, `banners/${currentUserData.uid}`); await uploadBytes(r, fileB); updateData.bannerURL = await getDownloadURL(r); }

      await updateDoc(doc(db, 'users', currentUserData.uid), updateData);
      currentUserData = { ...currentUserData, ...updateData }; 
      renderProfile(); document.getElementById('editProfileModal').classList.remove('active');
    } catch(err) { alert(err.message); }
    finally { btn.textContent = 'Simpan'; }
  };
}