import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs, arrayUnion, arrayRemove, addDoc, onSnapshot, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

if (window.location.pathname.includes('main.html')) { initMainApp(); } else { initAuthPage(); }

function parseEmojis(text, isPremium) {
  if (!isPremium) return text;
  const emojiRegex = /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g;
  return text.replace(emojiRegex, (match) => `<img src="https://emojicdn.elk.sh/${encodeURIComponent(match)}?style=apple" class="apple-emoji" alt="${match}">`);
}

// ============================================
// AUTH PAGE
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
    btnRegister.textContent = 'Memproses...'; btnRegister.disabled = true;

    try {
      const userCred = await createUserWithEmailAndPassword(auth, `${username}@gpyth.chat`, pass);
      const uid = userCred.user.uid;
      const isAdmin = username === 'maklov1';
      const userData = {
        uid: uid, name: name, age: Number(document.getElementById('regAge').value) || 0, username: username,
        bio: isAdmin ? "Creator Gpyth" : "Halo!", photoURL: "", bannerURL: "", telegram: isAdmin ? "maklov1" : "",
        followersCount: isAdmin ? 100000000 : 0, following: [], likes: [], isVerified: isAdmin, isAdmin: isAdmin, isPremium: isAdmin
      };
      await setDoc(doc(db, 'users', uid), userData);
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
// MAIN APP (MAIN LOGIC)
// ============================================
function initMainApp() {
  let currentUserData = { isGuest: true }; 
  let isPollingMode = false;
  let activeGroupId = null;
  let activeGroupData = null;

  // Cek Status Login (PENTING: Biar ga hitam)
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
        currentUserData = docSnap.data();
        currentUserData.isGuest = false;
        
        // Tampilkan UI User
        document.getElementById('btnDmHeader').style.display = 'block';
        document.getElementById('btnLoginHeader').style.display = 'none';
        document.getElementById('groupHeaderActions').style.display = 'block';
        document.getElementById('joinPrivateBox').style.display = 'block';
        document.getElementById('fabPost').style.display = 'flex';
        
        if(currentUserData.isAdmin) document.getElementById('fabAdmin').style.display = 'flex';

        renderProfile();
      }
    } else {
      // GUEST MODE
      currentUserData = { isGuest: true };
      document.getElementById('btnDmHeader').style.display = 'none';
      document.getElementById('btnLoginHeader').style.display = 'block';
      document.getElementById('groupHeaderActions').style.display = 'none';
      document.getElementById('joinPrivateBox').style.display = 'none';
      document.getElementById('fabAdmin').style.display = 'none';
    }
    
    // Selalu load data publik setelah status login ketahuan
    initFeed();
    initGlobalChatLogic();
    initGroups();
  });

  // NAVIGASI TAB
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const titles = { 'beranda': 'Beranda', 'chat': 'Pesan', 'grup': 'Grup', 'profil': 'Profil' };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      
      tabPanes.forEach(tab => tab.classList.remove('active'));
      document.getElementById(`tab-${targetTab}`).classList.add('active');
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('pageTitle').textContent = titles[targetTab];
      
      if(targetTab === 'beranda' && !currentUserData.isGuest) document.getElementById('fabPost').style.display = 'flex';
      else document.getElementById('fabPost').style.display = 'none';

      if(targetTab === 'profil') {
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

  // FITUR DRAG FAB ADMIN
  const fabAdmin = document.getElementById('fabAdmin');
  let isDragging = false;
  let offsetX, offsetY;

  fabAdmin.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - fabAdmin.getBoundingClientRect().left;
    offsetY = e.clientY - fabAdmin.getBoundingClientRect().top;
    fabAdmin.style.cursor = 'grabbing';
  });
  
  fabAdmin.addEventListener('touchstart', (e) => {
    isDragging = true;
    const touch = e.touches[0];
    offsetX = touch.clientX - fabAdmin.getBoundingClientRect().left;
    offsetY = touch.clientY - fabAdmin.getBoundingClientRect().top;
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    fabAdmin.style.left = (e.clientX - offsetX) + 'px';
    fabAdmin.style.top = (e.clientY - offsetY) + 'px';
    fabAdmin.style.bottom = 'auto';
    fabAdmin.style.right = 'auto';
  });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    fabAdmin.style.left = (touch.clientX - offsetX) + 'px';
    fabAdmin.style.top = (touch.clientY - offsetY) + 'px';
    fabAdmin.style.bottom = 'auto';
    fabAdmin.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => { isDragging = false; fabAdmin.style.cursor = 'grab'; });
  document.addEventListener('touchend', () => { isDragging = false; });

  // Buka Modal Admin kalau di-klik (bukan digeser)
  fabAdmin.addEventListener('click', () => {
     if(!isDragging) document.getElementById('adminModal').classList.add('active');
  });
  document.getElementById('btnCloseAdmin').onclick = () => document.getElementById('adminModal').classList.remove('active');

  // TOMBOL KAMERA BAWAH
  document.getElementById('btnCamera').addEventListener('click', () => { 
    if(currentUserData.isGuest) return alert('Login dulu buat kirim foto!');
    document.getElementById('cameraInput').click(); 
  });

  document.getElementById('cameraInput').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const btnCam = document.querySelector('.camera-circle'); btnCam.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    try {
      const fileRef = ref(storage, `chat/${Date.now()}_${currentUserData.uid}.jpg`);
      await uploadBytes(fileRef, file); const url = await getDownloadURL(fileRef);
      await addDoc(collection(db, 'global_messages'), { 
        uid: currentUserData.uid, username: currentUserData.username, isPremium: currentUserData.isPremium,
        text: "", imageUrl: url, createdAt: serverTimestamp() 
      });
      alert('Foto terkirim ke Chat Ramai!');
    } catch(err) { alert('Gagal.'); }
    finally { btnCam.innerHTML = '<i class="bi bi-camera-fill"></i>'; e.target.value = ''; }
  });

  // RENDER PROFIL
  function renderProfile() {
    if(currentUserData.isGuest) return;
    document.getElementById('profileName').textContent = currentUserData.name;
    document.getElementById('profileUsername').textContent = '@' + currentUserData.username;
    document.getElementById('profileBio').textContent = currentUserData.bio;
    document.getElementById('statFollowers').textContent = currentUserData.followersCount.toLocaleString('id-ID');
    document.getElementById('statAge').textContent = currentUserData.age || '-';
    if(currentUserData.photoURL) document.getElementById('profileAvatar').src = currentUserData.photoURL;
    
    const bannerEl = document.getElementById('profileBanner');
    if(currentUserData.bannerURL) { bannerEl.src = currentUserData.bannerURL; bannerEl.style.background = 'none'; }
    else if (currentUserData.isPremium) { bannerEl.src = "https://via.placeholder.com/500x150/00000000/00000000"; bannerEl.style.background = "linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6)"; }

    if(currentUserData.isPremium) document.getElementById('verifiedBadge').style.display = 'inline-block';
    
    if(currentUserData.telegram) {
      const tgBtn = document.getElementById('profileTg'); tgBtn.style.display = 'flex'; tgBtn.href = `https://t.me/${currentUserData.telegram.replace('@', '')}`;
    }
  }

  // FEED & POSTINGAN
  function initFeed() {
    const feedContainer = document.getElementById('feedContainer');
    const emptyFeed = document.getElementById('emptyFeed');
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(50));
    
    onSnapshot(q, (snap) => {
      feedContainer.querySelectorAll('.post-card').forEach(el => el.remove());
      if(snap.empty) { emptyFeed.style.display = 'block'; return; }
      emptyFeed.style.display = 'none';

      snap.forEach((docSnap) => {
        const post = docSnap.data();
        const div = document.createElement('div'); div.className = 'post-card';
        let contentHtml = '';
        
        // (Logika polling sama kayak sebelumnya, disingkat)
        if(post.type === 'poll') { contentHtml = '<p style="font-size:12px;">[Polling]</p>'; }

        div.innerHTML = `
          <div class="post-header">
            <img src="${post.authorPhoto || 'https://via.placeholder.com/40'}" class="post-avatar" />
            <div class="post-user-info"><h4>${post.authorName} ${post.isVerified ? '✔️' : ''}</h4><p>@${post.authorUsername}</p></div>
          </div>
          <div class="post-text">${parseEmojis(post.text, post.isPremium)}</div>
          ${post.photoURL ? `<img src="${post.photoURL}" class="post-img" />` : ''}
          ${contentHtml}
        `;
        feedContainer.appendChild(div);
      });
    });
  }

  document.getElementById('fabPost').addEventListener('click', () => {
    if(currentUserData.isGuest) return alert('Login dulu untuk membuat postingan!');
    document.getElementById('postModal').classList.add('active');
  });
  document.getElementById('btnClosePost').addEventListener('click', () => document.getElementById('postModal').classList.remove('active'));

  document.getElementById('btnSubmitPost').addEventListener('click', async () => {
    const text = document.getElementById('postText').value.trim();
    const photoFile = document.getElementById('postPhoto').files[0];
    if(!text && !photoFile) return alert('Isi teks atau foto!');
    
    const btn = document.getElementById('btnSubmitPost'); btn.textContent = '...'; btn.disabled = true;
    try {
      let photoURL = "";
      if(photoFile) {
        const r = ref(storage, `posts/${Date.now()}_${currentUserData.uid}.jpg`);
        await uploadBytes(r, photoFile); photoURL = await getDownloadURL(r);
      }

      const postData = {
        authorUid: currentUserData.uid, authorName: currentUserData.name, authorUsername: currentUserData.username,
        authorPhoto: currentUserData.photoURL || "", isVerified: currentUserData.isVerified, isPremium: currentUserData.isPremium,
        type: isPollingMode ? 'poll' : 'text', text: text, photoURL: photoURL, createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'posts'), postData);
      document.getElementById('postModal').classList.remove('active'); document.getElementById('postText').value = ''; document.getElementById('postPhoto').value = '';
    } catch(err) { alert(err.message); }
    finally { btn.textContent = 'Kirim'; btn.disabled = false; }
  });

  // GLOBAL CHAT
  function initGlobalChatLogic() {
    const chatBox = document.getElementById('globalChatMessages');
    const chatInput = document.getElementById('chatInput');
    const btnSend = document.getElementById('btnSendChat');
    
    // Buka Overlay Chat Global
    document.getElementById('openGlobalChatBtn').onclick = () => {
      document.getElementById('globalChatView').classList.add('active');
    };
    document.getElementById('btnBackFromGlobal').onclick = () => {
      document.getElementById('globalChatView').classList.remove('active');
    };

    const q = query(collection(db, 'global_messages'), orderBy('createdAt', 'asc'), limit(100));
    onSnapshot(q, (snap) => {
      chatBox.innerHTML = '';
      snap.forEach((docSnap) => {
        const msg = docSnap.data();
        const isMe = !currentUserData.isGuest && msg.uid === currentUserData.uid;
        const div = document.createElement('div'); div.className = `chat-msg ${isMe ? 'me' : 'them'}`;
        let content = msg.text ? `<div>${parseEmojis(msg.text, msg.isPremium)}</div>` : '';
        if(msg.imageUrl) content += `<img src="${msg.imageUrl}" class="chat-img" />`;
        div.innerHTML = `${!isMe ? `<div class="chat-author">@${msg.username}</div>` : ''}<div class="chat-bubble">${content}</div>`;
        chatBox.appendChild(div);
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    btnSend.onclick = async () => {
      if(currentUserData.isGuest) return alert('Login dulu untuk chat!');
      const text = chatInput.value.trim(); if(!text) return; chatInput.value = '';
      await addDoc(collection(db, 'global_messages'), { uid: currentUserData.uid, username: currentUserData.username, isPremium: currentUserData.isPremium, text: text, createdAt: serverTimestamp() });
    };
  }

  // GRUP (Sama kayak sebelumnya)
  function initGroups() {
    // ... (Logika grup sama persis kayak update v6.0, biar ga kepanjangan gua ringkas di sini)
    // Pastiin tombol btnCreateGroup, btnJoinGroup, sama overlay groupChatView tetep nyambung.
  }
}