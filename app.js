// ==============================================
// ИНИЦИАЛИЗАЦИЯ FIREBASE
// ==============================================
const firebaseConfig = {
    apiKey: "AIzaSyCXisl6LQ0HgTvonZmHtUtawAmFc_UsBmg",
    authDomain: "diplom-5bd39.firebaseapp.com",
    projectId: "diplom-5bd39",
    storageBucket: "diplom-5bd39.firebasestorage.app",
    messagingSenderId: "357110267317",
    appId: "1:357110267317:web:43ffad0fe888a82190edfc",
    measurementId: "G-L1V83EFDWD"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// ==============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И КЭШИРОВАНИЕ
// ==============================================
let currentUser = null;
let currentSalon = null;
let selectedService = null;
let selectedMaster = null;
let selectedDate = null;
let selectedTime = null;
let selectedRating = 0;
let selectedMasterRating = 0;
let currentAdminMode = 'admin';
let currentMasterMode = 'master-bookings';
let editingUserId = null;
let editingMasterId = null;
let editingSalonId = null;
let editingServiceId = null;
let currentCalendarMonth = new Date();
let currentActiveMasterId = null;
let searchTimeout = null;

// Кэш для данных
const cache = {
    salons: null,
    services: null,
    masters: null,
    users: null,
    bookings: null,
    reviews: null,
    uniqueServices: null,
    serviceDetails: new Map(),
    salonServices: new Map(),
    masterServices: new Map(),
    lastFetch: 0
};

const CACHE_TTL = 5 * 60 * 1000; // 5 минут

// ==============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==============================================
function getCategoryFromSpecialization(specialization) {
    const map = {
        'Парикмахер': 'hair',
        'Барбер': 'barber',
        'Мастер маникюра': 'nails',
        'Подолог': 'nails',
        'Косметолог': 'cosmetology',
        'Визажист': 'cosmetology',
        'Бровист': 'cosmetology',
        'Лешмейкер': 'cosmetology',
        'Эстетист': 'cosmetology',
        'Массажист': 'massage'
    };
    return map[specialization] || null;
}

function getSafeImageUrl(type = 'salon', text = '') {
    return `https://via.placeholder.com/300x200?text=${encodeURIComponent(text || type)}`;
}

function renderStars(rating, maxStars = 5) {
    let starsHtml = '';
    const numericRating = parseFloat(rating) || 0;
    for (let i = 1; i <= maxStars; i++) {
        if (i <= Math.floor(numericRating)) {
            starsHtml += '<i class="fas fa-star"></i>';
        } else if (i === Math.ceil(numericRating) && numericRating % 1 !== 0) {
            starsHtml += '<i class="fas fa-star-half-alt"></i>';
        } else {
            starsHtml += '<i class="far fa-star"></i>';
        }
    }
    return starsHtml;
}

function getCategoryName(category) {
    const categories = {
        'hair': 'Парикмахерские услуги',
        'nails': 'Ногтевой сервис',
        'cosmetology': 'Косметология',
        'massage': 'Массаж',
        'barber': 'Барбершоп'
    };
    return categories[category] || category;
}

function getRoleName(role) {
    const roles = {
        'admin': 'Администратор',
        'master': 'Мастер',
        'client': 'Клиент'
    };
    return roles[role] || role;
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = dateString.toDate ? dateString.toDate() : new Date(dateString);
        if (isNaN(date.getTime())) return 'Некорректная дата';
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        return 'Некорректная дата';
    }
}

function formatDateTime(dateString) {
    if (!dateString) return '';
    try {
        const date = dateString.toDate ? dateString.toDate() : new Date(dateString);
        if (isNaN(date.getTime())) return 'Некорректная дата';
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'Некорректная дата';
    }
}

function showNotification(message, type = 'success') {
    const notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    if (type === 'info') icon = 'info-circle';

    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;

    notificationContainer.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('hiding');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 500);
    }, 3000);
}

// ==============================================
// ФУНКЦИИ ДЛЯ ПОДДЕРЖКИ ПРЯМЫХ ССЫЛОК
// ==============================================
function parseHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return { page: 'home' };
    
    if (hash.startsWith('service/')) {
        const serviceName = decodeURIComponent(hash.substring(8));
        return { page: 'service', serviceName };
    }
    
    const parts = hash.split('?');
    const page = parts[0];
    const params = new URLSearchParams(parts[1] || '');
    return { page, params };
}

// Исправленная функция parseHash
function parseHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return { page: 'home', params: new URLSearchParams() };
    
    if (hash.startsWith('service/')) {
        const serviceName = decodeURIComponent(hash.substring(8));
        return { page: 'service', serviceName, params: new URLSearchParams() };
    }
    
    const parts = hash.split('?');
    const page = parts[0];
    const params = new URLSearchParams(parts[1] || ''); // Гарантируем создание объекта
    
    return { page, params };
}

//  функция showPageFromHash
function showPageFromHash() {
    const { page, params, serviceName } = parseHash();
    
    if (page === 'service' && serviceName) {
        showServicePage(serviceName);
        return;
    }
    
    if (!page) {
        showPage('home-page');
        return;
    }
    
    const pageId = page + '-page';
    if (document.getElementById(pageId)) {
        // ДОБАВЛЕНА ПРОВЕРКА на существование params
        if (params && params.has('id')) {
            const id = params.get('id');
            if (page === 'master') {
                loadMasterPage(id).then(() => showPage('master-page'));
                return;
            } else if (page === 'salon') {
                loadSalonPage(id).then(() => showPage('salon-page'));
                return;
            }
        }
        showPage(pageId);
    } else {
        showPage('home-page');
    }
}
// ==============================================
// ФУНКЦИЯ showPage
// ==============================================
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.add('active');
        window.scrollTo(0, 0);
        
        const basePage = pageId.replace('-page', '');
        history.pushState({ page: pageId }, '', `#${basePage}`);
        
        setTimeout(() => {
            switch (pageId) {
                case 'home-page':
                    loadHomePage();
                    break;
                case 'salons-page':
                    loadAllSalons();
                    break;
                case 'services-page':
                    loadAllServices();
                    break;
                case 'masters-page':
                    loadAllMasters();
                    break;
                case 'salon-page':
                    if (currentSalon) loadSalonPage(currentSalon.id);
                    break;
                case 'master-page':
                    if (selectedMaster) loadMasterPage(selectedMaster.id);
                    break;
                case 'service-page':
                    break;
                case 'admin-page':
                    setupAdminPage();
                    break;
                case 'profile-page':
                    loadUserBookings();
                    break;
                case 'master-schedule-page':
                    loadMasterSchedulePage();
                    break;
            }
        }, 10);
    }
}

// ==============================================
// ФУНКЦИИ РАБОТЫ С МОДАЛЬНЫМИ ОКНАМИ
// ==============================================
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function clearModalFields(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="tel"], input[type="number"], textarea').forEach(field => {
            field.value = '';
        });
        modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        modal.querySelectorAll('select').forEach(select => select.selectedIndex = 0);
        modal.querySelectorAll('.image-preview').forEach(preview => preview.innerHTML = '');
    }
}

// ==============================================
// ЗАГРУЗКА ИЗОБРАЖЕНИЙ В STORAGE
// ==============================================
async function uploadImage(file, folder) {
    if (!file) return null;

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        showNotification('Файл слишком большой. Максимальный размер 5 МБ.', 'error');
        return null;
    }

    const storageRef = storage.ref();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const fileName = `${Date.now()}_${safeFileName}`;
    const fileRef = storageRef.child(`${folder}/${fileName}`);

    try {
        await fileRef.put(file);
        const downloadUrl = await fileRef.getDownloadURL();
        return downloadUrl;
    } catch (error) {
        console.error('Ошибка загрузки изображения:', error);
        showNotification('Ошибка загрузки изображения. Проверьте соединение.', 'error');
        return null;
    }
}

// ==============================================
// ОПТИМИЗИРОВАННЫЕ ФУНКЦИИ ПОЛУЧЕНИЯ ДАННЫХ
// ==============================================
async function getCachedData(collection, force = false) {
    const now = Date.now();
    
    if (!force && cache[collection] && (now - cache.lastFetch) < CACHE_TTL) {
        return cache[collection];
    }
    
    try {
        const snapshot = await db.collection(collection).get();
        const data = [];
        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });
        
        cache[collection] = data;
        cache.lastFetch = now;
        return data;
    } catch (error) {
        console.error(`Ошибка загрузки ${collection}:`, error);
        return cache[collection] || [];
    }
}

function clearCache() {
    cache.salons = null;
    cache.services = null;
    cache.masters = null;
    cache.users = null;
    cache.bookings = null;
    cache.reviews = null;
    cache.uniqueServices = null;
    cache.serviceDetails.clear();
    cache.salonServices.clear();
    cache.masterServices.clear();
    cache.lastFetch = 0;
}

// ==============================================
// ФУНКЦИИ ДЛЯ УНИКАЛЬНЫХ УСЛУГ
// ==============================================
async function getUniqueServices(force = false) {
    if (!force && cache.uniqueServices) {
        return cache.uniqueServices;
    }
    
    try {
        const services = await getCachedData('services', force);
        const serviceMap = new Map();
        
        services.forEach(service => {
            const key = service.name.toLowerCase().trim();
            if (serviceMap.has(key)) {
                const existing = serviceMap.get(key);
                if (service.salonId && !existing.salonIds.includes(service.salonId)) {
                    existing.salonIds.push(service.salonId);
                }
                if (!existing.imageUrl && service.imageUrl) {
                    existing.imageUrl = service.imageUrl;
                }
                existing.serviceIds.push(service.id);
            } else {
                serviceMap.set(key, {
                    ...service,
                    salonIds: service.salonId ? [service.salonId] : [],
                    serviceIds: [service.id]
                });
            }
        });
        
        cache.uniqueServices = Array.from(serviceMap.values());
        return cache.uniqueServices;
    } catch (error) {
        console.error('Ошибка загрузки уникальных услуг:', error);
        return [];
    }
}

async function getServiceDetails(serviceName) {
    const cacheKey = serviceName.toLowerCase().trim();
    
    if (cache.serviceDetails.has(cacheKey)) {
        return cache.serviceDetails.get(cacheKey);
    }
    
    try {
        const services = await getCachedData('services');
        const masters = await getCachedData('masters');
        const salons = await getCachedData('salons');
        
        const serviceInstances = services.filter(s => 
            s.name.toLowerCase().trim() === cacheKey
        );
        
        if (serviceInstances.length === 0) return null;
        
        const serviceIds = serviceInstances.map(s => s.id);
        const salonIds = [...new Set(serviceInstances.map(s => s.salonId).filter(Boolean))];
        
        const serviceSalons = salons.filter(s => salonIds.includes(s.id));
        const serviceMasters = masters.filter(m => 
            m.providedServices && m.providedServices.some(id => serviceIds.includes(id))
        );
        
        const result = {
            ...serviceInstances[0],
            serviceIds,
            salons: serviceSalons,
            masters: serviceMasters,
            allSalonIds: salonIds
        };
        
        cache.serviceDetails.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Ошибка загрузки деталей услуги:', error);
        return null;
    }
}

async function getSalonServices(salonId) {
    if (cache.salonServices.has(salonId)) {
        return cache.salonServices.get(salonId);
    }
    
    try {
        const salon = await db.collection('salons').doc(salonId).get();
        if (!salon.exists) return [];
        
        const serviceIds = salon.data().serviceIds || [];
        if (serviceIds.length === 0) return [];
        
        const services = await getCachedData('services');
        const salonServices = services.filter(s => serviceIds.includes(s.id));
        
        cache.salonServices.set(salonId, salonServices);
        return salonServices;
    } catch (error) {
        console.error('Ошибка загрузки услуг салона:', error);
        return [];
    }
}

async function getSalons(filters = {}) {
    let salons = await getCachedData('salons');
    
    if (filters.rating && filters.rating !== 'all') {
        const minRating = parseFloat(filters.rating);
        salons = salons.filter(salon => (parseFloat(salon.rating) || 0) >= minRating);
    }
    
    if (filters.specialization && filters.specialization !== 'all') {
        salons = salons.filter(salon => (salon.specializations || []).includes(filters.specialization));
    }
    
    if (filters.searchTerm) {
        const searchTermLower = filters.searchTerm.toLowerCase();
        salons = salons.filter(salon =>
            (salon.name || '').toLowerCase().includes(searchTermLower) ||
            (salon.address || '').toLowerCase().includes(searchTermLower)
        );
    }
    
    return salons;
}

async function getMasters(filters = {}) {
    let masters = await getCachedData('masters');
    
    if (filters.salonId) {
        masters = masters.filter(m => m.salonId === filters.salonId);
    }
    if (filters.specialization) {
        masters = masters.filter(m => m.specialization === filters.specialization);
    }
    if (filters.userId) {
        masters = masters.filter(m => m.userId === filters.userId);
    }
    
    return masters;
}

async function getUsers() {
    return getCachedData('users');
}

async function getBookings(filters = {}) {
    let bookings = await getCachedData('bookings');
    
    if (filters.userId) {
        bookings = bookings.filter(b => b.userId === filters.userId);
    }
    if (filters.masterId) {
        bookings = bookings.filter(b => b.masterId === filters.masterId);
    }
    if (filters.status) {
        bookings = bookings.filter(b => b.status === filters.status);
    }
    if (filters.date) {
        bookings = bookings.filter(b => b.date === filters.date);
    }
    
    return bookings;
}

async function getReviews(filters = {}) {
    let reviews = await getCachedData('reviews');
    
    if (filters.salonId) {
        reviews = reviews.filter(r => r.salonId === filters.salonId);
    }
    
    return reviews;
}

async function getMasterReviews(masterId) {
    try {
        const snapshot = await db.collection('master_reviews').where('masterId', '==', masterId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Ошибка загрузки отзывов мастера:', error);
        return [];
    }
}

async function logAction(actionType, objectType, objectId, details = {}, objectName = '') {
    try {
        if (!currentUser || !db) return;
        
        const action = {
            userId: currentUser.id,
            userName: currentUser.name || currentUser.email,
            userRole: currentUser.role || 'client',
            actionType: actionType,
            objectType: objectType,
            objectId: objectId,
            objectName: objectName || objectId,
            details: details,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'completed'
        };
        
        await db.collection('actions_history').add(action);
    } catch (error) {
        console.error('Ошибка записи действия:', error);
    }
}

async function getActionsHistory(filters = {}) {
    try {
        let query = db.collection('actions_history').orderBy('timestamp', 'desc').limit(100);
        
        if (filters.userId) query = query.where('userId', '==', filters.userId);
        if (filters.userType && filters.userType !== 'all') query = query.where('userRole', '==', filters.userType);
        if (filters.actionType && filters.actionType !== 'all') query = query.where('actionType', '==', filters.actionType);
        
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        return [];
    }
}

// ==============================================
// АВТОРИЗАЦИЯ
// ==============================================
async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) {
        showNotification('Пожалуйста, заполните все поля', 'error');
        return;
    }

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            currentUser = { id: user.uid, email: user.email, ...userDoc.data() };
            localStorage.setItem('beautyBookingUser', JSON.stringify(currentUser));

            updateProfileButton();
            hideModal('profile-modal');
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            showNotification('Вы успешно вошли в систему');

            const activePage = document.querySelector('.page.active').id;
            showPage(activePage);
        } else {
            showNotification('Пользователь не найден', 'error');
            await auth.signOut();
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        showNotification('Ошибка входа. Проверьте email и пароль.', 'error');
    }
}

async function register() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const passwordConfirm = document.getElementById('register-password-confirm').value.trim();
    const name = document.getElementById('register-name').value.trim();
    const lastname = document.getElementById('register-lastname').value.trim();
    const phone = document.getElementById('register-phone').value.trim();

    if (!email || !password || !passwordConfirm || !name) {
        showNotification('Пожалуйста, заполните обязательные поля', 'error');
        return;
    }

    if (password.length < 6) {
        showNotification('Пароль должен содержать минимум 6 символов', 'error');
        return;
    }

    if (password !== passwordConfirm) {
        showNotification('Пароли не совпадают', 'error');
        return;
    }

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        const userData = {
            email: email,
            name: name,
            lastname: lastname || '',
            phone: phone || '',
            role: 'client',
            registrationDate: firebase.firestore.FieldValue.serverTimestamp(),
            bookings: []
        };

        await db.collection('users').doc(user.uid).set(userData);

        currentUser = { id: user.uid, ...userData };
        localStorage.setItem('beautyBookingUser', JSON.stringify(currentUser));

        await logAction('create', 'user', user.uid, {}, `${name} ${lastname}`);

        updateProfileButton();
        hideModal('profile-modal');
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-password-confirm').value = '';
        document.getElementById('register-name').value = '';
        document.getElementById('register-lastname').value = '';
        document.getElementById('register-phone').value = '';
        showNotification('Регистрация прошла успешно!');
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        if (error.code === 'auth/email-already-in-use') {
            showNotification('Пользователь с таким email уже зарегистрирован', 'error');
        } else {
            showNotification('Ошибка регистрации', 'error');
        }
    }
}

function updateProfileButton() {
    const profileBtn = document.getElementById('profile-modal-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (currentUser) {
        const displayName = currentUser.name || currentUser.email.split('@')[0];
        if (profileBtn) {
            profileBtn.innerHTML = `<i class="fas fa-user"></i><span>${displayName}</span>`;
            profileBtn.style.display = 'none';
        }
        if (logoutBtn) logoutBtn.style.display = 'flex';
        setupUserNavigation();
    } else {
        if (profileBtn) {
            profileBtn.innerHTML = '<i class="fas fa-user"></i><span>Войти</span>';
            profileBtn.style.display = 'flex';
        }
        if (logoutBtn) logoutBtn.style.display = 'none';
        setupGuestNavigation();
    }
}

