
    const STORAGE_KEY = 'bro_marketing_empty_v1';
    window.__broNowFallback = () => new Date();

    const firebaseConfig = {
      apiKey: "AIzaSyBfUlQdxkEcI_4WBgXwKcQ_txxeAPW-TiY",
      authDomain: "agenciabromark.firebaseapp.com",
      projectId: "agenciabromark",
      storageBucket: "agenciabromark.firebasestorage.app",
      messagingSenderId: "1013076664884",
      appId: "1:1013076664884:web:970f4ea850a52b4da7e061",
      measurementId: "G-KX4HCQWGLN"
    };

    let firebaseApp = null;
    let db = null;
    let auth = null;
    let analytics = null;
    let currentUser = null;
    let authReady = false;
    let remoteSaveTimer = null;
    let lastRemoteStateHash = '';
    let userDocUnsubscribe = null;
    let initialUserLoadDone = false;
    let suppressRemoteSync = false;

    function setDbStatus(mode='status-checking', message='Base de datos: verificando...'){
      const box = document.getElementById('dbStatus');
      const label = document.getElementById('dbStatusText');
      if(!box || !label) return;
      box.className = `db-status ${mode}`;
      label.textContent = message;
    }

    function getStorageKey(){
      return currentUser ? `${STORAGE_KEY}_${currentUser.uid}` : `${STORAGE_KEY}_guest`;
    }

    function getUserDocRef(){
      if(!db || !currentUser) return null;
      return db.collection('bro_marketing_users').doc(currentUser.uid);
    }

    function setAuthMessage(message='', mode=''){
      const box = document.getElementById('authMessage');
      if(!box) return;
      box.className = `auth-message ${mode}`.trim();
      box.textContent = message;
    }

    function getUserDisplayName(user){
      if(!user) return 'Sin sesión';
      if(user.displayName && user.displayName.trim()) return user.displayName.trim();
      return user.email || 'Usuario';
    }

    function syncAuthBrandLogo(){
      const brandSource = document.querySelector('.brand-mark');
      const authLogo = document.getElementById('authBrandLogo');
      const fallback = document.getElementById('authBrandFallback');
      if(brandSource && authLogo){
        authLogo.src = brandSource.src;
        authLogo.style.display = 'block';
        if(fallback) fallback.style.display = 'none';
      }else if(authLogo){
        authLogo.style.display = 'none';
        if(fallback) fallback.style.display = 'grid';
      }
    }

    function updateAuthUI(){
      const overlay = document.getElementById('authOverlay');
      const openBtn = document.getElementById('authOpenBtn');
      const logoutBtn = document.getElementById('logoutBtn');
      const authUserName = document.getElementById('authUserName');
      const authUserRole = document.getElementById('authUserRole');
      const authAvatar = document.getElementById('authAvatar');
      if(authUserName) authUserName.textContent = currentUser ? getUserDisplayName(currentUser) : 'Sin sesión';
      if(authUserRole) authUserRole.textContent = currentUser ? (currentUser.email || 'Cuenta conectada') : 'Inicia sesión para sincronizar';
      if(authAvatar) authAvatar.textContent = currentUser ? getUserDisplayName(currentUser).slice(0,2).toUpperCase() : 'BM';
      if(overlay) overlay.classList.toggle('hidden', !!currentUser);
      if(openBtn) openBtn.style.display = currentUser ? 'none' : 'inline-flex';
      if(logoutBtn) logoutBtn.style.display = currentUser ? 'inline-flex' : 'none';
    }

    async function pingFirebase(){
      if(!db){
        setDbStatus('status-error', 'Base de datos: no iniciada');
        return false;
      }
      if(!currentUser){
        setDbStatus('status-offline', 'Base de datos: inicia sesión');
        return false;
      }
      if(!navigator.onLine){
        setDbStatus('status-offline', 'Base de datos: sin internet');
        return false;
      }
      const userDocRef = getUserDocRef();
      if(!userDocRef){
        setDbStatus('status-error', 'Base de datos: usuario no listo');
        return false;
      }
      setDbStatus('status-checking', 'Base de datos: verificando...');
      try{
        await userDocRef.get();
        setDbStatus('status-connected', 'Base de datos: conectada');
        return true;
      }catch(error){
        console.error('No se pudo verificar Firebase:', error);
        setDbStatus('status-error', 'Base de datos: sin conexión o permisos');
        return false;
      }
    }

    try{
      if(typeof firebase !== 'undefined'){
        firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        auth = firebase.auth();
        setDbStatus('status-checking', 'Base de datos: verificando...');
        if(location.protocol === 'http:' || location.protocol === 'https:'){
          try{ analytics = firebase.analytics(); }catch(_analyticsError){}
        }
      } else {
        setDbStatus('status-error', 'Base de datos: SDK no cargado');
      }
    }catch(firebaseError){
      console.error('No se pudo iniciar Firebase:', firebaseError);
      setDbStatus('status-error', 'Base de datos: error al iniciar');
    }

    const pageMeta = {
      dashboard: ['Dashboard general', ''],
      clients: ['Clientes', 'Ficha completa por cliente con toda la trazabilidad del negocio.'],
      services: ['Servicios y productos', 'Organiza tu catálogo para vender mejor y con menos errores.'],
      sales: ['Ventas', 'Cada venta conectada con cobros, renovaciones y estado operativo.'],
      receivables: ['Cuentas por cobrar', ''],
      payments: ['Pagos y abonos', 'Todo el historial de ingresos con método, fecha y concepto.'],
      meetings: ['Reuniones y agenda', 'Llamadas, onboarding, renovaciones y seguimiento con historial.'],
      renewals: ['Renovaciones', 'No pierdas clientes por olvidarte de un dominio, hosting o plan mensual.'],
      tasks: ['Tareas internas', 'Ordena la operación del equipo y lo que debe hacerse hoy.'],
      reports: ['Reportes', 'Mira con claridad qué vende, qué cobra y dónde se está frenando la caja.'],
      settings: ['Configuración', '']
    };

    let state = loadState();
    let calendarCursor = new Date();
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);

    function normalizeState(raw){
      const empty = seedState();
      const safe = raw && typeof raw === 'object' ? raw : {};
      return {
        settings:{...empty.settings, ...(safe.settings || {})},
        clients:Array.isArray(safe.clients) ? safe.clients : [],
        services:Array.isArray(safe.services) ? safe.services : [],
        sales:Array.isArray(safe.sales) ? safe.sales : [],
        receivables:Array.isArray(safe.receivables) ? safe.receivables : [],
        payments:Array.isArray(safe.payments) ? safe.payments : [],
        meetings:Array.isArray(safe.meetings) ? safe.meetings : [],
        tasks:Array.isArray(safe.tasks) ? safe.tasks : []
      };
    }

    function loadState(){
      const saved = localStorage.getItem(getStorageKey());
      if(saved){
        try{
          return normalizeState(JSON.parse(saved));
        }catch(e){}
      }
      return seedState();
    }

    function saveLocalState(){
      localStorage.setItem(getStorageKey(), JSON.stringify(state));
    }

    function hasMeaningfulData(candidate){
      if(!candidate || typeof candidate !== 'object') return false;
      const safe = normalizeState(candidate);
      return ['clients','services','sales','receivables','payments','meetings','tasks'].some(key => Array.isArray(safe[key]) && safe[key].length > 0);
    }

    async function saveStateToFirebase(force=false){
      if(!db || !currentUser) return;
      const normalized = normalizeState(state);
      const hash = JSON.stringify(normalized);
      if(!force && hash === lastRemoteStateHash) return;
      if(!navigator.onLine){
        setDbStatus('status-offline', 'Base de datos: sin internet');
        return;
      }
      try{
        const userDocRef = getUserDocRef();
        if(!userDocRef) return;
        setDbStatus('status-checking', 'Base de datos: sincronizando...');
        await userDocRef.set({
          app: 'Bro Marketing',
          ownerUid: currentUser.uid,
          ownerEmail: currentUser.email || '',
          state: normalized,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, {merge:true});
        lastRemoteStateHash = hash;
        setDbStatus('status-connected', 'Base de datos: conectada');
      }catch(error){
        console.error('No se pudo guardar en Firebase:', error);
        setDbStatus('status-error', 'Base de datos: error al guardar');
      }
    }

    function queueFirebaseSave(force=false){
      if(!db || !currentUser) return;
      clearTimeout(remoteSaveTimer);
      remoteSaveTimer = setTimeout(() => {
        saveStateToFirebase(force);
      }, 450);
    }

    async function hydrateFromFirebase(fallbackState=null){
      if(!db || !currentUser) return {source:'none'};
      if(!navigator.onLine){
        setDbStatus('status-offline', 'Base de datos: sin internet');
        return {source:'offline'};
      }
      try{
        setDbStatus('status-checking', 'Base de datos: conectando...');
        const userDocRef = getUserDocRef();
        if(!userDocRef) return {source:'none'};
        const snap = await userDocRef.get();
        if(snap.exists){
          const data = snap.data() || {};
          if(data.state){
            applyRemoteState(data.state);
            return {source:'remote'};
          }
        }
        if(hasMeaningfulData(fallbackState)){
          state = normalizeState(fallbackState);
          saveLocalState();
          updateReceivableStatuses();
          generateAutoTasks();
          populateGlobalViews({persist:false});
          fillSettingsForm();
          setDbStatus('status-connected', 'Base de datos: conectada');
          return {source:'fallback'};
        }
        setDbStatus('status-connected', 'Base de datos: conectada');
        return {source:'empty'};
      }catch(error){
        console.error('No se pudo cargar desde Firebase:', error);
        setDbStatus('status-error', 'Base de datos: sin conexión o permisos');
        return {source:'error', error};
      }
    }

    function stopUserSync(){
      if(typeof userDocUnsubscribe === 'function'){
        userDocUnsubscribe();
      }
      userDocUnsubscribe = null;
    }

    function applyRemoteState(remoteState){
      state = normalizeState(remoteState);
      saveLocalState();
      updateReceivableStatuses();
      generateAutoTasks();
      populateGlobalViews();
      fillSettingsForm();
      lastRemoteStateHash = JSON.stringify(normalizeState(state));
      setDbStatus('status-connected', 'Base de datos: conectada');
    }

    function startUserSync(){
      if(!db || !currentUser) return;
      const userDocRef = getUserDocRef();
      if(!userDocRef) return;
      stopUserSync();
      userDocUnsubscribe = userDocRef.onSnapshot(snapshot => {
        if(!currentUser) return;
        if(!snapshot.exists){
          setDbStatus('status-connected', 'Base de datos: conectada');
          return;
        }
        const data = snapshot.data() || {};
        if(!data.state) return;
        const normalized = normalizeState(data.state);
        const remoteHash = JSON.stringify(normalized);
        if(remoteHash === lastRemoteStateHash) {
          setDbStatus('status-connected', 'Base de datos: conectada');
          return;
        }
        applyRemoteState(normalized);
      }, error => {
        console.error('No se pudo escuchar cambios en Firebase:', error);
        setDbStatus('status-error', 'Base de datos: sin conexión o permisos');
      });
    }

    function saveState(options={}){
      saveLocalState();
      if(suppressRemoteSync) return;
      if(currentUser && !initialUserLoadDone) return;
      queueFirebaseSave(!!options.force);
    }

    async function loginWithEmail(email, password){
      if(!auth) throw new Error('Firebase Authentication no está disponible.');
      return auth.signInWithEmailAndPassword(email, password);
    }

    async function signupWithEmail(name, email, password){
      if(!auth) throw new Error('Firebase Authentication no está disponible.');
      const credentials = await auth.createUserWithEmailAndPassword(email, password);
      if(credentials.user && name && name.trim()){
        await credentials.user.updateProfile({displayName:name.trim()});
      }
      return credentials;
    }

    async function sendPasswordReset(email){
      if(!auth) throw new Error('Firebase Authentication no está disponible.');
      return auth.sendPasswordResetEmail(email);
    }

    function handleSignedOutState(){
      stopUserSync();
      currentUser = null;
      lastRemoteStateHash = '';
      initialUserLoadDone = false;
      suppressRemoteSync = false;
      state = seedState();
      updateReceivableStatuses();
      generateAutoTasks();
      populateGlobalViews({persist:false});
      fillSettingsForm();
      updateAuthUI();
      setDbStatus('status-offline', 'Base de datos: inicia sesión');
    }

    async function handleSignedInState(user){
      currentUser = user;
      lastRemoteStateHash = '';
      initialUserLoadDone = false;
      suppressRemoteSync = true;

      const guestStorageKey = `${STORAGE_KEY}_guest`;
      let guestState = null;
      try{
        const guestSaved = localStorage.getItem(guestStorageKey);
        if(guestSaved) guestState = normalizeState(JSON.parse(guestSaved));
      }catch(_guestError){}

      const userLocalState = loadState();
      state = hasMeaningfulData(userLocalState) ? userLocalState : seedState();
      updateReceivableStatuses();
      generateAutoTasks();
      populateGlobalViews({persist:false});
      fillSettingsForm();
      updateAuthUI();
      setAuthMessage('');

      const hydrateResult = await hydrateFromFirebase(hasMeaningfulData(userLocalState) ? userLocalState : guestState);
      startUserSync();
      initialUserLoadDone = true;
      suppressRemoteSync = false;

      if(hydrateResult && (hydrateResult.source === 'fallback' || hydrateResult.source === 'empty')){
        await saveStateToFirebase(true);
      }

      await pingFirebase();
    }

    function bindAuth(){
      if(!auth) return;
      auth.onAuthStateChanged(async user => {
        authReady = true;
        if(user){
          await handleSignedInState(user);
        } else {
          handleSignedOutState();
        }
      });
    }

    function fillSettingsForm(){
      const form = document.getElementById('settingsForm');
      if(!form || !state || !state.settings) return;
      Object.entries(state.settings).forEach(([key, value]) => {
        const field = form.elements.namedItem(key);
        if(field) field.value = value ?? '';
      });
    }

    function uid(prefix='id'){
      return `${prefix}_${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-5)}`;
    }

    function todayISO(){
      return new Date().toISOString().slice(0,10);
    }

    function addDays(dateStr, days){
      const d = new Date(dateStr + 'T12:00:00');
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0,10);
    }

    function addCycle(dateStr, cycle){
      const d = new Date(dateStr + 'T12:00:00');
      if(cycle === 'monthly') d.setMonth(d.getMonth() + 1);
      if(cycle === 'quarterly') d.setMonth(d.getMonth() + 3);
      if(cycle === 'semiannual') d.setMonth(d.getMonth() + 6);
      if(cycle === 'annual') d.setFullYear(d.getFullYear() + 1);
      return d.toISOString().slice(0,10);
    }

    function formatCurrency(value){
      const currency = state.settings.currency || 'COP';
      return new Intl.NumberFormat('es-CO', {style:'currency', currency, maximumFractionDigits:0}).format(Number(value || 0));
    }

    function parseCurrencyInput(value){
      return Number(String(value ?? '').replace(/\D+/g, '') || 0);
    }

    function formatCurrencyInputValue(value){
      const amount = parseCurrencyInput(value);
      return amount ? new Intl.NumberFormat('es-CO', {maximumFractionDigits:0}).format(amount) : '';
    }

    function setCurrencyInputValue(input, value){
      if(!input) return;
      input.value = formatCurrencyInputValue(value);
    }

    function enhanceCurrencyInputs(scope=document){
      scope.querySelectorAll('input[data-currency="true"]').forEach(input => {
        if(input.dataset.currencyBound === '1') return;
        input.dataset.currencyBound = '1';
        if(input.value) input.value = formatCurrencyInputValue(input.value);
        input.addEventListener('input', () => {
          input.value = formatCurrencyInputValue(input.value);
          requestAnimationFrame(() => {
            const end = input.value.length;
            try{
              input.setSelectionRange(end, end);
            }catch(err){}
          });
        });
        input.addEventListener('blur', () => {
          input.value = formatCurrencyInputValue(input.value);
        });
      });
    }

    function getFormObject(form){
      const data = Object.fromEntries(new FormData(form).entries());
      form.querySelectorAll('input[data-currency="true"]').forEach(input => {
        data[input.name] = parseCurrencyInput(input.value);
      });
      return data;
    }

    function formatDate(dateStr){
      if(!dateStr) return '—';
      const d = new Date(dateStr + 'T12:00:00');
      return new Intl.DateTimeFormat('es-CO', {day:'2-digit', month:'short', year:'numeric'}).format(d);
    }

    function formatDateTime(dateStr, time){
      if(!dateStr) return '—';
      return `${formatDate(dateStr)}${time ? ' · ' + time : ''}`;
    }

    function diffDays(dateStr){
      const today = new Date(todayISO() + 'T12:00:00');
      const due = new Date(dateStr + 'T12:00:00');
      return Math.round((due - today) / (1000*60*60*24));
    }

    function getClient(id){ return state.clients.find(x => x.id === id); }
    function getService(id){ return state.services.find(x => x.id === id); }
    function getSale(id){ return state.sales.find(x => x.id === id); }
    function getInvoice(id){ return state.receivables.find(x => x.id === id); }

    function getTaskAlertWindow(task){
      const value = Number(task.alertDays ?? 1);
      return Number.isFinite(value) ? value : 1;
    }

    function taskAlertBadge(task){
      const level = task.alertLevel || 'neutral';
      const text = task.alertText || 'Sin alerta';
      const cls = {
        overdue:'overdue',
        dueToday:'warning',
        upcoming:'pending',
        neutral:'neutral'
      }[level] || 'neutral';
      return `<span class="badge ${cls}">${text}</span>`;
    }

    function derivedTaskAlerts(){
      return state.tasks
        .filter(task => ['pending','in-progress'].includes(task.status))
        .filter(task => task.alertEnabled !== false)
        .map(task => {
          const days = diffDays(task.date);
          const windowDays = getTaskAlertWindow(task);
          let alertLevel = 'neutral';
          let alertText = 'Sin alerta';
          let sortKey = 99;

          if(days < 0){
            const lateDays = Math.abs(days);
            alertLevel = 'overdue';
            alertText = lateDays === 1 ? 'Vencida 1 día' : `Vencida ${lateDays} días`;
            sortKey = 0;
          }else if(days === 0){
            alertLevel = 'dueToday';
            alertText = 'Vence hoy';
            sortKey = 1;
          }else if(days <= windowDays){
            alertLevel = 'upcoming';
            alertText = days === 1 ? 'Mañana' : `En ${days} días`;
            sortKey = 2;
          }

          return {
            ...task,
            days,
            windowDays,
            alertLevel,
            alertText,
            sortKey
          };
        })
        .filter(task => task.alertLevel !== 'neutral')
        .sort((a,b) => {
          if(a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
          const priorityRank = {high:0, medium:1, low:2};
          const pa = priorityRank[a.priority] ?? 3;
          const pb = priorityRank[b.priority] ?? 3;
          if(pa !== pb) return pa - pb;
          return a.date.localeCompare(b.date);
        });
    }

    function statusBadge(status){
      const map = {
        active:'active',
        pending:'pending',
        suspended:'warning',
        cancelled:'overdue',
        paid:'paid',
        overdue:'overdue',
        scheduled:'scheduled',
        completed:'completed',
        'one-time':'neutral',
        monthly:'pending',
        annual:'warning',
        quarterly:'pending',
        semiannual:'warning',
        high:'high',
        medium:'medium',
        low:'low',
        paused:'warning',
        inactive:'inactive'
      };
      const cls = map[status] || 'neutral';
      const label = {
        active:'Activo',
        pending:'Pendiente',
        suspended:'Suspendido',
        cancelled:'Cancelado',
        paid:'Pagado',
        overdue:'Vencido',
        scheduled:'Programada',
        completed:'Completada',
        'one-time':'Única',
        monthly:'Mensual',
        annual:'Anual',
        quarterly:'Trimestral',
        semiannual:'Semestral',
        high:'Alta',
        medium:'Media',
        low:'Baja',
        paused:'Pausada',
        inactive:'Inactivo',
        warning:'Próxima',
        success:'OK',
        neutral:'Info'
      }[status] || status;
      return `<span class="badge ${cls}">${label}</span>`;
    }

    function cycleLabel(cycle){
      return {
        'one-time':'Venta única',
        'monthly':'Mensual',
        'quarterly':'Trimestral',
        'semiannual':'Semestral',
        'annual':'Anual'
      }[cycle] || cycle;
    }

    function calcClientPending(clientId){
      return state.receivables
        .filter(x => x.clientId === clientId && x.status !== 'paid')
        .reduce((sum, x) => sum + Number(x.amount || 0), 0);
    }

    function nextMeetingForClient(clientId){
      const upcoming = state.meetings
        .filter(x => x.clientId === clientId && ['scheduled','pending'].includes(x.status))
        .sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      return upcoming[0];
    }

    function primaryServiceForClient(clientId){
      const sale = state.sales.find(x => x.clientId === clientId && x.status === 'active') || state.sales.find(x => x.clientId === clientId);
      if(!sale) return '—';
      const service = getService(sale.serviceId);
      return service ? service.name : sale.title || '—';
    }

    function seedState(){
      return {
        settings:{
          businessName:'Bro Marketing',
          opsEmail:'',
          billingWhatsapp:'',
          currency:'COP',
          reminderFirst:7,
          reminderLast:1,
          billingMessage:'Hola. Te escribimos para recordarte que tu pago está próximo a vencerse. Queremos ayudarte a mantener tu servicio activo sin contratiempos.'
        },
        clients:[],
        services:[],
        sales:[],
        receivables:[],
        payments:[],
        meetings:[],
        tasks:[]
      };
    }

    function updateReceivableStatuses(){
      state.receivables.forEach(inv => {
        if(inv.status === 'paid') return;
        inv.status = diffDays(inv.dueDate) < 0 ? 'overdue' : 'pending';
      });
    }

    function generateAutoTasks(){
      const existingKeys = new Set(state.tasks.map(t => `${t.clientId}|${t.title}|${t.date}`));
      state.receivables
        .filter(inv => inv.status === 'overdue')
        .forEach(inv => {
          const title = `Seguimiento de cobro: ${inv.concept}`;
          const key = `${inv.clientId}|${title}|${todayISO()}`;
          if(!existingKeys.has(key)){
            state.tasks.push({
              id:uid('task'),
              clientId:inv.clientId,
              title,
              date:todayISO(),
              priority:'high',
              responsible:'Cartera',
              status:'pending',
              alertEnabled:true,
              alertDays:0,
              notes:'Generada automáticamente por cartera vencida.'
            });
          }
        });
    }

    function derivedRenewals(){
      return state.sales
        .filter(sale => ['monthly','quarterly','semiannual','annual'].includes(sale.cycle))
        .map(sale => ({
          saleId:sale.id,
          clientId:sale.clientId,
          serviceId:sale.serviceId,
          serviceName:(getService(sale.serviceId) || {}).name || 'Servicio',
          date:sale.nextDue,
          amount:sale.amount,
          cycle:sale.cycle,
          status: diffDays(sale.nextDue) < 0 ? 'overdue' : (diffDays(sale.nextDue) <= 7 ? 'warning' : 'pending')
        }))
        .sort((a,b) => a.date.localeCompare(b.date));
    }

    function getActivityFeed(){
      const feed = [];
      state.payments.forEach(p => feed.push({date:p.date, title:'Pago registrado', text:`${clientName(p.clientId)} · ${p.concept} · ${formatCurrency(p.amount)}`}));
      state.meetings.forEach(m => feed.push({date:m.date, title:'Reunión agendada', text:`${clientName(m.clientId)} · ${m.type} · ${m.time}`}));
      state.tasks.forEach(t => feed.push({date:t.date, title:'Tarea creada', text:`${clientName(t.clientId)} · ${t.title}`}));
      state.sales.forEach(s => feed.push({date:s.startDate, title:'Venta activa', text:`${clientName(s.clientId)} · ${(getService(s.serviceId) || {}).name || 'Servicio'} · ${formatCurrency(s.amount)}`}));
      return feed.sort((a,b) => b.date.localeCompare(a.date)).slice(0,8);
    }

    function clientName(clientId){
      const c = getClient(clientId);
      return c ? (c.company || c.name) : 'Cliente';
    }

    function computeMetrics(){
      updateReceivableStatuses();
      const month = new Date().getMonth();
      const year = new Date().getFullYear();

      const revenueMonth = state.payments
        .filter(p => {
          const d = new Date(p.date + 'T12:00:00');
          return d.getMonth() === month && d.getFullYear() === year;
        })
        .reduce((sum,p) => sum + Number(p.amount || 0), 0);

      const projected = state.sales
        .filter(s => s.status !== 'cancelled')
        .reduce((sum, sale) => {
          if(sale.cycle === 'monthly') return sum + Number(sale.amount || 0);
          if(sale.cycle === 'quarterly') return sum + Number(sale.amount || 0) / 3;
          if(sale.cycle === 'semiannual') return sum + Number(sale.amount || 0) / 6;
          if(sale.cycle === 'annual') return sum + Number(sale.amount || 0) / 12;
          return sum;
        }, 0);

      const pending = state.receivables.filter(x => x.status !== 'paid').reduce((sum,x)=>sum+Number(x.amount||0),0);
      const activeClients = state.clients.filter(c => c.status === 'active').length;
      const meetingsToday = state.meetings.filter(m => m.date === todayISO() && m.status !== 'cancelled').length;
      const overdue = state.receivables.filter(x => x.status === 'overdue').length;
      const renew7 = derivedRenewals().filter(x => diffDays(x.date) >= 0 && diffDays(x.date) <= 7).length;
      const pendingTasks = state.tasks.filter(t => ['pending','in-progress'].includes(t.status)).length;
      const taskAlerts = derivedTaskAlerts().length;

      return { revenueMonth, projected, pending, activeClients, meetingsToday, overdue, renew7, pendingTasks, taskAlerts };
    }

    function renderDashboard(){
      const metrics = computeMetrics();
      document.getElementById('alertSummary').innerHTML = `
        <div class="alert-box alert-danger"><strong>${metrics.overdue}</strong><p>Cobros vencidos listos para seguimiento.</p></div>
        <div class="alert-box alert-warning"><strong>${metrics.renew7}</strong><p>Renovaciones que se acercan en 7 días.</p></div>
        <div class="alert-box alert-info"><strong>${metrics.meetingsToday}</strong><p>Reuniones agendadas para hoy.</p></div>
        <div class="alert-box alert-success"><strong>${metrics.taskAlerts}</strong><p>Alertas activas de tareas.</p></div>
      `;

      document.getElementById('dashboardMetrics').innerHTML = `
        <div class="card soft metric">
          <div class="kicker">Ingresos del mes</div>
          <div class="metric-value">${formatCurrency(metrics.revenueMonth)}</div>
          <div class="metric-row"><span>Pagos confirmados</span><span class="delta up">Caja real</span></div>
        </div>
        <div class="card soft metric">
          <div class="kicker">Ingreso proyectado</div>
          <div class="metric-value">${formatCurrency(metrics.projected)}</div>
          <div class="metric-row"><span>MRR aproximado</span><span class="delta up">Recurrente</span></div>
        </div>
        <div class="card soft metric">
          <div class="kicker">Cartera pendiente</div>
          <div class="metric-value">${formatCurrency(metrics.pending)}</div>
          <div class="metric-row"><span>Por cobrar</span><span class="delta ${metrics.overdue ? 'down':'warn'}">${metrics.overdue} vencidos</span></div>
        </div>
        <div class="card soft metric">
          <div class="kicker">Clientes activos</div>
          <div class="metric-value">${metrics.activeClients}</div>
          <div class="metric-row"><span>Base activa</span><span class="delta up">${state.clients.length} registrados</span></div>
        </div>
      `;

      const prio = state.receivables
        .filter(r => r.status !== 'paid')
        .sort((a,b) => {
          const pa = {high:0, medium:1, low:2}[a.priority] ?? 3;
          const pb = {high:0, medium:1, low:2}[b.priority] ?? 3;
          if(pa !== pb) return pa - pb;
          return a.dueDate.localeCompare(b.dueDate);
        })
        .slice(0,4);

      document.getElementById('priorityReceivables').innerHTML = prio.length ? prio.map(inv => `
        <div class="list-item">
          <div>
            <h4>${clientName(inv.clientId)}</h4>
            <p>${inv.concept}</p>
            <p class="muted">Vence ${formatDate(inv.dueDate)} · ${formatCurrency(inv.amount)}</p>
          </div>
          <div class="list-meta">
            ${statusBadge(inv.status)}
            ${statusBadge(inv.priority)}
            <button class="btn primary small" onclick="openPaymentModal('${inv.id}')">Registrar pago</button>
          </div>
        </div>
      `).join('') : `<div class="empty">No hay cobros prioritarios en este momento.</div>`;

      const recent = getActivityFeed();
      document.getElementById('recentActivity').innerHTML = recent.length ? recent.map(item => `
        <div class="list-item">
          <div>
            <h4>${item.title}</h4>
            <p>${item.text}</p>
          </div>
          <div class="list-meta"><span class="badge neutral">${formatDate(item.date)}</span></div>
        </div>
      `).join('') : `<div class="empty">Aún no hay actividad registrada.</div>`;

      const todayList = state.meetings
        .filter(m => m.date === todayISO())
        .sort((a,b) => a.time.localeCompare(b.time));

      document.getElementById('todayMeetings').innerHTML = todayList.length ? todayList.map(meeting => `
        <div class="list-item">
          <div>
            <h4>${meeting.time} · ${meeting.type}</h4>
            <p>${clientName(meeting.clientId)}</p>
            <p class="muted">${meeting.notes || 'Sin notas'}</p>
          </div>
          <div class="list-meta">${statusBadge(meeting.status)}</div>
        </div>
      `).join('') : `<div class="empty">Hoy no tienes reuniones programadas.</div>`;

      const totalTasks = {
        pending: state.tasks.filter(t => t.status === 'pending').length,
        progress: state.tasks.filter(t => t.status === 'in-progress').length,
        completed: state.tasks.filter(t => t.status === 'completed').length
      };
      const all = Math.max(1, totalTasks.pending + totalTasks.progress + totalTasks.completed);
      document.getElementById('taskBars').innerHTML = `
        ${barRow('Pendientes', totalTasks.pending, all)}
        ${barRow('En proceso', totalTasks.progress, all)}
        ${barRow('Completadas', totalTasks.completed, all)}
      `;
    }

    function barRow(label, value, total){
      const pct = Math.round((value / total) * 100);
      return `<div class="bar-row">
        <strong>${label}</strong>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="muted">${value}</span>
      </div>`;
    }

    function renderClients(){
      const filter = document.getElementById('clientStatusFilter').value;
      const q = queryValue();
      const rows = state.clients
        .filter(c => filter === 'all' ? true : c.status === filter)
        .filter(c => textMatch(`${c.name} ${c.company} ${c.email} ${c.city} ${primaryServiceForClient(c.id)}`, q))
        .sort((a,b) => (a.company || a.name).localeCompare(b.company || b.name));

      document.getElementById('clientsTable').innerHTML = rows.length ? rows.map(c => {
        const nextMeeting = nextMeetingForClient(c.id);
        const sale = state.sales.find(s => s.clientId === c.id && s.status !== 'cancelled');
        return `<tr>
          <td>
            <strong>${c.company || c.name}</strong>
            <span class="muted">${c.name} · ${c.city || '—'}</span>
          </td>
          <td>${primaryServiceForClient(c.id)}</td>
          <td>${sale ? formatDate(sale.nextDue) : '—'}</td>
          <td>${formatCurrency(calcClientPending(c.id))}</td>
          <td>${nextMeeting ? formatDateTime(nextMeeting.date, nextMeeting.time) : '—'}</td>
          <td>${statusBadge(c.status)}</td>
          <td>
            <div class="table-actions">
              <button class="btn secondary small" onclick="openClientDetail('${c.id}')">Ver ficha</button>
              <button class="btn ghost small" onclick="openClientEdit('${c.id}')">Editar</button>
            </div>
          </td>
        </tr>`;
      }).join('') : `<tr><td colspan="7"><div class="empty">No hay clientes para ese filtro.</div></td></tr>`;
    }

    function renderServices(){
      const filter = document.getElementById('serviceTypeFilter').value;
      const q = queryValue();
      const rows = state.services
        .filter(s => filter === 'all' ? true : s.billingType === filter)
        .filter(s => textMatch(`${s.name} ${s.category} ${s.description}`, q));

      document.getElementById('servicesTable').innerHTML = rows.length ? rows.map(s => `
        <tr>
          <td><strong>${s.name}</strong><span class="muted">${s.description || ''}</span></td>
          <td>${s.category}</td>
          <td>${formatCurrency(s.price)}</td>
          <td>${statusBadge(s.billingType)}</td>
          <td>${s.duration || '—'}</td>
          <td>${statusBadge(s.status)}</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost small" onclick="openServiceEdit('${s.id}')">Editar</button>
            </div>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="7"><div class="empty">No hay servicios que coincidan.</div></td></tr>`;
    }

    function renderSales(){
      const filter = document.getElementById('salesStatusFilter').value;
      const q = queryValue();
      const rows = state.sales
        .filter(s => filter === 'all' ? true : s.status === filter)
        .filter(s => textMatch(`${clientName(s.clientId)} ${(getService(s.serviceId)||{}).name || ''} ${s.notes || ''}`, q))
        .sort((a,b)=>b.startDate.localeCompare(a.startDate));

      document.getElementById('salesTable').innerHTML = rows.length ? rows.map(s => `
        <tr>
          <td>${clientName(s.clientId)}</td>
          <td><strong>${(getService(s.serviceId)||{}).name || 'Servicio'}</strong><span class="muted">${s.notes || ''}</span></td>
          <td>${formatCurrency(s.amount)}</td>
          <td>${statusBadge(s.cycle)}</td>
          <td>${formatDate(s.startDate)}</td>
          <td>${formatDate(s.nextDue)}</td>
          <td>${statusBadge(s.status)}</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost small" onclick="openSaleEdit('${s.id}')">Editar</button>
            </div>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="8"><div class="empty">No hay ventas para mostrar.</div></td></tr>`;
    }

    function renderReceivables(){
      const filter = document.getElementById('receivableStatusFilter').value;
      const q = queryValue();
      const rows = state.receivables
        .filter(r => filter === 'all' ? true : r.status === filter)
        .filter(r => textMatch(`${clientName(r.clientId)} ${r.concept}`, q))
        .sort((a,b) => a.dueDate.localeCompare(b.dueDate));

      document.getElementById('receivablesTable').innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td>${clientName(r.clientId)}</td>
          <td><strong>${r.concept}</strong><span class="muted">${getService((getSale(r.saleId)||{}).serviceId || '')?.name || ''}</span></td>
          <td>${formatDate(r.dueDate)}</td>
          <td>${statusBadge(r.priority)}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${formatCurrency(r.amount)}</td>
          <td>
            <div class="table-actions">
              ${r.status !== 'paid' ? `<button class="btn primary small" onclick="openPaymentModal('${r.id}')">Registrar pago</button>` : ''}
              <button class="btn secondary small" onclick="copyReminder('${r.id}')">Copiar recordatorio</button>
              <button class="btn ghost small" onclick="openReceivableEdit('${r.id}')">Editar</button>
            </div>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="7"><div class="empty">No hay cuentas por cobrar bajo ese filtro.</div></td></tr>`;
    }

    function renderPayments(){
      const q = queryValue();
      const rows = state.payments
        .filter(p => textMatch(`${clientName(p.clientId)} ${p.concept} ${p.method}`, q))
        .sort((a,b) => b.date.localeCompare(a.date));

      document.getElementById('paymentsTable').innerHTML = rows.length ? rows.map(p => `
        <tr>
          <td>${formatDate(p.date)}</td>
          <td>${clientName(p.clientId)}</td>
          <td>${p.concept}</td>
          <td>${p.method}</td>
          <td>${formatCurrency(p.amount)}</td>
          <td>${p.notes || '—'}</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost small" onclick="openPaymentEdit('${p.id}')">Editar</button>
            </div>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="7"><div class="empty">Aún no hay pagos registrados.</div></td></tr>`;
    }

    function renderMeetings(){
      const q = queryValue();
      const rows = state.meetings
        .filter(m => textMatch(`${clientName(m.clientId)} ${m.type} ${m.responsible} ${m.notes}`, q))
        .sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

      document.getElementById('meetingsTable').innerHTML = rows.length ? rows.map(m => `
        <tr>
          <td>${clientName(m.clientId)}</td>
          <td><strong>${m.type}</strong><span class="muted">${m.duration} min</span></td>
          <td>${formatDateTime(m.date, m.time)}</td>
          <td>${m.responsible}</td>
          <td>${statusBadge(m.status)}</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost small" onclick="openMeetingEdit('${m.id}')">Editar</button>
            </div>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="6"><div class="empty">No hay reuniones agendadas.</div></td></tr>`;

      const sortedMeetings = [...state.meetings].sort((a,b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      const nextMeetings = sortedMeetings
        .filter(m => `${m.date} ${m.time}` >= `${todayISO()} 00:00`)
        .slice(0,6);

      document.getElementById('meetingsTodayList').innerHTML = nextMeetings.length ? nextMeetings.map(m => `
        <div class="list-item">
          <div>
            <h4>${m.time} · ${m.type}</h4>
            <p>${clientName(m.clientId)}</p>
            <p class="muted">${formatDate(m.date)} · ${m.responsible}${m.link ? ` · <a href="${m.link}" target="_blank" rel="noopener">Abrir enlace</a>` : ''}</p>
          </div>
          <div class="list-meta">
            ${statusBadge(m.status)}
            <button class="btn ghost small" onclick="openMeetingEdit('${m.id}')">Editar</button>
          </div>
        </div>
      `).join('') : `<div class="empty">No hay reuniones próximas.</div>`;

      const todayCount = state.meetings.filter(m => m.date === todayISO() && m.status !== 'cancelled').length;
      const weekCount = state.meetings.filter(m => {
        const days = diffDays(m.date);
        return days >= 0 && days <= 7 && m.status !== 'cancelled';
      }).length;
      const pendingFollowUp = state.meetings.filter(m => m.status === 'scheduled').length;

      document.getElementById('meetingStats').innerHTML = `
        <div class="meeting-stat">
          <strong>${todayCount}</strong>
          <span>Reuniones para hoy</span>
        </div>
        <div class="meeting-stat">
          <strong>${weekCount}</strong>
          <span>Reuniones en los próximos 7 días</span>
        </div>
        <div class="meeting-stat">
          <strong>${pendingFollowUp}</strong>
          <span>Reuniones programadas activas</span>
        </div>
      `;

      renderCalendar();
    }

    function renderCalendar(){
      const grid = document.getElementById('calendarGrid');
      const title = document.getElementById('calendarTitle');
      const today = todayISO();
      const weekdayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
      const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const year = calendarCursor.getFullYear();
      const month = calendarCursor.getMonth();

      function toISO(dateObj){
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2,'0');
        const d = String(dateObj.getDate()).padStart(2,'0');
        return `${y}-${m}-${d}`;
      }

      title.textContent = `${monthNames[month]} ${year}`;

      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      const startWeekday = (first.getDay() + 6) % 7;
      const totalDays = last.getDate();
      const blocks = [];

      weekdayNames.forEach(name => {
        blocks.push(`<div class="weekday">${name}</div>`);
      });

      for(let i = 0; i < startWeekday; i++){
        blocks.push('<div class="day empty"></div>');
      }

      for(let day = 1; day <= totalDays; day++){
        const date = toISO(new Date(year, month, day));
        const meetings = state.meetings.filter(m => m.date === date).slice(0,2);
        const isToday = date === today ? ' today' : '';
        blocks.push(`<div class="day${isToday}">
          <strong>${String(day).padStart(2,'0')}</strong>
          ${meetings.map(m => `<div class="mini-meeting">${m.time} · ${clientName(m.clientId)}</div>`).join('')}
        </div>`);
      }

      grid.innerHTML = `<div class="month-grid">${blocks.join('')}</div>`;
    }

    function changeCalendarMonth(step){
      calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + step, 1);
      renderCalendar();
    }

    function renderRenewals(){
      const filter = document.getElementById('renewalFilter').value;
      const q = queryValue();
      const rows = derivedRenewals()
        .filter(r => filter === 'all' ? true : (diffDays(r.date) >= 0 && diffDays(r.date) <= Number(filter)))
        .filter(r => textMatch(`${clientName(r.clientId)} ${r.serviceName}`, q));

      document.getElementById('renewalsTable').innerHTML = rows.length ? rows.map(r => `
        <tr>
          <td>${clientName(r.clientId)}</td>
          <td>${r.serviceName}</td>
          <td>${formatDate(r.date)}</td>
          <td>${formatCurrency(r.amount)}</td>
          <td>${statusBadge(r.cycle)}</td>
          <td>${statusBadge(r.status === 'warning' ? 'warning' : r.status)}</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost small" onclick="openRenewalEdit('${r.saleId}')">Editar</button>
            </div>
          </td>
        </tr>
      `).join('') : `<tr><td colspan="7"><div class="empty">No hay renovaciones para ese rango.</div></td></tr>`;
    }

    function renderTasks(){
      const q = queryValue();
      const alerts = derivedTaskAlerts();
      const alertsByTask = Object.fromEntries(alerts.map(task => [task.id, task]));
      const rows = state.tasks
        .filter(t => textMatch(`${clientName(t.clientId)} ${t.title} ${t.responsible} ${t.notes}`, q))
        .sort((a,b) => a.date.localeCompare(b.date));

      document.getElementById('tasksTable').innerHTML = rows.length ? rows.map(t => {
        const alert = alertsByTask[t.id];
        return `
        <tr>
          <td><strong>${t.title}</strong><span class="muted">${t.notes || ''}</span></td>
          <td>${clientName(t.clientId)}</td>
          <td>${formatDate(t.date)}</td>
          <td>${alert ? taskAlertBadge(alert) : '<span class="badge neutral">Sin alerta</span>'}</td>
          <td>${statusBadge(t.priority)}</td>
          <td>${t.responsible}</td>
          <td>${statusBadge(t.status === 'in-progress' ? 'warning' : t.status)}</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost small" onclick="openTaskEdit('${t.id}')">Editar</button>
              ${t.status !== 'completed' ? `<button class="btn secondary small" onclick="completeTask('${t.id}')">Completar</button>` : ''}
            </div>
          </td>
        </tr>
      `;
      }).join('') : `<tr><td colspan="8"><div class="empty">No hay tareas registradas.</div></td></tr>`;

      const focus = state.tasks
        .filter(t => ['pending','in-progress'].includes(t.status))
        .sort((a,b) => {
          const pa = {high:0, medium:1, low:2}[a.priority];
          const pb = {high:0, medium:1, low:2}[b.priority];
          if(pa !== pb) return pa - pb;
          return a.date.localeCompare(b.date);
        })
        .slice(0,5);

      document.getElementById('taskFocus').innerHTML = focus.length ? focus.map(t => `
        <div class="list-item">
          <div>
            <h4>${t.title}</h4>
            <p>${clientName(t.clientId)} · ${t.responsible}</p>
            <p class="muted">${formatDate(t.date)}</p>
          </div>
          <div class="list-meta">
            ${statusBadge(t.priority)}
            ${statusBadge(t.status === 'in-progress' ? 'warning' : t.status)}
            <button class="btn ghost small" onclick="openTaskEdit('${t.id}')">Editar</button>
          </div>
        </div>
      `).join('') : `<div class="empty">No tienes tareas críticas pendientes.</div>`;

      document.getElementById('taskAlerts').innerHTML = alerts.length ? alerts.slice(0,6).map(t => `
        <div class="list-item">
          <div>
            <h4>${t.title}</h4>
            <p>${clientName(t.clientId)} · ${t.responsible}</p>
            <p class="muted">${formatDate(t.date)}</p>
          </div>
          <div class="list-meta">
            ${taskAlertBadge(t)}
            <button class="btn secondary small" onclick="completeTask('${t.id}')">Completar</button>
            <button class="btn ghost small" onclick="openTaskEdit('${t.id}')">Editar</button>
          </div>
        </div>
      `).join('') : `<div class="empty">No hay alertas activas.</div>`;
    }

    function renderReports(){
      const byService = {};
      state.payments.forEach(p => {
        const inv = getInvoice(p.invoiceId);
        const sale = inv ? getSale(inv.saleId) : null;
        const serviceName = sale ? ((getService(sale.serviceId) || {}).name || 'Servicio') : p.concept.split('·')[0].trim();
        byService[serviceName] = (byService[serviceName] || 0) + Number(p.amount || 0);
      });
      const entries = Object.entries(byService).sort((a,b)=>b[1]-a[1]);
      const max = entries.length ? entries[0][1] : 1;

      document.getElementById('serviceReportBars').innerHTML = entries.length ? entries.map(([name, value]) => `
        <div class="bar-row">
          <strong>${name}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, Math.round((value / max) * 100))}%"></div></div>
          <span class="muted">${formatCurrency(value)}</span>
        </div>
      `).join('') : `<div class="empty">Aún no hay datos para este reporte.</div>`;

      const metrics = computeMetrics();
      document.getElementById('reportSummary').innerHTML = `
        <div class="card soft metric"><div class="kicker">Cobrado</div><div class="metric-value">${formatCurrency(state.payments.reduce((s,p)=>s+Number(p.amount||0),0))}</div></div>
        <div class="card soft metric"><div class="kicker">Pendiente</div><div class="metric-value">${formatCurrency(metrics.pending)}</div></div>
        <div class="card soft metric"><div class="kicker">Mora</div><div class="metric-value">${state.receivables.filter(x=>x.status==='overdue').length}</div></div>
        <div class="card soft metric"><div class="kicker">Renovaciones 30d</div><div class="metric-value">${derivedRenewals().filter(x=>diffDays(x.date)>=0 && diffDays(x.date)<=30).length}</div></div>
      `;

      const topClients = state.clients.map(c => {
        const paid = state.payments.filter(p => p.clientId === c.id).reduce((s,p)=>s+Number(p.amount||0),0);
        const pending = calcClientPending(c.id);
        return { client:c, total: paid + pending, paid, pending };
      }).sort((a,b)=>b.total-a.total).slice(0,6);

      document.getElementById('topClientsTable').innerHTML = topClients.length ? topClients.map(row => `
        <tr>
          <td>${row.client.company || row.client.name}</td>
          <td>${formatCurrency(row.total)}</td>
          <td>${formatCurrency(row.paid)}</td>
          <td>${formatCurrency(row.pending)}</td>
        </tr>
      `).join('') : `<tr><td colspan="4"><div class="empty">No hay clientes suficientes para este reporte.</div></td></tr>`;

      const radar = [];
      if(metrics.overdue > 0) radar.push({title:'Cartera en riesgo', text:`Tienes ${metrics.overdue} cobros vencidos. Conviene activar seguimiento hoy mismo.`, status:'overdue'});
      else radar.push({title:'Cartera controlada', text:'No tienes cobros vencidos en este momento.', status:'success'});
      if(derivedRenewals().filter(x=>diffDays(x.date)>=0 && diffDays(x.date)<=7).length > 0) radar.push({title:'Renovaciones sensibles', text:'Hay servicios que pueden perderse si no se gestionan esta semana.', status:'warning'});
      else radar.push({title:'Renovaciones sanas', text:'No hay renovaciones urgentes en los próximos 7 días.', status:'success'});
      if(state.meetings.filter(m=>m.date===todayISO()).length === 0) radar.push({title:'Agenda liviana', text:'Hoy no hay reuniones. Puedes usar el espacio para seguimiento comercial o cartera.', status:'neutral'});
      else radar.push({title:'Agenda activa', text:`Hoy tienes ${state.meetings.filter(m=>m.date===todayISO()).length} reuniones programadas.`, status:'pending'});

      document.getElementById('adminRadar').innerHTML = radar.map(item => `
        <div class="list-item">
          <div>
            <h4>${item.title}</h4>
            <p>${item.text}</p>
          </div>
          <div class="list-meta">${statusBadge(item.status)}</div>
        </div>
      `).join('');
    }

    function populateSettings(){
      const form = document.getElementById('settingsForm');
      Object.entries(state.settings).forEach(([key,val]) => {
        if(form.elements[key]) form.elements[key].value = val;
      });
    }

    function populateGlobalViews(options={}){
      renderDashboard();
      renderClients();
      renderServices();
      renderSales();
      renderReceivables();
      renderPayments();
      renderMeetings();
      renderRenewals();
      renderTasks();
      renderReports();
      populateSettings();
      renderNotificationPreview();
      updateNotificationButtons();
      if(options.persist !== false){
        saveState(options);
      }
    }

    function queryValue(){
      return (document.getElementById('globalSearch').value || '').trim().toLowerCase();
    }

    function textMatch(text, q){
      if(!q) return true;
      return (text || '').toLowerCase().includes(q);
    }

    function switchView(view){
      const section = document.getElementById(view);
      if(!section) return;
      document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
      section.classList.add('active');
      document.querySelectorAll('.nav button').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
      const meta = pageMeta[view];
      if(meta){
        const pageTitleEl = document.getElementById('pageTitle');
        const pageSubtitleEl = document.getElementById('pageSubtitle');
        if(pageTitleEl) pageTitleEl.textContent = meta[0];
        if(pageSubtitleEl) pageSubtitleEl.textContent = meta[1];
      }
      const sidebar = document.getElementById('sidebar');
      if(sidebar) sidebar.classList.remove('open');
    }

    function openSlideover({kicker='Nuevo registro', title='Formulario', html=''}){
      document.getElementById('slideoverKicker').textContent = kicker;
      document.getElementById('slideoverTitle').textContent = title;
      document.getElementById('slideoverBody').innerHTML = html;
      enhanceCurrencyInputs(document.getElementById('slideoverBody'));
      document.getElementById('slideover').classList.add('open');
    }

    function closeSlideover(){
      document.getElementById('slideover').classList.remove('open');
      document.getElementById('slideoverBody').innerHTML = '';
    }

    function clientOptions(selected=''){
      return state.clients.map(c => `<option value="${c.id}" ${c.id===selected?'selected':''}>${c.company || c.name}</option>`).join('');
    }
    function serviceOptions(selected=''){
      return state.services.map(s => `<option value="${s.id}" ${s.id===selected?'selected':''}>${s.name}</option>`).join('');
    }
    function invoiceOptions(selected=''){
      return state.receivables.filter(x => x.status !== 'paid').map(inv => `<option value="${inv.id}" ${inv.id===selected?'selected':''}>${clientName(inv.clientId)} · ${inv.concept}</option>`).join('');
    }

    function syncSaleReceivable(sale){
      const service = getService(sale.serviceId);
      const dueDate = sale.nextDue || sale.startDate;
      const concept = `${service?.name || 'Servicio'} · ${cycleLabel(sale.cycle)}`;
      const pendingInvoices = state.receivables
        .filter(inv => inv.saleId === sale.id && inv.status !== 'paid')
        .sort((a,b) => a.dueDate.localeCompare(b.dueDate));
      const invoice = pendingInvoices[0];
      if(invoice){
        invoice.clientId = sale.clientId;
        invoice.concept = concept;
        invoice.amount = Number(sale.amount || 0);
        invoice.dueDate = dueDate;
        invoice.priority = sale.cycle === 'annual' ? 'medium' : 'high';
        invoice.status = diffDays(dueDate) < 0 ? 'overdue' : 'pending';
      }else if(sale.status !== 'cancelled'){
        createReceivableFromSale(sale, dueDate);
      }
    }

    function openClientForm(client=null){
      openSlideover({
        kicker: client ? 'Editar cliente' : 'Nuevo cliente',
        title: client ? (client.company || client.name) : 'Crear cliente',
        html: `
          <form id="clientForm" class="form-grid">
            <div class="form-field"><label>Nombre</label><input class="input" name="name" value="${client?.name || ''}" required></div>
            <div class="form-field"><label>Empresa</label><input class="input" name="company" value="${client?.company || ''}" required></div>
            <div class="form-field"><label>Teléfono</label><input class="input" name="phone" value="${client?.phone || ''}"></div>
            <div class="form-field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${client?.whatsapp || ''}"></div>
            <div class="form-field"><label>Correo</label><input class="input" name="email" value="${client?.email || ''}"></div>
            <div class="form-field"><label>Ciudad</label><input class="input" name="city" value="${client?.city || ''}"></div>
            <div class="form-field"><label>Servicio principal</label><input class="input" name="mainService" value="${client?.mainService || ''}"></div>
            <div class="form-field"><label>Asesor responsable</label><input class="input" name="advisor" value="${client?.advisor || ''}"></div>
            <div class="form-field"><label>Fecha de inicio</label><input class="input" type="date" name="startDate" value="${client?.startDate || todayISO()}"></div>
            <div class="form-field"><label>Estado</label>
              <select class="select" name="status">
                <option value="active" ${client?.status==='active'?'selected':''}>Activo</option>
                <option value="pending" ${client?.status==='pending'?'selected':''}>Pendiente</option>
                <option value="suspended" ${client?.status==='suspended'?'selected':''}>Suspendido</option>
                <option value="cancelled" ${client?.status==='cancelled'?'selected':''}>Cancelado</option>
              </select>
            </div>
            <div class="form-field full"><label>Notas</label><textarea class="textarea" name="notes">${client?.notes || ''}</textarea></div>
            <div class="form-field full"><button class="btn primary" type="submit">${client ? 'Guardar cambios' : 'Crear cliente'}</button></div>
          </form>
        `
      });
      document.getElementById('clientForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        if(client){
          Object.assign(client, data);
        }else{
          state.clients.push({id:uid('client'), ...data});
        }
        populateGlobalViews();
        closeSlideover();
      };
    }

    function openServiceForm(service=null){
      openSlideover({
        kicker: service ? 'Editar servicio' : 'Nuevo servicio',
        title: service ? service.name : 'Crear servicio',
        html:`
          <form id="serviceForm" class="form-grid">
            <div class="form-field"><label>Nombre</label><input class="input" name="name" value="${service?.name || ''}" required></div>
            <div class="form-field"><label>Categoría</label><input class="input" name="category" value="${service?.category || ''}" required></div>
            <div class="form-field"><label>Precio base</label><input class="input" type="text" inputmode="numeric" data-currency="true" name="price" value="${service?.price ?? ''}" required></div>
            <div class="form-field"><label>Tipo de cobro</label>
              <select class="select" name="billingType">
                <option value="one-time" ${service?.billingType==='one-time'?'selected':''}>Venta única</option>
                <option value="monthly" ${service?.billingType==='monthly'?'selected':''}>Mensual</option>
                <option value="quarterly" ${service?.billingType==='quarterly'?'selected':''}>Trimestral</option>
                <option value="semiannual" ${service?.billingType==='semiannual'?'selected':''}>Semestral</option>
                <option value="annual" ${service?.billingType==='annual'?'selected':''}>Anual</option>
              </select>
            </div>
            <div class="form-field"><label>Duración</label><input class="input" name="duration" value="${service?.duration || ''}" placeholder="Ej. 30 días"></div>
            <div class="form-field"><label>Estado</label>
              <select class="select" name="status">
                <option value="active" ${service?.status==='active'?'selected':''}>Activo</option>
                <option value="inactive" ${service?.status==='inactive'?'selected':''}>Inactivo</option>
              </select>
            </div>
            <div class="form-field full"><label>Descripción</label><textarea class="textarea" name="description">${service?.description || ''}</textarea></div>
            <div class="form-field full"><button class="btn primary" type="submit">${service ? 'Guardar cambios' : 'Guardar servicio'}</button></div>
          </form>
        `
      });
      document.getElementById('serviceForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        data.price = Number(data.price || 0);
        if(service){
          Object.assign(service, data);
          state.sales.filter(s => s.serviceId === service.id).forEach(syncSaleReceivable);
        }else{
          state.services.push({
            id:uid('service'),
            ...data
          });
        }
        populateGlobalViews();
        closeSlideover();
      };
    }

    function createReceivableFromSale(sale, dueDate){
      const service = getService(sale.serviceId);
      state.receivables.push({
        id:uid('inv'),
        clientId:sale.clientId,
        saleId:sale.id,
        concept:`${service?.name || 'Servicio'} · ${cycleLabel(sale.cycle)}`,
        amount:Number(sale.amount || 0),
        dueDate,
        priority: sale.cycle === 'annual' ? 'medium' : 'high',
        status: diffDays(dueDate) < 0 ? 'overdue' : 'pending',
        createdAt:todayISO()
      });
    }

    function openSaleForm(sale=null){
      openSlideover({
        kicker: sale ? 'Editar venta' : 'Registrar venta',
        title: sale ? 'Actualizar venta' : 'Nueva venta',
        html:`
          <form id="saleForm" class="form-grid">
            <div class="form-field"><label>Cliente</label><select class="select" name="clientId" required>${clientOptions(sale?.clientId || '')}</select></div>
            <div class="form-field"><label>Servicio</label><select class="select" name="serviceId" id="saleServiceSelect" required>${serviceOptions(sale?.serviceId || '')}</select></div>
            <div class="form-field"><label>Monto</label><input class="input" type="text" inputmode="numeric" data-currency="true" name="amount" id="saleAmountInput" value="${sale?.amount ?? ''}" required></div>
            <div class="form-field"><label>Ciclo</label>
              <select class="select" name="cycle" id="saleCycleSelect">
                <option value="one-time" ${sale?.cycle==='one-time'?'selected':''}>Venta única</option>
                <option value="monthly" ${sale?.cycle==='monthly'?'selected':''}>Mensual</option>
                <option value="quarterly" ${sale?.cycle==='quarterly'?'selected':''}>Trimestral</option>
                <option value="semiannual" ${sale?.cycle==='semiannual'?'selected':''}>Semestral</option>
                <option value="annual" ${sale?.cycle==='annual'?'selected':''}>Anual</option>
              </select>
            </div>
            <div class="form-field"><label>Fecha de inicio</label><input class="input" type="date" name="startDate" value="${sale?.startDate || todayISO()}"></div>
            <div class="form-field"><label>Próximo cobro</label><input class="input" type="date" name="nextDue" value="${sale?.nextDue || sale?.startDate || todayISO()}"></div>
            <div class="form-field"><label>Asesor</label><input class="input" name="advisor" value="${sale?.advisor || ''}" placeholder="Responsable"></div>
            <div class="form-field"><label>Estado</label>
              <select class="select" name="status">
                <option value="active" ${sale?.status==='active'?'selected':''}>Activa</option>
                <option value="pending" ${sale?.status==='pending'?'selected':''}>Pendiente</option>
                <option value="paused" ${sale?.status==='paused'?'selected':''}>Pausada</option>
                <option value="cancelled" ${sale?.status==='cancelled'?'selected':''}>Cancelada</option>
              </select>
            </div>
            <div class="form-field full"><label>Notas</label><textarea class="textarea" name="notes">${sale?.notes || ''}</textarea></div>
            <div class="form-field full"><button class="btn primary" type="submit">${sale ? 'Guardar cambios' : 'Guardar venta'}</button></div>
          </form>
        `
      });

      const serviceSelect = document.getElementById('saleServiceSelect');
      const amountInput = document.getElementById('saleAmountInput');
      const cycleSelect = document.getElementById('saleCycleSelect');

      function syncFromService(){
        const service = getService(serviceSelect.value);
        if(service && !sale){
          setCurrencyInputValue(amountInput, service.price);
          cycleSelect.value = service.billingType;
        }
      }
      syncFromService();
      serviceSelect.onchange = syncFromService;

      document.getElementById('saleForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        data.amount = Number(data.amount || 0);
        if(sale){
          Object.assign(sale, data);
          syncSaleReceivable(sale);
          const client = getClient(sale.clientId);
          if(client){
            client.mainService = (getService(sale.serviceId) || {}).name || client.mainService;
          }
        }else{
          const newSale = {
            id:uid('sale'),
            ...data
          };
          state.sales.push(newSale);
          createReceivableFromSale(newSale, newSale.nextDue || newSale.startDate);
          const client = getClient(newSale.clientId);
          if(client){
            client.mainService = (getService(newSale.serviceId) || {}).name || client.mainService;
            if(client.status === 'pending' && newSale.status === 'active') client.status = 'active';
          }
        }
        populateGlobalViews();
        closeSlideover();
      };
    }

    function openMeetingForm(meeting=null){
      openSlideover({
        kicker: meeting ? 'Editar reunión' : 'Nueva reunión',
        title: meeting ? 'Actualizar reunión' : 'Agendar reunión',
        html:`
          <form id="meetingForm" class="form-stack">
            <div class="form-field"><label>Cliente</label><select class="select" name="clientId" required>${clientOptions(meeting?.clientId || '')}</select></div>
            <div class="form-field"><label>Tipo</label><input class="input" name="type" value="${meeting?.type || ''}" placeholder="Onboarding, soporte, renovación..." required></div>
            <div class="form-field"><label>Fecha</label><input class="input" type="date" name="date" value="${meeting?.date || todayISO()}" required></div>
            <div class="form-field"><label>Hora</label><input class="input" type="time" name="time" value="${meeting?.time || '09:00'}" required></div>
            <div class="form-field"><label>Duración (min)</label><input class="input" type="number" name="duration" value="${meeting?.duration ?? 30}"></div>
            <div class="form-field"><label>Responsable</label><input class="input" name="responsible" value="${meeting?.responsible || ''}" placeholder="Responsable" required></div>
            <div class="form-field"><label>Estado</label>
              <select class="select" name="status">
                <option value="scheduled" ${meeting?.status==='scheduled'?'selected':''}>Programada</option>
                <option value="pending" ${meeting?.status==='pending'?'selected':''}>Pendiente</option>
                <option value="completed" ${meeting?.status==='completed'?'selected':''}>Completada</option>
                <option value="cancelled" ${meeting?.status==='cancelled'?'selected':''}>Cancelada</option>
              </select>
            </div>
            <div class="form-field full"><label>Enlace</label><input class="input" name="link" value="${meeting?.link || 'https://meet.google.com/'}"></div>
            <div class="form-field full"><label>Notas previas</label><textarea class="textarea" name="notes">${meeting?.notes || ''}</textarea></div>
            <div class="form-field full"><label>Conclusión</label><textarea class="textarea" name="conclusion">${meeting?.conclusion || ''}</textarea></div>
            <div class="form-field full"><label>Próxima acción</label><textarea class="textarea" name="nextAction">${meeting?.nextAction || ''}</textarea></div>
            <div class="form-field full"><button class="btn primary" type="submit">${meeting ? 'Guardar cambios' : 'Guardar reunión'}</button></div>
          </form>
        `
      });
      document.getElementById('meetingForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        data.duration = Number(data.duration || 30);
        if(meeting){
          Object.assign(meeting, data);
        }else{
          state.meetings.push({
            id:uid('meet'),
            ...data,
            conclusion:'',
            nextAction:''
          });
        }
        populateGlobalViews();
        closeSlideover();
      };
    }

    function openTaskForm(task=null){
      openSlideover({
        kicker: task ? 'Editar tarea' : 'Nueva tarea',
        title: task ? 'Actualizar tarea' : 'Crear tarea',
        html:`
          <form id="taskForm" class="form-grid">
            <div class="form-field"><label>Cliente</label><select class="select" name="clientId">${clientOptions(task?.clientId || '')}</select></div>
            <div class="form-field"><label>Título</label><input class="input" name="title" value="${task?.title || ''}" required></div>
            <div class="form-field"><label>Fecha</label><input class="input" type="date" name="date" value="${task?.date || todayISO()}"></div>
            <div class="form-field"><label>Prioridad</label>
              <select class="select" name="priority">
                <option value="high" ${task?.priority==='high'?'selected':''}>Alta</option>
                <option value="medium" ${task?.priority==='medium'?'selected':''}>Media</option>
                <option value="low" ${task?.priority==='low'?'selected':''}>Baja</option>
              </select>
            </div>
            <div class="form-field"><label>Responsable</label><input class="input" name="responsible" value="${task?.responsible || ''}" required></div>
            <div class="form-field"><label>Estado</label>
              <select class="select" name="status">
                <option value="pending" ${task?.status==='pending'?'selected':''}>Pendiente</option>
                <option value="in-progress" ${task?.status==='in-progress'?'selected':''}>En proceso</option>
                <option value="completed" ${task?.status==='completed'?'selected':''}>Completada</option>
              </select>
            </div>
            <div class="form-field">
              <label>Anticipación de alerta</label>
              <select class="select" name="alertDays">
                <option value="0" ${Number(task?.alertDays)===0?'selected':''}>El mismo día</option>
                <option value="1" ${Number(task?.alertDays ?? 1)===1?'selected':''}>1 día antes</option>
                <option value="3" ${Number(task?.alertDays)===3?'selected':''}>3 días antes</option>
                <option value="7" ${Number(task?.alertDays)===7?'selected':''}>7 días antes</option>
              </select>
            </div>
            <div class="form-field">
              <label>Activar alerta</label>
              <div class="checkbox-row">
                <input type="checkbox" name="alertEnabled" ${task?.alertEnabled !== false ? 'checked' : ''}>
                <span class="muted">Mostrar aviso automático</span>
              </div>
            </div>
            <div class="form-field full"><label>Notas</label><textarea class="textarea" name="notes">${task?.notes || ''}</textarea></div>
            <div class="form-field full"><button class="btn primary" type="submit">${task ? 'Guardar cambios' : 'Guardar tarea'}</button></div>
          </form>
        `
      });
      document.getElementById('taskForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        const payload = {
          ...data,
          alertEnabled: fd.get('alertEnabled') === 'on',
          alertDays: Number(data.alertDays || 1)
        };
        if(task){
          Object.assign(task, payload);
        }else{
          state.tasks.push({
            id:uid('task'),
            ...payload
          });
        }
        populateGlobalViews();
        closeSlideover();
      };
    }

    function openPaymentModal(invoiceId=''){
      openSlideover({
        kicker:'Registrar pago',
        title:'Confirmar pago o abono',
        html:`
          <form id="paymentForm" class="form-grid">
            <div class="form-field full"><label>Cuenta por cobrar</label><select class="select" name="invoiceId" id="invoiceSelect">${invoiceOptions(invoiceId)}</select></div>
            <div class="form-field"><label>Cliente</label><input class="input" id="paymentClientLabel" disabled></div>
            <div class="form-field"><label>Valor</label><input class="input" type="text" inputmode="numeric" data-currency="true" name="amount" id="paymentAmountInput" required></div>
            <div class="form-field"><label>Fecha</label><input class="input" type="date" name="date" value="${todayISO()}"></div>
            <div class="form-field"><label>Método</label>
              <select class="select" name="method">
                <option>Transferencia</option>
                <option>Nequi</option>
                <option>Daviplata</option>
                <option>Wompi</option>
                <option>Tarjeta</option>
                <option>Efectivo</option>
              </select>
            </div>
            <div class="form-field full"><label>Observación</label><textarea class="textarea" name="notes"></textarea></div>
            <div class="form-field full"><button class="btn primary" type="submit">Guardar pago</button></div>
          </form>
        `
      });
      const invoiceSelect = document.getElementById('invoiceSelect');
      const amountInput = document.getElementById('paymentAmountInput');
      const clientLabel = document.getElementById('paymentClientLabel');

      function syncPaymentFields(){
        const inv = getInvoice(invoiceSelect.value);
        if(inv){
          setCurrencyInputValue(amountInput, inv.amount);
          clientLabel.value = clientName(inv.clientId);
        }
      }
      syncPaymentFields();
      invoiceSelect.onchange = syncPaymentFields;

      document.getElementById('paymentForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        const inv = getInvoice(data.invoiceId);
        if(!inv) return;
        const amount = Number(data.amount || 0);

        state.payments.push({
          id:uid('pay'),
          invoiceId:inv.id,
          clientId:inv.clientId,
          concept:inv.concept,
          amount,
          date:data.date,
          method:data.method,
          notes:data.notes
        });

        inv.status = 'paid';
        const sale = getSale(inv.saleId);
        if(sale && ['monthly','quarterly','semiannual','annual'].includes(sale.cycle)){
          sale.nextDue = addCycle(inv.dueDate, sale.cycle);
          createReceivableFromSale(sale, sale.nextDue);
        }
        const client = getClient(inv.clientId);
        if(client && client.status !== 'cancelled') client.status = 'active';

        populateGlobalViews();
        closeSlideover();
      };
    }

    function openManualPaymentForm(payment=null){
      openSlideover({
        kicker: payment ? 'Editar pago manual' : 'Pago manual',
        title: payment ? 'Actualizar ingreso manual' : 'Registrar ingreso manual',
        html:`
          <form id="manualPaymentForm" class="form-grid">
            <div class="form-field"><label>Cliente</label><select class="select" name="clientId">${clientOptions(payment?.clientId || '')}</select></div>
            <div class="form-field"><label>Valor</label><input class="input" type="text" inputmode="numeric" data-currency="true" name="amount" value="${payment?.amount ?? ''}" required></div>
            <div class="form-field"><label>Fecha</label><input class="input" type="date" name="date" value="${payment?.date || todayISO()}"></div>
            <div class="form-field"><label>Método</label>
              <select class="select" name="method">
                <option ${payment?.method==='Transferencia'?'selected':''}>Transferencia</option>
                <option ${payment?.method==='Nequi'?'selected':''}>Nequi</option>
                <option ${payment?.method==='Daviplata'?'selected':''}>Daviplata</option>
                <option ${payment?.method==='Wompi'?'selected':''}>Wompi</option>
                <option ${payment?.method==='Tarjeta'?'selected':''}>Tarjeta</option>
                <option ${payment?.method==='Efectivo'?'selected':''}>Efectivo</option>
              </select>
            </div>
            <div class="form-field full"><label>Concepto</label><input class="input" name="concept" value="${payment?.concept || ''}" required></div>
            <div class="form-field full"><label>Observación</label><textarea class="textarea" name="notes">${payment?.notes || ''}</textarea></div>
            <div class="form-field full"><button class="btn primary" type="submit">${payment ? 'Guardar cambios' : 'Guardar pago'}</button></div>
          </form>
        `
      });
      document.getElementById('manualPaymentForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        const payload = {
          clientId:data.clientId,
          concept:data.concept,
          amount:Number(data.amount || 0),
          date:data.date,
          method:data.method,
          notes:data.notes
        };
        if(payment){
          Object.assign(payment, payload);
        }else{
          state.payments.push({
            id:uid('pay'),
            invoiceId:null,
            ...payload
          });
        }
        populateGlobalViews();
        closeSlideover();
      };
    }

    function openQuickAction(){
      openSlideover({
        kicker:'Acción rápida',
        title:'¿Qué quieres hacer?',
        html:`
          <div class="list">
            <div class="list-item">
              <div>
                <h4>Registrar nuevo cliente</h4>
                <p>Crea la ficha principal y luego conecta ventas, tareas y reuniones.</p>
              </div>
              <button class="btn primary small" onclick="openClientForm()">Abrir</button>
            </div>
            <div class="list-item">
              <div>
                <h4>Registrar venta</h4>
                <p>Activa el servicio, el cobro y la próxima renovación.</p>
              </div>
              <button class="btn primary small" onclick="openSaleForm()">Abrir</button>
            </div>
            <div class="list-item">
              <div>
                <h4>Agendar reunión</h4>
                <p>Guarda fecha, hora, enlace y notas previas.</p>
              </div>
              <button class="btn primary small" onclick="openMeetingForm()">Abrir</button>
            </div>
            <div class="list-item">
              <div>
                <h4>Registrar pago</h4>
                <p>Confirma el ingreso y mueve el siguiente cobro si es recurrente.</p>
              </div>
              <button class="btn primary small" onclick="openPaymentModal()">Abrir</button>
            </div>
          </div>
        `
      });
    }

    function openClientDetail(clientId){
      const client = getClient(clientId);
      const sales = state.sales.filter(s => s.clientId === clientId);
      const invoices = state.receivables.filter(r => r.clientId === clientId);
      const meetings = state.meetings.filter(m => m.clientId === clientId).sort((a,b)=>`${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
      const tasks = state.tasks.filter(t => t.clientId === clientId);

      openSlideover({
        kicker:'Ficha del cliente',
        title:client.company || client.name,
        html:`
          <div class="profile">
            <div class="avatar">${(client.company || client.name).slice(0,2).toUpperCase()}</div>
            <div>
              <h3>${client.company || client.name}</h3>
              <p>${client.name} · ${client.email || 'sin correo'} · ${client.city || 'sin ciudad'}</p>
            </div>
          </div>
          <div class="chips" style="margin-top:14px">
            ${statusBadge(client.status)}
            <span class="badge neutral">Saldo ${formatCurrency(calcClientPending(client.id))}</span>
            <span class="badge neutral">Asesor ${client.advisor || '—'}</span>
          </div>
          <div class="tabs" style="margin-top:18px">
            <button class="tab active" data-client-tab="summary">Resumen</button>
            <button class="tab" data-client-tab="sales">Servicios</button>
            <button class="tab" data-client-tab="payments">Cobros</button>
            <button class="tab" data-client-tab="meetings">Reuniones</button>
            <button class="tab" data-client-tab="tasks">Tareas</button>
          </div>
          <div class="client-detail-panel">
            <section class="active" data-client-panel="summary">
              <div class="list">
                <div class="list-item"><div><h4>Datos principales</h4><p>${client.phone || '—'} · ${client.whatsapp || '—'} · Inicio ${formatDate(client.startDate)}</p></div></div>
                <div class="list-item"><div><h4>Servicio principal</h4><p>${client.mainService || '—'}</p></div></div>
                <div class="list-item"><div><h4>Notas</h4><p>${client.notes || 'Sin notas'}</p></div></div>
              </div>
            </section>
            <section data-client-panel="sales">
              <div class="list">${sales.length ? sales.map(s => `<div class="list-item"><div><h4>${(getService(s.serviceId)||{}).name || 'Servicio'}</h4><p>${cycleLabel(s.cycle)} · Próximo cobro ${formatDate(s.nextDue)}</p></div><div class="list-meta">${statusBadge(s.status)}<span class="badge neutral">${formatCurrency(s.amount)}</span></div></div>`).join('') : '<div class="empty">No hay servicios asociados.</div>'}</div>
            </section>
            <section data-client-panel="payments">
              <div class="list">${invoices.length ? invoices.map(i => `<div class="list-item"><div><h4>${i.concept}</h4><p>Vence ${formatDate(i.dueDate)}</p></div><div class="list-meta">${statusBadge(i.status)}<span class="badge neutral">${formatCurrency(i.amount)}</span></div></div>`).join('') : '<div class="empty">No hay cobros asociados.</div>'}</div>
            </section>
            <section data-client-panel="meetings">
              <div class="list">${meetings.length ? meetings.map(m => `<div class="list-item"><div><h4>${m.type}</h4><p>${formatDateTime(m.date,m.time)} · ${m.responsible}</p></div><div class="list-meta">${statusBadge(m.status)}</div></div>`).join('') : '<div class="empty">No hay reuniones registradas.</div>'}</div>
            </section>
            <section data-client-panel="tasks">
              <div class="list">${tasks.length ? tasks.map(t => `<div class="list-item"><div><h4>${t.title}</h4><p>${formatDate(t.date)} · ${t.responsible}</p></div><div class="list-meta">${statusBadge(t.priority)}${statusBadge(t.status === 'in-progress' ? 'warning' : t.status)}</div></div>`).join('') : '<div class="empty">No hay tareas registradas.</div>'}</div>
            </section>
          </div>
        `
      });

      document.querySelectorAll('[data-client-tab]').forEach(tab => {
        tab.onclick = () => {
          document.querySelectorAll('[data-client-tab]').forEach(t => t.classList.remove('active'));
          document.querySelectorAll('[data-client-panel]').forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          document.querySelector(`[data-client-panel="${tab.dataset.clientTab}"]`).classList.add('active');
        };
      });
    }

    function openClientEdit(clientId){
      openClientForm(getClient(clientId));
    }

    function openServiceEdit(serviceId){
      openServiceForm(getService(serviceId));
    }

    function openSaleEdit(saleId){
      openSaleForm(getSale(saleId));
    }

    function openMeetingEdit(meetingId){
      openMeetingForm(state.meetings.find(m => m.id === meetingId));
    }

    function openTaskEdit(taskId){
      openTaskForm(state.tasks.find(t => t.id === taskId));
    }

    function openRenewalEdit(saleId){
      openSaleForm(getSale(saleId));
    }

    function openReceivableEdit(invoiceId){
      const invoice = getInvoice(invoiceId);
      if(!invoice) return;
      openSlideover({
        kicker:'Editar cobro',
        title:'Actualizar cuenta por cobrar',
        html:`
          <form id="receivableForm" class="form-grid">
            <div class="form-field"><label>Cliente</label><input class="input" value="${clientName(invoice.clientId)}" disabled></div>
            <div class="form-field"><label>Concepto</label><input class="input" name="concept" value="${invoice.concept || ''}" required></div>
            <div class="form-field"><label>Monto</label><input class="input" type="text" inputmode="numeric" data-currency="true" name="amount" value="${invoice.amount ?? ''}" required></div>
            <div class="form-field"><label>Vence</label><input class="input" type="date" name="dueDate" value="${invoice.dueDate || todayISO()}" required></div>
            <div class="form-field"><label>Prioridad</label>
              <select class="select" name="priority">
                <option value="high" ${invoice.priority==='high'?'selected':''}>Alta</option>
                <option value="medium" ${invoice.priority==='medium'?'selected':''}>Media</option>
                <option value="low" ${invoice.priority==='low'?'selected':''}>Baja</option>
              </select>
            </div>
            <div class="form-field"><label>Estado</label>
              <select class="select" name="status">
                <option value="pending" ${invoice.status==='pending'?'selected':''}>Pendiente</option>
                <option value="overdue" ${invoice.status==='overdue'?'selected':''}>Vencido</option>
                <option value="paid" ${invoice.status==='paid'?'selected':''}>Pagado</option>
              </select>
            </div>
            <div class="form-field full"><button class="btn primary" type="submit">Guardar cambios</button></div>
          </form>
        `
      });
      document.getElementById('receivableForm').onsubmit = e => {
        e.preventDefault();
        const data = getFormObject(e.target);
        invoice.concept = data.concept;
        invoice.amount = Number(data.amount || 0);
        invoice.dueDate = data.dueDate;
        invoice.priority = data.priority;
        invoice.status = data.status;
        const sale = getSale(invoice.saleId);
        if(sale && invoice.status !== 'paid'){
          sale.amount = invoice.amount;
          sale.nextDue = invoice.dueDate;
        }
        populateGlobalViews();
        closeSlideover();
      };
    }

    function openPaymentEdit(paymentId){
      const payment = state.payments.find(p => p.id === paymentId);
      if(!payment) return;
      if(payment.invoiceId){
        const invoice = getInvoice(payment.invoiceId);
        openSlideover({
          kicker:'Editar pago',
          title:'Actualizar pago registrado',
          html:`
            <form id="paymentEditForm" class="form-grid">
              <div class="form-field full"><label>Cuenta por cobrar</label><input class="input" value="${invoice ? `${clientName(invoice.clientId)} · ${invoice.concept}` : payment.concept}" disabled></div>
              <div class="form-field"><label>Cliente</label><input class="input" value="${clientName(payment.clientId)}" disabled></div>
              <div class="form-field"><label>Valor</label><input class="input" type="text" inputmode="numeric" data-currency="true" name="amount" value="${payment.amount ?? ''}" required></div>
              <div class="form-field"><label>Fecha</label><input class="input" type="date" name="date" value="${payment.date || todayISO()}" required></div>
              <div class="form-field"><label>Método</label>
                <select class="select" name="method">
                  <option ${payment.method==='Transferencia'?'selected':''}>Transferencia</option>
                  <option ${payment.method==='Nequi'?'selected':''}>Nequi</option>
                  <option ${payment.method==='Daviplata'?'selected':''}>Daviplata</option>
                  <option ${payment.method==='Wompi'?'selected':''}>Wompi</option>
                  <option ${payment.method==='Tarjeta'?'selected':''}>Tarjeta</option>
                  <option ${payment.method==='Efectivo'?'selected':''}>Efectivo</option>
                </select>
              </div>
              <div class="form-field full"><label>Observación</label><textarea class="textarea" name="notes">${payment.notes || ''}</textarea></div>
              <div class="form-field full"><button class="btn primary" type="submit">Guardar cambios</button></div>
            </form>
          `
        });
        document.getElementById('paymentEditForm').onsubmit = e => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const data = Object.fromEntries(fd.entries());
          payment.amount = Number(data.amount || 0);
          payment.date = data.date;
          payment.method = data.method;
          payment.notes = data.notes;
          populateGlobalViews();
          closeSlideover();
        };
        return;
      }
      openManualPaymentForm(payment);
    }

    function completeTask(taskId){
      const task = state.tasks.find(t => t.id === taskId);
      if(!task) return;
      task.status = 'completed';
      populateGlobalViews();
    }

    function copyReminder(invoiceId){
      const inv = getInvoice(invoiceId);
      if(!inv) return;
      const message = `${state.settings.billingMessage}\n\nCliente: ${clientName(inv.clientId)}\nConcepto: ${inv.concept}\nValor: ${formatCurrency(inv.amount)}\nFecha de vencimiento: ${formatDate(inv.dueDate)}`;
      navigator.clipboard.writeText(message).then(() => {
        alert('Recordatorio copiado al portapapeles.');
      }).catch(() => {
        alert(message);
      });
    }

    function exportBackup(){
      const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bro-marketing-backup.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    function applyFilters(){
      populateGlobalViews();
    }

    document.getElementById('nav').addEventListener('click', e => {
      const btn = e.target.closest('button[data-view]');
      if(btn) switchView(btn.dataset.view);
    });

    document.querySelectorAll('[data-jump]').forEach(btn => {
      btn.onclick = () => switchView(btn.dataset.jump);
    });

    document.getElementById('openSidebarBtn').onclick = () => document.getElementById('sidebar').classList.add('open');
    document.getElementById('closeSlideover').onclick = closeSlideover;
    document.getElementById('closeSlideoverBtn').onclick = closeSlideover;
    document.getElementById('quickActionBtn').onclick = openQuickAction;
    document.getElementById('addClientBtn').onclick = () => openClientForm();
    document.getElementById('addServiceBtn').onclick = openServiceForm;
    document.getElementById('addSaleBtn').onclick = openSaleForm;
    document.getElementById('addMeetingBtn').onclick = openMeetingForm;
    document.getElementById('calendarPrevBtn').onclick = () => changeCalendarMonth(-1);
    document.getElementById('calendarNextBtn').onclick = () => changeCalendarMonth(1);
    document.getElementById('addTaskBtn').onclick = openTaskForm;
    document.getElementById('registerManualPaymentBtn').onclick = openManualPaymentForm;
    document.getElementById('generateRemindersBtn').onclick = () => {
      generateAutoTasks();
      populateGlobalViews();
      alert('Se generaron tareas internas para cobros vencidos.');
    };
    document.getElementById('exportBtn').onclick = exportBackup;
    document.getElementById('seedBtn').onclick = () => {
      if(confirm('Esto borrará los datos actuales y dejará el sistema vacío.')){
        state = seedState();
        populateGlobalViews();
      }
    };

    ['clientStatusFilter','serviceTypeFilter','salesStatusFilter','receivableStatusFilter','renewalFilter','globalSearch']
      .forEach(id => document.getElementById(id).addEventListener('input', applyFilters));

    document.getElementById('settingsForm').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.reminderFirst = Number(data.reminderFirst || 7);
      data.reminderLast = Number(data.reminderLast || 1);
      state.settings = data;
      saveState();
      alert('Configuración guardada.');
      populateGlobalViews();
    });

    syncAuthBrandLogo();

    document.getElementById('authOpenBtn').onclick = () => {
      document.getElementById('authOverlay').classList.remove('hidden');
      setAuthMessage('');
    };

    document.getElementById('logoutBtn').onclick = async () => {
      if(!auth) return;
      await auth.signOut();
    };

    document.getElementById('authForm').addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      const password = document.getElementById('authPassword').value;
      if(!email || !password){
        setAuthMessage('Completa correo y contraseña.', 'error');
        return;
      }
      try{
        setAuthMessage('Ingresando...', '');
        await loginWithEmail(email, password);
        setAuthMessage('Acceso correcto.', 'success');
      }catch(error){
        console.error(error);
        setAuthMessage('No se pudo iniciar sesión. Revisa el correo, la contraseña o activa Email/Password en Firebase.', 'error');
      }
    });

    document.getElementById('resetPasswordBtn').onclick = async () => {
      const email = document.getElementById('authEmail').value.trim();
      if(!email){
        setAuthMessage('Escribe el correo para enviarte la recuperación.', 'error');
        return;
      }
      try{
        await sendPasswordReset(email);
        setAuthMessage('Te enviamos un correo para recuperar el acceso.', 'success');
      }catch(error){
        console.error(error);
        setAuthMessage('No se pudo enviar la recuperación. Revisa el correo.', 'error');
      }
    };

    window.openPaymentModal = openPaymentModal;
    window.openPaymentEdit = openPaymentEdit;
    window.openClientDetail = openClientDetail;
    window.openClientEdit = openClientEdit;
    window.openClientForm = openClientForm;
    window.openServiceEdit = openServiceEdit;
    window.openSaleForm = openSaleForm;
    window.openSaleEdit = openSaleEdit;
    window.openMeetingForm = openMeetingForm;
    window.openMeetingEdit = openMeetingEdit;
    window.openTaskEdit = openTaskEdit;
    window.openRenewalEdit = openRenewalEdit;
    window.openReceivableEdit = openReceivableEdit;
    window.completeTask = completeTask;
    window.copyReminder = copyReminder;


    let deferredInstallPrompt = null;
    let notificationCheckTimer = null;
    const NOTIFICATION_SEEN_KEY = 'bro_marketing_seen_notifications_v1';

    function supportsInstallPrompt(){
      return typeof window !== 'undefined' && ('onbeforeinstallprompt' in window || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone);
    }

    function setNotificationChip(mode='idle', text='Notificaciones inactivas'){
      const chip = document.getElementById('notificationChip');
      const chipText = document.getElementById('notificationChipText');
      if(!chip || !chipText) return;
      chip.classList.remove('status-idle','status-on');
      chip.classList.add(mode === 'on' ? 'status-on' : 'status-idle');
      chipText.textContent = text;
    }

    function updateNotificationButtons(){
      const granted = 'Notification' in window && Notification.permission === 'granted';
      const text = granted ? 'Notificaciones activas' : 'Activar notificaciones';
      ['notifBtn','mobileNotifBtn'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = text;
      });
      document.getElementById('notificationNote').textContent = granted
        ? 'La app revisa tareas, reuniones, cobros y renovaciones para avisarte en este dispositivo.'
        : 'Activa las notificaciones para recibir avisos del sistema cuando la app detecte pendientes.';
      if(granted){
        const pendingCount = deriveAppNotifications().filter(item => item.priorityScore <= 2).length;
        setNotificationChip('on', pendingCount ? `${pendingCount} alertas activas` : 'Sin alertas urgentes');
      }else{
        setNotificationChip('idle', 'Notificaciones inactivas');
      }
    }

    function getSeenNotifications(){
      try{
        return JSON.parse(localStorage.getItem(NOTIFICATION_SEEN_KEY) || '{}');
      }catch(error){
        return {};
      }
    }

    function saveSeenNotifications(map){
      localStorage.setItem(NOTIFICATION_SEEN_KEY, JSON.stringify(map));
    }

    function normalizeTimeLabel(time){
      return time ? ` · ${time}` : '';
    }

    function deriveAppNotifications(){
      const items = [];

      derivedTaskAlerts().forEach(task => {
        let label = 'Tarea';
        let score = 4;
        if(task.alertLevel === 'overdue'){
          label = 'Tarea vencida';
          score = 0;
        }else if(task.alertLevel === 'dueToday'){
          label = 'Tarea para hoy';
          score = 1;
        }else if(task.alertLevel === 'upcoming'){
          label = 'Tarea próxima';
          score = 3;
        }
        items.push({
          id: `task:${task.id}:${task.alertLevel}:${task.date}`,
          kind: 'task',
          title: label,
          body: `${task.title} · ${clientName(task.clientId)} · ${formatDate(task.date)}`,
          previewTitle: task.title,
          previewMeta: `${clientName(task.clientId)} · ${formatDate(task.date)}`,
          badge: taskAlertBadge(task),
          priorityScore: score,
          date: task.date
        });
      });

      state.meetings
        .filter(meeting => meeting.status !== 'cancelled')
        .forEach(meeting => {
          const days = diffDays(meeting.date);
          if(days < 0 || days > 1) return;
          const isToday = days === 0;
          items.push({
            id: `meeting:${meeting.id}:${meeting.date}:${meeting.time}`,
            kind: 'meeting',
            title: isToday ? 'Reunión de hoy' : 'Reunión de mañana',
            body: `${meeting.type} · ${clientName(meeting.clientId)} · ${formatDate(meeting.date)}${normalizeTimeLabel(meeting.time)}`,
            previewTitle: `${meeting.type}${normalizeTimeLabel(meeting.time)}`,
            previewMeta: `${clientName(meeting.clientId)} · ${formatDate(meeting.date)}`,
            badge: `<span class="badge ${isToday ? 'pending' : 'neutral'}">${isToday ? 'Hoy' : 'Mañana'}</span>`,
            priorityScore: isToday ? 1 : 3,
            date: meeting.date
          });
        });

      state.receivables
        .filter(receivable => receivable.status !== 'paid')
        .forEach(receivable => {
          const days = diffDays(receivable.dueDate);
          if(days < 0 || days <= 2){
            const overdue = days < 0;
            items.push({
              id: `receivable:${receivable.id}:${receivable.dueDate}:${receivable.status}`,
              kind: 'receivable',
              title: overdue ? 'Cobro vencido' : (days === 0 ? 'Cobro para hoy' : 'Cobro próximo'),
              body: `${clientName(receivable.clientId)} · ${receivable.concept} · ${formatCurrency(receivable.amount)}`,
              previewTitle: `${receivable.concept} · ${formatCurrency(receivable.amount)}`,
              previewMeta: `${clientName(receivable.clientId)} · ${formatDate(receivable.dueDate)}`,
              badge: `<span class="badge ${overdue ? 'overdue' : (days === 0 ? 'warning' : 'pending')}">${overdue ? 'Vencido' : (days === 0 ? 'Hoy' : `${days} día${days===1?'':'s'}`)}</span>`,
              priorityScore: overdue ? 0 : (days === 0 ? 1 : 2),
              date: receivable.dueDate
            });
          }
        });

      derivedRenewals().forEach(renewal => {
        const days = diffDays(renewal.date);
        if(days < 0 || days > 7) return;
        items.push({
          id: `renewal:${renewal.saleId}:${renewal.date}`,
          kind: 'renewal',
          title: days === 0 ? 'Renovación para hoy' : 'Renovación próxima',
          body: `${renewal.serviceName} · ${clientName(renewal.clientId)} · ${formatCurrency(renewal.amount)}`,
          previewTitle: `${renewal.serviceName} · ${formatCurrency(renewal.amount)}`,
          previewMeta: `${clientName(renewal.clientId)} · ${formatDate(renewal.date)}`,
          badge: `<span class="badge ${days <= 2 ? 'warning' : 'neutral'}">${days === 0 ? 'Hoy' : `${days} día${days===1?'':'s'}`}</span>`,
          priorityScore: days === 0 ? 1 : 3,
          date: renewal.date
        });
      });

      return items.sort((a,b) => {
        if(a.priorityScore !== b.priorityScore) return a.priorityScore - b.priorityScore;
        return `${a.date}`.localeCompare(`${b.date}`);
      });
    }

    function renderNotificationPreview(){
      const container = document.getElementById('notificationPreview');
      if(!container) return;
      const items = deriveAppNotifications();
      container.innerHTML = items.length ? items.slice(0,6).map(item => `
        <div class="list-item">
          <div>
            <h4>${item.previewTitle}</h4>
            <p>${item.previewMeta}</p>
          </div>
          <div class="list-meta">${item.badge}</div>
        </div>
      `).join('') : `<div class="empty">No hay alertas ni recordatorios urgentes.</div>`;
      if('Notification' in window && Notification.permission === 'granted'){
        const urgent = items.filter(item => item.priorityScore <= 2).length;
        setNotificationChip('on', urgent ? `${urgent} alertas activas` : 'Sin alertas urgentes');
      }
    }

    async function showSystemNotification(item){
      const title = `Bro Marketing · ${item.title}`;
      const options = {
        body: item.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: item.id,
        renotify: false
      };
      try{
        if('serviceWorker' in navigator){
          const registration = await navigator.serviceWorker.ready;
          await registration.showNotification(title, options);
          return true;
        }
      }catch(error){
        console.warn('No se pudo usar el service worker para notificar:', error);
      }
      try{
        new Notification(title, options);
        return true;
      }catch(error){
        console.warn('No se pudo mostrar la notificación del sistema:', error);
        return false;
      }
    }

    async function runNotificationCheck(force=false){
      renderNotificationPreview();
      if(!('Notification' in window) || Notification.permission !== 'granted') {
        updateNotificationButtons();
        return;
      }
      const seen = getSeenNotifications();
      const nowTs = Date.now();
      const items = deriveAppNotifications().filter(item => item.priorityScore <= 2);
      for(const item of items.slice(0,4)){
        const lastShown = seen[item.id];
        if(!force && lastShown && (nowTs - lastShown) < 6 * 60 * 60 * 1000){
          continue;
        }
        const shown = await showSystemNotification(item);
        if(shown){
          seen[item.id] = nowTs;
        }
      }
      const cutoff = nowTs - (14 * 24 * 60 * 60 * 1000);
      Object.keys(seen).forEach(key => {
        if(seen[key] < cutoff) delete seen[key];
      });
      saveSeenNotifications(seen);
      updateNotificationButtons();
    }

    async function requestAppNotifications(){
      if(!('Notification' in window)){
        alert('Este navegador no soporta notificaciones web.');
        return;
      }
      try{
        const permission = await Notification.requestPermission();
        if(permission === 'granted'){
          updateNotificationButtons();
          runNotificationCheck(true);
        }else{
          updateNotificationButtons();
          alert('Las notificaciones quedaron desactivadas. Puedes activarlas luego desde el navegador.');
        }
      }catch(error){
        console.error('No se pudo solicitar permiso de notificaciones:', error);
        alert('No se pudo activar las notificaciones en este momento.');
      }
    }

    async function registerAppShell(){
      if(!('serviceWorker' in navigator)) return;
      try{
        await navigator.serviceWorker.register('./sw.js');
      }catch(error){
        console.warn('No se pudo registrar el service worker:', error);
      }
    }

    function updateInstallButtons(isAvailable=false){
      const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      const show = !installed && isAvailable;
      ['installAppBtn','mobileInstallBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if(btn) btn.style.display = show ? '' : 'none';
      });
    }

    async function triggerInstall(){
      if(deferredInstallPrompt){
        deferredInstallPrompt.prompt();
        try{ await deferredInstallPrompt.userChoice; }catch(error){}
        deferredInstallPrompt = null;
        updateInstallButtons(false);
        return;
      }
      alert('En iPhone abre el menú Compartir y luego toca “Añadir a pantalla de inicio”. En Android, usa el menú del navegador y elige “Instalar app”.');
    }

    updateReceivableStatuses();
    generateAutoTasks();
    populateGlobalViews({persist:false});
    fillSettingsForm();
    updateAuthUI();
    bindAuth();

    updateNotificationButtons();
    renderNotificationPreview();
    registerAppShell();
    if(notificationCheckTimer) clearInterval(notificationCheckTimer);
    notificationCheckTimer = setInterval(() => runNotificationCheck(false), 60000);
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible') runNotificationCheck(false);
    });
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      deferredInstallPrompt = event;
      updateInstallButtons(true);
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      updateInstallButtons(false);
    });
    document.getElementById('installAppBtn').onclick = triggerInstall;
    document.getElementById('mobileInstallBtn').onclick = triggerInstall;
    document.getElementById('notifBtn').onclick = requestAppNotifications;
    document.getElementById('mobileNotifBtn').onclick = requestAppNotifications;
    document.getElementById('refreshNotificationsBtn').onclick = () => runNotificationCheck(true);
    window.addEventListener('online', () => {
      setDbStatus('status-checking', 'Base de datos: reconectando...');
      if(currentUser){
        startUserSync();
        hydrateFromFirebase();
        pingFirebase();
        queueFirebaseSave(true);
      }
      runNotificationCheck(false);
    });
    window.addEventListener('offline', () => {
      setDbStatus('status-offline', 'Base de datos: sin internet');
    });
  