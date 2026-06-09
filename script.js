import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

window.db = null;
window.auth = null;
window.useFirebaseCloud = false;
window.appId = typeof __app_id !== 'undefined' ? __app_id : 'default-flexiz-app';

// Phase d'authentification initiale et écouteurs Cloud
const configureFirebase = async () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    try {
      const firebaseConfig = JSON.parse(__firebase_config);
      const app = initializeApp(firebaseConfig);
      window.auth = getAuth(app);
      window.db = getFirestore(app);
      
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(window.auth, __initial_auth_token);
      } else {
        await signInAnonymously(window.auth);
      }
      
      onAuthStateChanged(window.auth, (user) => {
        if (user) {
          window.useFirebaseCloud = true;
          document.getElementById('cloudStatusIcon').className = "ml-2 text-xs text-emerald-500 animate-pulse";
          document.getElementById('cloudStatusIcon').title = "Synchronisation Cloud active en temps réel.";
          document.getElementById('navUserEmail').innerText = user.email || "Utilisateur Anonyme";
          document.getElementById('authSection').classList.add('hidden');
          document.getElementById('loggedInSection').classList.remove('hidden');
          setupCloudListener();
        } else {
          fallbackToLocalStorage();
        }
      });
    } catch (e) {
      console.error("Firebase Auth Error, fallback to LocalStorage", e);
      fallbackToLocalStorage();
    }
  } else {
    fallbackToLocalStorage();
  }
};

const fallbackToLocalStorage = () => {
  window.useFirebaseCloud = false;
  document.getElementById('cloudStatusIcon').className = "ml-2 text-xs text-zinc-400";
  document.getElementById('navUserEmail').innerText = "Invité Local";
  document.getElementById('authSection').classList.remove('hidden');
  document.getElementById('loggedInSection').classList.add('hidden');
  loadLocalTasks();
};

const setupCloudListener = () => {
  if (!window.db || !window.auth.currentUser) return;
  const userDocRef = doc(window.db, "users", window.auth.currentUser.uid, "apps", window.appId);
  
  onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      const cloudData = docSnap.data();
      if (cloudData && Array.isArray(cloudData.tasks)) {
        window.tasks = cloudData.tasks;
        renderTasks();
        updateCountdownState();
      }
    } else {
      if (!window.tasks || window.tasks.length === 0) {
        window.tasks = [];
        renderTasks();
      }
    }
  });
};

window.saveTasksState = async () => {
  if (window.useFirebaseCloud && window.db && window.auth.currentUser) {
    try {
      const userDocRef = doc(window.db, "users", window.auth.currentUser.uid, "apps", window.appId);
      await setDoc(userDocRef, { tasks: window.tasks }, { merge: true });
    } catch (e) {
      console.error("Cloud Save failed, writing local backup", e);
      localStorage.setItem('flexiz_tasks', JSON.stringify(window.tasks));
    }
  } else {
    localStorage.setItem('flexiz_tasks', JSON.stringify(window.tasks));
  }
};

const loadLocalTasks = () => {
  const local = localStorage.getItem('flexiz_tasks');
  window.tasks = local ? JSON.parse(local) : [];
  renderTasks();
  updateCountdownState();
};

// Architecture de l'application & Variables d'état fondamentales
window.tasks = [];
let currentFilter = 'all';
let currentMobileTab = 'matin';
let timerInterval = null;
let activeTaskId = null;
let timeRemaining = 0;
let totalDurationSeconds = 0;
let audioCtx = null;

const iconsList = [
    'fa-briefcase', 'fa-code', 'fa-book', 'fa-dumbbell', 'fa-gavel', 'fa-utensils',
    'fa-mug-hot', 'fa-bed', 'fa-plane', 'fa-car', 'fa-cart-shopping', 'fa-heartPulse',
    'fa-comments', 'fa-envelope', 'fa-music', 'fa-gamepad', 'fa-tv', 'fa-brush',
    'fa-seedling', 'fa-wallet', 'fa-gear', 'fa-wrench', 'fa-lightbulb', 'fa-phone'
];
// Fonction pour quitter l'écran d'accueil et entrer dans l'application
function enterApp() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    const welcomeContent = document.getElementById('welcomeContent');
    
    if (welcomeScreen && welcomeContent) {
        // Effet visuel de rétrécissement du contenu
        welcomeContent.classList.add('scale-95', 'opacity-0');
        
        // Effet visuel de fondu de l'arrière-plan
        welcomeScreen.classList.add('opacity-0', 'pointer-events-none');
        
        // Suppression définitive du DOM après la fin de l'animation pour libérer de la mémoire
        setTimeout(() => {
            welcomeScreen.remove();
        }, 700);
        
        // Optionnel : Initialiser l'audio à l'entrée de l'utilisateur pour éviter les restrictions de bruitage du navigateur
        if (typeof initAudio === 'function') {
            initAudio();
        }
    }
}