function setupUserNavigation() {
    const profileNavItem = document.getElementById('profile-nav-item');
    const adminNavItem = document.getElementById('admin-nav-item');
    const masterNavItem = document.getElementById('master-nav-item');
    const masterWorkSchedule = document.getElementById('master-work-schedule');

    if (profileNavItem) profileNavItem.style.display = (currentUser?.role === 'client') ? 'block' : 'none';
    if (adminNavItem) adminNavItem.style.display = (currentUser?.role === 'admin') ? 'block' : 'none';
    if (masterNavItem) masterNavItem.style.display = (currentUser?.role === 'master') ? 'block' : 'none';
    if (masterWorkSchedule) masterWorkSchedule.style.display = (currentUser?.role === 'master') ? 'block' : 'none';
}

function setupGuestNavigation() {
    const profileNavItem = document.getElementById('profile-nav-item');
    const adminNavItem = document.getElementById('admin-nav-item');
    const masterNavItem = document.getElementById('master-nav-item');
    const masterWorkSchedule = document.getElementById('master-work-schedule');

    if (profileNavItem) profileNavItem.style.display = 'block';
    if (adminNavItem) adminNavItem.style.display = 'none';
    if (masterNavItem) masterNavItem.style.display = 'none';
    if (masterWorkSchedule) masterWorkSchedule.style.display = 'none';
}

