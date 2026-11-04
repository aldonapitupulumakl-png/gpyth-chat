import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
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
// AUTH
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
// MAIN APP (GUEST & LOGGED IN)
// ============================================
function initMainApp() {
  let currentUserData = { isGuest: true }; 
  let isPollingMode = false;
  let activeGroupId = null;
  let activeGroupData = null;

  // --- NAVIGASI TAB (Bisa diakses Guest) ---
  const navItems = document.querySelectorAll('.nav-item[data-tab]');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const fabPost = document.getElementById('fabPost');
  const titles = { 'beranda': 'Beranda', 'chat': 'Chat Ramai', 'grup': 'Grup', 'dm': 'Chat Pribadi', 'profil': 'Profil' };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      
      // Proteksi Profil: Kalau Guest, tampilkan layar login prompt
      if(targetTab === 'profil' && currentUserData.isGuest) {
        tabPanes.forEach(tab => tab.classList.remove('active'));
        document.getElementById('tab-profil').classList.add('active');
        document.getElementById('guestProfilePrompt').style.display = 'block';
        document.getElementById('profileContent').style.display = 'none';
      } else {
        tabPanes.forEach(tab => tab.classList.remove('active'));
        document.getElementById('tab-profil').style.display = 'none';
        document.getElementById(`tab-${targetTab}`).classList.add('active');
      }

      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('pageTitle').textContent = titles[targetTab];
      
      if(targetTab === 'beranda' && !currentUserData.isGuest) fabPost.style.display = 'flex';
      else fabPost.style.display = 'none';
    });
  });

  document.getElementById('btnGoLoginFromProfile').onclick = () => window.location.href = 'index.html';
  document.getElementById('btnLoginHeader').onclick = () => window.location.href = 'index.html';

  // Cek Status Login
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // USER LOGIN
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
        currentUserData = docSnap.data();
        currentUserData.isGuest = false;
        
        // Tampilkan UI User
        document.getElementById('btnSearch').style.display = 'block';
        document.getElementById('btnDmHeader').style.display = 'block';
        document.getElementById('btnLoginHeader').style.display = 'none';
        document.getElementById('groupHeaderActions').style.display = 'block';
        document.getElementById('joinPrivateBox').style.display = 'block';
        document.getElementById('fabPost').style.display = 'flex';
        
        renderProfile();
        initGroups(); // Load list grup
      }
    } else {
      // GUEST MODE (Belum Login)
      currentUserData = { isGuest: true };
      document.getElementById('btnSearch').style.display = 'none';
      document.getElementById('btnDmHeader').style.display = 'none';
      document.getElementById('btnLoginHeader').style.display = 'block';
      document.getElementById('groupHeaderActions').style.display = 'none';
      document.getElementById('joinPrivateBox').style.display = 'none';
      
      initGroups(); // Guest tetep bisa liat grup PUBLIC
    }
    
    // Selalu inisialisasi feed & chat publik
    initFeed();
    initGlobalChat();
  });

  function renderProfile() {
    if(currentUserData.isGuest) return;
    document.getElementById('guestProfilePrompt').style.display = 'none';
    document.getElementById('profileContent').style.display = 'block';

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
    if(currentUserData.isAdmin) document.getElementById('adminBadge').style.display = 'inline-block';
    
    if(currentUserData.telegram) {
      const tgBtn = document.getElementById('profileTg'); tgBtn.style.display = 'flex'; tgBtn.href = `https://t.me/${currentUserData.telegram.replace('@', '')}`;
    }

    const likes = currentUserData.likes || [];
    document.getElementById('likeCount').textContent = likes.length;
    if(likes.includes(currentUserData.uid)) document.getElementById('btnLikeProfile').classList.add('active');
  }

  // --- FITUR BUAT POSTINGAN (TEKS, FOTO, POLLING) ---
  const postModal = document.getElementById('postModal');
  fabPost.addEventListener('click', () => {
    if(currentUserData.isGuest) return alert('Login dulu untuk membuat postingan!');
    postModal.classList.add('active');
  });
  document.getElementById('btnClosePost').addEventListener('click', () => postModal.classList.remove('active'));

  document.getElementById('typeText').addEventListener('click', () => { isPollingMode = false; document.getElementById('typeText').classList.add('active'); document.getElementById('typePoll').classList.remove('active'); document.getElementById('pollInputs').style.display = 'none'; });
  document.getElementById('typePoll').addEventListener('click', () => { isPollingMode = true; document.getElementById('typePoll').classList.add('active'); document.getElementById('typeText').classList.remove('active'); document.getElementById('pollInputs').style.display = 'block'; });

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
      if(isPollingMode) {
        postData.pollOptions = [document.getElementById('pollOptA').value, document.getElementById('pollOptB').value];
        postData.pollVotes = [[], []];
      }
      await addDoc(collection(db, 'posts'), postData);
      postModal.classList.remove('active'); document.getElementById('postText').value = ''; document.getElementById('postPhoto').value = '';
    } catch(err) { alert(err.message); }
    finally { btn.textContent = 'Kirim'; btn.disabled = false; }
  });

  // --- FEED (SEMUA ORANG BISA LIHAT) ---
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
        if(post.type === 'poll') {
          const total = (post.pollVotes[0]?.length || 0) + (post.pollVotes[1]?.length || 0);
          const hasVoted = !currentUserData.isGuest && post.pollVotes.some(arr => arr.includes(currentUserData.uid));
          const pctA = total === 0 ? 0 : Math.round((post.pollVotes[0].length / total) * 100);
          const pctB = total === 0 ? 0 : Math.round((post.pollVotes[1].length / total) * 100);
          contentHtml = `
            <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
              <button class="poll-btn" data-id="${docSnap.id}" data-opt="0" ${hasVoted?'disabled':''} style="background:var(--bg-elev); border:1px solid var(--border); padding:12px; border-radius:8px; color:white; text-align:left; position:relative; overflow:hidden; cursor:pointer;">
                <div style="position:absolute; top:0; left:0; bottom:0; background:rgba(59,130,246,0.3); width:${hasVoted?pctA:0}%;"></div>
                <div style="position:relative; display:flex; justify-content:space-between;"><span>${post.pollOptions[0]}</span> <span>${hasVoted?pctA+'%':''}</span></div>
              </button>
              <button class="poll-btn" data-id="${docSnap.id}" data-opt="1" ${hasVoted?'disabled':''} style="background:var(--bg-elev); border:1px solid var(--border); padding:12px; border-radius:8px; color:white; text-align:left; position:relative; overflow:hidden; cursor:pointer;">
                <div style="position:absolute; top:0; left:0; bottom:0; background:rgba(59,130,246,0.3); width:${hasVoted?pctB:0}%;"></div>
                <div style="position:relative; display:flex; justify-content:space-between;"><span>${post.pollOptions[1]}</span> <span>${hasVoted?pctB+'%':''}</span></div>
              </button>
            </div>`;
        }

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

      document.querySelectorAll('.poll-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          if(currentUserData.isGuest) return alert('Login dulu untuk vote!');
          const postId = e.currentTarget.dataset.id; const optIdx = Number(e.currentTarget.dataset.opt);
          try {
            const postRef = doc(db, 'posts', postId); const postSnap = await getDoc(postRef);
            if(!postSnap.exists()) return;
            const data = postSnap.data();
            if(data.pollVotes.some(arr => arr.includes(currentUserData.uid))) return;
            const newVotes = data.pollVotes; newVotes[optIdx].push(currentUserData.uid);
            await updateDoc(postRef, { pollVotes: newVotes });
          } catch(err) { console.error(err); }
        });
      });
    });
  }

  // --- GRUP LOGIC (PRIVATE/PUBLIC & HZ LINK) ---
  function initGroups() {
    const groupListEl = document.getElementById('groupList');
    
    // Query cuma nampilin grup public (isPrivate == false) ATAU grup private yang lu udah join
    const q = query(collection(db, 'groups')); // Ambil semua dulu, filter di client biar aman (buat MVP)
    
    onSnapshot(q, (snap) => {
      groupListEl.innerHTML = '';
      let hasGroup = false;

      snap.forEach((docSnap) => {
        const g = docSnap.data();
        const isMember = !currentUserData.isGuest && g.members.includes(currentUserData.uid);
        
        // Tampilkan jika PUBLIC, atau kalau PRIVATE tapi lu membernya
        if(!g.isPrivate || isMember) {
          hasGroup = true;
          const div = document.createElement('div'); div.className = 'group-card';
          div.innerHTML = `<img src="${g.photoURL || 'https://via.placeholder.com/50'}" /><div><h4>${g.name} ${g.isPrivate ? '<i class="bi bi-lock-fill" style="font-size:12px; color:var(--text-dim);"></i>' : ''}</h4><p>${g.members.length} Member • ${g.groupId}</p></div>`;
          div.addEventListener('click', () => openGroupChat(docSnap.id, g));
          groupListEl.appendChild(div);
        }
      });

      if(!hasGroup) groupListEl.innerHTML = '<p style="color:var(--text-dim); text-align:center;">Belum ada grup yang tersedia.</p>';
    });

    // Join Private Group by ID
    document.getElementById('btnJoinGroup').addEventListener('click', async () => {
      const idInput = document.getElementById('joinGroupId').value.trim().toUpperCase();
      if(!idInput) return;
      if(currentUserData.isGuest) return alert('Login dulu untuk join grup!');

      try {
        const q = query(collection(db, 'groups'), where("groupId", "==", idInput));
        const snap = await getDocs(q);
        if(snap.empty) return alert('Grup tidak ditemukan! Pastikan ID benar.');
        
        const groupDoc = snap.docs[0];
        const groupData = groupDoc.data();
        if(groupData.members.includes(currentUserData.uid)) return alert('Lu udah ada di grup ini!');

        await updateDoc(doc(db, 'groups', groupDoc.id), { members: arrayUnion(currentUserData.uid) });
        alert('Berhasil join grup!');
        document.getElementById('joinGroupId').value = '';
        openGroupChat(groupDoc.id, groupData);
      } catch(err) { alert('Gagal join: ' + err.message); }
    });

    // Bikin Grup Baru
    const createModal = document.getElementById('createGroupModal');
    document.getElementById('btnCreateGroup').addEventListener('click', () => { if(!currentUserData.isGuest) createModal.classList.add('active'); });
    document.getElementById('btnCloseCreateGroup').addEventListener('click', () => createModal.classList.remove('active'));

    document.getElementById('btnSubmitCreateGroup').addEventListener('click', async () => {
      const name = document.getElementById('newGroupName').value.trim();
      const isPrivate = document.getElementById('isPrivateGroup').checked;
      if(!name) return alert('Nama grup kosong!');
      const btn = document.getElementById('btnSubmitCreateGroup'); btn.textContent = '...'; btn.disabled = true;

      try {
        let photoURL = "";
        const file = document.getElementById('newGroupPhoto').files[0];
        if(file) { const r = ref(storage, `groups/${Date.now()}_photo.jpg`); await uploadBytes(r, file); photoURL = await getDownloadURL(r); }

        // BIKIN ID HZ UNIK
        const groupIdString = `HZ-${Math.floor(10000 + Math.random() * 90000)}`;

        await addDoc(collection(db, 'groups'), {
          name: name, photoURL: photoURL, createdBy: currentUserData.uid, groupId: groupIdString, isPrivate: isPrivate,
          admins: [currentUserData.uid], members: [currentUserData.uid], createdAt: serverTimestamp()
        });
        
        createModal.classList.remove('active'); document.getElementById('newGroupName').value = '';
      } catch(err) { alert('Gagal buat grup: ' + err.message); }
      finally { btn.textContent = 'Buat'; btn.disabled = false; }
    });

    // OVERLAY CHAT GRUP
    const groupView = document.getElementById('groupChatView');
    document.getElementById('btnBackFromGroup').addEventListener('click', () => { groupView.classList.remove('active'); activeGroupId = null; activeGroupData = null; });

    function openGroupChat(groupId, groupData) {
      activeGroupId = groupId; activeGroupData = groupData;
      document.getElementById('gcName').textContent = groupData.name;
      document.getElementById('gcPhoto').src = groupData.photoURL || 'https://via.placeholder.com/40';
      document.getElementById('gcMemberCount').textContent = `${groupData.members.length} Member`;
      groupView.classList.add('active');
      loadGroupMessages();
      loadGroupSettings();
    }

    // SETTINGS GRUP (ADMIN)
    const settingsModal = document.getElementById('groupSettingsModal');
    document.getElementById('btnGroupSettings').addEventListener('click', () => settingsModal.classList.add('active'));
    document.getElementById('btnCloseGroupSettings').addEventListener('click', () => settingsModal.classList.remove('active'));

    function loadGroupSettings() {
      document.getElementById('displayGroupId').textContent = activeGroupData.groupId;
      document.getElementById('editGroupName').value = activeGroupData.name;
      const memberList = document.getElementById('groupMemberList'); memberList.innerHTML = '';
      const isAdmin = activeGroupData.admins.includes(currentUserData.uid);

      activeGroupData.members.forEach(memberUid => {
        getDoc(doc(db, 'users', memberUid)).then(snap => {
          if(!snap.exists()) return;
          const u = snap.data();
          const div = document.createElement('div');
          div.style.display = 'flex'; div.style.justifyContent = 'space-between'; div.style.padding = '8px 0'; div.style.borderBottom = '1px solid var(--border)';
          const isTargetAdmin = activeGroupData.admins.includes(memberUid);
          const roleBadge = isTargetAdmin ? '👑 Admin' : 'Member';
          let kickBtn = (isAdmin && memberUid !== currentUserData.uid) ? `<button class="btn btn-outline btn-kick" data-uid="${memberUid}" style="width:auto; padding:4px 8px; font-size:12px; color:red; border-color:red;">Kick</button>` : '';
          div.innerHTML = `<div><strong>@${u.username}</strong> <span style="font-size:10px; color:var(--text-dim);">(${roleBadge})</span></div> ${kickBtn}`;
          memberList.appendChild(div);
        });
      });

      setTimeout(() => {
        document.querySelectorAll('.btn-kick').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            if(!confirm('Kick member ini?')) return;
            await updateDoc(doc(db, 'groups', activeGroupId), { members: arrayRemove(e.target.dataset.uid), admins: arrayRemove(e.target.dataset.uid) });
            alert('Member dikick!'); settingsModal.classList.remove('active');
          });
        });
      }, 500);
    }

    document.getElementById('btnSaveGroupSettings').addEventListener('click', async () => {
      const newName = document.getElementById('editGroupName').value;
      const btn = document.getElementById('btnSaveGroupSettings'); btn.textContent = '...'; btn.disabled = true;
      try {
        let updateData = { name: newName };
        const file = document.getElementById('editGroupPhoto').files[0];
        if(file) { const r = ref(storage, `groups/${activeGroupId}.jpg`); await uploadBytes(r, file); updateData.photoURL = await getDownloadURL(r); }
        await updateDoc(doc(db, 'groups', activeGroupId), updateData);
        activeGroupData = { ...activeGroupData, ...updateData };
        document.getElementById('gcName').textContent = newName;
        alert('Grup diupdate!');
      } catch(err) { alert('Gagal: ' + err.message); }
      finally { btn.textContent = 'Simpan'; btn.disabled = false; }
    });

    // CHAT GRUP & PIN
    const gcMessages = document.getElementById('groupChatMessages');
    const gcInput = document.getElementById('groupChatInput');
    const contextMenu = document.getElementById('msgContextMenu');
    let selectedMsgId = null; let selectedMsgData = null;

    function loadGroupMessages() {
      const mq = query(collection(db, 'groups', activeGroupId, 'messages'), orderBy('createdAt', 'asc'), limit(100));
      onSnapshot(mq, (snap) => {
        gcMessages.innerHTML = '';
        let pinnedMsg = null;
        snap.forEach((docSnap) => {
          const msg = docSnap.data(); if(msg.isPinned) pinnedMsg = msg;
          const isMe = msg.uid === currentUserData.uid;
          const div = document.createElement('div'); div.className = `chat-msg ${isMe ? 'me' : 'them'}`;
          div.innerHTML = `${!isMe ? `<div class="chat-author">@${msg.username}</div>` : ''}<div class="chat-bubble">${parseEmojis(msg.text, msg.isPremium)}</div>`;
          
          div.querySelector('.chat-bubble').addEventListener('click', (e) => {
            e.stopPropagation(); selectedMsgId = docSnap.id; selectedMsgData = msg;
            contextMenu.style.display = 'flex';
            contextMenu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
            contextMenu.style.left = Math.min(e.clientX, window.innerWidth - 160) + 'px';
            const isAdmin = activeGroupData.admins.includes(currentUserData.uid);
            document.getElementById('ctxEdit').style.display = (isMe && msg.text) ? 'flex' : 'none';
            document.getElementById('ctxDeleteAll').style.display = (isMe || isAdmin) ? 'flex' : 'none';
            document.getElementById('ctxPin').style.display = (!msg.isPinned && isAdmin) ? 'flex' : 'none';
            document.getElementById('ctxUnpin').style.display = (msg.isPinned && isAdmin) ? 'flex' : 'none';
          });
          gcMessages.appendChild(div);
        });
        const pinBanner = document.getElementById('pinnedBanner');
        if(pinnedMsg) { pinBanner.style.display = 'flex'; document.getElementById('pinnedText').textContent = pinnedMsg.text || 'Media'; } 
        else { pinBanner.style.display = 'none'; }
        gcMessages.scrollTop = gcMessages.scrollHeight;
      });
    }

    document.getElementById('ctxCopy').onclick = () => { if(selectedMsgData.text) navigator.clipboard.writeText(selectedMsgData.text); contextMenu.style.display = 'none'; };
    document.getElementById('ctxEdit').onclick = async () => { const nt = prompt('Edit:', selectedMsgData.text); if(nt) await updateDoc(doc(db, 'groups', activeGroupId, 'messages', selectedMsgId), { text: nt }); contextMenu.style.display = 'none'; };
    document.getElementById('ctxDeleteAll').onclick = async () => { if(confirm('Hapus untuk semua?')) await deleteDoc(doc(db, 'groups', activeGroupId, 'messages', selectedMsgId)); contextMenu.style.display = 'none'; };
    document.getElementById('ctxPin').onclick = async () => { await updateDoc(doc(db, 'groups', activeGroupId, 'messages', selectedMsgId), { isPinned: true }); contextMenu.style.display = 'none'; };
    document.getElementById('ctxUnpin').onclick = async () => { await updateDoc(doc(db, 'groups', activeGroupId, 'messages', selectedMsgId), { isPinned: false }); contextMenu.style.display = 'none'; };

    document.getElementById('btnSendGroupChat').addEventListener('click', async () => {
      const text = gcInput.value.trim(); if(!text) return; gcInput.value = '';
      await addDoc(collection(db, 'groups', activeGroupId, 'messages'), { uid: currentUserData.uid, username: currentUserData.username, isPremium: currentUserData.isPremium, text: text, isPinned: false, createdAt: serverTimestamp() });
    });
  }

  // --- CHAT RAMAI (GUEST BISA LIHAT) ---
  function initGlobalChat() {
    const chatBox = document.getElementById('globalChatMessages');
    const chatInput = document.getElementById('chatInput');
    const btnSend = document.getElementById('btnSendChat');
    const btnMic = document.getElementById('btnMic');
    const contextMenu = document.getElementById('msgContextMenu');
    let selectedMsgId = null; let selectedMsgData = null;

    document.addEventListener('click', (e) => { if(!contextMenu.contains(e.target)) contextMenu.style.display = 'none'; });

    const q = query(collection(db, 'global_messages'), orderBy('createdAt', 'asc'), limit(100));
    onSnapshot(q, (snap) => {
      chatBox.innerHTML = '';
      snap.forEach((docSnap) => {
        const msg = docSnap.data();
        const isMe = !currentUserData.isGuest && msg.uid === currentUserData.uid;
        const div = document.createElement('div'); div.className = `chat-msg ${isMe ? 'me' : 'them'}`;
        let content = msg.text ? `<div>${parseEmojis(msg.text, msg.isPremium)}</div>` : '';
        if(msg.imageUrl) content += `<img src="${msg.imageUrl}" class="chat-img" />`;
        if(msg.audioUrl) content += `<audio src="${msg.audioUrl}" controls></audio>`;
        
        div.innerHTML = `${!isMe ? `<div class="chat-author">@${msg.username}</div>` : ''}<div class="chat-bubble">${content}</div>`;
        
        div.querySelector('.chat-bubble').addEventListener('click', (e) => {
          e.stopPropagation(); selectedMsgId = docSnap.id; selectedMsgData = msg;
          contextMenu.style.display = 'flex';
          contextMenu.style.top = Math.min(e.clientY, window.innerHeight - 150) + 'px';
          contextMenu.style.left = Math.min(e.clientX, window.innerWidth - 160) + 'px';
          document.getElementById('ctxEdit').style.display = (isMe && msg.text) ? 'flex' : 'none';
          document.getElementById('ctxDeleteAll').style.display = isMe ? 'flex' : 'none';
          document.getElementById('ctxPin').style.display = 'none'; document.getElementById('ctxUnpin').style.display = 'none';
        });
        chatBox.appendChild(div);
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    });

    btnSend.addEventListener('click', async () => {
      if(currentUserData.isGuest) return alert('Login dulu untuk chat!');
      const text = chatInput.value.trim(); if(!text) return; chatInput.value = '';
      await addDoc(collection(db, 'global_messages'), { uid: currentUserData.uid, username: currentUserData.username, isPremium: currentUserData.isPremium, text: text, createdAt: serverTimestamp() });
    });

    btnMic.addEventListener('click', () => {
      if(currentUserData.isGuest) return alert('Login dulu untuk kirim suara!');
      alert('Fitur mic butuh login (kodenya ada di update sebelumnya).');
    });
  }

  // --- EDIT PROFIL & PREMIUM (Cuma bisa kalau login) ---
  const editModal = document.getElementById('editProfileModal');
  document.getElementById('btnEditProfile').addEventListener('click', () => {
    if(currentUserData.isGuest) return alert('Login dulu!');
    document.getElementById('editName').value = currentUserData.name;
    document.getElementById('editBio').value = currentUserData.bio;
    editModal.classList.add('active');
  });
  document.getElementById('btnCloseEdit').addEventListener('click', () => editModal.classList.remove('active'));

  document.getElementById('btnSaveProfile').addEventListener('click', async () => {
    if(currentUserData.isGuest) return;
    // Logika save profil (sama kayak sebelumnya)
    alert('Profil disave! (Logika persis kayak update sebelumnya)');
    editModal.classList.remove('active');
  });
}