// Rendre la fonction publique pour le bouton HTML onclick="enterApp()"
window.enterApp = enterApp;
function initApp() {
    initTheme();
    generateIconGrid();
    configureFirebase();
    
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
}

function initTheme() {
    if (localStorage.getItem('theme') === 'light') {
        document.documentElement.classList.remove('dark');
    } else {
        document.documentElement.classList.add('dark');
    }
}

function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
}

function generateIconGrid() {
    const grid = document.getElementById('iconGrid');
    if(!grid) return;
    grid.innerHTML = '';
    
    iconsList.forEach(icon => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `icon-select-btn p-3 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition ${icon === 'fa-briefcase' ? 'ring-2 ring-blue-500 border-transparent' : ''}`;
        btn.dataset.icon = icon;
        btn.innerHTML = `<i class="fa-solid ${icon} text-base pointer-events-none"></i>`;
        btn.onclick = (e) => selectIcon(e, icon);
        grid.appendChild(btn);
    });
}

function selectIcon(e, icon) {
    document.querySelectorAll('.icon-select-btn').forEach(b => {
        b.classList.remove('ring-2', 'ring-blue-500', 'border-transparent');
    });
    e.currentTarget.classList.add('ring-2', 'ring-blue-500', 'border-transparent');
    document.getElementById('selectedIcon').value = icon;
}

function toggleModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        setTimeout(() => {
            const content = modal.querySelector('div');
            if(content) content.classList.remove('scale-95', 'opacity-0');
        }, 20);
    } else {
        const content = modal.querySelector('div');
        if(content) content.classList.add('scale-95', 'opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 200);
    }
}

function openCreateTask() {
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('modalTitle').innerText = 'Nouvelle tâche';
    document.getElementById('btnDeleteTask').classList.add('hidden');
    document.getElementById('selectedIcon').value = 'fa-briefcase';
    
    const now = new Date();
    document.getElementById('taskTime').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    generateIconGrid();
    toggleModal('taskModal');
}

function openEditTask(id) {
    const task = window.tasks.find(t => t.id === id);
    if (!task) return;
    
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskTime').value = task.time;
    document.getElementById('taskDuration').value = task.duration;
    document.getElementById('taskCategory').value = task.category;
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('selectedIcon').value = task.icon || 'fa-briefcase';
    
    document.getElementById('modalTitle').innerText = 'Modifier la tâche';
    document.getElementById('btnDeleteTask').classList.remove('hidden');
    
    generateIconGrid();
    const activeBtn = document.querySelector(`.icon-select-btn[data-icon="${task.icon || 'fa-briefcase'}"]`);
    if(activeBtn) activeBtn.click();
    
    toggleModal('taskModal');
}

function saveTask(e) {
    e.preventDefault();
    const id = document.getElementById('taskId').value;
    const title = document.getElementById('taskTitle').value;
    const time = document.getElementById('taskTime').value;
    const duration = parseInt(document.getElementById('taskDuration').value) || 30;
    const category = document.getElementById('taskCategory').value;
    const priority = document.getElementById('taskPriority').value;
    const icon = document.getElementById('selectedIcon').value;
    
    if (id) {
        const task = window.tasks.find(t => t.id === id);
        if (task) {
            task.title = title;
            task.time = time;
            task.duration = duration;
            task.category = category;
            task.priority = priority;
            task.icon = icon;
        }
    } else {
        const newTask = {
            id: 'task-' + Date.now(),
            title, time, duration, category, priority, icon,
            status: 'pending'
        };
        window.tasks.push(newTask);
    }
    
    window.saveTasksState();
    renderTasks();
    updateCountdownState();
    toggleModal('taskModal');
    showToast("Tâche enregistrée avec succès.", "success");
}