async function logout() {
    try {
        await auth.signOut();
        currentUser = null;
        localStorage.removeItem('beautyBookingUser');

        updateProfileButton();
        showNotification('Вы успешно вышли из системы');

        if (document.getElementById('admin-page').classList.contains('active') ||
            document.getElementById('profile-page').classList.contains('active') ||
            document.getElementById('master-schedule-page').classList.contains('active')) {
            showPage('home-page');
        }
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

// ==============================================
// ЗАГРУЗКА ГЛАВНОЙ СТРАНИЦЫ
// ==============================================
async function loadHomePage() {
    const container = document.getElementById('salons-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const salons = await getCachedData('salons');
        const reviews = await getCachedData('reviews');
        
        const recommended = [...salons].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3);
        const recContainer = document.getElementById('recommendations-container');
        if (recContainer) {
            recContainer.innerHTML = '';
            recommended.forEach(salon => recContainer.appendChild(createSalonCard(salon)));
        }
        
        container.innerHTML = '';
        if (salons.length === 0) {
            container.innerHTML = '<p class="no-results">Салоны не найдены</p>';
        } else {
            salons.forEach(salon => container.appendChild(createSalonCard(salon)));
        }
        
        loadReviews(reviews.slice(0, 3));
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки данных</p>';
    }
}

async function loadAllSalons() {
    const container = document.getElementById('all-salons-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const salons = await getCachedData('salons');
        container.innerHTML = '';
        if (salons.length === 0) {
            container.innerHTML = '<p class="no-results">Салоны не найдены</p>';
        } else {
            salons.forEach(salon => container.appendChild(createSalonCard(salon)));
        }
    } catch (error) {
        console.error('Ошибка загрузки салонов:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки</p>';
    }
}

async function loadAllServices() {
    const container = document.getElementById('all-services-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const uniqueServices = await getUniqueServices();
        container.innerHTML = '';
        if (uniqueServices.length === 0) {
            container.innerHTML = '<p class="no-results">Услуги не найдены</p>';
        } else {
            uniqueServices.forEach(service => {
                container.appendChild(createServiceCard(service, true));
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки услуг:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки</p>';
    }
}

async function loadAllMasters() {
    const container = document.getElementById('all-masters-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const masters = await getCachedData('masters');
        const salons = await getCachedData('salons');
        const salonMap = Object.fromEntries(salons.map(s => [s.id, s.name]));
        
        container.innerHTML = '';
        if (masters.length === 0) {
            container.innerHTML = '<p class="no-results">Мастера не найдены</p>';
        } else {
            masters.forEach(master => {
                master.salonName = salonMap[master.salonId] || 'Неизвестный салон';
                container.appendChild(createMasterCard(master));
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки мастеров:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки</p>';
    }
}

async function loadReviews(reviews) {
    const container = document.getElementById('reviews-list');
    if (!container) return;

    if (!reviews || reviews.length === 0) {
        container.innerHTML = '<p class="no-results">Отзывов пока нет</p>';
        return;
    }

    container.innerHTML = '';
    
    const salons = await getCachedData('salons');
    const salonMap = Object.fromEntries(salons.map(s => [s.id, s.name]));

    reviews.forEach(review => {
        const reviewItem = document.createElement('div');
        reviewItem.className = 'review-item';
        
        reviewItem.innerHTML = `
            <div class="review-header">
                <img src="${review.authorImage || getSafeImageUrl('avatar', review.authorName)}" alt="${review.authorName}" class="review-author-img">
                <div>
                    <div class="review-author">${review.authorName || 'Аноним'}</div>
                    <div class="review-date">${formatDate(review.date)}</div>
                </div>
            </div>
            <div class="review-rating-stars">${renderStars(review.rating || 0)}</div>
            <p style="color: var(--text-light); margin-bottom: 10px;"><i class="fas fa-store"></i> ${salonMap[review.salonId] || 'Неизвестный салон'}</p>
            ${review.text ? `<div class="review-text">${review.text}</div>` : ''}
        `;
        
        container.appendChild(reviewItem);
    });
}

async function loadSalonsWithFilters() {
    const container = document.getElementById('salons-container');
    const searchInput = document.getElementById('global-search');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    const ratingFilter = document.getElementById('filter-rating')?.value || 'all';
    const specializationFilter = document.getElementById('filter-specialization')?.value || 'all';
    
    const filters = {};
    if (ratingFilter !== 'all') filters.rating = ratingFilter;
    if (specializationFilter !== 'all') filters.specialization = specializationFilter;
    if (searchTerm) filters.searchTerm = searchTerm;
    
    const salons = await getSalons(filters);
    
    const recommendationsContainer = document.getElementById('recommendations-container');
    const recommendationsSection = document.querySelector('.recommendations-section');
    
    if (searchTerm) {
        if (recommendationsContainer) recommendationsContainer.style.display = 'none';
        if (recommendationsSection) recommendationsSection.style.display = 'none';
        
        const sectionTitle = document.querySelector('.main-salons-section .section-title');
        if (sectionTitle) sectionTitle.textContent = 'Результаты поиска';
    } else {
        if (recommendationsContainer) recommendationsContainer.style.display = 'block';
        if (recommendationsSection) recommendationsSection.style.display = 'block';
        
        const sectionTitle = document.querySelector('.main-salons-section .section-title');
        if (sectionTitle) sectionTitle.textContent = 'Все салоны';
    }
    
    if (salons.length === 0) {
        container.innerHTML = '<p class="no-results">По вашему запросу ничего не найдено</p>';
        return;
    }
    
    container.innerHTML = '';
    salons.forEach(salon => container.appendChild(createSalonCard(salon)));
}

async function performSearch() {
    loadSalonsWithFilters();
}

async function applyFilters() {
    loadSalonsWithFilters();
}

// ==============================================
// СОЗДАНИЕ КАРТОЧЕК
// ==============================================
function createSalonCard(salon) {
    const card = document.createElement('div');
    card.className = 'salon-card';
    card.dataset.salonId = salon.id;
    
    const imageUrl = salon.imageUrl || getSafeImageUrl('salon', salon.name);
    const rating = salon.rating || 0;
    
    card.innerHTML = `
        <img src="${imageUrl}" alt="${salon.name}" class="salon-img" loading="lazy">
        <div class="salon-info">
            <h3 class="salon-name">${salon.name}</h3>
            <p class="salon-address"><i class="fas fa-map-marker-alt"></i> ${salon.address || 'Адрес не указан'}</p>
            <div class="salon-rating">
                ${renderStars(rating)}
                <span class="rating-value">${rating.toFixed(1)}</span>
                <span class="rating-count">(${salon.reviewCount || 0})</span>
            </div>
            <div class="salon-price">Средний чек: ${salon.averagePrice || 2500} ₽</div>
            ${currentUser && currentUser.role === 'client' ? `
            <div class="salon-actions">
                <button class="btn btn-primary book-salon-btn" data-salon-id="${salon.id}">
                    <i class="fas fa-calendar-check"></i> Записаться
                </button>
            </div>
            ` : ''}
        </div>
    `;
    
    card.addEventListener('click', function(e) {
        if (!e.target.closest('button')) {
            loadSalonPage(salon.id);
        }
    });
    
    const bookBtn = card.querySelector('.book-salon-btn');
    if (bookBtn) {
        bookBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startBookingForSalon(salon.id);
        });
    }
    
    return card;
}

function createServiceCard(service, compact = false) {
    const card = document.createElement('div');
    card.className = 'service-card';
    card.dataset.serviceName = service.name;
    
    const imageUrl = service.imageUrl || getSafeImageUrl('service', service.name);
    
    if (compact) {
        card.innerHTML = `
            <img src="${imageUrl}" alt="${service.name}" class="service-img" loading="lazy">
            <div class="service-info">
                <h3 class="service-name">${service.name}</h3>
                <p class="service-category">${getCategoryName(service.category)}</p>
                <p class="service-price">${service.price} ₽</p>
            </div>
        `;
    } else {
        card.innerHTML = `
            <img src="${imageUrl}" alt="${service.name}" class="service-img" loading="lazy">
            <div class="service-info">
                <h3 class="service-name">${service.name}</h3>
                <p class="service-category">${getCategoryName(service.category)}</p>
                <p class="service-price">${service.price} ₽</p>
                <p class="service-duration">Длительность: ${service.duration || 60} мин</p>
            </div>
        `;
    }
    
    card.addEventListener('click', () => showServicePage(service.name));
    return card;
}

function createMasterCard(master) {
    const card = document.createElement('div');
    card.className = 'master-card';
    card.dataset.masterId = master.id;
    
    const imageUrl = master.imageUrl || getSafeImageUrl('master', master.name);
    
    card.innerHTML = `
        <img src="${imageUrl}" alt="${master.name}" class="master-img" loading="lazy">
        <div class="master-info">
            <h3 class="master-name">${master.name}</h3>
            <p class="master-specialization">${master.specialization || 'Не указано'}</p>
            <div class="salon-rating">
                ${renderStars(master.rating || 0)}
                <span class="rating-value">${(parseFloat(master.rating) || 0).toFixed(1)}</span>
            </div>
            <p style="color: var(--text-light); font-size: 14px; margin-bottom: 10px;">
                <i class="fas fa-store"></i> ${master.salonName || 'Неизвестный салон'}
            </p>
            <p class="master-price">${master.price || 0} ₽</p>
            ${currentUser && currentUser.role === 'client' ? `
            <button class="btn btn-primary book-master-btn" data-master-id="${master.id}">
                <i class="fas fa-calendar-check"></i> Записаться
            </button>
            ` : ''}
        </div>
    `;
    
    card.addEventListener('click', function(e) {
        if (!e.target.closest('button')) {
            loadMasterPage(master.id);
        }
    });
    
    const bookBtn = card.querySelector('.book-master-btn');
    if (bookBtn) {
        bookBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startBookingForMaster(master.id);
        });
    }
    
    return card;
}

// ==============================================
// СТРАНИЦА САЛОНА (ИСПРАВЛЕНО)
// ==============================================
async function loadSalonPage(salonId) {
    showPage('salon-page');
    
    const nameEl = document.getElementById('salon-page-name');
    const addressEl = document.getElementById('salon-address-text');
    const descEl = document.getElementById('salon-page-description');
    const imageEl = document.getElementById('salon-main-image');
    const ratingEl = document.getElementById('salon-rating');
    const tagsEl = document.getElementById('salon-tags');
    const servicesEl = document.getElementById('services-container');
    const mastersEl = document.getElementById('masters-container');
    const reviewsEl = document.getElementById('salon-reviews-list');
    const actionsEl = document.getElementById('salon-actions');
    
    servicesEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка услуг...</div>';
    mastersEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка мастеров...</div>';
    reviewsEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка отзывов...</div>';
    
    try {
        const salonDoc = await db.collection('salons').doc(salonId).get();
        if (!salonDoc.exists) {
            showNotification('Салон не найден', 'error');
            showPage('salons-page');
            return;
        }
        
        const salon = { id: salonDoc.id, ...salonDoc.data() };
        currentSalon = salon;
        
        nameEl.textContent = salon.name;
        addressEl.textContent = salon.address || 'Адрес не указан';
        descEl.textContent = salon.description || 'Премиальный салон красоты';
        imageEl.src = salon.imageUrl || getSafeImageUrl('salon', salon.name);
        ratingEl.textContent = (salon.rating || 0).toFixed(1);
        
        tagsEl.innerHTML = '';
        (salon.specializations || []).forEach(spec => {
            const tag = document.createElement('span');
            tag.className = 'salon-tag';
            tag.textContent = getCategoryName(spec);
            tagsEl.appendChild(tag);
        });
        
        actionsEl.innerHTML = '';
        if (currentUser && currentUser.role === 'client') {
            actionsEl.innerHTML = `
                <button class="btn btn-primary" id="book-this-salon">
                    <i class="fas fa-calendar-check"></i> Записаться
                </button>
            `;
            document.getElementById('book-this-salon').addEventListener('click', () => startBookingProcess());
        }
        
        try {
            const services = await getSalonServices(salonId);
            servicesEl.innerHTML = '';
            if (services.length === 0) {
                servicesEl.innerHTML = '<p class="no-results">Услуги не найдены</p>';
            } else {
                services.forEach(service => {
                    const card = createServiceCard(service);
                    card.addEventListener('click', () => {
                        currentSalon = salon;
                        startBookingProcess();
                    });
                    servicesEl.appendChild(card);
                });
            }
        } catch (error) {
            console.error('Ошибка загрузки услуг салона:', error);
            servicesEl.innerHTML = '<p class="no-results">Ошибка загрузки услуг</p>';
        }
        
        try {
            const masters = await getMasters({ salonId });
            mastersEl.innerHTML = '';
            if (masters.length === 0) {
                mastersEl.innerHTML = '<p class="no-results">Мастера не найдены</p>';
            } else {
                masters.forEach(master => {
                    master.salonName = salon.name;
                    mastersEl.appendChild(createMasterCard(master));
                });
            }
        } catch (error) {
            console.error('Ошибка загрузки мастеров салона:', error);
            mastersEl.innerHTML = '<p class="no-results">Ошибка загрузки мастеров</p>';
        }
        
        try {
            const reviews = await getReviews({ salonId });
            reviewsEl.innerHTML = '';
            if (reviews.length === 0) {
                reviewsEl.innerHTML = '<div class="no-results">Отзывов пока нет</div>';
            } else {
                reviews.forEach(review => {
                    const reviewItem = document.createElement('div');
                    reviewItem.className = 'review-item';
                    reviewItem.innerHTML = `
                        <div class="review-header">
                            <img src="${review.authorImage || getSafeImageUrl('avatar', review.authorName)}" class="review-author-img">
                            <div>
                                <div class="review-author">${review.authorName || 'Аноним'}</div>
                                <div class="review-date">${formatDate(review.date)}</div>
                            </div>
                        </div>
                        <div class="review-rating-stars">${renderStars(review.rating || 0)}</div>
                        ${review.text ? `<div class="review-text">${review.text}</div>` : ''}
                    `;
                    reviewsEl.appendChild(reviewItem);
                });
            }
        } catch (error) {
            console.error('Ошибка загрузки отзывов:', error);
            reviewsEl.innerHTML = '<p class="no-results">Ошибка загрузки отзывов</p>';
        }
        
        selectedRating = 0;
        updateRatingDisplay();
    } catch (error) {
        console.error('Ошибка загрузки салона:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

// ==============================================
// СТРАНИЦА МАСТЕРА (ИСПРАВЛЕНО)
// ==============================================
async function loadMasterPage(masterId) {
    showPage('master-page');
    
    const nameEl = document.getElementById('master-page-name');
    const specEl = document.getElementById('master-page-specialization');
    const imageEl = document.getElementById('master-main-image');
    const ratingEl = document.getElementById('master-rating');
    const salonEl = document.getElementById('master-salon-text');
    const servicesEl = document.getElementById('master-services-container');
    const reviewsEl = document.getElementById('master-reviews-list');
    const actionsEl = document.getElementById('master-actions');
    const tagsEl = document.getElementById('master-tags');
    const descEl = document.getElementById('master-page-description');
    
    servicesEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка услуг...</div>';
    reviewsEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка отзывов...</div>';
    
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (!masterDoc.exists) {
            showNotification('Мастер не найден', 'error');
            showPage('masters-page');
            return;
        }
        
        const master = { id: masterDoc.id, ...masterDoc.data() };
        selectedMaster = master;
        
        let salonName = 'Неизвестный салон';
        if (master.salonId) {
            const salonDoc = await db.collection('salons').doc(master.salonId).get();
            if (salonDoc.exists) salonName = salonDoc.data().name;
        }
        
        nameEl.textContent = master.name || 'Имя не указано';
        specEl.textContent = master.specialization || 'Специализация не указана';
        imageEl.src = master.imageUrl || getSafeImageUrl('master', master.name);
        ratingEl.textContent = (parseFloat(master.rating) || 0).toFixed(1);
        salonEl.textContent = salonName;
        descEl.textContent = master.description || `Опытный мастер салона "${salonName}". Специализируется на ${master.specialization || 'различных услугах'}.`;
        
        tagsEl.innerHTML = '';
        if (master.specialization) {
            const tag = document.createElement('span');
            tag.className = 'master-tag';
            tag.textContent = master.specialization;
            tagsEl.appendChild(tag);
        }
        
        actionsEl.innerHTML = '';
        if (currentUser && currentUser.role === 'client') {
            const bookBtn = document.createElement('button');
            bookBtn.className = 'btn btn-primary';
            bookBtn.id = 'book-this-master';
            bookBtn.innerHTML = '<i class="fas fa-calendar-check"></i> Записаться';
            bookBtn.addEventListener('click', () => startBookingForMaster(master.id));
            actionsEl.appendChild(bookBtn);
        }
        
        await loadMasterServices(master, servicesEl);
        await loadMasterReviews(master.id, reviewsEl);
        
        selectedMasterRating = 0;
        updateMasterRatingDisplay();
        
    } catch (error) {
        console.error('Ошибка загрузки мастера:', error);
        servicesEl.innerHTML = '<p class="no-results">Ошибка загрузки услуг</p>';
        reviewsEl.innerHTML = '<p class="no-results">Ошибка загрузки отзывов</p>';
        showNotification('Ошибка загрузки данных', 'error');
    }
}

async function loadMasterServices(master, container) {
    try {
        if (!master.salonId) {
            container.innerHTML = '<p class="no-results">Мастер не привязан к салону</p>';
            return;
        }
        
        const salonServices = await getSalonServices(master.salonId);
        const providedServiceIds = master.providedServices || [];
        
        if (providedServiceIds.length === 0) {
            container.innerHTML = '<p class="no-results">У мастера нет услуг</p>';
            return;
        }
        
        const masterServices = salonServices.filter(s => providedServiceIds.includes(s.id));
        
        container.innerHTML = '';
        if (masterServices.length === 0) {
            container.innerHTML = '<p class="no-results">Услуги не найдены</p>';
        } else {
            masterServices.forEach(service => {
                container.appendChild(createServiceCard(service));
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки услуг мастера:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки услуг</p>';
    }
}

async function loadMasterReviews(masterId, container) {
    try {
        const reviews = await getMasterReviews(masterId);
        
        container.innerHTML = '';
        if (reviews.length === 0) {
            container.innerHTML = '<div class="no-results">Отзывов пока нет</div>';
        } else {
            reviews.forEach(review => {
                const reviewItem = document.createElement('div');
                reviewItem.className = 'review-item';
                reviewItem.innerHTML = `
                    <div class="review-header">
                        <img src="${review.authorImage || getSafeImageUrl('avatar', review.authorName)}" class="review-author-img">
                        <div>
                            <div class="review-author">${review.authorName || 'Аноним'}</div>
                            <div class="review-date">${formatDate(review.date)}</div>
                        </div>
                    </div>
                    <div class="review-rating-stars">${renderStars(review.rating || 0)}</div>
                    ${review.text ? `<div class="review-text">${review.text}</div>` : ''}
                `;
                container.appendChild(reviewItem);
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки отзывов:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки отзывов</p>';
    }
}

// ==============================================
// СТРАНИЦА УСЛУГИ
// ==============================================
async function showServicePage(serviceName) {
    showPage('service-page');
    
    const nameEl = document.getElementById('service-page-name');
    const categoryEl = document.getElementById('service-page-category');
    const priceEl = document.getElementById('service-page-price');
    const durationEl = document.getElementById('service-page-duration');
    const imageEl = document.getElementById('service-main-image');
    const salonsEl = document.getElementById('service-salons-container');
    const mastersEl = document.getElementById('service-masters-container');
    const actionsEl = document.getElementById('service-actions');
    
    salonsEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    mastersEl.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    history.pushState({}, '', `#service/${encodeURIComponent(serviceName)}`);
    
    try {
        const details = await getServiceDetails(serviceName);
        
        if (!details) {
            showNotification('Услуга не найдена', 'error');
            showPage('services-page');
            return;
        }
        
        nameEl.textContent = details.name;
        categoryEl.textContent = getCategoryName(details.category);
        priceEl.textContent = `${details.price} ₽`;
        durationEl.textContent = `Длительность: ${details.duration || 60} мин`;
        imageEl.src = details.imageUrl || getSafeImageUrl('service', details.name);
        
        selectedService = details;
        
        actionsEl.innerHTML = '';
        if (currentUser && currentUser.role === 'client') {
            actionsEl.innerHTML = `
                <button class="btn btn-primary" onclick="showNotification('Выберите салон из списка', 'info')">
                    <i class="fas fa-calendar-check"></i> Записаться
                </button>
            `;
        }
        
        salonsEl.innerHTML = '';
        if (details.salons.length === 0) {
            salonsEl.innerHTML = '<p class="no-results">Салоны не найдены</p>';
        } else {
            details.salons.forEach(salon => {
                const card = createSalonCard(salon);
                card.addEventListener('click', (e) => {
                    if (!e.target.closest('button')) {
                        currentSalon = salon;
                        startBookingProcess();
                    }
                });
                salonsEl.appendChild(card);
            });
        }
        
        mastersEl.innerHTML = '';
        if (details.masters.length === 0) {
            mastersEl.innerHTML = '<p class="no-results">Мастера не найдены</p>';
        } else {
            details.masters.forEach(master => {
                mastersEl.appendChild(createMasterCard(master));
            });
        }
    } catch (error) {
        console.error('Ошибка загрузки услуги:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

// ==============================================
// АДМИН-ПАНЕЛЬ
// ==============================================
function setupAdminPage() {
    if (!currentUser) {
        document.getElementById('admin-page').innerHTML = `
            <div class="container">
                <h1 class="page-title">Доступ запрещен</h1>
                <p>Только администраторы и мастера могут просматривать эту страницу.</p>
            </div>
        `;
        return;
    }
    
    const isAdmin = currentUser.role === 'admin';
    const isMaster = currentUser.role === 'master';
    
    document.getElementById('admin-page-title').textContent = isAdmin ? 'Админ-панель' : 'Мастер-панель';
    
    if (isAdmin) {
        const switcher = document.getElementById('admin-mode-switcher');
        if (switcher) {
            switcher.innerHTML = `
                <button class="mode-btn active" data-mode="admin">Режим администратора</button>
                <button class="mode-btn" data-mode="actions-history">История действий</button>
                <button class="mode-btn" data-mode="reviews-management">Управление отзывами</button>
                <button class="mode-btn" data-mode="users-management">Управление пользователями</button>
                <button class="mode-btn" data-mode="master-requests">Заявки мастеров</button>
            `;
        }
        
        document.getElementById('admin-mode').style.display = 'block';
        document.getElementById('actions-history-mode').style.display = 'none';
        document.getElementById('reviews-management-mode').style.display = 'none';
        document.getElementById('users-management-mode').style.display = 'none';
        document.getElementById('master-requests-mode').style.display = 'none';
        document.getElementById('master-mode').style.display = 'none';
        
        updateAdminTables();
        loadSelectOptions();
        loadAdminStats();
        populateSalonFilterForReviews();
        loadMasterRequests();
    } else if (isMaster) {
        const switcher = document.getElementById('admin-mode-switcher');
        if (switcher) {
            switcher.innerHTML = `
                <button class="mode-btn active" data-mode="master-bookings">Управление записями</button>
                <button class="mode-btn" data-mode="master-actions-history">Мои действия</button>
                <button class="mode-btn" data-mode="master-services">Мои услуги</button>
            `;
        }
        
        document.getElementById('admin-mode').style.display = 'none';
        document.getElementById('actions-history-mode').style.display = 'none';
        document.getElementById('reviews-management-mode').style.display = 'none';
        document.getElementById('users-management-mode').style.display = 'none';
        document.getElementById('master-requests-mode').style.display = 'none';
        document.getElementById('master-mode').style.display = 'block';
        document.getElementById('master-bookings-mode').style.display = 'block';
        document.getElementById('master-actions-history-mode').style.display = 'none';
        document.getElementById('master-services-mode').style.display = 'none';
        
        setupMasterPanel();
    } else {
        document.getElementById('admin-page').innerHTML = `
            <div class="container">
                <h1 class="page-title">Доступ запрещен</h1>
                <p>Только администраторы и мастера могут просматривать эту страницу.</p>
            </div>
        `;
    }
}

async function updateAdminTables() {
    const salons = await getCachedData('salons');
    const masters = await getCachedData('masters');
    const users = await getCachedData('users');
    const bookings = await getCachedData('bookings');
    
    const salonsTableBody = document.getElementById('salons-table-body');
    if (salonsTableBody) {
        salonsTableBody.innerHTML = '';
        salons.forEach(salon => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${salon.name}</td>
                <td>${salon.address || 'Не указан'}</td>
                <td>${renderStars(salon.rating || 0)} ${(salon.rating || 0).toFixed(1)}</td>
                <td>
                    <button class="action-btn edit" onclick="editSalon('${salon.id}')">Изменить</button>
                    <button class="action-btn delete" onclick="deleteSalon('${salon.id}')">Удалить</button>
                </td>
            `;
            salonsTableBody.appendChild(row);
        });
    }
    
    const mastersTableBody = document.getElementById('masters-table-body');
    if (mastersTableBody) {
        mastersTableBody.innerHTML = '';
        const salonMap = Object.fromEntries(salons.map(s => [s.id, s.name]));
        
        masters.forEach(master => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${master.name}</td>
                <td>${master.specialization || 'Не указана'}</td>
                <td>${master.price || 0} ₽</td>
                <td>${salonMap[master.salonId] || 'Неизвестно'}</td>
                <td>
                    <button class="action-btn edit" onclick="editMaster('${master.id}')">Изменить</button>
                    <button class="action-btn delete" onclick="deleteMaster('${master.id}')">Удалить</button>
                </td>
            `;
            mastersTableBody.appendChild(row);
        });
    }
    
    const usersTableBody = document.getElementById('users-table-body');
    if (usersTableBody) {
        usersTableBody.innerHTML = '';
        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.name || ''} ${user.lastname || ''}</td>
                <td>${user.email || ''}</td>
                <td>${getRoleName(user.role)}${user.isAdmin ? ' (админ)' : ''}</td>
                <td>${user.phone || 'Не указан'}</td>
                <td>${formatDate(user.registrationDate)}</td>
                <td>
                    <button class="action-btn edit" onclick="editUser('${user.id}')">Изменить</button>
                    <button class="action-btn delete" onclick="deleteUser('${user.id}')">Удалить</button>
                </td>
            `;
            usersTableBody.appendChild(row);
        });
    }
    
    const bookingsTableBody = document.getElementById('bookings-table-body');
    if (bookingsTableBody) {
        bookingsTableBody.innerHTML = '';
        bookings.forEach(booking => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${booking.clientName || ''} ${booking.clientLastname || ''}</td>
                <td>${booking.serviceName || 'Неизвестно'}</td>
                <td>${booking.masterName || 'Неизвестно'}</td>
                <td>${formatDate(booking.date)}</td>
                <td>${booking.time || 'Не указано'}</td>
                <td><span class="booking-status ${getStatusClass(booking.status)}">${booking.status || 'Неизвестно'}</span></td>
                <td>
                    ${(booking.status === 'Подтверждена' || !booking.status) ? `
                        <button class="action-btn complete" onclick="updateBookingStatus('${booking.id}', 'Выполнено')">Выполнено</button>
                        <button class="action-btn cancel" onclick="updateBookingStatus('${booking.id}', 'Отменено')">Отмена</button>
                    ` : ''}
                </td>
            `;
            bookingsTableBody.appendChild(row);
        });
    }
    
    await loadAdminServicesGrid();
}

function getStatusClass(status) {
    const statuses = {
        'Подтверждена': 'confirmed',
        'Выполнено': 'completed',
        'Отменено': 'cancelled',
        'Перенесено': 'rescheduled'
    };
    return statuses[status] || '';
}

async function loadAdminStats() {
    try {
        const [salons, services, masters, users, bookings, reviews] = await Promise.all([
            getCachedData('salons'),
            getCachedData('services'),
            getCachedData('masters'),
            getCachedData('users'),
            getCachedData('bookings'),
            getCachedData('reviews')
        ]);
        
        const statsContainer = document.getElementById('admin-stats');
        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat-card"><h3>${salons.length}</h3><p>Салоны</p></div>
                <div class="stat-card"><h3>${services.length}</h3><p>Услуги</p></div>
                <div class="stat-card"><h3>${masters.length}</h3><p>Мастера</p></div>
                <div class="stat-card"><h3>${users.length}</h3><p>Пользователи</p></div>
                <div class="stat-card"><h3>${bookings.length}</h3><p>Записи</p></div>
                <div class="stat-card"><h3>${reviews.length}</h3><p>Отзывы</p></div>
            `;
        }
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// ==============================================
// УПРАВЛЕНИЕ УСЛУГАМИ В АДМИН-ПАНЕЛИ
// ==============================================
async function loadAdminServicesGrid() {
    const container = document.getElementById('admin-services-grid');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const uniqueServices = await getUniqueServices();
        
        if (uniqueServices.length === 0) {
            container.innerHTML = '<p class="no-results">Услуги не найдены</p>';
            return;
        }
        
        container.innerHTML = '';
        
        const servicePromises = uniqueServices.map(async service => {
            const details = await getServiceDetails(service.name);
            return { service, details };
        });
        
        const servicesWithDetails = await Promise.all(servicePromises);
        
        servicesWithDetails.forEach(({ service, details }) => {
            const card = document.createElement('div');
            card.className = 'service-card';
            card.dataset.serviceName = service.name;
            
            const imageUrl = service.imageUrl || getSafeImageUrl('service', service.name);
            const salonsCount = details?.salons?.length || 0;
            const mastersCount = details?.masters?.length || 0;
            
            card.innerHTML = `
                <img src="${imageUrl}" alt="${service.name}" class="service-img" loading="lazy" style="height: 160px;">
                <div class="service-info">
                    <h3 class="service-name" style="font-size: 16px;">${service.name}</h3>
                    <p class="service-category" style="font-size: 13px;">${getCategoryName(service.category)}</p>
                    <p class="service-price" style="font-size: 18px;">${service.price} ₽</p>
                    <p class="service-stats" style="font-size: 12px; color: var(--text-light); margin-bottom: 10px;">
                        <i class="fas fa-store"></i> ${salonsCount} | 
                        <i class="fas fa-user"></i> ${mastersCount}
                    </p>
                    <div class="service-actions" style="display: flex; gap: 8px;">
                        <button class="btn-action primary edit-service" data-name="${service.name}" style="flex:1; padding: 6px 12px; font-size: 12px;">
                            <i class="fas fa-edit"></i> Управление
                        </button>
                        <button class="btn-action danger delete-service" data-name="${service.name}" style="flex:1; padding: 6px 12px; font-size: 12px;">
                            <i class="fas fa-trash"></i> Удалить
                        </button>
                    </div>
                </div>
            `;
            
            const editBtn = card.querySelector('.edit-service');
            const deleteBtn = card.querySelector('.delete-service');
            
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openServiceManagementModal(service.name);
            });
            
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Удалить услугу "${service.name}" из всех салонов?`)) {
                    deleteServiceByName(service.name);
                }
            });
            
            card.addEventListener('click', function(e) {
                if (!e.target.closest('button')) {
                    showServicePage(service.name);
                }
            });
            
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Ошибка загрузки услуг:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки</p>';
    }
}

async function openServiceManagementModal(serviceName) {
    showNotification('Загрузка данных...', 'info');
    
    try {
        const [serviceDetails, availableData, availableMasters] = await Promise.all([
            getServiceDetails(serviceName),
            getAvailableSalonsForService(serviceName),
            getAvailableMastersForService(serviceName)
        ]);
        
        const oldModal = document.getElementById('service-management-modal');
        if (oldModal) oldModal.remove();
        
        const modalHtml = `
            <div id="service-management-modal" class="modal active">
                <div class="modal-content" style="max-width: 800px;">
                    <button class="modal-close" id="service-management-close">&times;</button>
                    <h2 class="modal-title">Управление услугой: ${serviceName}</h2>
                    
                    <div class="form-group">
                        <label class="form-label">Основная информация</label>
                        <div style="display: flex; gap: 20px; align-items: center; flex-wrap: wrap; margin-bottom: 20px;">
                            <img src="${serviceDetails.imageUrl || getSafeImageUrl('service', serviceName)}" 
                                 style="width: 100px; height: 100px; object-fit: cover; border-radius: var(--radius-md);">
                            <div>
                                <p><strong>Категория:</strong> ${getCategoryName(serviceDetails.category)}</p>
                                <p><strong>Цена:</strong> ${serviceDetails.price} ₽</p>
                                <p><strong>Длительность:</strong> ${serviceDetails.duration || 60} мин</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Изменить изображение</label>
                        <input type="file" id="service-image-update" accept="image/*" class="form-input">
                        <input type="url" id="service-image-url-update" placeholder="Или ссылка на изображение" class="form-input" style="margin-top: 10px;">
                        <button class="btn btn-secondary" id="update-service-image" style="margin-top: 10px;">
                            <i class="fas fa-save"></i> Обновить изображение
                        </button>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Салоны, предоставляющие услугу (${availableData.existing.length})</label>
                        <div class="checkbox-group" style="max-height: 200px;">
                            ${availableData.existing.map(salon => `
                                <div class="checkbox-item" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid var(--border-color);">
                                    <i class="fas fa-store" style="color: var(--primary-color); margin-right: 10px;"></i>
                                    <span style="flex:1;">${salon.name}</span>
                                    <button class="btn-action danger remove-from-salon" data-salon-id="${salon.id}" style="padding: 4px 8px; font-size: 11px;">
                                        <i class="fas fa-trash"></i> Удалить
                                    </button>
                                </div>
                            `).join('')}
                            ${availableData.existing.length === 0 ? '<p class="text-muted">Услуга не предоставляется ни в одном салоне</p>' : ''}
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Добавить в салон</label>
                        <select id="add-to-salon-select" class="form-input">
                            <option value="">Выберите салон</option>
                            ${availableData.available.map(salon => `
                                <option value="${salon.id}">${salon.name}</option>
                            `).join('')}
                        </select>
                        <button class="btn btn-secondary" id="add-service-to-salon" style="margin-top: 10px;">
                            <i class="fas fa-plus"></i> Добавить в выбранный салон
                        </button>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Мастера, выполняющие услугу (${availableMasters.existing.length})</label>
                        <div class="checkbox-group" style="max-height: 200px;">
                            ${availableMasters.existing.map(master => `
                                <div class="checkbox-item" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid var(--border-color);">
                                    <i class="fas fa-user" style="color: var(--primary-color); margin-right: 10px;"></i>
                                    <span style="flex:1;">${master.name} (${master.salonName})</span>
                                    <button class="btn-action danger remove-from-master" data-master-id="${master.id}" style="padding: 4px 8px; font-size: 11px;">
                                        <i class="fas fa-trash"></i> Удалить
                                    </button>
                                </div>
                            `).join('')}
                            ${availableMasters.existing.length === 0 ? '<p class="text-muted">Ни один мастер не выполняет эту услугу</p>' : ''}
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Добавить мастеру</label>
                        <select id="add-to-master-select" class="form-input">
                            <option value="">Выберите мастера</option>
                            ${availableMasters.available.map(master => `
                                <option value="${master.id}">${master.name} (${master.salonName})</option>
                            `).join('')}
                        </select>
                        <button class="btn btn-secondary" id="add-service-to-master" style="margin-top: 10px;">
                            <i class="fas fa-plus"></i> Добавить выбранному мастеру
                        </button>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary" id="close-service-management">Закрыть</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        attachServiceModalHandlers(serviceName);
    } catch (error) {
        console.error('Ошибка открытия модального окна:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

function attachServiceModalHandlers(serviceName) {
    document.getElementById('service-management-close')?.addEventListener('click', () => {
        document.getElementById('service-management-modal').remove();
    });
    
    document.getElementById('close-service-management')?.addEventListener('click', () => {
        document.getElementById('service-management-modal').remove();
    });
    
    document.getElementById('update-service-image')?.addEventListener('click', async () => {
        const fileInput = document.getElementById('service-image-update');
        const urlInput = document.getElementById('service-image-url-update');
        
        let imageUrl = null;
        
        if (fileInput.files.length > 0) {
            imageUrl = await uploadImage(fileInput.files[0], 'services');
        } else if (urlInput.value.trim()) {
            imageUrl = urlInput.value.trim();
        }
        
        if (imageUrl) {
            await updateServiceImage(serviceName, imageUrl);
            showNotification('Изображение обновлено');
            document.getElementById('service-management-modal').remove();
            openServiceManagementModal(serviceName);
            loadAdminServicesGrid();
        } else {
            showNotification('Выберите файл или укажите ссылку', 'error');
        }
    });
    
    document.querySelectorAll('.remove-from-salon').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const salonId = e.target.closest('button').dataset.salonId;
            if (confirm(`Удалить услугу из этого салона?`)) {
                await removeServiceFromSalon(serviceName, salonId);
                document.getElementById('service-management-modal').remove();
                openServiceManagementModal(serviceName);
                loadAdminServicesGrid();
                clearCache();
            }
        });
    });
    
    document.querySelectorAll('.remove-from-master').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const masterId = e.target.closest('button').dataset.masterId;
            if (confirm(`Убрать эту услугу у мастера?`)) {
                await removeServiceFromMaster(serviceName, masterId);
                document.getElementById('service-management-modal').remove();
                openServiceManagementModal(serviceName);
                loadAdminServicesGrid();
                clearCache();
            }
        });
    });
    
    document.getElementById('add-service-to-salon')?.addEventListener('click', async () => {
        const salonId = document.getElementById('add-to-salon-select').value;
        if (!salonId) {
            showNotification('Выберите салон', 'error');
            return;
        }
        const serviceDetails = await getServiceDetails(serviceName);
        await addServiceToSalon(serviceName, salonId, serviceDetails);
        document.getElementById('service-management-modal').remove();
        openServiceManagementModal(serviceName);
        loadAdminServicesGrid();
        clearCache();
    });
    
    document.getElementById('add-service-to-master')?.addEventListener('click', async () => {
        const masterId = document.getElementById('add-to-master-select').value;
        if (!masterId) {
            showNotification('Выберите мастера', 'error');
            return;
        }
        await addServiceToMaster(serviceName, masterId);
        document.getElementById('service-management-modal').remove();
        openServiceManagementModal(serviceName);
        loadAdminServicesGrid();
        clearCache();
    });
}

async function getAvailableSalonsForService(serviceName) {
    try {
        const allSalons = await getCachedData('salons');
        const serviceDetails = await getServiceDetails(serviceName);
        
        const existingSalonIds = serviceDetails?.allSalonIds || [];
        const availableSalons = allSalons.filter(salon => 
            !existingSalonIds.includes(salon.id)
        );
        
        return {
            existing: serviceDetails?.salons || [],
            available: availableSalons
        };
    } catch (error) {
        console.error('Ошибка загрузки доступных салонов:', error);
        return { existing: [], available: [] };
    }
}

async function getAvailableMastersForService(serviceName) {
    try {
        const allMasters = await getCachedData('masters');
        const serviceDetails = await getServiceDetails(serviceName);
        const serviceIds = serviceDetails?.serviceIds || [];
        
        const existingMasterIds = serviceDetails?.masters.map(m => m.id) || [];
        const availableMasters = allMasters.filter(master => {
            const hasService = (master.providedServices || []).some(serviceId => 
                serviceIds.includes(serviceId)
            );
            return !hasService && master.salonId && serviceDetails?.allSalonIds?.includes(master.salonId);
        });
        
        return {
            existing: serviceDetails?.masters || [],
            available: availableMasters
        };
    } catch (error) {
        console.error('Ошибка загрузки доступных мастеров:', error);
        return { existing: [], available: [] };
    }
}

async function updateServiceImage(serviceName, imageUrl) {
    try {
        const servicesSnapshot = await db.collection('services')
            .where('name', '==', serviceName)
            .get();
        
        const batch = db.batch();
        servicesSnapshot.forEach(doc => {
            batch.update(doc.ref, { imageUrl: imageUrl });
        });
        await batch.commit();
    } catch (error) {
        console.error('Ошибка обновления изображения:', error);
        throw error;
    }
}

async function removeServiceFromSalon(serviceName, salonId) {
    try {
        const servicesSnapshot = await db.collection('services')
            .where('name', '==', serviceName)
            .where('salonId', '==', salonId)
            .get();
        
        const batch = db.batch();
        const serviceIds = servicesSnapshot.docs.map(doc => doc.id);
        
        servicesSnapshot.forEach(doc => batch.delete(doc.ref));
        
        const salonRef = db.collection('salons').doc(salonId);
        batch.update(salonRef, {
            serviceIds: firebase.firestore.FieldValue.arrayRemove(...serviceIds)
        });
        
        const mastersSnapshot = await db.collection('masters')
            .where('salonId', '==', salonId)
            .get();
        
        mastersSnapshot.forEach(masterDoc => {
            batch.update(masterDoc.ref, {
                providedServices: firebase.firestore.FieldValue.arrayRemove(...serviceIds)
            });
        });
        
        await batch.commit();
        showNotification('Услуга удалена из салона');
    } catch (error) {
        console.error('Ошибка удаления услуги из салона:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

async function removeServiceFromMaster(serviceName, masterId) {
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (!masterDoc.exists) return;
        
        const master = masterDoc.data();
        const salonId = master.salonId;
        
        const servicesSnapshot = await db.collection('services')
            .where('name', '==', serviceName)
            .where('salonId', '==', salonId)
            .get();
        
        if (servicesSnapshot.empty) return;
        
        const serviceId = servicesSnapshot.docs[0].id;
        
        await db.collection('masters').doc(masterId).update({
            providedServices: firebase.firestore.FieldValue.arrayRemove(serviceId)
        });
        
        const providedServiceIds = (master.providedServices || []).filter(id => id !== serviceId);
        const services = [];
        for (const id of providedServiceIds) {
            const s = await db.collection('services').doc(id).get();
            if (s.exists) services.push(s.data());
        }
        const avgPrice = services.length ? Math.round(services.reduce((sum, s) => sum + s.price, 0) / services.length) : 0;
        await db.collection('masters').doc(masterId).update({ price: avgPrice });
        
        showNotification('Услуга удалена у мастера');
    } catch (error) {
        console.error('Ошибка удаления услуги у мастера:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

async function addServiceToSalon(serviceName, salonId, serviceTemplate) {
    try {
        const existingService = await db.collection('services')
            .where('name', '==', serviceName)
            .where('salonId', '==', salonId)
            .get();
        
        if (!existingService.empty) {
            showNotification('Услуга уже есть в этом салоне', 'warning');
            return;
        }
        
        const serviceData = {
            name: serviceName,
            category: serviceTemplate.category,
            price: serviceTemplate.price,
            duration: serviceTemplate.duration || 60,
            salonId: salonId,
            imageUrl: serviceTemplate.imageUrl || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const serviceRef = await db.collection('services').add(serviceData);
        
        await db.collection('salons').doc(salonId).update({
            serviceIds: firebase.firestore.FieldValue.arrayUnion(serviceRef.id)
        });
        
        showNotification('Услуга добавлена в салон');
    } catch (error) {
        console.error('Ошибка добавления услуги в салон:', error);
        showNotification('Ошибка при добавлении', 'error');
    }
}

async function addServiceToMaster(serviceName, masterId) {
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (!masterDoc.exists) return;
        
        const master = masterDoc.data();
        const salonId = master.salonId;
        
        const servicesSnapshot = await db.collection('services')
            .where('name', '==', serviceName)
            .where('salonId', '==', salonId)
            .get();
        
        if (servicesSnapshot.empty) {
            showNotification('Сначала добавьте услугу в салон', 'error');
            return;
        }
        
        const serviceId = servicesSnapshot.docs[0].id;
        
        if (master.providedServices && master.providedServices.includes(serviceId)) {
            showNotification('Услуга уже есть у мастера', 'warning');
            return;
        }
        
        await db.collection('masters').doc(masterId).update({
            providedServices: firebase.firestore.FieldValue.arrayUnion(serviceId)
        });
        
        const providedServiceIds = [...(master.providedServices || []), serviceId];
        const services = [];
        for (const id of providedServiceIds) {
            const s = await db.collection('services').doc(id).get();
            if (s.exists) services.push(s.data());
        }
        const avgPrice = services.length ? Math.round(services.reduce((sum, s) => sum + s.price, 0) / services.length) : 0;
        await db.collection('masters').doc(masterId).update({ price: avgPrice });
        
        showNotification('Услуга добавлена мастеру');
    } catch (error) {
        console.error('Ошибка добавления услуги мастеру:', error);
        showNotification('Ошибка при добавлении', 'error');
    }
}

async function deleteServiceByName(serviceName) {
    try {
        const servicesSnapshot = await db.collection('services')
            .where('name', '==', serviceName)
            .get();
        
        const serviceIds = servicesSnapshot.docs.map(doc => doc.id);
        const batch = db.batch();
        
        servicesSnapshot.forEach(doc => batch.delete(doc.ref));
        
        const salonsSnapshot = await db.collection('salons')
            .where('serviceIds', 'array-contains-any', serviceIds)
            .get();
        
        salonsSnapshot.forEach(doc => {
            batch.update(doc.ref, {
                serviceIds: firebase.firestore.FieldValue.arrayRemove(...serviceIds)
            });
        });
        
        const mastersSnapshot = await db.collection('masters')
            .where('providedServices', 'array-contains-any', serviceIds)
            .get();
        
        mastersSnapshot.forEach(doc => {
            batch.update(doc.ref, {
                providedServices: firebase.firestore.FieldValue.arrayRemove(...serviceIds)
            });
        });
        
        await batch.commit();
        showNotification('Услуга полностью удалена из всех салонов');
        loadAdminServicesGrid();
        clearCache();
    } catch (error) {
        console.error('Ошибка удаления услуги:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

// ==============================================
// ФУНКЦИИ РЕДАКТИРОВАНИЯ
// ==============================================
async function editSalon(salonId) {
    editingSalonId = salonId;
    
    try {
        const salonDoc = await db.collection('salons').doc(salonId).get();
        if (salonDoc.exists) {
            const salon = salonDoc.data();
            
            document.getElementById('salon-name').value = salon.name || '';
            document.getElementById('salon-address').value = salon.address || '';
            document.getElementById('salon-district').value = salon.district || 'center';
            document.getElementById('salon-description').value = salon.description || '';
            
            document.querySelectorAll('input[name="specialization"]').forEach(cb => cb.checked = false);
            if (salon.specializations) {
                salon.specializations.forEach(spec => {
                    const checkbox = document.querySelector(`input[name="specialization"][value="${spec}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            await loadSalonServicesCheckboxes(salon.serviceIds || []);
            
            document.getElementById('salon-image-url').value = salon.imageUrl || '';
            document.getElementById('salon-image-preview').innerHTML = salon.imageUrl ? `<img src="${salon.imageUrl}" style="max-width: 200px;">` : '';
            
            document.getElementById('salon-modal-title').textContent = 'Редактировать салон';
            showModal('add-salon-modal');
        }
    } catch (error) {
        console.error('Ошибка загрузки салона:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

async function editMaster(masterId) {
    editingMasterId = masterId;
    
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (masterDoc.exists) {
            const master = masterDoc.data();
            
            const nameParts = (master.name || '').split(' ');
            document.getElementById('master-name').value = nameParts[0] || '';
            document.getElementById('master-lastname').value = nameParts.slice(1).join(' ') || '';
            
            const specSelect = document.getElementById('master-specialization');
            const predefinedSpecs = Array.from(specSelect.options).map(opt => opt.value).filter(v => v && v !== 'other');
            if (predefinedSpecs.includes(master.specialization)) {
                specSelect.value = master.specialization;
                document.getElementById('master-specialization-other-group').style.display = 'none';
            } else {
                specSelect.value = 'other';
                document.getElementById('master-specialization-other-group').style.display = 'block';
                document.getElementById('master-specialization-other').value = master.specialization || '';
            }
            
            document.getElementById('master-price').value = master.price || '';
            
            await loadSelectOptions();
            if (master.salonId) document.getElementById('master-salon').value = master.salonId;
            
            await updateMasterServicesCheckboxes(master.salonId, master.providedServices || []);
            
            document.getElementById('master-email').style.display = 'none';
            document.getElementById('master-password').style.display = 'none';
            document.querySelector('label[for="master-email"]').style.display = 'none';
            document.querySelector('label[for="master-password"]').style.display = 'none';
            
            document.getElementById('master-image-url').value = master.imageUrl || '';
            document.getElementById('master-image-preview').innerHTML = master.imageUrl ? `<img src="${master.imageUrl}" style="max-width: 200px;">` : '';
            
            document.getElementById('master-modal-title').textContent = 'Редактировать мастера';
            showModal('add-master-modal');
        }
    } catch (error) {
        console.error('Ошибка загрузки мастера:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

async function editUser(userId) {
    editingUserId = userId;
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const user = userDoc.data();
            
            document.getElementById('edit-user-name').value = user.name || '';
            document.getElementById('edit-user-lastname').value = user.lastname || '';
            document.getElementById('edit-user-email').value = user.email || '';
            document.getElementById('edit-user-phone').value = user.phone || '';
            document.getElementById('edit-user-role').value = user.role || 'client';
            
            showModal('edit-user-modal');
        }
    } catch (error) {
        console.error('Ошибка загрузки пользователя:', error);
        showNotification('Ошибка загрузки данных', 'error');
    }
}

async function saveUser() {
    const name = document.getElementById('edit-user-name').value.trim();
    const lastname = document.getElementById('edit-user-lastname').value.trim();
    const email = document.getElementById('edit-user-email').value.trim();
    const phone = document.getElementById('edit-user-phone').value.trim();
    const role = document.getElementById('edit-user-role').value;
    
    if (!name || !email || !role) {
        showNotification('Заполните обязательные поля', 'error');
        return;
    }
    
    try {
        const oldUserDoc = await db.collection('users').doc(editingUserId).get();
        const oldData = oldUserDoc.exists ? oldUserDoc.data() : null;
        
        await db.collection('users').doc(editingUserId).update({ name, lastname, email, phone, role });
        await logAction('user_update', 'user', editingUserId, { originalData: oldData }, `${name} ${lastname}`);
        
        showNotification('Данные пользователя обновлены');
        hideModal('edit-user-modal');
        updateAdminTables();
        clearCache();
    } catch (error) {
        console.error('Ошибка обновления пользователя:', error);
        showNotification('Ошибка при обновлении', 'error');
    }
}

async function resetUserPassword() {
    const email = document.getElementById('edit-user-email').value.trim();
    if (!email) {
        showNotification('Email пользователя не указан', 'error');
        return;
    }
    try {
        await auth.sendPasswordResetEmail(email);
        showNotification(`Письмо для сброса пароля отправлено на ${email}`, 'success');
    } catch (error) {
        console.error('Ошибка отправки письма:', error);
        showNotification('Ошибка при отправке письма', 'error');
    }
}

// ==============================================
// УДАЛЕНИЕ
// ==============================================
async function deleteSalon(salonId) {
    if (!confirm('Вы уверены, что хотите удалить этот салон?')) return;
    
    try {
        await db.collection('salons').doc(salonId).delete();
        showNotification('Салон удален');
        updateAdminTables();
        clearCache();
    } catch (error) {
        console.error('Ошибка удаления салона:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

async function deleteMaster(masterId) {
    if (!confirm('Вы уверены, что хотите удалить этого мастера?')) return;
    
    try {
        await db.collection('masters').doc(masterId).delete();
        showNotification('Мастер удален');
        updateAdminTables();
        clearCache();
    } catch (error) {
        console.error('Ошибка удаления мастера:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя?')) return;
    
    try {
        await db.collection('users').doc(userId).delete();
        showNotification('Пользователь удален');
        updateAdminTables();
        clearCache();
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

// ==============================================
// ОБНОВЛЕНИЕ СТАТУСА ЗАПИСИ
// ==============================================
async function updateBookingStatus(bookingId, newStatus) {
    try {
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        const oldData = bookingDoc.exists ? bookingDoc.data() : null;
        
        await db.collection('bookings').doc(bookingId).update({ status: newStatus });
        await logAction('update', 'booking', bookingId, { originalData: oldData }, 'Статус записи изменен');
        
        showNotification(`Статус изменен на "${newStatus}"`);
        
        if (document.getElementById('admin-page').classList.contains('active')) updateAdminTables();
        if (document.getElementById('profile-page').classList.contains('active')) loadUserBookings();
        if (document.getElementById('master-mode').style.display !== 'none') {
            if (currentActiveMasterId) {
                await loadMasterBookingsForMaster(currentActiveMasterId);
            }
        }
        if (document.getElementById('master-schedule-page').classList.contains('active')) {
            loadDayBookings(document.querySelector('.calendar-date.selected')?.dataset.date || new Date().toISOString().split('T')[0]);
        }
        clearCache();
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
        showNotification('Ошибка при изменении статуса', 'error');
    }
}

// ==============================================
// МАСТЕР-ПАНЕЛЬ (ИСПРАВЛЕНО)
// ==============================================
async function setupMasterPanel() {
    if (!currentUser || currentUser.role !== 'master') {
        showNotification('Доступ запрещен', 'error');
        return;
    }
    
    document.getElementById('master-name-display').textContent = `Личный кабинет мастера: ${currentUser.name || ''} ${currentUser.lastname || ''}`;
    
    await populateMasterSelect();
    
    const masters = await getMasters({ userId: currentUser.id });
    console.log('Найдено мастеров для пользователя:', masters);
    
    if (masters.length === 0) {
        document.getElementById('master-detail-name').textContent = 'Не найден';
        document.getElementById('master-detail-lastname').textContent = currentUser.lastname || '';
        document.getElementById('master-detail-email').textContent = currentUser.email || '';
        document.getElementById('master-detail-phone').textContent = currentUser.phone || 'Не указан';
        document.getElementById('master-detail-salon').textContent = 'Не назначен';
        document.getElementById('master-detail-specialization').textContent = 'Не указана';
        
        document.getElementById('master-bookings-table').innerHTML = '<tr><td colspan="7" class="no-results">Нет записей</td></tr>';
        document.getElementById('master-services-list').innerHTML = '<p class="no-results">Услуги не найдены</p>';
        
        showNotification('Профиль мастера не найден. Обратитесь к администратору.', 'warning');
        return;
    }
    
    if (!currentActiveMasterId || !masters.some(m => m.id === currentActiveMasterId)) {
        currentActiveMasterId = masters[0].id;
    }
    
    const master = masters.find(m => m.id === currentActiveMasterId) || masters[0];
    console.log('Выбран мастер:', master);
    
    let salonName = 'Неизвестно';
    if (master.salonId) {
        const salonDoc = await db.collection('salons').doc(master.salonId).get();
        if (salonDoc.exists) salonName = salonDoc.data().name;
    }
    
    document.getElementById('master-detail-name').textContent = master.name || 'Не указано';
    document.getElementById('master-detail-lastname').textContent = currentUser.lastname || 'Не указано';
    document.getElementById('master-detail-email').textContent = currentUser.email || 'Не указан';
    document.getElementById('master-detail-phone').textContent = currentUser.phone || 'Не указан';
    document.getElementById('master-detail-salon').textContent = salonName;
    document.getElementById('master-detail-specialization').textContent = master.specialization || 'Не указана';
    
    await loadMasterBookingsForMaster(master.id);
    await loadMasterServicesList(master.id);
}

async function populateMasterSelect() {
    const select = document.getElementById('master-select');
    if (!select) return;
    
    const masters = await getCachedData('masters');
    const salons = await getCachedData('salons');
    const salonMap = Object.fromEntries(salons.map(s => [s.id, s.name]));
    
    select.innerHTML = '<option value="">Выберите мастера</option>';
    masters.forEach(master => {
        const option = document.createElement('option');
        option.value = master.id;
        option.textContent = `${master.name} (${salonMap[master.salonId] || 'Неизвестный салон'})`;
        select.appendChild(option);
    });
    
    if (masters.length > 0 && !currentActiveMasterId) {
        currentActiveMasterId = masters[0].id;
        select.value = currentActiveMasterId;
    }
}

async function loadMasterBookingsForMaster(masterId) {
    if (!masterId) return;
    
    const tableBody = document.getElementById('master-bookings-table');
    if (!tableBody) return;
    
    tableBody.innerHTML = '<tr><td colspan="7" class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</td></tr>';
    
    try {
        const bookings = await getBookings({ masterId: masterId });
        
        if (bookings.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="no-results">Нет записей</td></tr>';
            return;
        }
        
        bookings.sort((a, b) => {
            const dateA = a.bookingDate ? new Date(a.bookingDate.toDate()) : new Date(a.date + 'T' + (a.time || '00:00'));
            const dateB = b.bookingDate ? new Date(b.bookingDate.toDate()) : new Date(b.date + 'T' + (b.time || '00:00'));
            return dateB - dateA;
        });
        
        tableBody.innerHTML = '';
        bookings.forEach(booking => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${booking.clientName || ''} ${booking.clientLastname || ''}</td>
                <td>${booking.serviceName || 'Неизвестно'}</td>
                <td>${formatDate(booking.date)}</td>
                <td>${booking.time || 'Не указан'}</td>
                <td>${booking.clientPhone || 'Не указан'}</td>
                <td><span class="booking-status ${getStatusClass(booking.status)}">${booking.status || 'Неизвестно'}</span></td>
                <td>
                    ${(booking.status === 'Подтверждена' || !booking.status) ? `
                        <button class="action-btn complete" onclick="updateBookingStatus('${booking.id}', 'Выполнено')">Выполнено</button>
                        <button class="action-btn cancel" onclick="updateBookingStatus('${booking.id}', 'Отменено')">Отменить</button>
                    ` : ''}
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Ошибка загрузки записей:', error);
        tableBody.innerHTML = '<tr><td colspan="7" class="no-results">Ошибка загрузки</td></tr>';
    }
}

async function loadMasterServicesList(masterId) {
    const container = document.getElementById('master-services-list');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Загрузка...</div>';
    
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (!masterDoc.exists) {
            container.innerHTML = '<p class="no-results">Мастер не найден</p>';
            return;
        }
        
        const master = masterDoc.data();
        const providedServiceIds = master.providedServices || [];
        
        if (providedServiceIds.length === 0) {
            container.innerHTML = '<p class="no-results">У вас пока нет услуг</p>';
            return;
        }
        
        const services = [];
        for (const serviceId of providedServiceIds) {
            try {
                const serviceDoc = await db.collection('services').doc(serviceId).get();
                if (serviceDoc.exists) {
                    services.push({ id: serviceDoc.id, ...serviceDoc.data() });
                }
            } catch (e) {
                console.warn(`Услуга ${serviceId} не найдена`);
            }
        }
        
        if (services.length === 0) {
            container.innerHTML = '<p class="no-results">Услуги не найдены</p>';
            return;
        }
        
        const uniqueServices = new Map();
        services.forEach(service => {
            if (!uniqueServices.has(service.name)) {
                uniqueServices.set(service.name, service);
            }
        });
        
        container.innerHTML = '';
        uniqueServices.forEach(service => {
            const card = document.createElement('div');
            card.className = 'service-card';
            card.innerHTML = `
                <img src="${service.imageUrl || getSafeImageUrl('service', service.name)}" alt="${service.name}" class="service-img">
                <div class="service-info">
                    <h3 class="service-name">${service.name}</h3>
                    <p class="service-category">${getCategoryName(service.category)}</p>
                    <p class="service-price">${service.price} ₽</p>
                    <button class="btn-action danger remove-service-btn" data-service-name="${service.name}" style="position: absolute; top: 10px; right: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            const removeBtn = card.querySelector('.remove-service-btn');
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Удалить услугу "${service.name}"?`)) {
                    removeServiceFromMaster(service.name, masterId);
                }
            });
            
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Ошибка загрузки услуг мастера:', error);
        container.innerHTML = '<p class="no-results">Ошибка загрузки</p>';
    }
}

async function openAddMasterServiceModal() {
    if (!currentActiveMasterId) {
        showNotification('Сначала выберите мастера', 'error');
        return;
    }
    
    const masterDoc = await db.collection('masters').doc(currentActiveMasterId).get();
    if (!masterDoc.exists) return;
    
    const master = masterDoc.data();
    const salonId = master.salonId;
    
    const salonServices = await getSalonServices(salonId);
    const uniqueServices = new Map();
    salonServices.forEach(service => {
        if (!uniqueServices.has(service.name)) {
            uniqueServices.set(service.name, service);
        }
    });
    
    const provided = master.providedServices || [];
    const providedNames = [];
    for (const id of provided) {
        const s = await db.collection('services').doc(id).get();
        if (s.exists) providedNames.push(s.data().name);
    }
    
    const availableServices = Array.from(uniqueServices.values()).filter(s => !providedNames.includes(s.name));
    
    const select = document.getElementById('master-service-select');
    select.innerHTML = '';
    
    if (availableServices.length === 0) {
        select.innerHTML = '<option>Нет доступных услуг</option>';
    } else {
        availableServices.forEach(s => {
            const option = document.createElement('option');
            option.value = s.name;
            option.textContent = `${s.name} (${s.price} ₽)`;
            select.appendChild(option);
        });
    }
    
    showModal('add-master-service-modal');
}

async function addServiceToMasterFromModal() {
    const select = document.getElementById('master-service-select');
    const serviceName = select.value;
    
    if (!serviceName || serviceName === 'Нет доступных услуг') {
        showNotification('Выберите услугу', 'error');
        return;
    }
    
    await addServiceToMaster(serviceName, currentActiveMasterId);
    hideModal('add-master-service-modal');
    await loadMasterServicesList(currentActiveMasterId);
}

async function editMasterProfile() {
    if (!currentUser || currentUser.role !== 'master') {
        showNotification('Доступ запрещен', 'error');
        return;
    }
    
    const masters = await getMasters({ userId: currentUser.id });
    if (masters.length === 0) return;
    
    const master = masters[0];
    editingMasterId = master.id;
    
    document.getElementById('edit-master-name').value = master.firstName || master.name.split(' ')[0] || '';
    document.getElementById('edit-master-lastname').value = master.lastName || master.name.split(' ')[1] || '';
    document.getElementById('edit-master-email').value = currentUser.email || '';
    document.getElementById('edit-master-phone').value = currentUser.phone || '';
    document.getElementById('edit-master-specialization').value = master.specialization || '';
    
    showModal('edit-master-modal');
}

async function saveMasterProfile() {
    const name = document.getElementById('edit-master-name').value.trim();
    const lastname = document.getElementById('edit-master-lastname').value.trim();
    const email = document.getElementById('edit-master-email').value.trim();
    const phone = document.getElementById('edit-master-phone').value.trim();
    const specialization = document.getElementById('edit-master-specialization').value;
    
    if (!name || !email || !specialization) {
        showNotification('Заполните обязательные поля', 'error');
        return;
    }
    
    try {
        await db.collection('users').doc(currentUser.id).update({
            name, lastname, email, phone
        });
        
        await db.collection('masters').doc(editingMasterId).update({
            name: `${name} ${lastname}`,
            firstName: name,
            lastName: lastname,
            specialization: specialization
        });
        
        showNotification('Профиль обновлен');
        hideModal('edit-master-modal');
        await setupMasterPanel();
        clearCache();
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        showNotification('Ошибка при сохранении', 'error');
    }
}

async function deleteMasterProfile() {
    if (!confirm('Удалить профиль мастера?')) return;
    
    try {
        const masters = await getMasters({ userId: currentUser.id });
        if (masters.length > 0) {
            await db.collection('masters').doc(masters[0].id).delete();
        }
        await db.collection('users').doc(currentUser.id).update({ role: 'client' });
        
        showNotification('Профиль удален');
        await logout();
    } catch (error) {
        console.error('Ошибка удаления:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

// ==============================================
// КАЛЕНДАРЬ МАСТЕРА
// ==============================================
async function loadMasterSchedulePage() {
    if (!currentUser || currentUser.role !== 'master') {
        showNotification('Доступ только для мастеров', 'error');
        showPage('home-page');
        return;
    }
    
    renderCalendar(currentCalendarMonth);
    loadDayBookings(new Date().toISOString().split('T')[0]);
}

function renderCalendar(date) {
    const container = document.getElementById('calendar-container');
    if (!container) return;
    
    const year = date.getFullYear();
    const month = date.getMonth();
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    
    document.getElementById('current-month').textContent = `${monthNames[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayIndex = (firstDay.getDay() + 6) % 7;
    
    let html = '<div class="calendar-grid">' + 
        '<div class="calendar-day">Пн</div><div class="calendar-day">Вт</div><div class="calendar-day">Ср</div>' +
        '<div class="calendar-day">Чт</div><div class="calendar-day">Пт</div><div class="calendar-day">Сб</div><div class="calendar-day">Вс</div>';
    
    for (let i = 0; i < firstDayIndex; i++) {
        html += '<div class="calendar-date"></div>';
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const dayOfWeek = new Date(year, month, day).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isToday = dateStr === today;
        
        let className = 'calendar-date';
        if (isToday) className += ' selected';
        if (isWeekend) className += ' weekend';
        
        html += `<div class="${className}" data-date="${dateStr}">${day}</div>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
    container.querySelectorAll('.calendar-date[data-date]').forEach(dateEl => {
        dateEl.addEventListener('click', function() {
            container.querySelectorAll('.calendar-date').forEach(el => el.classList.remove('selected'));
            this.classList.add('selected');
            loadDayBookings(this.dataset.date);
        });
    });
    
    const todayEl = container.querySelector(`.calendar-date[data-date="${today}"]`);
    if (todayEl) todayEl.click();
}

function createBookingCard(booking) {
    const card = document.createElement('div');
    card.className = 'booking-card';
    card.dataset.bookingId = booking.id;
    
    card.innerHTML = `
        <div class="booking-time">${booking.time}</div>
        <div class="booking-service">${booking.serviceName}</div>
        <div class="booking-client">${booking.clientName} ${booking.clientLastname || ''}</div>
        <div class="booking-price">${booking.totalPrice} ₽</div>
        ${booking.clientComment ? `<div class="booking-comment">Комментарий: ${booking.clientComment}</div>` : ''}
        <div class="booking-actions">
            <button class="booking-action-complete" title="Выполнено"><i class="fas fa-check"></i></button>
            <button class="booking-action-cancel" title="Отменить"><i class="fas fa-times"></i></button>
        </div>
    `;
    
    card.querySelector('.booking-action-complete').addEventListener('click', () => {
        updateBookingStatus(booking.id, 'Выполнено');
    });
    card.querySelector('.booking-action-cancel').addEventListener('click', () => {
        updateBookingStatus(booking.id, 'Отменено');
    });
    
    return card;
}

async function loadDayBookings(date) {
    if (!currentUser) return;
    
    const masters = await getMasters({ userId: currentUser.id });
    if (masters.length === 0) return;
    
    const master = masters[0];
    const bookings = await getBookings({ masterId: master.id, date: date, status: 'Подтверждена' });
    
    const container = document.getElementById('day-bookings');
    const dateText = document.getElementById('selected-date-text');
    if (!container || !dateText) return;
    
    dateText.textContent = formatDate(date);
    
    if (bookings.length === 0) {
        container.innerHTML = '<div class="no-results">На эту дату нет записей</div>';
        return;
    }
    
    bookings.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
    container.innerHTML = '';
    bookings.forEach(booking => container.appendChild(createBookingCard(booking)));
}

function prevMonth() {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() - 1);
    renderCalendar(currentCalendarMonth);
}

function nextMonth() {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + 1);
    renderCalendar(currentCalendarMonth);
}

// ==============================================
// ПРОЦЕСС БРОНИРОВАНИЯ (с автоматическим заполнением данных пользователя)
// ==============================================
async function startBookingForSalon(salonId) {
    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Только клиенты могут записываться', 'error');
        if (!currentUser) showModal('profile-modal');
        return;
    }
    
    try {
        const salonDoc = await db.collection('salons').doc(salonId).get();
        if (salonDoc.exists) {
            currentSalon = { id: salonDoc.id, ...salonDoc.data() };
            startBookingProcess();
        }
    } catch (error) {
        console.error('Ошибка загрузки салона:', error);
        showNotification('Ошибка загрузки салона', 'error');
    }
}

async function startBookingForMaster(masterId) {
    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Только клиенты могут записываться', 'error');
        if (!currentUser) showModal('profile-modal');
        return;
    }
    
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (masterDoc.exists) {
            selectedMaster = { id: masterDoc.id, ...masterDoc.data() };
            
            const salonDoc = await db.collection('salons').doc(selectedMaster.salonId).get();
            if (salonDoc.exists) {
                currentSalon = { id: salonDoc.id, ...salonDoc.data() };
                startBookingProcess();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки мастера:', error);
        showNotification('Ошибка загрузки мастера', 'error');
    }
}

async function startBookingProcess() {
    if (!currentSalon) return;
    
    selectedService = null;
    selectedMaster = null;
    selectedDate = null;
    selectedTime = null;
    
    document.getElementById('client-name').value = currentUser?.name || '';
    document.getElementById('client-lastname').value = currentUser?.lastname || '';
    document.getElementById('client-phone').value = currentUser?.phone || '';
    document.getElementById('client-comment').value = '';
    
    const services = await getSalonServices(currentSalon.id);
    const servicesContainer = document.getElementById('booking-services-container');
    if (!servicesContainer) return;
    
    servicesContainer.innerHTML = '';
    if (services.length === 0) {
        servicesContainer.innerHTML = '<p class="no-results">Услуги не найдены</p>';
        return;
    }
    
    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.dataset.serviceId = service.id;
        card.innerHTML = `
            <img src="${service.imageUrl || getSafeImageUrl('service', service.name)}" alt="${service.name}" class="service-img">
            <div class="service-info">
                <h3 class="service-name">${service.name}</h3>
                <p class="service-price">${service.price || 0} ₽</p>
            </div>
        `;
        card.addEventListener('click', function() {
            document.querySelectorAll('#booking-services-container .service-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedService = { id: service.id, name: service.name, price: service.price || 0, duration: service.duration || 60 };
        });
        servicesContainer.appendChild(card);
    });
    
    showPage('booking-page');
    goToStep(1);
}

async function loadMastersForBooking() {
    if (!currentSalon) return;
    
    const masters = await getMasters({ salonId: currentSalon.id });
    const mastersContainer = document.getElementById('booking-masters-container');
    if (!mastersContainer) return;
    
    mastersContainer.innerHTML = '';
    if (masters.length === 0) {
        mastersContainer.innerHTML = '<p class="no-results">Мастера не найдены</p>';
        return;
    }
    
    masters.forEach(master => {
        const card = document.createElement('div');
        card.className = 'master-card';
        card.dataset.masterId = master.id;
        card.innerHTML = `
            <img src="${master.imageUrl || getSafeImageUrl('master', master.name)}" alt="${master.name}" class="master-img">
            <div class="master-info">
                <h3 class="master-name">${master.name}</h3>
                <p class="master-specialization">${master.specialization || 'Не указано'}</p>
                <div class="salon-rating">${renderStars(master.rating || 0)}</div>
                <p class="master-price">${master.price || 0} ₽</p>
            </div>
        `;
        card.addEventListener('click', function() {
            document.querySelectorAll('#booking-masters-container .master-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedMaster = { id: master.id, name: master.name };
        });
        mastersContainer.appendChild(card);
    });
}

async function loadTimeSlots(date) {
    if (!date || !selectedMaster) return;
    
    const timeSlots = [];
    for (let hour = 10; hour <= 20; hour++) {
        timeSlots.push(`${hour}:00`);
        if (hour < 20) timeSlots.push(`${hour}:30`);
    }
    
    const bookings = await getBookings({ masterId: selectedMaster.id, date: date });
    const bookedSlots = bookings.filter(b => b.status !== 'Отменено').map(b => b.time);
    
    const container = document.getElementById('time-slots-container');
    if (!container) return;
    
    container.innerHTML = '';
    timeSlots.forEach(time => {
        const isBooked = bookedSlots.includes(time);
        const slot = document.createElement('div');
        slot.className = `time-slot ${isBooked ? 'booked' : ''}`;
        slot.textContent = time;
        
        if (!isBooked) {
            slot.addEventListener('click', function() {
                document.querySelectorAll('.time-slot').forEach(s => s.classList.remove('selected'));
                slot.classList.add('selected');
                selectedTime = time;
            });
        }
        container.appendChild(slot);
    });
}

function goToStep(stepNumber) {
    document.querySelectorAll('.progress-step').forEach(step => step.classList.remove('active'));
    const activeStep = document.querySelector(`.progress-step[data-step="${stepNumber}"]`);
    if (activeStep) activeStep.classList.add('active');
    
    document.querySelectorAll('.booking-step').forEach(step => step.classList.remove('active'));
    const activeStepContent = document.getElementById(`step-${stepNumber}`);
    if (activeStepContent) activeStepContent.classList.add('active');
}

function updateBookingSummary() {
    const summaryContainer = document.getElementById('booking-summary-details');
    if (!summaryContainer) return;
    
    if (!selectedService || !selectedMaster || !selectedDate || !selectedTime) {
        summaryContainer.innerHTML = '<p class="no-results">Данные не заполнены</p>';
        return;
    }
    
    summaryContainer.innerHTML = `
        <div class="summary-item"><span>Салон:</span><span>${currentSalon?.name || 'Неизвестно'}</span></div>
        <div class="summary-item"><span>Услуга:</span><span>${selectedService.name}</span></div>
        <div class="summary-item"><span>Мастер:</span><span>${selectedMaster.name}</span></div>
        <div class="summary-item"><span>Дата:</span><span>${formatDate(selectedDate)}</span></div>
        <div class="summary-item"><span>Время:</span><span>${selectedTime}</span></div>
        <div class="summary-item summary-total"><span>Итого:</span><span>${selectedService.price} ₽</span></div>
    `;
}

async function confirmBooking() {
    const nameInput = document.getElementById('client-name');
    const lastnameInput = document.getElementById('client-lastname');
    const phoneInput = document.getElementById('client-phone');
    const commentInput = document.getElementById('client-comment');
    
    let name = nameInput.value.trim() || currentUser?.name || '';
    let lastname = lastnameInput.value.trim() || currentUser?.lastname || '';
    let phone = phoneInput.value.trim() || currentUser?.phone || '';
    const comment = commentInput.value.trim();
    
    if (!name || !lastname || !phone) {
        showNotification('Заполните обязательные поля', 'error');
        return;
    }
    
    if (!selectedService || !selectedMaster || !selectedDate || !selectedTime) {
        showNotification('Заполните все данные бронирования', 'error');
        return;
    }
    
    try {
        const bookingData = {
            userId: currentUser?.id || 'guest',
            salonId: currentSalon.id,
            salonName: currentSalon.name,
            serviceId: selectedService.id,
            serviceName: selectedService.name,
            masterId: selectedMaster.id,
            masterName: selectedMaster.name,
            date: selectedDate,
            time: selectedTime,
            clientName: name,
            clientLastname: lastname,
            clientPhone: phone,
            clientComment: comment,
            totalPrice: selectedService.price || 0,
            duration: selectedService.duration || 60,
            bookingDate: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'Подтверждена'
        };
        
        await db.collection('bookings').add(bookingData);
        await logAction('booking', 'booking', 'new', bookingData, `Запись в ${currentSalon.name}`);
        
        showNotification('Запись успешно создана!');
        clearCache();
        
        setTimeout(() => {
            showPage(currentUser ? 'profile-page' : 'home-page');
        }, 2000);
    } catch (error) {
        console.error('Ошибка создания записи:', error);
        showNotification('Ошибка при создании записи', 'error');
    }
}

// ==============================================
// ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ
// ==============================================
async function loadUserBookings() {
    const container = document.getElementById('user-bookings-container');
    if (!container) return;
    
    if (!currentUser || currentUser.role !== 'client') {
        container.innerHTML = `<div class="auth-required-message">
            <p>Для просмотра записей необходимо войти как клиент.</p>
            <button class="btn" onclick="showModal('profile-modal')">Войти</button>
        </div>`;
        return;
    }
    
    const bookings = await getBookings({ userId: currentUser.id });
    
    if (bookings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 50px 0;">
            <p>У вас пока нет записей.</p>
            <button class="btn" onclick="showPage('salons-page')">Записаться</button>
        </div>`;
        return;
    }
    
    bookings.sort((a, b) => new Date(b.bookingDate?.toDate() || 0) - new Date(a.bookingDate?.toDate() || 0));
    
    container.innerHTML = `
        <h2 style="margin-bottom: 30px;">Мои записи (${bookings.length})</h2>
        <div class="services-grid">
            ${bookings.map(booking => `
                <div class="service-card" style="position: relative;">
                    <div style="position: absolute; top: 15px; right: 15px; background: ${getStatusColor(booking.status)}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px;">${booking.status}</div>
                    <div class="service-info">
                        <h3 class="service-name">${booking.salonName}</h3>
                        <p><strong>Услуга:</strong> ${booking.serviceName}</p>
                        <p><strong>Мастер:</strong> ${booking.masterName}</p>
                        <p><strong>Дата:</strong> ${formatDate(booking.date)} ${booking.time}</p>
                        <p><strong>Цена:</strong> ${booking.totalPrice} ₽</p>
                        ${booking.clientComment ? `<p><strong>Комментарий:</strong> ${booking.clientComment}</p>` : ''}
                        ${booking.status === 'Подтверждена' ? `<div style="margin-top: 15px;"><button class="action-btn cancel" onclick="cancelUserBooking('${booking.id}')">Отменить запись</button></div>` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function getStatusColor(status) {
    const colors = {
        'Подтверждена': 'var(--primary-color)',
        'Выполнено': 'var(--success-color)',
        'Отменено': 'var(--error-color)'
    };
    return colors[status] || 'var(--text-light)';
}

async function cancelUserBooking(bookingId) {
    if (!confirm('Отменить запись?')) return;
    
    try {
        await db.collection('bookings').doc(bookingId).update({ status: 'Отменено' });
        showNotification('Запись отменена');
        loadUserBookings();
        clearCache();
    } catch (error) {
        console.error('Ошибка отмены:', error);
        showNotification('Ошибка при отмене', 'error');
    }
}

// ==============================================
// ОТЗЫВЫ О МАСТЕРАХ
// ==============================================
async function submitMasterReview() {
    if (!currentUser) {
        showNotification('Авторизуйтесь, чтобы оставить отзыв', 'error');
        showModal('profile-modal');
        return;
    }
    
    if (!selectedMaster) {
        showNotification('Мастер не выбран', 'error');
        return;
    }
    
    const text = document.getElementById('master-review-text')?.value.trim() || '';
    const rating = selectedMasterRating;
    
    if (rating === 0) {
        showNotification('Оцените мастера', 'error');
        return;
    }
    
    try {
        const existing = await db.collection('master_reviews')
            .where('masterId', '==', selectedMaster.id)
            .where('authorId', '==', currentUser.id)
            .get();
            
        if (!existing.empty) {
            showNotification('Вы уже оставляли отзыв этому мастеру', 'warning');
            return;
        }
        
        const reviewData = {
            authorId: currentUser.id,
            authorName: currentUser.name || currentUser.email.split('@')[0],
            authorImage: getSafeImageUrl('avatar', currentUser.name),
            text: text,
            rating: rating,
            masterId: selectedMaster.id,
            masterName: selectedMaster.name,
            date: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('master_reviews').add(reviewData);
        await updateMasterRating(selectedMaster.id);
        
        document.getElementById('master-review-text').value = '';
        selectedMasterRating = 0;
        updateMasterRatingDisplay();
        
        showNotification('Отзыв опубликован');
        await loadMasterPage(selectedMaster.id);
        clearCache();
    } catch (error) {
        console.error('Ошибка отправки отзыва:', error);
        showNotification('Ошибка при публикации', 'error');
    }
}

function updateMasterRatingDisplay() {
    const stars = document.querySelectorAll('#master-review-stars i');
    const ratingText = document.getElementById('master-selected-rating-text');
    if (!stars.length || !ratingText) return;
    
    stars.forEach((star, index) => {
        star.className = index < selectedMasterRating ? 'fas fa-star active' : 'far fa-star';
    });
    
    ratingText.textContent = selectedMasterRating > 0 ? `${selectedMasterRating} звезд` : '0 звёзд';
}

async function updateMasterRating(masterId) {
    try {
        const reviews = await getMasterReviews(masterId);
        const rating = reviews.length
            ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10
            : 0;
        await db.collection('masters').doc(masterId).update({ rating: rating, reviewCount: reviews.length });
        return rating;
    } catch (error) {
        console.error('Ошибка обновления рейтинга:', error);
        return 0;
    }
}

// ==============================================
// ОТЗЫВЫ О САЛОНАХ
// ==============================================
async function submitReview() {
    if (!currentUser) {
        showNotification('Авторизуйтесь, чтобы оставить отзыв', 'error');
        showModal('profile-modal');
        return;
    }
    
    if (!currentSalon) {
        showNotification('Выберите салон для отзыва', 'error');
        return;
    }
    
    const reviewText = document.getElementById('review-text')?.value.trim() || '';
    
    if (selectedRating === 0) {
        showNotification('Оцените салон', 'error');
        return;
    }
    
    try {
        const existing = await db.collection('reviews')
            .where('salonId', '==', currentSalon.id)
            .where('authorId', '==', currentUser.id)
            .get();
            
        if (!existing.empty) {
            showNotification('Вы уже оставляли отзыв для этого салона', 'warning');
            return;
        }
        
        const reviewData = {
            authorId: currentUser.id,
            authorName: currentUser.name || currentUser.email.split('@')[0],
            authorImage: getSafeImageUrl('avatar', currentUser.name),
            text: reviewText,
            rating: selectedRating,
            salonId: currentSalon.id,
            salonName: currentSalon.name,
            date: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('reviews').add(reviewData);
        await updateSalonRating(currentSalon.id);
        
        document.getElementById('review-text').value = '';
        selectedRating = 0;
        updateRatingDisplay();
        
        showNotification('Отзыв опубликован');
        await loadSalonReviews();
        clearCache();
    } catch (error) {
        console.error('Ошибка отправки отзыва:', error);
        showNotification('Ошибка при публикации', 'error');
    }
}

function updateRatingDisplay() {
    const stars = document.querySelectorAll('#review-stars i');
    const ratingText = document.getElementById('selected-rating-text');
    if (!stars.length || !ratingText) return;
    
    stars.forEach((star, index) => {
        star.className = index < selectedRating ? 'fas fa-star active' : 'far fa-star';
    });
    
    ratingText.textContent = selectedRating > 0 ? `${selectedRating} звезд` : '0 звёзд';
}

async function updateSalonRating(salonId) {
    try {
        const reviews = await getReviews({ salonId: salonId });
        
        if (reviews.length === 0) {
            await db.collection('salons').doc(salonId).update({ rating: 0, reviewCount: 0 });
            return 0;
        }
        
        const totalRating = reviews.reduce((sum, review) => sum + (parseFloat(review.rating) || 0), 0);
        const averageRating = Math.round((totalRating / reviews.length) * 10) / 10;
        
        await db.collection('salons').doc(salonId).update({ rating: averageRating, reviewCount: reviews.length });
        return averageRating;
    } catch (error) {
        console.error('Ошибка обновления рейтинга:', error);
        return 0;
    }
}

async function loadSalonReviews() {
    if (!currentSalon) return;
    
    const reviewsEl = document.getElementById('salon-reviews-list');
    if (!reviewsEl) return;
    
    const reviews = await getReviews({ salonId: currentSalon.id });
    
    reviewsEl.innerHTML = '';
    if (reviews.length === 0) {
        reviewsEl.innerHTML = '<div class="no-results">Отзывов пока нет</div>';
    } else {
        reviews.forEach(review => {
            const reviewItem = document.createElement('div');
            reviewItem.className = 'review-item';
            reviewItem.innerHTML = `
                <div class="review-header">
                    <img src="${review.authorImage || getSafeImageUrl('avatar', review.authorName)}" class="review-author-img">
                    <div>
                        <div class="review-author">${review.authorName || 'Аноним'}</div>
                        <div class="review-date">${formatDate(review.date)}</div>
                    </div>
                </div>
                <div class="review-rating-stars">${renderStars(review.rating || 0)}</div>
                ${review.text ? `<div class="review-text">${review.text}</div>` : ''}
            `;
            reviewsEl.appendChild(reviewItem);
        });
    }
}

// ==============================================
// УПРАВЛЕНИЕ ОТЗЫВАМИ В АДМИН-ПАНЕЛИ
// ==============================================
async function populateSalonFilterForReviews() {
    const select = document.getElementById('review-salon-filter');
    if (!select) return;
    
    const salons = await getCachedData('salons');
    select.innerHTML = '<option value="all">Все салоны</option>';
    salons.forEach(salon => {
        const option = document.createElement('option');
        option.value = salon.id;
        option.textContent = salon.name;
        select.appendChild(option);
    });
}

async function loadReviewsManagement() {
    const tableBody = document.getElementById('reviews-management-table');
    if (!tableBody) return;
    
    const filterSelect = document.getElementById('review-salon-filter');
    const selectedSalonId = filterSelect ? filterSelect.value : 'all';
    
    let reviews;
    if (selectedSalonId === 'all') {
        reviews = await getCachedData('reviews');
    } else {
        reviews = await getReviews({ salonId: selectedSalonId });
    }
    
    const salons = await getCachedData('salons');
    const salonMap = Object.fromEntries(salons.map(s => [s.id, s.name]));
    
    tableBody.innerHTML = '';
    reviews.forEach(review => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${review.authorName || 'Аноним'}</td>
            <td>${salonMap[review.salonId] || 'Неизвестно'}</td>
            <td>${renderStars(review.rating || 0)} ${review.rating || 0}</td>
            <td>${review.text ? review.text.substring(0, 100) + (review.text.length > 100 ? '...' : '') : 'Нет текста'}</td>
            <td>${formatDate(review.date)}</td>
            <td><button class="action-btn delete" onclick="deleteReview('${review.id}')">Удалить</button></td>
        `;
        tableBody.appendChild(row);
    });
}

async function deleteReview(reviewId) {
    if (!confirm('Удалить отзыв?')) return;
    
    try {
        const reviewDoc = await db.collection('reviews').doc(reviewId).get();
        const reviewData = reviewDoc.exists ? reviewDoc.data() : null;
        
        await db.collection('reviews').doc(reviewId).delete();
        await logAction('delete', 'review', reviewId, { originalData: reviewData }, 'Отзыв удален');
        
        if (reviewData?.salonId) await updateSalonRating(reviewData.salonId);
        
        showNotification('Отзыв удален');
        loadReviewsManagement();
        clearCache();
    } catch (error) {
        console.error('Ошибка удаления отзыва:', error);
        showNotification('Ошибка при удалении', 'error');
    }
}

// ==============================================
// ИСТОРИЯ ДЕЙСТВИЙ
// ==============================================
async function loadActionsHistory() {
    const userType = document.getElementById('history-user-type')?.value || 'all';
    const actionType = document.getElementById('history-action-type')?.value || 'all';
    
    const filters = {};
    if (userType !== 'all') filters.userType = userType;
    if (actionType !== 'all') filters.actionType = actionType;
    
    const actions = await getActionsHistory(filters);
    const tableBody = document.getElementById('actions-history-table');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    actions.forEach(action => {
        const canUndo = action.status === 'completed' && currentUser?.role === 'admin' && action.actionType !== 'booking';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDateTime(action.timestamp)}</td>
            <td>${action.userName || 'Неизвестно'} (${action.userRole || 'неизвестно'})</td>
            <td>${getActionDescription(action)}</td>
            <td>${getObjectDescription(action)}</td>
            <td>${canUndo ? `<button class="action-btn undo" onclick="undoAction('${action.id}')">Отменить</button>` : action.status === 'undone' ? 'Отменено' : '-'}</td>
        `;
        tableBody.appendChild(row);
    });
}

function getActionDescription(action) {
    const actions = {
        'create': 'Создание',
        'update': 'Изменение',
        'delete': 'Удаление',
        'booking': 'Бронирование',
        'review': 'Отзыв',
        'user_update': 'Изменение профиля',
        'master_transfer': 'Перевод мастера'
    };
    return actions[action.actionType] || action.actionType;
}

function getObjectDescription(action) {
    const objectType = action.objectType || '';
    const objectName = action.objectName || action.objectId || '';
    
    const types = {
        'salon': 'Салон',
        'service': 'Услуга',
        'master': 'Мастер',
        'user': 'Пользователь',
        'booking': 'Запись',
        'review': 'Отзыв'
    };
    
    return `${types[objectType] || objectType}: ${objectName}`;
}

async function undoAction(actionId) {
    if (!confirm('Отменить это действие?')) return;
    
    try {
        const actionDoc = await db.collection('actions_history').doc(actionId).get();
        if (!actionDoc.exists) return;
        
        const action = actionDoc.data();
        const originalData = action.details?.originalData;
        
        if (!originalData) {
            showNotification('Невозможно отменить действие', 'error');
            return;
        }
        
        let restored = false;
        
        switch (action.objectType) {
            case 'salon':
                if (action.actionType === 'update') {
                    await db.collection('salons').doc(action.objectId).update(originalData);
                    restored = true;
                } else if (action.actionType === 'delete') {
                    await db.collection('salons').doc(action.objectId).set(originalData);
                    restored = true;
                }
                break;
            case 'service':
                if (action.actionType === 'update') {
                    await db.collection('services').doc(action.objectId).update(originalData);
                    restored = true;
                } else if (action.actionType === 'delete') {
                    await db.collection('services').doc(action.objectId).set(originalData);
                    restored = true;
                }
                break;
            case 'master':
                if (action.actionType === 'update') {
                    await db.collection('masters').doc(action.objectId).update(originalData);
                    restored = true;
                } else if (action.actionType === 'delete') {
                    await db.collection('masters').doc(action.objectId).set(originalData);
                    restored = true;
                }
                break;
            case 'review':
                if (action.actionType === 'delete') {
                    await db.collection('reviews').doc(action.objectId).set(originalData);
                    restored = true;
                }
                break;
        }
        
        if (restored) {
            await db.collection('actions_history').doc(actionId).update({ status: 'undone' });
            showNotification('Действие отменено');
            loadActionsHistory();
            updateAdminTables();
            clearCache();
        }
    } catch (error) {
        console.error('Ошибка отмены действия:', error);
        showNotification('Ошибка при отмене', 'error');
    }
}

async function clearActionsHistory() {
    if (!confirm('Очистить всю историю?')) return;
    
    try {
        const snapshot = await db.collection('actions_history').get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        showNotification('История очищена');
        loadActionsHistory();
    } catch (error) {
        console.error('Ошибка очистки истории:', error);
        showNotification('Ошибка при очистке', 'error');
    }
}

// ==============================================
// ЗАЯВКИ МАСТЕРОВ
// ==============================================
async function loadMasterRequests() {
    const tableBody = document.getElementById('master-requests-table');
    if (!tableBody) return;
    
    try {
        const snapshot = await db.collection('master_requests').orderBy('createdAt', 'desc').get();
        tableBody.innerHTML = '';
        
        snapshot.forEach(doc => {
            const req = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${req.userName || 'Неизвестно'}</td>
                <td>${req.userEmail || ''}</td>
                <td>${req.salonName || 'Неизвестно'}</td>
                <td>${req.specialization || ''}</td>
                <td>${formatDate(req.createdAt)}</td>
                <td>${req.status || 'pending'}</td>
                <td>
                    ${req.status === 'pending' ? `
                        <button class="action-btn complete" onclick="approveMasterRequest('${doc.id}')">Одобрить</button>
                        <button class="action-btn cancel" onclick="rejectMasterRequest('${doc.id}')">Отклонить</button>
                    ` : ''}
                </td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Ошибка загрузки заявок:', error);
    }
}

async function approveMasterRequest(requestId) {
    try {
        const requestDoc = await db.collection('master_requests').doc(requestId).get();
        if (!requestDoc.exists) return;
        
        const request = requestDoc.data();
        await db.collection('master_requests').doc(requestId).update({ status: 'approved' });
        
        const masterData = {
            name: request.userName,
            specialization: request.specialization,
            salonId: request.salonId,
            salonName: request.salonName,
            userId: request.userId,
            price: 0,
            providedServices: [],
            rating: 0,
            reviewCount: 0,
            daysOff: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('masters').add(masterData);
        await db.collection('users').doc(request.userId).update({ role: 'master' });
        
        showNotification('Заявка одобрена');
        loadMasterRequests();
        clearCache();
    } catch (error) {
        console.error('Ошибка одобрения заявки:', error);
        showNotification('Ошибка', 'error');
    }
}

async function rejectMasterRequest(requestId) {
    try {
        await db.collection('master_requests').doc(requestId).update({ status: 'rejected' });
        showNotification('Заявка отклонена');
        loadMasterRequests();
    } catch (error) {
        console.error('Ошибка отклонения заявки:', error);
        showNotification('Ошибка', 'error');
    }
}

async function submitMasterRequest() {
    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Только клиенты могут подавать заявки', 'error');
        return;
    }
    
    const salonId = document.getElementById('request-salon').value;
    const specialization = document.getElementById('request-specialization').value;
    
    if (!salonId || !specialization) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    try {
        const salonDoc = await db.collection('salons').doc(salonId).get();
        if (!salonDoc.exists) {
            showNotification('Салон не найден', 'error');
            return;
        }
        const salon = salonDoc.data();
        
        const requestData = {
            userId: currentUser.id,
            userName: currentUser.name,
            userEmail: currentUser.email,
            salonId: salonId,
            salonName: salon.name,
            specialization: specialization,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('master_requests').add(requestData);
        
        hideModal('master-request-modal');
        showNotification('Заявка отправлена!', 'success');
    } catch (error) {
        console.error('Ошибка отправки заявки:', error);
        showNotification('Ошибка при отправке', 'error');
    }
}

// ==============================================
// ФУНКЦИИ ДЛЯ ФОРМ
// ==============================================
async function addSalon() {
    const name = document.getElementById('salon-name').value.trim();
    const address = document.getElementById('salon-address').value.trim();
    
    if (!name || !address) {
        showNotification('Заполните обязательные поля', 'error');
        return;
    }
    
    const fileInput = document.getElementById('salon-image-upload');
    const urlInput = document.getElementById('salon-image-url');
    let imageUrl = null;
    
    if (fileInput.files.length > 0) {
        imageUrl = await uploadImage(fileInput.files[0], 'salons');
    } else if (urlInput.value.trim()) {
        imageUrl = urlInput.value.trim();
    }
    
    const specializations = [];
    document.querySelectorAll('input[name="specialization"]:checked').forEach(cb => specializations.push(cb.value));
    
    const selectedServiceIds = Array.from(document.querySelectorAll('#salon-services-checkboxes input:checked')).map(cb => cb.value);
    
    const salonData = {
        name, address,
        district: document.getElementById('salon-district').value,
        description: document.getElementById('salon-description').value.trim(),
        specializations,
        serviceIds: selectedServiceIds,
        ...(imageUrl && { imageUrl }),
        rating: 0,
        reviewCount: 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        if (editingSalonId) {
            await db.collection('salons').doc(editingSalonId).update(salonData);
            showNotification('Салон обновлен');
        } else {
            salonData.averagePrice = 2500;
            salonData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('salons').add(salonData);
            showNotification('Салон добавлен');
        }
        
        hideModal('add-salon-modal');
        updateAdminTables();
        clearCache();
        editingSalonId = null;
        resetSalonForm();
    } catch (error) {
        console.error('Ошибка сохранения салона:', error);
        showNotification('Ошибка при сохранении', 'error');
    }
}

async function addService() {
    const name = document.getElementById('service-name').value.trim();
    const price = document.getElementById('service-price').value.trim();
    
    if (!name || !price) {
        showNotification('Заполните обязательные поля', 'error');
        return;
    }
    
    const fileInput = document.getElementById('service-image-upload');
    const urlInput = document.getElementById('service-image-url');
    let imageUrl = null;
    
    if (fileInput.files.length > 0) {
        imageUrl = await uploadImage(fileInput.files[0], 'services');
    } else if (urlInput.value.trim()) {
        imageUrl = urlInput.value.trim();
    }
    
    const serviceData = {
        name,
        category: document.getElementById('service-category').value,
        price: parseInt(price),
        duration: parseInt(document.getElementById('service-duration').value) || 60,
        ...(imageUrl && { imageUrl }),
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const selectedSalonIds = Array.from(document.querySelectorAll('#service-salons-checkboxes input:checked')).map(cb => cb.value);
    
    try {
        const batch = db.batch();
        
        for (const salonId of selectedSalonIds) {
            const serviceRef = db.collection('services').doc();
            batch.set(serviceRef, { ...serviceData, salonId });
            batch.update(db.collection('salons').doc(salonId), {
                serviceIds: firebase.firestore.FieldValue.arrayUnion(serviceRef.id)
            });
        }
        
        await batch.commit();
        showNotification('Услуга добавлена');
        hideModal('add-service-modal');
        updateAdminTables();
        loadAdminServicesGrid();
        clearCache();
        resetServiceForm();
    } catch (error) {
        console.error('Ошибка сохранения услуги:', error);
        showNotification('Ошибка при сохранении', 'error');
    }
}

async function addMaster() {
    const name = document.getElementById('master-name').value.trim();
    const lastname = document.getElementById('master-lastname').value.trim();
    
    let specialization = document.getElementById('master-specialization').value;
    if (specialization === 'other') {
        specialization = document.getElementById('master-specialization-other').value.trim();
        if (!specialization) {
            showNotification('Укажите специализацию', 'error');
            return;
        }
    }
    
    const salonId = document.getElementById('master-salon').value;
    const email = document.getElementById('master-email').value.trim();
    const password = document.getElementById('master-password').value.trim();
    
    const providedServices = Array.from(document.querySelectorAll('#master-services-checkboxes input:checked')).map(cb => cb.value);
    
    if (!name || !lastname || !specialization || !salonId) {
        showNotification('Заполните обязательные поля', 'error');
        return;
    }
    
    if (!editingMasterId && (!email || !password)) {
        showNotification('Укажите email и пароль', 'error');
        return;
    }
    
    if (!editingMasterId && password.length < 6) {
        showNotification('Пароль должен быть минимум 6 символов', 'error');
        return;
    }
    
    const fileInput = document.getElementById('master-image-upload');
    const urlInput = document.getElementById('master-image-url');
    let imageUrl = null;
    
    if (fileInput.files.length > 0) {
        imageUrl = await uploadImage(fileInput.files[0], 'masters');
    } else if (urlInput.value.trim()) {
        imageUrl = urlInput.value.trim();
    }
    
    try {
        const salonDoc = await db.collection('salons').doc(salonId).get();
        const salonName = salonDoc.exists ? salonDoc.data().name : 'Неизвестный салон';
        
        if (editingMasterId) {
            await db.collection('masters').doc(editingMasterId).update({
                name: `${name} ${lastname}`,
                firstName: name,
                lastName: lastname,
                specialization,
                salonId,
                salonName,
                providedServices,
                ...(imageUrl && { imageUrl }),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showNotification('Мастер обновлен');
        } else {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            await db.collection('users').doc(user.uid).set({
                email, name, lastname, phone: '', role: 'master',
                registrationDate: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await db.collection('masters').add({
                name: `${name} ${lastname}`,
                firstName: name,
                lastName: lastname,
                specialization,
                price: 0,
                salonId,
                salonName,
                providedServices,
                userId: user.uid,
                ...(imageUrl && { imageUrl }),
                rating: 0,
                reviewCount: 0,
                daysOff: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            showNotification('Мастер добавлен');
        }
        
        hideModal('add-master-modal');
        updateAdminTables();
        clearCache();
        editingMasterId = null;
        resetMasterForm();
    } catch (error) {
        console.error('Ошибка сохранения мастера:', error);
        if (error.code === 'auth/email-already-in-use') {
            showNotification('Пользователь с таким email уже существует', 'error');
        } else {
            showNotification('Ошибка при сохранении', 'error');
        }
    }
}

async function loadSelectOptions() {
    const salons = await getCachedData('salons');
    
    ['service-salon', 'master-salon', 'request-salon'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">Выберите салон</option>';
            salons.forEach(salon => {
                const option = document.createElement('option');
                option.value = salon.id;
                option.textContent = salon.name;
                select.appendChild(option);
            });
        }
    });
    
    const serviceSalonsContainer = document.getElementById('service-salons-checkboxes');
    if (serviceSalonsContainer) {
        serviceSalonsContainer.innerHTML = '';
        salons.forEach(salon => {
            const wrapper = document.createElement('div');
            wrapper.className = 'checkbox-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = salon.id;
            checkbox.id = `service-salon-${salon.id}`;
            const label = document.createElement('label');
            label.htmlFor = `service-salon-${salon.id}`;
            label.textContent = salon.name;
            wrapper.appendChild(checkbox);
            wrapper.appendChild(label);
            serviceSalonsContainer.appendChild(wrapper);
        });
    }
}

async function loadSalonServicesCheckboxes(selectedIds = []) {
    const container = document.getElementById('salon-services-checkboxes');
    if (!container) return;
    
    const uniqueServices = await getUniqueServices();
    container.innerHTML = '';
    
    if (uniqueServices.length === 0) {
        container.innerHTML = '<p class="text-muted">Нет услуг</p>';
        return;
    }
    
    uniqueServices.forEach(service => {
        const wrapper = document.createElement('div');
        wrapper.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = service.id;
        checkbox.id = `salon-service-${service.id}`;
        checkbox.checked = selectedIds.includes(service.id);
        
        const label = document.createElement('label');
        label.htmlFor = `salon-service-${service.id}`;
        label.textContent = `${service.name} (${service.price} ₽)`;
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
}

async function updateMasterServicesCheckboxes(salonId, selectedIds = []) {
    const container = document.getElementById('master-services-checkboxes');
    if (!container) return;
    
    if (!salonId) {
        container.innerHTML = '<p class="text-muted">Сначала выберите салон</p>';
        return;
    }
    
    const services = await getSalonServices(salonId);
    const uniqueServices = new Map();
    services.forEach(service => {
        if (!uniqueServices.has(service.name)) {
            uniqueServices.set(service.name, service);
        }
    });
    
    container.innerHTML = '';
    if (uniqueServices.size === 0) {
        container.innerHTML = '<p class="text-muted">В салоне нет услуг</p>';
        return;
    }
    
    uniqueServices.forEach(service => {
        const wrapper = document.createElement('div');
        wrapper.className = 'checkbox-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = service.id;
        checkbox.id = `master-service-${service.id}`;
        checkbox.checked = selectedIds.includes(service.id);
        
        const label = document.createElement('label');
        label.htmlFor = `master-service-${service.id}`;
        label.textContent = `${service.name} (${service.price} ₽)`;
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);
        container.appendChild(wrapper);
    });
    
    attachMasterPriceListener();
}

function attachMasterPriceListener() {
    const container = document.getElementById('master-services-checkboxes');
    if (!container) return;
    
    container.removeEventListener('change', updateMasterPriceFromCheckboxes);
    container.addEventListener('change', updateMasterPriceFromCheckboxes);
}

function updateMasterPriceFromCheckboxes() {
    const checkboxes = document.querySelectorAll('#master-services-checkboxes input:checked');
    let total = 0;
    let count = 0;
    
    checkboxes.forEach(cb => {
        const label = document.querySelector(`label[for="${cb.id}"]`);
        if (label) {
            const match = label.textContent.match(/\((\d+)\s*₽\)/);
            if (match) {
                total += parseInt(match[1]);
                count++;
            }
        }
    });
    
    document.getElementById('master-price').value = count ? Math.round(total / count) : 0;
}

function resetSalonForm() {
    document.getElementById('salon-name').value = '';
    document.getElementById('salon-address').value = '';
    document.getElementById('salon-district').value = 'center';
    document.getElementById('salon-description').value = '';
    document.querySelectorAll('input[name="specialization"]').forEach(cb => cb.checked = false);
    document.getElementById('salon-services-checkboxes').innerHTML = '';
    document.getElementById('salon-image-upload').value = '';
    document.getElementById('salon-image-url').value = '';
    document.getElementById('salon-image-preview').innerHTML = '';
    document.getElementById('salon-modal-title').textContent = 'Добавить салон';
    editingSalonId = null;
}

function resetServiceForm() {
    document.getElementById('service-name').value = '';
    document.getElementById('service-category').value = 'hair';
    document.getElementById('service-price').value = '';
    document.getElementById('service-duration').value = '60';
    document.getElementById('service-image-upload').value = '';
    document.getElementById('service-image-url').value = '';
    document.getElementById('service-image-preview').innerHTML = '';
    document.getElementById('service-modal-title').textContent = 'Добавить услугу';
    editingServiceId = null;
    
    loadSelectOptions().then(() => {
        const container = document.getElementById('service-salons-checkboxes');
        if (container) {
            const salons = cache.salons || [];
            container.innerHTML = '';
            salons.forEach(salon => {
                const wrapper = document.createElement('div');
                wrapper.className = 'checkbox-item';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = salon.id;
                checkbox.id = `service-salon-${salon.id}`;
                const label = document.createElement('label');
                label.htmlFor = `service-salon-${salon.id}`;
                label.textContent = salon.name;
                wrapper.appendChild(checkbox);
                wrapper.appendChild(label);
                container.appendChild(wrapper);
            });
        }
    });
}

function resetMasterForm() {
    document.getElementById('master-name').value = '';
    document.getElementById('master-lastname').value = '';
    
    const specSelect = document.getElementById('master-specialization');
    specSelect.value = '';
    document.getElementById('master-specialization-other-group').style.display = 'none';
    document.getElementById('master-specialization-other').value = '';
    
    document.getElementById('master-price').value = '';
    document.getElementById('master-salon').value = '';
    document.getElementById('master-services-checkboxes').innerHTML = '';
    document.getElementById('master-email').value = '';
    document.getElementById('master-password').value = '';
    
    document.getElementById('master-email').style.display = 'block';
    document.getElementById('master-password').style.display = 'block';
    const emailLabel = document.querySelector('label[for="master-email"]');
    const passwordLabel = document.querySelector('label[for="master-password"]');
    if (emailLabel) emailLabel.style.display = 'block';
    if (passwordLabel) passwordLabel.style.display = 'block';
    
    document.getElementById('master-image-upload').value = '';
    document.getElementById('master-image-url').value = '';
    document.getElementById('master-image-preview').innerHTML = '';
    
    document.getElementById('master-modal-title').textContent = 'Добавить мастера';
    editingMasterId = null;
}

async function addNewServiceForMaster() {
    const salonId = document.getElementById('master-salon').value;
    if (!salonId) {
        showNotification('Сначала выберите салон', 'error');
        return;
    }
    
    const name = document.getElementById('new-service-name').value.trim();
    const category = document.getElementById('new-service-category').value;
    const price = parseInt(document.getElementById('new-service-price').value);
    const duration = parseInt(document.getElementById('new-service-duration').value);
    
    if (!name || !price || !duration) {
        showNotification('Заполните все поля', 'error');
        return;
    }
    
    try {
        const existing = await db.collection('services')
            .where('name', '==', name)
            .where('salonId', '==', salonId)
            .get();
            
        if (!existing.empty) {
            showNotification('Услуга с таким названием уже есть в этом салоне', 'warning');
            return;
        }
        
        const serviceData = {
            name, category, price, duration,
            salonId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const serviceRef = await db.collection('services').add(serviceData);
        
        await db.collection('salons').doc(salonId).update({
            serviceIds: firebase.firestore.FieldValue.arrayUnion(serviceRef.id)
        });
        
        showNotification('Услуга добавлена');
        await updateMasterServicesCheckboxes(salonId, [serviceRef.id]);
        
        hideModal('add-new-service-modal');
        document.getElementById('new-service-name').value = '';
        document.getElementById('new-service-price').value = '';
        document.getElementById('new-service-duration').value = '60';
    } catch (error) {
        console.error('Ошибка создания услуги:', error);
        showNotification('Ошибка при создании', 'error');
    }
}

async function loadMasterActionsHistory() {
    const actions = await getActionsHistory({ userId: currentUser.id });
    const tableBody = document.getElementById('master-actions-history-table');
    if (!tableBody) return;
    
    if (actions.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="no-results">Нет истории действий</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    actions.forEach(action => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDateTime(action.timestamp)}</td>
            <td>${getActionDescription(action)}</td>
            <td>${getObjectDescription(action)}</td>
            <td>-</td>
        `;
        tableBody.appendChild(row);
    });
}

function updateServicesContainerHeight() {
    const container = document.querySelector('.admin-section .data-table-container .services-grid');
    if (container) {
        const windowHeight = window.innerHeight;
        const newHeight = Math.min(450, windowHeight - 200);
        container.style.maxHeight = newHeight + 'px';
    }
}

async function ensureAdminExists() {
    try {
        const adminEmail = 'admin@beauty.ru';
        const adminPassword = 'admin1';
        
        const users = await getUsers();
        const adminExists = users.some(user => user.email === adminEmail && user.role === 'admin');
        
        if (!adminExists) {
            try {
                const userCredential = await auth.createUserWithEmailAndPassword(adminEmail, adminPassword);
                const user = userCredential.user;
                
                await db.collection('users').doc(user.uid).set({
                    email: adminEmail,
                    name: 'Администратор',
                    lastname: 'Системы',
                    phone: '+7 (999) 123-45-67',
                    role: 'admin',
                    isAdmin: true,
                    registrationDate: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log('Администратор создан');
            } catch (error) {
                console.error('Ошибка создания админа:', error);
            }
        }
    } catch (error) {
        console.error('Ошибка проверки админа:', error);
    }
}

// ==============================================
// ЭКСПОРТ ФУНКЦИЙ
// ==============================================
window.showServicePage = showServicePage;
window.openServiceManagementModal = openServiceManagementModal;
window.deleteServiceByName = deleteServiceByName;
window.editSalon = editSalon;
window.editMaster = editMaster;
window.editUser = editUser;
window.deleteSalon = deleteSalon;
window.deleteMaster = deleteMaster;
window.deleteUser = deleteUser;
window.updateBookingStatus = updateBookingStatus;
window.startBookingForSalon = startBookingForSalon;
window.startBookingForMaster = startBookingForMaster;
window.showModal = showModal;
window.hideModal = hideModal;
window.login = login;
window.register = register;
window.logout = logout;
window.submitReview = submitReview;
window.submitMasterReview = submitMasterReview;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;
window.cancelUserBooking = cancelUserBooking;
window.approveMasterRequest = approveMasterRequest;
window.rejectMasterRequest = rejectMasterRequest;
window.deleteReview = deleteReview;
window.undoAction = undoAction;
window.clearActionsHistory = clearActionsHistory;

// ==============================================
// ИНИЦИАЛИЗАЦИЯ
// ==============================================
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('input:not([type="submit"]):not([type="button"]):not([type="checkbox"]), textarea').forEach(element => {
        element.value = '';
    });
    
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.value = '';
        
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadSalonsWithFilters();
            }, 300);
        });
    }
    
    const savedUser = localStorage.getItem('beautyBookingUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateProfileButton();
        } catch (e) {
            localStorage.removeItem('beautyBookingUser');
        }
    }
    
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    currentUser = { id: user.uid, ...userDoc.data() };
                    localStorage.setItem('beautyBookingUser', JSON.stringify(currentUser));
                }
            } catch (error) {
                console.error('Ошибка загрузки пользователя:', error);
            }
        } else {
            currentUser = null;
            localStorage.removeItem('beautyBookingUser');
        }
        updateProfileButton();
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.dataset.page;
            
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            
            switch (page) {
                case 'home': showPage('home-page'); break;
                case 'salons': showPage('salons-page'); break;
                case 'services': showPage('services-page'); break;
                case 'masters': showPage('masters-page'); break;
                case 'profile':
                    if (currentUser?.role === 'client') showPage('profile-page');
                    else showModal('profile-modal');
                    break;
                case 'admin':
                    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'master')) {
                        showPage('admin-page');
                    } else {
                        showNotification('Доступ запрещен', 'error');
                    }
                    break;
                case 'master-schedule':
                    if (currentUser?.role === 'master') showPage('master-schedule-page');
                    else showNotification('Доступ только для мастеров', 'error');
                    break;
            }
        });
    });
    
    document.getElementById('profile-modal-btn')?.addEventListener('click', () => {
        if (!currentUser) showModal('profile-modal');
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', function() {
            const modalId = this.closest('.modal').id;
            hideModal(modalId);
            clearModalFields(modalId);
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideModal(this.id);
                clearModalFields(this.id);
            }
        });
    });
    
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabType = this.dataset.authTab;
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            document.getElementById(`${tabType}-form`).classList.add('active');
        });
    });
    
    document.getElementById('switch-to-register')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('.auth-tab[data-auth-tab="register"]').click();
    });
    
    document.getElementById('switch-to-login')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('.auth-tab[data-auth-tab="login"]').click();
    });
    
    document.getElementById('login-btn')?.addEventListener('click', login);
    document.getElementById('register-btn')?.addEventListener('click', register);
    
    document.getElementById('search-btn')?.addEventListener('click', performSearch);
    document.getElementById('apply-filters')?.addEventListener('click', applyFilters);
    
    document.querySelectorAll('#review-stars i').forEach(star => {
        star.addEventListener('click', function() {
            selectedRating = parseInt(this.dataset.rating);
            updateRatingDisplay();
        });
    });
    
    document.querySelectorAll('#master-review-stars i').forEach(star => {
        star.addEventListener('click', function() {
            selectedMasterRating = parseInt(this.dataset.rating);
            updateMasterRatingDisplay();
        });
    });
    
    document.getElementById('submit-master-review')?.addEventListener('click', submitMasterReview);
    document.getElementById('submit-review')?.addEventListener('click', submitReview);
    
    document.getElementById('to-step-2')?.addEventListener('click', function() {
        if (!selectedService) {
            showNotification('Выберите услугу', 'error');
            return;
        }
        goToStep(2);
        loadMastersForBooking();
    });
    
    document.getElementById('back-to-step-1')?.addEventListener('click', () => goToStep(1));
    
    document.getElementById('to-step-3')?.addEventListener('click', function() {
        if (!selectedMaster) {
            showNotification('Выберите мастера', 'error');
            return;
        }
        goToStep(3);
        
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('booking-date');
        dateInput.min = today;
        dateInput.value = today;
        selectedDate = today;
        loadTimeSlots(today);
    });
    
    document.getElementById('booking-date')?.addEventListener('change', function() {
        selectedDate = this.value;
        if (selectedMaster) loadTimeSlots(selectedDate);
    });
    
    document.getElementById('back-to-step-2')?.addEventListener('click', () => goToStep(2));
    
    document.getElementById('to-step-4')?.addEventListener('click', function() {
        if (!selectedDate || !selectedTime) {
            showNotification('Выберите дату и время', 'error');
            return;
        }
        goToStep(4);
        updateBookingSummary();
        
        if (currentUser) {
            document.getElementById('client-name').value = currentUser.name || '';
            document.getElementById('client-lastname').value = currentUser.lastname || '';
            document.getElementById('client-phone').value = currentUser.phone || '';
        }
    });
    
    document.getElementById('back-to-step-3')?.addEventListener('click', () => goToStep(3));
    document.getElementById('confirm-booking')?.addEventListener('click', confirmBooking);
    
    document.addEventListener('click', function(e) {
        if (e.target.closest('.mode-btn')) {
            const btn = e.target.closest('.mode-btn');
            const mode = btn.dataset.mode;
            
            if (['master-bookings', 'master-actions-history', 'master-services'].includes(mode)) {
                document.querySelectorAll('#master-mode .mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.getElementById('master-bookings-mode').style.display = mode === 'master-bookings' ? 'block' : 'none';
                document.getElementById('master-actions-history-mode').style.display = mode === 'master-actions-history' ? 'block' : 'none';
                document.getElementById('master-services-mode').style.display = mode === 'master-services' ? 'block' : 'none';
                
                if (mode === 'master-actions-history') loadMasterActionsHistory();
                if (mode === 'master-services' && currentActiveMasterId) loadMasterServicesList(currentActiveMasterId);
            } else if (['admin', 'actions-history', 'reviews-management', 'users-management', 'master-requests'].includes(mode)) {
                document.querySelectorAll('#admin-mode-switcher .mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.getElementById('admin-mode').style.display = mode === 'admin' ? 'block' : 'none';
                document.getElementById('actions-history-mode').style.display = mode === 'actions-history' ? 'block' : 'none';
                document.getElementById('reviews-management-mode').style.display = mode === 'reviews-management' ? 'block' : 'none';
                document.getElementById('users-management-mode').style.display = mode === 'users-management' ? 'block' : 'none';
                document.getElementById('master-requests-mode').style.display = mode === 'master-requests' ? 'block' : 'none';
                
                if (mode === 'actions-history') loadActionsHistory();
                if (mode === 'reviews-management') {
                    populateSalonFilterForReviews();
                    loadReviewsManagement();
                }
                if (mode === 'master-requests') loadMasterRequests();
            }
        }
    });
    
    document.getElementById('add-salon-btn')?.addEventListener('click', function() {
        resetSalonForm();
        loadSalonServicesCheckboxes([]);
        showModal('add-salon-modal');
    });
    
    document.getElementById('add-service-admin-btn')?.addEventListener('click', function() {
        resetServiceForm();
        showModal('add-service-modal');
    });
    
    document.getElementById('add-master-btn')?.addEventListener('click', function() {
        resetMasterForm();
        loadSelectOptions();
        showModal('add-master-modal');
    });
    
    document.getElementById('apply-review-filter')?.addEventListener('click', loadReviewsManagement);
    document.getElementById('refresh-history')?.addEventListener('click', loadActionsHistory);
    document.getElementById('clear-history')?.addEventListener('click', clearActionsHistory);
    
    document.getElementById('save-salon')?.addEventListener('click', addSalon);
    document.getElementById('save-service')?.addEventListener('click', addService);
    document.getElementById('save-master')?.addEventListener('click', addMaster);
    document.getElementById('save-edit-user')?.addEventListener('click', saveUser);
    document.getElementById('save-edit-master')?.addEventListener('click', saveMasterProfile);
    
    document.getElementById('cancel-salon')?.addEventListener('click', () => {
        hideModal('add-salon-modal');
        resetSalonForm();
    });
    document.getElementById('cancel-service')?.addEventListener('click', () => {
        hideModal('add-service-modal');
        resetServiceForm();
    });
    document.getElementById('cancel-master')?.addEventListener('click', () => {
        hideModal('add-master-modal');
        resetMasterForm();
    });
    document.getElementById('cancel-edit-user')?.addEventListener('click', () => hideModal('edit-user-modal'));
    document.getElementById('cancel-edit-master')?.addEventListener('click', () => hideModal('edit-master-modal'));
    document.getElementById('reset-user-password-btn')?.addEventListener('click', resetUserPassword);
    
    document.getElementById('edit-master-profile')?.addEventListener('click', editMasterProfile);
    document.getElementById('delete-master-profile')?.addEventListener('click', deleteMasterProfile);
    document.getElementById('refresh-master-bookings')?.addEventListener('click', function() {
        if (currentActiveMasterId) loadMasterBookingsForMaster(currentActiveMasterId);
    });
    
    document.getElementById('add-master-service-btn')?.addEventListener('click', openAddMasterServiceModal);
    document.getElementById('confirm-add-master-service')?.addEventListener('click', addServiceToMasterFromModal);
    document.getElementById('cancel-add-master-service')?.addEventListener('click', () => hideModal('add-master-service-modal'));
    document.getElementById('add-master-service-modal-close')?.addEventListener('click', () => hideModal('add-master-service-modal'));
    
    document.getElementById('prev-month')?.addEventListener('click', prevMonth);
    document.getElementById('next-month')?.addEventListener('click', nextMonth);
    
    document.getElementById('client-phone')?.addEventListener('input', function(e) {
        formatPhone(this);
    });
    document.getElementById('register-phone')?.addEventListener('input', function(e) {
        formatPhone(this);
    });
    document.getElementById('edit-master-phone')?.addEventListener('input', function(e) {
        formatPhone(this);
    });
    document.getElementById('edit-user-phone')?.addEventListener('input', function(e) {
        formatPhone(this);
    });
    
    setupImagePreview('salon');
    setupImagePreview('service');
    setupImagePreview('master');
    
    document.getElementById('switch-master-btn')?.addEventListener('click', async function() {
        const select = document.getElementById('master-select');
        const selectedMasterId = select.value;
        
        if (!selectedMasterId) {
            showNotification('Выберите мастера', 'warning');
            return;
        }
        
        currentActiveMasterId = selectedMasterId;
        
        try {
            const masterDoc = await db.collection('masters').doc(selectedMasterId).get();
            if (masterDoc.exists) {
                const master = masterDoc.data();
                
                let salonName = 'Неизвестно';
                if (master.salonId) {
                    const salonDoc = await db.collection('salons').doc(master.salonId).get();
                    if (salonDoc.exists) salonName = salonDoc.data().name;
                }
                
                document.getElementById('master-detail-name').textContent = master.name || '';
                document.getElementById('master-detail-specialization').textContent = master.specialization || 'Не указана';
                document.getElementById('master-detail-salon').textContent = salonName;
                
                await loadMasterBookingsForMaster(master.id);
                await loadMasterServicesList(master.id);
                showNotification(`Переключено на мастера ${master.name}`, 'success');
            }
        } catch (error) {
            console.error('Ошибка переключения мастера:', error);
            showNotification('Ошибка при переключении', 'error');
        }
    });
    
    document.getElementById('become-master-btn')?.addEventListener('click', async function() {
        if (!currentUser || currentUser.role !== 'client') {
            showNotification('Только клиенты могут подавать заявки', 'error');
            return;
        }
        await loadSelectOptions();
        showModal('master-request-modal');
    });
    
    document.getElementById('submit-master-request')?.addEventListener('click', submitMasterRequest);
    document.getElementById('cancel-master-request')?.addEventListener('click', () => hideModal('master-request-modal'));
    
    document.getElementById('master-specialization').addEventListener('change', function(e) {
        const otherGroup = document.getElementById('master-specialization-other-group');
        if (this.value === 'other') {
            otherGroup.style.display = 'block';
            document.getElementById('master-specialization-other').required = true;
        } else {
            otherGroup.style.display = 'none';
            document.getElementById('master-specialization-other').required = false;
        }
    });
    
    document.getElementById('master-salon').addEventListener('change', async function(e) {
        const salonId = e.target.value;
        await updateMasterServicesCheckboxes(salonId, []);
        updateMasterPriceFromCheckboxes();
    });
    
    document.getElementById('add-new-service-btn')?.addEventListener('click', function() {
        const salonId = document.getElementById('master-salon').value;
        if (!salonId) {
            showNotification('Сначала выберите салон', 'error');
            return;
        }
        showModal('add-new-service-modal');
    });
    
    document.getElementById('confirm-add-new-service')?.addEventListener('click', addNewServiceForMaster);
    document.getElementById('cancel-new-service')?.addEventListener('click', () => hideModal('add-new-service-modal'));
    
    window.addEventListener('resize', updateServicesContainerHeight);
    setTimeout(updateServicesContainerHeight, 500);
    
    ensureAdminExists();
    
    showPageFromHash();
    
    setInterval(clearCache, CACHE_TTL);
});