function deleteTaskClick() {
    const id = document.getElementById('taskId').value;
    if (!id) return;
    
    window.tasks = window.tasks.filter(t => t.id !== id);
    if (activeTaskId === id) {
        stopTimer();
        activeTaskId = null;
    }
    
    window.saveTasksState();
    renderTasks();
    updateCountdownState();
    toggleModal('taskModal');
    showToast("Tâche supprimée.", "info");
}

function renderTasks() {
    const lists = { matin: [], midi: [], apresmidi: [], soir: [], backlog: [] };
    const query = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
    
    let filtered = window.tasks.filter(t => {
        if (currentFilter === 'pending' && t.status !== 'pending') return false;
        if (currentFilter === 'completed' && t.status !== 'completed') return false;
        if (query && !t.title.toLowerCase().includes(query)) return false;
        return true;
    });
    
    filtered.sort((a, b) => a.time.localeCompare(b.time));
    
    const counts = { matin: 0, midi: 0, apresmidi: 0, soir: 0, backlog: 0 };
    window.tasks.forEach(t => { if(counts[t.category] !== undefined) counts[t.category]++; });
    
    Object.keys(counts).forEach(cat => {
        const hCount = document.getElementById(`header-count-${cat}`);
        const mCount = document.getElementById(`count-${cat}`);
        if(hCount) hCount.innerText = counts[cat];
        if(mCount) mCount.innerText = counts[cat];
    });
    
    filtered.forEach(task => {
        if (lists[task.category]) lists[task.category].push(task);
    });
    
    Object.keys(lists).forEach(category => {
        const container = document.getElementById(`list-${category}`);
        if (!container) return;
        container.innerHTML = '';
        
        if (lists[category].length === 0) {
            container.innerHTML = `
                <div class="h-24 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col items-center justify-center text-zinc-400 p-4 text-center">
                    <p class="text-[11px] font-medium">Aucune tâche</p>
                </div>
            `;
            return;
        }
        
        lists[category].forEach(task => {
            const card = document.createElement('div');
            const isCompleted = task.status === 'completed';
            const isActive = task.id === activeTaskId;
            
            let priorityClass = 'border-zinc-200 dark:border-zinc-800';
            if (task.priority === 'high') priorityClass = 'border-l-4 border-l-red-500 border-zinc-200 dark:border-zinc-800';
            if (task.priority === 'low') priorityClass = 'border-l-4 border-l-green-500 border-zinc-200 dark:border-zinc-800';
            
            card.id = task.id;
            card.draggable = true;
            card.ondragstart = (e) => drag(e);
            card.onclick = () => openEditTask(task.id);
            
            card.className = `p-3.5 bg-white dark:bg-zinc-900 border ${priorityClass} rounded-xl shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing flex items-start space-x-3 group relative transition ${isCompleted ? 'opacity-50 line-through' : ''} ${isActive ? 'active-task-pulse ring-1 ring-blue-500' : ''}`;
            
            card.innerHTML = `
                <div onclick="event.stopPropagation(); toggleTaskStatus('${task.id}')" class="mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition cursor-pointer shrink-0 ${isCompleted ? 'bg-green-500 border-transparent text-white' : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-500'}">
                    ${isCompleted ? '<i class="fa-solid fa-check text-[10px]"></i>' : ''}
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm tracking-tight text-zinc-800 dark:text-zinc-100 truncate">${task.title}</p>
                    <div class="flex items-center space-x-2 text-[11px] text-zinc-400 mt-1 font-medium">
                        <span class="flex items-center"><i class="fa-solid ${task.icon || 'fa-briefcase'} mr-1 text-zinc-500"></i> ${task.time}</span>
                        <span>•</span>
                        <span>${task.duration} min</span>
                    </div>
                </div>
                <button onclick="event.stopPropagation(); startFocusSession('${task.id}')" class="opacity-0 group-hover:opacity-100 w-7 h-7 bg-blue-500/10 hover:bg-blue-500 text-blue-600 hover:text-white rounded-lg flex items-center justify-center transition shrink-0" title="Lancer le focus">
                    <i class="fa-solid fa-play text-xs"></i>
                </button>
            `;
            container.appendChild(card);
        });
    });
    
    updateMobileTabsVisibility();
}

function updateMobileTabsVisibility() {
    const categories = ['matin', 'midi', 'apresmidi', 'soir', 'backlog'];
    categories.forEach(cat => {
        const col = document.getElementById(`col-${cat}`);
        if (!col) return;
        if (window.innerWidth < 1024) {
            if (cat === currentMobileTab) col.classList.remove('hidden');
            else col.classList.add('hidden');
        } else {
            col.classList.remove('hidden');
        }
    });
}

function switchMobileTab(tab) {
    currentMobileTab = tab;
    document.querySelectorAll('.mobile-tab').forEach(btn => {
        btn.className = "mobile-tab px-4 py-2 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 flex items-center space-x-2 shrink-0";
    });
    
    const activeBtn = document.getElementById(`tab-${tab}`);
    if (activeBtn) {
        if(tab === 'backlog') {
            activeBtn.className = "mobile-tab px-4 py-2 rounded-full text-xs font-semibold bg-orange-500 text-white shadow-sm flex items-center space-x-2 shrink-0";
        } else {
            activeBtn.className = "mobile-tab px-4 py-2 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-sm flex items-center space-x-2 shrink-0";
        }
    }
    renderTasks();
}

function setFilter(filter) {
    currentFilter = filter;
    ['all', 'pending', 'completed'].forEach(f => {
        const b = document.getElementById(`filter-${f}`);
        if(b) b.className = `px-3 py-1.5 rounded-lg text-xs font-semibold ${f === filter ? 'bg-blue-600 text-white shadow-sm' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`;
    });
    renderTasks();
}

function filterTasks() { renderTasks(); }

function toggleTaskStatus(id) {
    const task = window.tasks.find(t => t.id === id);
    if (!task) return;
    
    task.status = task.status === 'completed' ? 'pending' : 'completed';
    if(task.status === 'completed' && activeTaskId === id) {
        stopTimer();
        activeTaskId = null;
    }
    
    window.saveTasksState();
    renderTasks();
    updateCountdownState();
    
    if (task.status === 'completed') {
        playEffect('completion');
        triggerConfetti();
        showToast("Tâche complétée ! Félicitations.", "success");
    }
}

function drag(e) { e.dataTransfer.setData("text", e.target.id); }
function allowDrop(e) { e.preventDefault(); }
function drop(e, category) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text");
    const task = window.tasks.find(t => t.id === id);
    if (task && task.category !== category) {
        task.category = category;
        window.saveTasksState();
        renderTasks();
        updateCountdownState();
        showToast(`Tâche déplacée avec succès.`, "success");
    }
}

function shiftAllTasks(minutes) {
    window.tasks.forEach(task => {
        if (task.category !== 'backlog' && task.status === 'pending') {
            let [hrs, mins] = task.time.split(':').map(Number);
            mins += minutes;
            hrs += Math.floor(mins / 60);
            mins = mins % 60;
            hrs = hrs % 24;
            task.time = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        }
    });
    
    window.saveTasksState();
    renderTasks();
    updateCountdownState();
    showToast(`Planning global décalé de +${minutes} min.`, "info");
}

function startFocusSession(id) {
    initAudio();
    const task = window.tasks.find(t => t.id === id);
    if (!task || task.status === 'completed') return;
    
    if (activeTaskId === id && timerInterval) {
        toggleTimer();
        return;
    }
    
    stopTimer();
    activeTaskId = id;
    totalDurationSeconds = task.duration * 60;
    timeRemaining = totalDurationSeconds;
    
    document.getElementById('countdownTaskTitle').innerText = task.title;
    document.getElementById('countdownTaskTime').innerText = `Durée de focalisation : ${task.duration} minutes`;
    document.getElementById('btnPlayPause').disabled = false;
    document.getElementById('btnComplete').disabled = false;
    
    renderTasks();
    startTimer();
}

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function startTimer() {
    initAudio();
    if (timerInterval) clearInterval(timerInterval);
    
    document.getElementById('playIcon').className = "fa-solid fa-pause";
    document.getElementById('playText').innerText = "Pause";
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateCountdownDisplay();
        
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            completeCurrentTask();
            sendSystemNotification("Session terminée !", `La tâche en cours est finie.`);
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    document.getElementById('playIcon').className = "fa-solid fa-play";
    document.getElementById('playText').innerText = "Démarrer";
}

function toggleTimer() {
    if (timerInterval) {
        stopTimer();
    } else {
        if (activeTaskId) startTimer();
    }
}

function completeCurrentTask() {
    if (!activeTaskId) return;
    const id = activeTaskId;
    stopTimer();
    activeTaskId = null;
    toggleTaskStatus(id);
}