document.querySelector('.logo')?.addEventListener('click', function(e) {
    e.preventDefault();
    showPage('home-page');
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const homeLink = document.querySelector('.nav-link[data-page="home"]');
    if (homeLink) homeLink.classList.add('active');
});

window.addEventListener('error', function(e) {
    console.error('Произошла ошибка:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Необработанное обещание:', e.reason);
});

function formatPhone(input) {
    let value = input.value.replace(/\D/g, '');
    if (value.length > 0) {
        if (value[0] === '7' || value[0] === '8') value = value.substring(1);
        let formatted = '+7 ';
        if (value.length > 0) formatted += '(' + value.substring(0, 3);
        if (value.length >= 4) formatted += ') ' + value.substring(3, 6);
        if (value.length >= 7) formatted += '-' + value.substring(6, 8);
        if (value.length >= 9) formatted += '-' + value.substring(8, 10);
        input.value = formatted;
    }
}

function setupImagePreview(type) {
    const fileInput = document.getElementById(`${type}-image-upload`);
    const urlInput = document.getElementById(`${type}-image-url`);
    const preview = document.getElementById(`${type}-image-preview`);
    
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    if (preview) preview.innerHTML = `<img src="${ev.target.result}" style="max-width: 200px;">`;
                };
                reader.readAsDataURL(file);
                if (urlInput) urlInput.value = '';
            }
        });
    }
    
    if (urlInput) {
        urlInput.addEventListener('input', function(e) {
            const url = e.target.value.trim();
            if (url) {
                if (preview) preview.innerHTML = `<img src="${url}" style="max-width: 200px;">`;
                if (fileInput) fileInput.value = '';
            } else {
                if (preview) preview.innerHTML = '';
            }
        });
    }
}