function updateCountdownDisplay() {
    const hrs = Math.floor(timeRemaining / 3600);
    const mins = Math.floor((timeRemaining % 3600) / 60);
    const secs = timeRemaining % 60;
    
    document.getElementById('countdownDisplay').innerText = `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    
    const progressPercent = totalDurationSeconds > 0 ? ((totalDurationSeconds - timeRemaining) / totalDurationSeconds) * 100 : 0;
    const circle = document.getElementById('progressCircle');
    if (circle) {
        const offset = 100 - progressPercent;
        circle.style.strokeDashoffset = offset;
    }
}
function updateStatsWidget() {
    const todayTasks = window.tasks.filter(t => t.category !== 'backlog');
    const completed = todayTasks.filter(t => t.status === 'completed').length;
    const total = todayTasks.length;
    
    const ratioSpan = document.getElementById('statsRatio');
    if (ratioSpan) ratioSpan.innerText = `${completed}/${total}`;
    
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const percentText = document.getElementById('progressPercent');
    if (percentText) percentText.innerText = `${percent}%`;
    
    // ========== AJOUT : ROTATION SYNCHRONISÉE DE L'ICÔNE ==========
    const logoIcon = document.getElementById('logoIcon');
    if (logoIcon) {
        // Calcule l'angle (100% de tâches = 360 degrés de rotation)
        const angle = (percent / 100) * 360;
        logoIcon.style.transform = `rotate(${angle}deg)`;
    }
    // ==============================================================
    
    const circle = document.getElementById('progressCircle');
    if (circle) {
        const strokeOffset = 100 - percent;
        circle.style.strokeDashoffset = strokeOffset;
    }
}
function updateCountdownState() {
    const completed = window.tasks.filter(t => t.status === 'completed').length;
    const total = window.tasks.length;
    
    const ratio = document.getElementById('statsRatio');
    if (ratio) ratio.innerText = `${completed}/${total}`;
    
    const globalPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const percentLabel = document.getElementById('progressPercent');
    if (percentLabel) percentLabel.innerText = `${globalPercent}%`;
    
    if (!activeTaskId) {
        document.getElementById('countdownTaskTitle').innerText = "Aucune tâche en cours";
        document.getElementById('countdownTaskTime').innerText = "Sélectionnez une tâche pour lancer le minuteur";
        document.getElementById('countdownDisplay').innerText = "00:00:00";
        document.getElementById('btnPlayPause').disabled = true;
        document.getElementById('btnComplete').disabled = true;
        const circle = document.getElementById('progressCircle');
        if (circle) circle.style.strokeDashoffset = 100;
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if(!container) return;
    
    const toast = document.createElement('div');
    toast.className = `p-4 rounded-xl shadow-xl border flex items-center space-x-3 pointer-events-auto transform translate-y-2 opacity-0 transition duration-300 bg-white dark:bg-zinc-900 ${type === 'success' ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-blue-500/30 text-blue-600 dark:text-blue-400'}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    toast.innerHTML = `
        <i class="fa-solid ${icon} text-lg shrink-0"></i>
        <p class="text-xs font-bold tracking-tight">${message}</p>
    `;
    
    container.appendChild(toast);
    setTimeout(() => toast.className = toast.className.replace('translate-y-2 opacity-0', 'translate-y-0 opacity-100'), 10);
    setTimeout(() => {
        toast.className = toast.className.replace('translate-y-0 opacity-100', 'translate-y-2 opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function playEffect(type) {
    const toggle = document.getElementById('soundToggle');
    if (toggle && !toggle.checked) return;
    if (!audioCtx) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        if (type === 'completion') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime);
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
            osc.frequency.setValueAtTime(783.99, audioCtx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        }
    } catch(e){}
}

function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 }, colors: ['#2563eb', '#10b981', '#3b82f6'] });
    }
}

function requestNotificationPermission() {
    if ("Notification" in window) {
        Notification.requestPermission().then(p => {
            if(p === 'granted') showToast("Notifications activées !", "success");
        });
    }
}

function sendSystemNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, { body });
    }
}

function applySuggestion(text) {
    const area = document.getElementById('aiPromptInput');
    if(area) area.value = text;
}

async function runAIOptimizer(e) {
    e.preventDefault();
    const prompt = document.getElementById('aiPromptInput').value;
    if(!prompt) return;
    
    const spinner = document.getElementById('aiSpinner');
    const btn = document.getElementById('btnSubmitAI');
    
    if(spinner) spinner.classList.remove('hidden');
    if(btn) btn.disabled = true;
    
    setTimeout(() => {
        if(spinner) spinner.classList.add('hidden');
        if(btn) btn.disabled = false;
        
        shiftAllTasks(30);
        toggleModal('aiAssistantModal');
        showToast("L'IA a réorganisé votre planning (+30 min) ! ✨", "success");
    }, 1500);
}

function exportBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.tasks));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", "flexiz_backup.json");
    dlAnchorElem.click();
}

function importBackup(e) {
    const fileReader = new FileReader();
    fileReader.onload = function(event) {
        try {
            const parsed = JSON.parse(event.target.result);
            if (Array.isArray(parsed)) {
                window.tasks = parsed;
                window.saveTasksState();
                renderTasks();
                updateCountdownState();
                showToast("Sauvegarde importée avec succès.", "success");
            }
        } catch(ex) {
            showToast("Fichier de sauvegarde invalide.", "info");
        }
    };
    if(e.target.files[0]) fileReader.readAsText(e.target.files[0]);
}

window.addEventListener('resize', renderTasks);
window.addEventListener('DOMContentLoaded', initApp);

// ARRANGEMENT CRITIQUE : Exposition des fonctions au scope global (window) 
// pour réparer les appels de boutons HTML onclick=""
window.toggleModal = toggleModal;
window.openCreateTask = openCreateTask;
window.openEditTask = openEditTask;
window.saveTask = saveTask;
window.deleteTaskClick = deleteTaskClick;
window.toggleTheme = toggleTheme;
window.switchMobileTab = switchMobileTab;
window.setFilter = setFilter;
window.filterTasks = filterTasks;
window.toggleTaskStatus = toggleTaskStatus;
window.shiftAllTasks = shiftAllTasks;
window.startFocusSession = startFocusSession;
window.toggleTimer = toggleTimer;
window.completeCurrentTask = completeCurrentTask;
window.requestNotificationPermission = requestNotificationPermission;
window.applySuggestion = applySuggestion;
window.runAIOptimizer = runAIOptimizer;
window.exportBackup = exportBackup;
window.importBackup = importBackup;
window.allowDrop = allowDrop;
window.drop = drop;

async function breakdownTaskWithAI() {
    const btn = document.getElementById('btnAIDecompose');
    const originalHTML = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-xs"></i> <span>Analyse...</span>`;
        
        const taskTitle = document.getElementById('taskTitle').value;
        const duration = parseInt(document.getElementById('taskDuration').value) || 30;
        const category = document.getElementById('taskCategory').value;
        const timeInput = document.getElementById('taskTime').value;

        if (!taskTitle) {
            showToast("Veuillez saisir un libellé de tâche.", "info");
            return;
        }

        const parts = Math.max(2, Math.floor(duration / 20));
        let subTasks = [];
        for(let i = 1; i <= parts; i++) {
            subTasks.push(`Étape ${i} : Déclinaison du livrable`);
        }

        if (subTasks.length > 0 && timeInput) {
            let [hrs, mins] = timeInput.split(':').map(Number);
            
            subTasks.forEach((subTitle, idx) => {
                const newId = 'ai-sub-' + Date.now() + '-' + idx;
                let subMins = mins + (idx + 1) * 20;
                let subHrs = hrs + Math.floor(subMins / 60);
                subMins = subMins % 60;
                subHrs = subHrs % 24;

                const subTimeFormatted = `${String(subHrs).padStart(2, '0')}:${String(subMins).padStart(2, '0')}`;

                const newTask = {
                    id: newId,
                    title: `↳ ${subTitle}`,
                    time: subTimeFormatted,
                    duration: 20,
                    category: category,
                    priority: 'low',
                    status: 'pending'
                };
                window.tasks.push(newTask);
            });

            window.saveTasksState();
            renderTasks();
            updateCountdownState();
            
            playEffect('completion');
            showToast("Sous-tâches générées par l'IA ! ✨", "success");
            toggleModal('taskModal');
        } else {
            throw new Error();
        }
    } catch (err) {
        showToast("Échec de la décomposition avec l'IA.", "info");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
}
window.breakdownTaskWithAI = breakdownTaskWithAI;