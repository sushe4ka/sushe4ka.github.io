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
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==============================================
let currentUser = null;
let currentSalon = null;
let selectedService = null;
let selectedMaster = null;
let selectedDate = null;
let selectedTime = null;
let selectedRating = 0;
let selectedMasterRating = 0; // для отзыва о мастере
let currentAdminMode = 'admin';
let currentMasterMode = 'master-bookings';
let editingUserId = null;
let editingMasterId = null;
let editingSalonId = null;
let editingServiceId = null;
let currentCalendarMonth = new Date();
let actionsHistory = [];
let currentActiveMasterId = null; // ID текущего выбранного мастера в мастер-панели

// ==============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==============================================
function getSafeImageUrl(type = 'salon', text = '') {
    // Локальная заглушка – файл orig.jpg должен лежать рядом с index.html
    return 'orig.jpg';
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
    }, 5000);
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.add('active');
        window.scrollTo(0, 0);
        
        // Обновляем хэш для поддержки истории браузера
        if (window.location.hash !== `#${pageId}`) {
            history.pushState({ page: pageId }, '', `#${pageId}`);
        }
        
        switch(pageId) {
            case 'home-page':
                loadSalonsWithFilters();
                loadRecommendations();
                loadReviews();
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
                // Страница уже загружена при клике, ничего не делаем
                break;
            case 'master-page':
                if (selectedMaster) loadMasterPage(selectedMaster.id);
                break;
            case 'service-page':
                if (selectedService) loadServicePage(selectedService.id);
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
    }
}

// Обработка кнопок браузера "назад/вперёд"
window.addEventListener('popstate', (event) => {
    const hash = window.location.hash.substring(1); // убираем #
    if (hash) {
        showPage(hash);
    } else {
        showPage('home-page');
    }
});

// При загрузке страницы проверяем хэш
window.addEventListener('load', () => {
    const hash = window.location.hash.substring(1);
    if (hash && document.getElementById(hash)) {
        showPage(hash);
    } else {
        showPage('home-page');
    }
});

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        if (modalId === 'profile-modal') {
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            document.getElementById('register-email').value = '';
            document.getElementById('register-password').value = '';
            document.getElementById('register-password-confirm').value = '';
            document.getElementById('register-name').value = '';
            document.getElementById('register-lastname').value = '';
            document.getElementById('register-phone').value = '';
            document.getElementById('register-role').value = 'client';
        }
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        if (modalId === 'profile-modal') {
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
        }
    }
}

// ==============================================
// ЗАГРУЗКА ИЗОБРАЖЕНИЙ В STORAGE (с таймаутом)
// ==============================================
async function uploadImage(file, folder) {
    if (!file) return null;
    
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
        showNotification('Файл слишком большой. Максимальный размер 5 МБ.', 'error');
        return null;
    }
    
    const storageRef = storage.ref();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const fileName = `${Date.now()}_${safeFileName}`;
    const fileRef = storageRef.child(`${folder}/${fileName}`);
    
    const uploadTask = fileRef.put(file);
    
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 30000);
    });
    
    try {
        await Promise.race([uploadTask, timeoutPromise]);
        const downloadUrl = await fileRef.getDownloadURL();
        return downloadUrl;
    } catch (error) {
        console.error('Ошибка загрузки изображения:', error);
        if (error.message === 'timeout') {
            showNotification('Загрузка превысила время ожидания. Попробуйте ещё раз или используйте ссылку.', 'error');
        } else if (error.code === 'storage/unauthorized') {
            showNotification('Нет прав для загрузки файла. Проверьте правила Firebase Storage.', 'error');
        } else if (error.code === 'storage/canceled') {
            showNotification('Загрузка отменена.', 'warning');
        } else {
            showNotification('Ошибка загрузки изображения. Проверьте соединение или попробуйте другой файл.', 'error');
        }
        return null;
    }
}

// ==============================================
// ФУНКЦИИ РАБОТЫ С FIREBASE
// ==============================================
async function logAction(actionType, objectType, objectId, details = {}, objectName = '') {
    try {
        if (!currentUser || !db) return;

        let finalDetails = { ...details };

        // Если originalData не передан, но нужно (для update/delete), пытаемся получить из БД
        if (!finalDetails.originalData && (actionType === 'update' || actionType === 'delete')) {
            try {
                const collectionName = objectType + 's';
                const docRef = db.collection(collectionName).doc(objectId);
                const docSnap = await docRef.get();
                if (docSnap.exists) {
                    finalDetails.originalData = docSnap.data();
                } else {
                    console.warn(`logAction: документ ${collectionName}/${objectId} не найден для получения originalData`);
                }
            } catch (error) {
                console.warn('logAction: ошибка получения оригинальных данных:', error);
            }
        }

        // Если originalData всё ещё нет, но это delete, возможно, данные были переданы, но не сохранились? Проверим
        if (!finalDetails.originalData && actionType === 'delete') {
            console.warn(`logAction: для delete не удалось получить originalData (objectId: ${objectId})`);
        }

        const action = {
            userId: currentUser.id,
            userName: currentUser.name || currentUser.email,
            userRole: currentUser.role || 'client',
            actionType: actionType,
            objectType: objectType,
            objectId: objectId,
            objectName: objectName || objectId,
            details: finalDetails,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'completed'
        };

        const docRef = await db.collection('actions_history').add(action);

        actionsHistory.push({
            id: docRef.id,
            ...action,
            originalData: finalDetails.originalData
        });

        return docRef.id;
    } catch (error) {
        console.error('Ошибка записи действия:', error);
    }
}

async function getSalons(filters = {}) {
    try {
        const snapshot = await db.collection('salons').get();
        let allSalons = [];
        
        snapshot.forEach(doc => {
            const salonData = doc.data();
            if (salonData.rating === undefined) salonData.rating = 0;
            if (salonData.reviewCount === undefined) salonData.reviewCount = 0;
            allSalons.push({ id: doc.id, ...salonData });
        });
        
        if (filters.rating && filters.rating !== 'all') {
            const minRating = parseFloat(filters.rating);
            allSalons = allSalons.filter(salon => (parseFloat(salon.rating) || 0) >= minRating);
        }
        
        if (filters.specialization && filters.specialization !== 'all') {
            allSalons = allSalons.filter(salon => (salon.specializations || []).includes(filters.specialization));
        }
        
        if (filters.searchTerm) {
            const searchTermLower = filters.searchTerm.toLowerCase();
            allSalons = allSalons.filter(salon =>
                (salon.name || '').toLowerCase().includes(searchTermLower) ||
                (salon.address || '').toLowerCase().includes(searchTermLower) ||
                (salon.description || '').toLowerCase().includes(searchTermLower)
            );
        }
        
        return allSalons;
    } catch (error) {
        console.error('Ошибка загрузки салонов:', error);
        showNotification('Ошибка загрузки салонов', 'error');
        return [];
    }
}

async function getServices(filters = {}) {
    try {
        let query = db.collection('services');
        
        if (filters.salonId) query = query.where('salonId', '==', filters.salonId);
        if (filters.category && filters.category !== 'all') query = query.where('category', '==', filters.category);
        
        const snapshot = await query.get();
        const services = [];
        
        snapshot.forEach(doc => services.push({ id: doc.id, ...doc.data() }));
        
        return services;
    } catch (error) {
        console.error('Ошибка загрузки услуг:', error);
        return [];
    }
}

async function getMasters(filters = {}) {
    try {
        let query = db.collection('masters');
        
        if (filters.salonId) query = query.where('salonId', '==', filters.salonId);
        if (filters.specialization) query = query.where('specialization', '==', filters.specialization);
        if (filters.userId) query = query.where('userId', '==', filters.userId);
        
        const snapshot = await query.get();
        const masters = [];
        
        snapshot.forEach(doc => masters.push({ id: doc.id, ...doc.data() }));
        
        return masters;
    } catch (error) {
        console.error('Ошибка загрузки мастеров:', error);
        return [];
    }
}

async function getUsers() {
    try {
        const snapshot = await db.collection('users').get();
        const users = [];
        
        snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
        
        return users;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        return [];
    }
}

async function getBookings(filters = {}) {
    try {
        let query = db.collection('bookings');
        
        if (filters.userId) query = query.where('userId', '==', filters.userId);
        if (filters.masterId) query = query.where('masterId', '==', filters.masterId);
        if (filters.status) query = query.where('status', '==', filters.status);
        if (filters.date) query = query.where('date', '==', filters.date);
        
        const snapshot = await query.get();
        const bookings = [];
        
        snapshot.forEach(doc => bookings.push({ id: doc.id, ...doc.data() }));
        
        return bookings;
    } catch (error) {
        console.error('Ошибка загрузки записей:', error);
        return [];
    }
}

async function getReviews(filters = {}) {
    try {
        let query = db.collection('reviews');
        
        if (filters.salonId) query = query.where('salonId', '==', filters.salonId);
        
        const snapshot = await query.get();
        const reviews = [];
        
        snapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
        
        return reviews;
    } catch (error) {
        console.error('Ошибка загрузки отзывов:', error);
        return [];
    }
}

// ==============================================
// ОТЗЫВЫ О МАСТЕРАХ
// ==============================================

async function getMasterReviews(masterId) {
    try {
        const snapshot = await db.collection('master_reviews').where('masterId', '==', masterId).get();
        const reviews = [];
        snapshot.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
        return reviews;
    } catch (error) {
        console.error('Ошибка загрузки отзывов мастера:', error);
        return [];
    }
}

async function updateMasterRating(masterId) {
    try {
        const reviews = await getMasterReviews(masterId);
        const rating = reviews.length 
            ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length) * 10) / 10 
            : 0;
        await db.collection('masters').doc(masterId).update({
            rating: rating,
            reviewCount: reviews.length
        });
        return rating;
    } catch (error) {
        console.error('Ошибка обновления рейтинга мастера:', error);
        return 0;
    }
}

async function loadMasterReviews(masterId) {
    const container = document.getElementById('master-reviews-list');
    if (!container) return;

    const reviews = await getMasterReviews(masterId);
    if (reviews.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px 20px; color: var(--text-light);">
            <i class="far fa-comment" style="font-size: 48px; margin-bottom: 20px;"></i>
            <p>Отзывов о мастере пока нет. Будьте первым!</p>
        </div>`;
        return;
    }

    container.innerHTML = '';
    reviews.forEach(review => {
        const reviewItem = document.createElement('div');
        reviewItem.className = 'review-item';
        const avatarUrl = review.authorImage || getSafeImageUrl('avatar', review.authorName);
        reviewItem.innerHTML = `
            <div class="review-header">
                <img src="${avatarUrl}" alt="${review.authorName}" class="review-author-img">
                <div>
                    <div class="review-author">${review.authorName}</div>
                    <div class="review-date">${formatDate(review.date)}</div>
                </div>
            </div>
            <div class="review-rating-stars">${renderStars(review.rating)}</div>
            ${review.text ? `<div class="review-text">${review.text}</div>` : ''}
        `;
        container.appendChild(reviewItem);
    });
}

async function submitMasterReview() {
    if (!currentUser) {
        showNotification('Только авторизованные пользователи могут оставлять отзывы', 'error');
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
        showNotification('Пожалуйста, оцените мастера', 'error');
        return;
    }

    try {
        // Проверим, не оставлял ли пользователь уже отзыв этому мастеру
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

        // Сброс формы
        document.getElementById('master-review-text').value = '';
        selectedMasterRating = 0;
        updateMasterRatingDisplay();

        showNotification('Отзыв успешно опубликован');
        loadMasterReviews(selectedMaster.id);
    } catch (error) {
        console.error('Ошибка отправки отзыва:', error);
        showNotification('Ошибка при публикации отзыва', 'error');
    }
}

function updateMasterRatingDisplay() {
    const stars = document.querySelectorAll('#master-review-stars i');
    const ratingText = document.getElementById('master-selected-rating-text');
    if (!stars.length || !ratingText) return;
    stars.forEach((star, index) => {
        star.className = index < selectedMasterRating ? 'fas fa-star active' : 'far fa-star';
    });
    ratingText.textContent = selectedMasterRating > 0 ? 
        `${selectedMasterRating} звезд${selectedMasterRating === 1 ? 'а' : selectedMasterRating < 5 ? 'ы' : ''}` : 
        '0 звёзд';
}

// ==============================================
// ДАЛЕЕ ИДУТ ВСЕ ОСТАЛЬНЫЕ ФУНКЦИИ
// ==============================================

async function getActionsHistory(filters = {}) {
    try {
        let query = db.collection('actions_history').orderBy('timestamp', 'desc');
        
        if (filters.userId) query = query.where('userId', '==', filters.userId);
        if (filters.userType && filters.userType !== 'all') query = query.where('userRole', '==', filters.userType);
        if (filters.actionType && filters.actionType !== 'all') query = query.where('actionType', '==', filters.actionType);
        
        const snapshot = await query.limit(100).get();
        const actions = [];
        
        snapshot.forEach(doc => actions.push({ id: doc.id, ...doc.data() }));
        
        return actions;
    } catch (error) {
        console.error('Ошибка загрузки истории действий:', error);
        return [];
    }
}

async function initializeSalonRatings() {
    try {
        const salons = await getSalons();
        const updatePromises = [];
        
        for (const salon of salons) {
            const reviews = await getReviews({ salonId: salon.id });
            
            if (reviews.length === 0 && salon.rating !== 0) {
                updatePromises.push(
                    db.collection('salons').doc(salon.id).update({ rating: 0, reviewCount: 0 })
                );
            }
        }
        
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log('Рейтинги салонов инициализированы');
        }
    } catch (error) {
        console.error('Ошибка инициализации рейтингов:', error);
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
            setupUserNavigation();
            
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            
            hideModal('profile-modal');
            showNotification('Вы успешно вошли в систему');
            
            const activePage = document.querySelector('.page.active').id;
            showPage(activePage);
        } else {
            showNotification('Пользователь не найден', 'error');
            await auth.signOut();
        }
    } catch (error) {
        console.error('Ошибка входа:', error);
        if (error.code === 'auth/user-not-found') {
            showNotification('Пользователь не найден', 'error');
        } else if (error.code === 'auth/wrong-password') {
            showNotification('Неверный пароль', 'error');
        } else {
            showNotification('Ошибка входа. Попробуйте еще раз.', 'error');
        }
    }
}

async function register() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();
    const passwordConfirm = document.getElementById('register-password-confirm').value.trim();
    const name = document.getElementById('register-name').value.trim();
    const lastname = document.getElementById('register-lastname').value.trim();
    const phone = document.getElementById('register-phone').value.trim();
    const role = document.getElementById('register-role').value;
    
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
            role: role,
            registrationDate: firebase.firestore.FieldValue.serverTimestamp(),
            bookings: []
        };
        
        await db.collection('users').doc(user.uid).set(userData);
        
        currentUser = { id: user.uid, ...userData };
        localStorage.setItem('beautyBookingUser', JSON.stringify(currentUser));
        
        await logAction('create', 'user', user.uid, {}, `${name} ${lastname}`);
        
        updateProfileButton();
        setupUserNavigation();
        
        document.getElementById('register-email').value = '';
        document.getElementById('register-password').value = '';
        document.getElementById('register-password-confirm').value = '';
        document.getElementById('register-name').value = '';
        document.getElementById('register-lastname').value = '';
        document.getElementById('register-phone').value = '';
        document.getElementById('register-role').value = 'client';
        
        hideModal('profile-modal');
        showNotification('Регистрация прошла успешно!');
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        if (error.code === 'auth/email-already-in-use') {
            showNotification('Пользователь с таким email уже зарегистрирован', 'error');
        } else {
            showNotification('Ошибка регистрации. Попробуйте позже.', 'error');
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
    
    if (profileNavItem) profileNavItem.style.display = (currentUser.role === 'client') ? 'block' : 'none';
    if (adminNavItem) adminNavItem.style.display = (currentUser.role === 'admin') ? 'block' : 'none';
    if (masterNavItem) masterNavItem.style.display = (currentUser.role === 'master') ? 'block' : 'none';
    if (masterWorkSchedule) masterWorkSchedule.style.display = (currentUser.role === 'master') ? 'block' : 'none';
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
        
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
    } catch (error) {
        console.error('Ошибка выхода:', error);
    }
}

// ==============================================
// ЗАГРУЗКА САЛОНОВ С ФИЛЬТРАМИ И ПОИСКОМ
// ==============================================
async function loadSalonsWithFilters() {
    const container = document.getElementById('salons-container');
    const searchInput = document.getElementById('global-search');
    
    if (searchInput && searchInput.value.includes('@')) searchInput.value = '';
    
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Загрузка...</div>';
    
    const ratingFilter = document.getElementById('filter-rating') ? document.getElementById('filter-rating').value : 'all';
    const specializationFilter = document.getElementById('filter-specialization') ? document.getElementById('filter-specialization').value : 'all';
    
    const filters = {};
    if (ratingFilter !== 'all') filters.rating = ratingFilter;
    if (specializationFilter !== 'all') filters.specialization = specializationFilter;
    if (searchTerm) filters.searchTerm = searchTerm;
    
    const salons = await getSalons(filters);
    
    const recommendationsContainer = document.getElementById('recommendations-container');
    const recommendationsSection = document.getElementById('recommendations-section');
    
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
        
        loadRecommendations();
    }
    
    if (salons.length === 0) {
        container.innerHTML = '<p class="no-results">По вашему запросу ничего не найдено</p>';
        return;
    }
    
    container.innerHTML = '';
    salons.forEach(salon => container.appendChild(createSalonCard(salon)));
}

function createSalonCard(salon) {
    const salonCard = document.createElement('div');
    salonCard.className = 'salon-card';
    salonCard.setAttribute('data-salon-id', salon.id);
    
    let specializationIcon = 'fa-spa';
    if (salon.specializations && salon.specializations.includes('hair')) specializationIcon = 'fa-cut';
    if (salon.specializations && salon.specializations.includes('nails')) specializationIcon = 'fa-hand-sparkles';
    if (salon.specializations && salon.specializations.includes('barber')) specializationIcon = 'fa-male';
    
    const imageUrl = salon.imageUrl || getSafeImageUrl('salon', salon.name);
    const salonRating = salon.rating !== undefined ? parseFloat(salon.rating) : 0;
    const reviewCount = salon.reviewCount !== undefined ? parseInt(salon.reviewCount) : 0;
    
    salonCard.innerHTML = `
        <img src="${imageUrl}" alt="${salon.name}" class="salon-img">
        <div class="salon-info">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <h3 class="salon-name">${salon.name}</h3>
                <i class="fas ${specializationIcon}" style="color: var(--primary-color); font-size: 20px;"></i>
            </div>
            <p class="salon-address"><i class="fas fa-map-marker-alt"></i> ${salon.address || 'Адрес не указан'}</p>
            <div class="salon-rating">
                ${renderStars(salonRating)}
                <span class="rating-value">${salonRating.toFixed(1)}</span>
                <span class="rating-count">(${reviewCount})</span>
            </div>
            <div class="salon-tags">
                ${(salon.specializations || []).map(spec => {
                    const specNames = { 
                        'hair': 'Парикмахерская', 
                        'nails': 'Ногтевой сервис', 
                        'cosmetology': 'Косметология', 
                        'massage': 'Массаж', 
                        'barber': 'Барбершоп' 
                    };
                    return `<span class="salon-tag">${specNames[spec] || spec}</span>`;
                }).join('')}
            </div>
            <div class="salon-price">Средний чек: ${salon.averagePrice || 2500} ₽</div>
            ${currentUser && currentUser.role === 'client' ? `
            <div class="salon-actions">
                <button class="btn btn-primary" onclick="startBookingForSalon('${salon.id}')">
                    <i class="fas fa-calendar-check"></i> Записаться
                </button>
            </div>
            ` : ''}
        </div>
    `;
    
    salonCard.addEventListener('click', function(e) {
        if (!e.target.closest('button')) {
            loadSalonPage(salon.id);
            showPage('salon-page');
        }
    });
    
    return salonCard;
}

function createMasterCard(master, salonName = '') {
    const masterCard = document.createElement('div');
    masterCard.className = 'master-card';
    masterCard.setAttribute('data-master-id', master.id);
    
    const imageUrl = master.imageUrl || getSafeImageUrl('master', master.name);
    
    masterCard.innerHTML = `
        <img src="${imageUrl}" alt="${master.name}" class="master-img">
        <div class="master-info">
            <h3 class="master-name">${master.name}</h3>
            <p class="master-specialization">${master.specialization || 'Не указано'}</p>
            <div class="salon-rating" style="margin: 10px 0;">
                ${renderStars(master.rating || 0)}
                <span class="rating-value">${(master.rating || 0).toFixed(1)}</span>
            </div>
            <p style="color: var(--text-light); font-size: 14px; margin-bottom: 10px;">
                <i class="fas fa-store"></i> ${salonName || 'Неизвестный салон'}
            </p>
            <p class="master-price">${master.price || 0} ₽</p>
            ${currentUser && currentUser.role === 'client' ? `
            <button class="btn btn-primary" onclick="startBookingForMaster('${master.id}')">
                <i class="fas fa-calendar-check"></i> Записаться
            </button>
            ` : ''}
        </div>
    `;
    
    masterCard.addEventListener('click', function(e) {
        if (!e.target.closest('button')) {
            loadMasterPage(master.id);
            showPage('master-page');
        }
    });
    
    return masterCard;
}

function createServiceCard(service, salonName = '') {
    const serviceCard = document.createElement('div');
    serviceCard.className = 'service-card';
    serviceCard.setAttribute('data-service-id', service.id);
    
    const imageUrl = service.imageUrl || getSafeImageUrl('service', service.name);
    
    serviceCard.innerHTML = `
        <img src="${imageUrl}" alt="${service.name}" class="service-img">
        <div class="service-info">
            <h3 class="service-name">${service.name}</h3>
            <p class="service-category">${getCategoryName(service.category)}</p>
            <p style="color: var(--text-light); font-size: 14px; margin-bottom: 10px;">
                <i class="fas fa-store"></i> ${salonName || 'Неизвестный салон'}
            </p>
            <p class="service-price">${service.price || 0} ₽</p>
            ${currentUser && currentUser.role === 'client' ? `
            <button class="btn btn-primary" onclick="startBookingForService('${service.id}')">
                <i class="fas fa-calendar-check"></i> Записаться
            </button>
            ` : ''}
        </div>
    `;
    
    serviceCard.addEventListener('click', function(e) {
        if (!e.target.closest('button')) {
            loadServicePage(service.id);
            showPage('service-page');
        }
    });
    
    return serviceCard;
}

async function loadAllSalons() {
    const container = document.getElementById('all-salons-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Загрузка...</div>';
    
    const salons = await getSalons();
    
    if (salons.length === 0) {
        container.innerHTML = '<p class="no-results">Салоны не найдены</p>';
        return;
    }
    
    container.innerHTML = '';
    salons.forEach(salon => container.appendChild(createSalonCard(salon)));
}

async function loadAllServices() {
    const container = document.getElementById('all-services-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Загрузка...</div>';
    
    const services = await getServices();
    const salons = await getSalons();
    const salonMap = {};
    salons.forEach(salon => salonMap[salon.id] = salon.name);
    
    if (services.length === 0) {
        container.innerHTML = '<p class="no-results">Услуги не найдены</p>';
        return;
    }
    
    container.innerHTML = '';
    services.forEach(service => {
        const salonName = salonMap[service.salonId] || 'Неизвестный салон';
        container.appendChild(createServiceCard(service, salonName));
    });
}

async function loadAllMasters() {
    const container = document.getElementById('all-masters-container');
    if (!container) return;
    
    container.innerHTML = '<div class="loading"><i class="fas fa-spinner"></i> Загрузка...</div>';
    
    const masters = await getMasters();
    const salons = await getSalons();
    const salonMap = {};
    salons.forEach(salon => salonMap[salon.id] = salon.name);
    
    if (masters.length === 0) {
        container.innerHTML = '<p class="no-results">Мастера не найдены</p>';
        return;
    }
    
    container.innerHTML = '';
    masters.forEach(master => {
        const salonName = salonMap[master.salonId] || 'Неизвестный салон';
        container.appendChild(createMasterCard(master, salonName));
    });
}

async function loadRecommendations() {
    const container = document.getElementById('recommendations-container');
    if (!container) return;
    
    const searchInput = document.getElementById('global-search');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    if (searchTerm) {
        container.innerHTML = '';
        return;
    }
    
    const salons = await getSalons();
    let recommendedSalons = [...salons].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 3);
    
    if (recommendedSalons.length === 0) {
        container.innerHTML = '<p class="no-results">Нет рекомендаций</p>';
        return;
    }
    
    container.innerHTML = '';
    recommendedSalons.forEach(salon => container.appendChild(createSalonCard(salon)));
}

async function loadReviews() {
    const container = document.getElementById('reviews-list');
    if (!container) return;
    
    const reviews = await getReviews();
    const recentReviews = reviews.slice(0, 3);
    
    if (recentReviews.length === 0) {
        container.innerHTML = '<p class="no-results">Отзывов пока нет</p>';
        return;
    }
    
    container.innerHTML = '';
    
    for (const review of recentReviews) {
        let salonName = 'Неизвестный салон';
        
        if (review.salonId) {
            try {
                const salonDoc = await db.collection('salons').doc(review.salonId).get();
                if (salonDoc.exists) salonName = salonDoc.data().name;
            } catch (error) {
                console.error('Ошибка загрузки салона для отзыва:', error);
            }
        }
        
        const reviewItem = document.createElement('div');
        reviewItem.className = 'review-item';
        
        const avatarUrl = review.authorImage || getSafeImageUrl('avatar', review.authorName);
        
        reviewItem.innerHTML = `
            <div class="review-header">
                <img src="${avatarUrl}" alt="${review.authorName}" class="review-author-img">
                <div>
                    <div class="review-author">${review.authorName || 'Анонимный пользователь'}</div>
                    <div class="review-date">${formatDate(review.date)}</div>
                </div>
            </div>
            <div class="review-rating-stars">${renderStars(review.rating || 0)}</div>
            <p style="color: var(--text-light); margin-bottom: 10px;"><i class="fas fa-store"></i> ${salonName}</p>
            ${review.text ? `<div class="review-text">${review.text}</div>` : ''}
        `;
        
        container.appendChild(reviewItem);
    }
}

// ==============================================
// СТРАНИЦА САЛОНА
// ==============================================
async function loadSalonPage(salonId) {
    try {
        const salonDoc = await db.collection('salons').doc(salonId).get();
        if (!salonDoc.exists) {
            showNotification('Салон не найден', 'error');
            return;
        }
        
        currentSalon = { id: salonDoc.id, ...salonDoc.data() };
        
        document.getElementById('salon-page-name').textContent = currentSalon.name;
        document.getElementById('salon-address-text').textContent = currentSalon.address || 'Адрес не указан';
        document.getElementById('salon-page-description').textContent = currentSalon.description || 'Премиальный салон красоты с опытными мастерами и современным оборудованием.';
        document.getElementById('salon-main-image').src = currentSalon.imageUrl || getSafeImageUrl('salon', currentSalon.name);
        
        const salonRating = currentSalon.rating !== undefined ? currentSalon.rating : 0;
        document.getElementById('salon-rating').textContent = salonRating.toFixed(1);
        
        const tagsContainer = document.getElementById('salon-tags');
        tagsContainer.innerHTML = '';
        
        (currentSalon.specializations || []).forEach(spec => {
            const specNames = { 
                'hair': 'Парикмахерская', 
                'nails': 'Ногтевой сервис', 
                'cosmetology': 'Косметология', 
                'massage': 'Массаж', 
                'barber': 'Барбершоп' 
            };
            
            const tag = document.createElement('span');
            tag.className = 'salon-tag';
            tag.textContent = specNames[spec] || spec;
            tagsContainer.appendChild(tag);
        });
        
        const salonActions = document.getElementById('salon-actions');
        salonActions.innerHTML = '';
        
        if (currentUser && currentUser.role === 'client') {
            salonActions.innerHTML = `
                <button class="btn btn-primary" id="book-this-salon">
                    <i class="fas fa-calendar-check"></i> Записаться
                </button>
            `;
        }
        
        await loadSalonServices();
        await loadSalonMasters();
        await loadSalonReviews();
        
        selectedRating = 0;
        updateRatingDisplay();
    } catch (error) {
        console.error('Ошибка загрузки страницы салона:', error);
        showNotification('Ошибка загрузки данных салона', 'error');
    }
}

async function loadSalonServices() {
    const container = document.getElementById('services-container');
    if (!container || !currentSalon) return;
    
    const services = await getServices({ salonId: currentSalon.id });
    
    if (services.length === 0) {
        container.innerHTML = '<p class="no-results">Услуги не найдены</p>';
        return;
    }
    
    container.innerHTML = '';
    services.forEach(service => {
        container.appendChild(createServiceCard(service, currentSalon.name));
    });
}

async function loadSalonMasters() {
    const container = document.getElementById('masters-container');
    if (!container || !currentSalon) return;
    
    const masters = await getMasters({ salonId: currentSalon.id });
    
    if (masters.length === 0) {
        container.innerHTML = '<p class="no-results">Мастера не найдены</p>';
        return;
    }
    
    container.innerHTML = '';
    masters.forEach(master => {
        container.appendChild(createMasterCard(master, currentSalon.name));
    });
}

async function loadSalonReviews() {
    const container = document.getElementById('salon-reviews-list');
    if (!currentSalon || !container) return;
    
    const reviews = await getReviews({ salonId: currentSalon.id });
    
    if (reviews.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-light);">
                <i class="far fa-comment" style="font-size: 48px; margin-bottom: 20px;"></i>
                <p>Отзывов об этом салоне пока нет. Будьте первым!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    
    reviews.forEach(review => {
        const reviewItem = document.createElement('div');
        reviewItem.className = 'review-item';
        
        const avatarUrl = review.authorImage || getSafeImageUrl('avatar', review.authorName);
        
        reviewItem.innerHTML = `
            <div class="review-header">
                <img src="${avatarUrl}" alt="${review.authorName}" class="review-author-img">
                <div>
                    <div class="review-author">${review.authorName || 'Анонимный пользователь'}</div>
                    <div class="review-date">${formatDate(review.date)}</div>
                </div>
            </div>
            <div class="review-rating-stars">${renderStars(review.rating || 0)}</div>
            ${review.text ? `<div class="review-text">${review.text}</div>` : ''}
        `;
        
        container.appendChild(reviewItem);
    });
}

function updateRatingDisplay() {
    const stars = document.querySelectorAll('#review-stars i');
    const ratingText = document.getElementById('selected-rating-text');
    
    if (!stars.length || !ratingText) return;
    
    stars.forEach((star, index) => {
        star.className = index < selectedRating ? 'fas fa-star active' : 'far fa-star';
    });
    
    ratingText.textContent = selectedRating > 0 ? 
        `${selectedRating} звезд${selectedRating === 1 ? 'а' : selectedRating < 5 ? 'ы' : ''}` : 
        '0 звёзд';
}

// ==============================================
// СТРАНИЦА МАСТЕРА
// ==============================================
async function loadMasterPage(masterId) {
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (!masterDoc.exists) {
            showNotification('Мастер не найден', 'error');
            return;
        }
        
        selectedMaster = { id: masterDoc.id, ...masterDoc.data() };
        
        // Загружаем данные салона
        let salonName = 'Неизвестный салон';
        if (selectedMaster.salonId) {
            const salonDoc = await db.collection('salons').doc(selectedMaster.salonId).get();
            if (salonDoc.exists) {
                salonName = salonDoc.data().name;
            }
        }
        
        // Заполняем страницу
        document.getElementById('master-page-name').textContent = selectedMaster.name;
        document.getElementById('master-page-specialization').textContent = selectedMaster.specialization || 'Специализация не указана';
        document.getElementById('master-main-image').src = selectedMaster.imageUrl || getSafeImageUrl('master', selectedMaster.name);
        
        const masterRating = selectedMaster.rating !== undefined ? selectedMaster.rating : 0;
        document.getElementById('master-rating').textContent = masterRating.toFixed(1);
        
        document.getElementById('master-salon-text').textContent = salonName;
        
        // Описание мастера
        const masterTags = document.getElementById('master-tags');
        if (masterTags) {
            masterTags.innerHTML = '';
            
            if (selectedMaster.specialization) {
                const tag = document.createElement('span');
                tag.className = 'master-tag';
                tag.textContent = selectedMaster.specialization;
                masterTags.appendChild(tag);
            }
        }
        
        document.getElementById('master-page-description').textContent = 
            `Опытный мастер салона "${salonName}". Специализируется на ${selectedMaster.specialization || 'различных услугах'}.`;
        
        // Кнопка записи
        const masterActions = document.getElementById('master-actions');
        masterActions.innerHTML = '';
        
        if (currentUser && currentUser.role === 'client') {
            masterActions.innerHTML = `
                <button class="btn btn-primary" id="book-this-master">
                    <i class="fas fa-calendar-check"></i> Записаться
                </button>
            `;
        }
        
        // Загружаем услуги и отзывы
        await loadMasterServices();
        await loadMasterReviews(selectedMaster.id); // загрузка отзывов о мастере
        
        selectedMasterRating = 0;
        updateMasterRatingDisplay();
    } catch (error) {
        console.error('Ошибка загрузки страницы мастера:', error);
        showNotification('Ошибка загрузки данных мастера', 'error');
    }
}

async function loadMasterServices() {
    const container = document.getElementById('master-services-container');
    if (!container || !selectedMaster) return;
    
    const services = await getServices({ salonId: selectedMaster.salonId });
    
    if (services.length === 0) {
        container.innerHTML = '<p class="no-results">Услуги не найдены</p>';
        return;
    }
    
    container.innerHTML = '';
    
    services.forEach(service => {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'service-card';
        serviceCard.setAttribute('data-service-id', service.id);
        
        const imageUrl = service.imageUrl || getSafeImageUrl('service', service.name);
        
        serviceCard.innerHTML = `
            <img src="${imageUrl}" alt="${service.name}" class="service-img">
            <div class="service-info">
                <h3 class="service-name">${service.name}</h3>
                <p class="service-category">${getCategoryName(service.category)}</p>
                <p class="service-price">${service.price || 0} ₽</p>
                ${currentUser && currentUser.role === 'client' ? `
                <button class="btn btn-primary" onclick="startBookingForService('${service.id}')">
                    <i class="fas fa-calendar-check"></i> Выбрать
                </button>
                ` : ''}
            </div>
        `;
        
        container.appendChild(serviceCard);
    });
}

// ==============================================
// СТРАНИЦА УСЛУГИ
// ==============================================
async function loadServicePage(serviceId) {
    try {
        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (!serviceDoc.exists) {
            showNotification('Услуга не найдена', 'error');
            return;
        }
        
        selectedService = { id: serviceDoc.id, ...serviceDoc.data() };
        
        // Загружаем данные салона
        let salonName = 'Неизвестный салон';
        if (selectedService.salonId) {
            const salonDoc = await db.collection('salons').doc(selectedService.salonId).get();
            if (salonDoc.exists) {
                salonName = salonDoc.data().name;
            }
        }
        
        // Заполняем страницу
        document.getElementById('service-page-name').textContent = selectedService.name;
        document.getElementById('service-page-category').textContent = getCategoryName(selectedService.category);
        document.getElementById('service-main-image').src = selectedService.imageUrl || getSafeImageUrl('service', selectedService.name);
        document.getElementById('service-page-price').textContent = `${selectedService.price || 0} ₽`;
        document.getElementById('service-page-duration').textContent = `Длительность: ${selectedService.duration || 60} минут`;
        document.getElementById('service-salon-text').textContent = salonName;
        
        document.getElementById('service-page-description').innerHTML = `
            <p>Профессиональная услуга в салоне "${salonName}". Качественное выполнение с использованием современных технологий и материалов.</p>
        `;
        
        // Кнопка записи
        const serviceActions = document.getElementById('service-actions');
        serviceActions.innerHTML = '';
        
        if (currentUser && currentUser.role === 'client') {
            serviceActions.innerHTML = `
                <button class="btn btn-primary" id="book-this-service">
                    <i class="fas fa-calendar-check"></i> Записаться
                </button>
            `;
        }
        
        // Загружаем мастеров
        await loadServiceMasters();
    } catch (error) {
        console.error('Ошибка загрузки страницы услуги:', error);
        showNotification('Ошибка загрузки данных услуги', 'error');
    }
}

async function loadServiceMasters() {
    const container = document.getElementById('service-masters-container');
    if (!container || !selectedService) return;
    
    const masters = await getMasters({ salonId: selectedService.salonId });
    
    if (masters.length === 0) {
        container.innerHTML = '<p class="no-results">Мастера не найдены</p>';
        return;
    }
    
    container.innerHTML = '';
    
    masters.forEach(master => {
        const masterCard = document.createElement('div');
        masterCard.className = 'master-card';
        masterCard.setAttribute('data-master-id', master.id);
        
        const imageUrl = master.imageUrl || getSafeImageUrl('master', master.name);
        
        masterCard.innerHTML = `
            <img src="${imageUrl}" alt="${master.name}" class="master-img">
            <div class="master-info">
                <h3 class="master-name">${master.name}</h3>
                <p class="master-specialization">${master.specialization || 'Не указано'}</p>
                <div class="salon-rating" style="margin: 10px 0;">
                    ${renderStars(master.rating || 0)}
                    <span class="rating-value">${(master.rating || 0).toFixed(1)}</span>
                </div>
                <p class="master-price">${master.price || 0} ₽</p>
                ${currentUser && currentUser.role === 'client' ? `
                <button class="btn btn-primary" onclick="startBookingForMaster('${master.id}')">
                    <i class="fas fa-calendar-check"></i> Выбрать
                </button>
                ` : ''}
            </div>
        `;
        
        container.appendChild(masterCard);
    });
}

// ==============================================
// ПРОЦЕСС БРОНИРОВАНИЯ
// ==============================================
async function startBookingForSalon(salonId) {
    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Только клиенты могут записываться на услуги', 'error');
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

async function startBookingForService(serviceId) {
    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Только клиенты могут записываться на услуги', 'error');
        if (!currentUser) showModal('profile-modal');
        return;
    }
    
    try {
        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (serviceDoc.exists) {
            selectedService = { id: serviceDoc.id, ...serviceDoc.data() };
            
            const salonDoc = await db.collection('salons').doc(selectedService.salonId).get();
            if (salonDoc.exists) {
                currentSalon = { id: salonDoc.id, ...salonDoc.data() };
                startBookingProcess();
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки услуги:', error);
        showNotification('Ошибка загрузки данных услуги', 'error');
    }
}

async function startBookingForMaster(masterId) {
    if (!currentUser || currentUser.role !== 'client') {
        showNotification('Только клиенты могут записываться на услуги', 'error');
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
        showNotification('Ошибка загрузки данных мастера', 'error');
    }
}

async function startBookingProcess() {
    if (!currentSalon) return;
    
    selectedService = null;
    selectedMaster = null;
    selectedDate = null;
    selectedTime = null;
    
    const services = await getServices({ salonId: currentSalon.id });
    const servicesContainer = document.getElementById('booking-services-container');
    
    if (!servicesContainer) return;
    
    servicesContainer.innerHTML = '';
    
    if (services.length === 0) {
        servicesContainer.innerHTML = '<p class="no-results">Услуги не найдены</p>';
        return;
    }
    
    services.forEach(service => {
        const serviceCard = document.createElement('div');
        serviceCard.className = 'service-card';
        serviceCard.setAttribute('data-service-id', service.id);
        
        const imageUrl = service.imageUrl || getSafeImageUrl('service', service.name);
        
        serviceCard.innerHTML = `
            <img src="${imageUrl}" alt="${service.name}" class="service-img">
            <div class="service-info">
                <h3 class="service-name">${service.name}</h3>
                <p class="service-category">${getCategoryName(service.category)}</p>
                <p class="service-price">${service.price || 0} ₽</p>
            </div>
        `;
        
        serviceCard.addEventListener('click', function() {
            document.querySelectorAll('#booking-services-container .service-card').forEach(card => card.classList.remove('selected'));
            serviceCard.classList.add('selected');
            selectedService = { id: service.id, name: service.name, price: service.price || 0, duration: service.duration || 60 };
        });
        
        servicesContainer.appendChild(serviceCard);
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
        const masterCard = document.createElement('div');
        masterCard.className = 'master-card';
        masterCard.setAttribute('data-master-id', master.id);
        
        const imageUrl = master.imageUrl || getSafeImageUrl('master', master.name);
        
        masterCard.innerHTML = `
            <img src="${imageUrl}" alt="${master.name}" class="master-img">
            <div class="master-info">
                <h3 class="master-name">${master.name}</h3>
                <p class="master-specialization">${master.specialization || 'Не указано'}</p>
                <div class="salon-rating" style="margin: 10px 0;">
                    ${renderStars(master.rating || 0)}
                    <span class="rating-value">${(master.rating || 0).toFixed(1)}</span>
                </div>
                <p class="master-price">${master.price || 0} ₽</p>
            </div>
        `;
        
        masterCard.addEventListener('click', function() {
            document.querySelectorAll('#booking-masters-container .master-card').forEach(card => card.classList.remove('selected'));
            masterCard.classList.add('selected');
            selectedMaster = { id: master.id, name: master.name };
        });
        
        mastersContainer.appendChild(masterCard);
    });
}

async function loadTimeSlots(date) {
    if (!date || !selectedMaster) return;
    
    const timeSlots = [];
    for (let hour = 10; hour <= 20; hour++) {
        timeSlots.push(`${hour}:00`);
        if (hour < 20) timeSlots.push(`${hour}:30`);
    }
    
    const masterDoc = await db.collection('masters').doc(selectedMaster.id).get();
    const masterData = masterDoc.exists ? masterDoc.data() : {};
    const daysOff = masterData.daysOff || [];
    const isDayOff = daysOff.includes(date);
    
    const bookings = await getBookings({ masterId: selectedMaster.id, date: date });
    const bookedSlots = bookings.filter(b => b.status !== 'Отменено').map(b => b.time);
    
    const timeSlotsContainer = document.getElementById('time-slots-container');
    if (!timeSlotsContainer) return;
    
    timeSlotsContainer.innerHTML = '';
    
    timeSlots.forEach(time => {
        const isBooked = bookedSlots.includes(time);
        
        const timeSlot = document.createElement('div');
        
        if (isDayOff || isBooked) {
            timeSlot.className = 'time-slot booked';
            timeSlot.title = isDayOff ? 'Выходной день мастера' : 'Это время уже занято';
            timeSlot.textContent = time;
        } else {
            timeSlot.className = 'time-slot';
            timeSlot.setAttribute('data-time', time);
            timeSlot.textContent = time;
            
            timeSlot.addEventListener('click', function() {
                document.querySelectorAll('.time-slot').forEach(slot => slot.classList.remove('selected'));
                timeSlot.classList.add('selected');
                selectedTime = time;
            });
        }
        
        timeSlotsContainer.appendChild(timeSlot);
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
    
    const totalPrice = selectedService.price || 0;
    
    summaryContainer.innerHTML = `
        <div class="summary-item"><span>Салон:</span><span>${currentSalon ? currentSalon.name : 'Неизвестно'}</span></div>
        <div class="summary-item"><span>Услуга:</span><span>${selectedService.name}</span></div>
        <div class="summary-item"><span>Мастер:</span><span>${selectedMaster.name}</span></div>
        <div class="summary-item"><span>Дата:</span><span>${formatDate(selectedDate)}</span></div>
        <div class="summary-item"><span>Время:</span><span>${selectedTime}</span></div>
        <div class="summary-item"><span>Длительность:</span><span>${selectedService.duration || 60} минут</span></div>
        <div class="summary-item summary-total"><span>Итого:</span><span>${totalPrice} ₽</span></div>
    `;
}

async function confirmBooking() {
    const nameInput = document.getElementById('client-name');
    const lastnameInput = document.getElementById('client-lastname');
    const phoneInput = document.getElementById('client-phone');
    const commentInput = document.getElementById('client-comment');
    
    if (!nameInput || !lastnameInput || !phoneInput || !commentInput) return;
    
    let name = nameInput.value.trim();
    let lastname = lastnameInput.value.trim();
    let phone = phoneInput.value.trim();
    const comment = commentInput.value.trim();
    
    if (currentUser) {
        if (!name) name = currentUser.name || '';
        if (!lastname) lastname = currentUser.lastname || '';
        if (!phone && currentUser.phone) phone = currentUser.phone;
        
        nameInput.value = name;
        lastnameInput.value = lastname;
        phoneInput.value = phone;
    }
    
    if (!name || !lastname || !phone) {
        showNotification('Пожалуйста, заполните все обязательные поля', 'error');
        return;
    }
    
    const phoneRegex = /^(\+7|7|8)?[\s\-]?\(?[0-9]{3}\)?[\s\-]?[0-9]{3}[\s\-]?[0-9]{2}[\s\-]?[0-9]{2}$/;
    if (!phoneRegex.test(phone.replace(/\s+/g, ''))) {
        showNotification('Пожалуйста, введите корректный номер телефона', 'error');
        return;
    }
    
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('7') || formattedPhone.startsWith('8')) {
        formattedPhone = '+7' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('+7')) {
        formattedPhone = '+7' + formattedPhone;
    }
    
    if (formattedPhone.length !== 12) {
        showNotification('Номер телефона должен содержать 11 цифр', 'error');
        return;
    }
    
    const displayPhone = formattedPhone.replace(/(\+7)(\d{3})(\d{3})(\d{2})(\d{2})/, '+7 ($2) $3-$4-$5');
    phoneInput.value = displayPhone;
    
    if (!selectedService || !selectedMaster || !selectedDate || !selectedTime) {
        showNotification('Пожалуйста, заполните все данные бронирования', 'error');
        return;
    }
    
    try {
        const bookingData = {
            userId: currentUser ? currentUser.id : 'guest',
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
            clientPhone: formattedPhone,
            clientComment: comment,
            totalPrice: selectedService.price || 0,
            duration: selectedService.duration || 60,
            bookingDate: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'Подтверждена'
        };
        
        const bookingRef = await db.collection('bookings').add(bookingData);
        
        await logAction('booking', 'booking', bookingRef.id, {
            salonId: currentSalon.id,
            serviceId: selectedService.id,
            masterId: selectedMaster.id
        }, `Запись в ${currentSalon.name}`);
        
        nameInput.value = '';
        lastnameInput.value = '';
        phoneInput.value = '';
        commentInput.value = '';
        
        showNotification('Запись успешно создана! Мы ждем вас в салоне.', 'success');
        
        setTimeout(() => {
            if (currentUser) showPage('profile-page');
            else showPage('home-page');
        }, 2000);
    } catch (error) {
        console.error('Ошибка создания записи:', error);
        showNotification('Ошибка при создании записи', 'error');
    }
}

// ==============================================
// ФУНКЦИИ ДЛЯ РАБОТЫ С РЕЙТИНГОМ САЛОНА
// ==============================================
async function updateSalonRating(salonId) {
    try {
        const reviews = await getReviews({ salonId: salonId });
        
        if (reviews.length === 0) {
            await db.collection('salons').doc(salonId).update({
                rating: 0,
                reviewCount: 0,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return 0;
        }
        
        const totalRating = reviews.reduce((sum, review) => sum + (parseFloat(review.rating) || 0), 0);
        const averageRating = Math.round((totalRating / reviews.length) * 10) / 10;
        
        await db.collection('salons').doc(salonId).update({
            rating: averageRating,
            reviewCount: reviews.length,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        return averageRating;
    } catch (error) {
        console.error('Ошибка обновления рейтинга салона:', error);
        showNotification('Ошибка при обновлении рейтинга салона', 'error');
        return 0;
    }
}

// ==============================================
// ФУНКЦИЯ ОТПРАВКИ ОТЗЫВА (О САЛОНЕ)
// ==============================================
async function submitReview() {
    if (!currentUser) {
        showNotification('Только авторизованные пользователи могут оставлять отзывы', 'error');
        showModal('profile-modal');
        return;
    }
    
    if (!currentSalon) {
        showNotification('Выберите салон для отзыва', 'error');
        return;
    }
    
    const reviewTextInput = document.getElementById('review-text');
    if (!reviewTextInput) return;
    
    const reviewText = reviewTextInput.value.trim();
    
    if (selectedRating === 0) {
        showNotification('Пожалуйста, оцените салон', 'error');
        return;
    }
    
    try {
        const existingReviews = await getReviews({ salonId: currentSalon.id });
        const userExistingReview = existingReviews.find(review => review.authorId === currentUser.id);
        
        if (userExistingReview) {
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
        
        const reviewRef = await db.collection('reviews').add(reviewData);
        
        await logAction('review', 'review', reviewRef.id, {
            salonId: currentSalon.id,
            salonName: currentSalon.name,
            rating: selectedRating
        }, currentSalon.name);
        
        const newRating = await updateSalonRating(currentSalon.id);
        
        reviewTextInput.value = '';
        selectedRating = 0;
        updateRatingDisplay();
        
        showNotification('Отзыв успешно опубликован!');
        
        await loadSalonReviews();
        
        if (document.getElementById('home-page').classList.contains('active')) {
            await loadSalonsWithFilters();
            await loadRecommendations();
            await loadReviews();
        }
        
        if (document.getElementById('admin-page').classList.contains('active') && currentUser.role === 'admin') {
            await loadReviewsManagement();
        }
    } catch (error) {
        console.error('Ошибка отправки отзыва:', error);
        showNotification('Ошибка при публикации отзыва', 'error');
    }
}

// ==============================================
// ФУНКЦИЯ УДАЛЕНИЯ ОТЗЫВА (О САЛОНЕ) - ИСПРАВЛЕНО
// ==============================================
async function deleteReview(reviewId) {
    if (!confirm('Вы уверены, что хотите удалить этот отзыв?')) return;
    
    try {
        const reviewDoc = await db.collection('reviews').doc(reviewId).get();
        if (!reviewDoc.exists) {
            showNotification('Отзыв не найден', 'error');
            return;
        }
        
        const reviewData = reviewDoc.data();
        const salonId = reviewData.salonId;
        const salonName = reviewData.salonName;
        
        await db.collection('reviews').doc(reviewId).delete();
        
        // Передаём полный объект отзыва для возможности восстановления
        await logAction('delete', 'review', reviewId, { originalData: reviewData }, salonName);
        
        if (salonId) await updateSalonRating(salonId);
        
        showNotification('Отзыв успешно удален');
        
        // Обновляем таблицу управления отзывами
        if (document.getElementById('reviews-management-table')) await loadReviewsManagement();
        if (currentSalon && currentSalon.id === salonId) await loadSalonReviews();
        
        if (document.getElementById('home-page').classList.contains('active')) {
            await loadReviews();
            await loadSalonsWithFilters();
        }
    } catch (error) {
        console.error('Ошибка удаления отзыва:', error);
        showNotification('Ошибка при удалении отзыва', 'error');
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
            if (salon.specializations && Array.isArray(salon.specializations)) {
                salon.specializations.forEach(spec => {
                    const checkbox = document.querySelector(`input[name="specialization"][value="${spec}"]`);
                    if (checkbox) checkbox.checked = true;
                });
            }
            
            const urlInput = document.getElementById('salon-image-url');
            if (urlInput) urlInput.value = salon.imageUrl || '';
            
            const fileInput = document.getElementById('salon-image-upload');
            if (fileInput) fileInput.value = '';
            
            const previewDiv = document.getElementById('salon-image-preview');
            if (previewDiv) {
                previewDiv.innerHTML = salon.imageUrl ? `<img src="${salon.imageUrl}" style="max-width: 200px; max-height: 200px;">` : '';
            }
            
            document.getElementById('salon-modal-title').textContent = 'Редактировать салон';
            showModal('add-salon-modal');
        }
    } catch (error) {
        console.error('Ошибка загрузки салона для редактирования:', error);
        showNotification('Ошибка загрузки данных салона', 'error');
    }
}

async function editService(serviceId) {
    editingServiceId = serviceId;
    
    try {
        const serviceDoc = await db.collection('services').doc(serviceId).get();
        if (serviceDoc.exists) {
            const service = serviceDoc.data();
            
            document.getElementById('service-name').value = service.name || '';
            document.getElementById('service-category').value = service.category || 'hair';
            document.getElementById('service-price').value = service.price || '';
            document.getElementById('service-duration').value = service.duration || 60;
            
            await loadSelectOptions();
            
            if (service.salonId) document.getElementById('service-salon').value = service.salonId;
            
            const urlInput = document.getElementById('service-image-url');
            if (urlInput) urlInput.value = service.imageUrl || '';
            
            const fileInput = document.getElementById('service-image-upload');
            if (fileInput) fileInput.value = '';
            
            const previewDiv = document.getElementById('service-image-preview');
            if (previewDiv) {
                previewDiv.innerHTML = service.imageUrl ? `<img src="${service.imageUrl}" style="max-width: 200px; max-height: 200px;">` : '';
            }
            
            document.getElementById('service-modal-title').textContent = 'Редактировать услугу';
            showModal('add-service-modal');
        }
    } catch (error) {
        console.error('Ошибка загрузки услуги для редактирования:', error);
        showNotification('Ошибка загрузки данных услуги', 'error');
    }
}

async function editMaster(masterId) {
    editingMasterId = masterId;
    
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        if (masterDoc.exists) {
            const master = masterDoc.data();
            
            document.getElementById('master-name').value = master.name || '';
            
            const specializationInput = document.getElementById('master-specialization');
            if (specializationInput && specializationInput.tagName === 'INPUT') {
                const select = document.createElement('select');
                select.id = 'master-specialization';
                select.className = 'form-input';
                select.innerHTML = `
                    <option value="">Выберите специализацию</option>
                    <option value="Парикмахер">Парикмахер</option>
                    <option value="Мастер маникюра">Мастер маникюра</option>
                    <option value="Косметолог">Косметолог</option>
                    <option value="Массажист">Массажист</option>
                    <option value="Барбер">Барбер</option>
                    <option value="Визажист">Визажист</option>
                    <option value="Бровист">Бровист</option>
                    <option value="Лешмейкер">Лешмейкер</option>
                    <option value="Эстетист">Эстетист</option>
                    <option value="Подолог">Подолог</option>
                `;
                
                specializationInput.parentNode.replaceChild(select, specializationInput);
                
                const newSelect = document.getElementById('master-specialization');
                if (newSelect && master.specialization) newSelect.value = master.specialization;
            } else {
                document.getElementById('master-specialization').value = master.specialization || '';
            }
            
            document.getElementById('master-price').value = master.price || '';
            
            await loadSelectOptions();
            
            if (master.salonId) document.getElementById('master-salon').value = master.salonId;
            
            // Скрываем поля создания пользователя при редактировании
            document.getElementById('master-email').style.display = 'none';
            document.getElementById('master-password').style.display = 'none';
            document.querySelector('label[for="master-email"]').style.display = 'none';
            document.querySelector('label[for="master-password"]').style.display = 'none';
            
            const urlInput = document.getElementById('master-image-url');
            if (urlInput) urlInput.value = master.imageUrl || '';
            
            const fileInput = document.getElementById('master-image-upload');
            if (fileInput) fileInput.value = '';
            
            const previewDiv = document.getElementById('master-image-preview');
            if (previewDiv) {
                previewDiv.innerHTML = master.imageUrl ? `<img src="${master.imageUrl}" style="max-width: 200px; max-height: 200px;">` : '';
            }
            
            document.getElementById('master-modal-title').textContent = 'Редактировать мастера';
            showModal('add-master-modal');
        }
    } catch (error) {
        console.error('Ошибка загрузки мастера для редактирования:', error);
        showNotification('Ошибка загрузки данных мастера', 'error');
    }
}

// ==============================================
// ФУНКЦИИ СОХРАНЕНИЯ
// ==============================================
async function addSalon() {
    const name = document.getElementById('salon-name').value.trim();
    const address = document.getElementById('salon-address').value.trim();
    const description = document.getElementById('salon-description').value.trim();
    
    if (!name || !address) {
        showNotification('Пожалуйста, заполните обязательные поля', 'error');
        return;
    }
    
    const fileInput = document.getElementById('salon-image-upload');
    const urlInput = document.getElementById('salon-image-url');
    let imageUrl = null;
    
    const saveBtn = document.getElementById('save-salon');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
    
    try {
        if (fileInput.files.length > 0) {
            imageUrl = await uploadImage(fileInput.files[0], 'salons');
        } else if (urlInput.value.trim()) {
            imageUrl = urlInput.value.trim();
        }
        
        const specializations = [];
        document.querySelectorAll('input[name="specialization"]:checked').forEach(cb => specializations.push(cb.value));
        
        const salonData = {
            name: name,
            address: address,
            district: document.getElementById('salon-district').value,
            description: description,
            specializations: specializations,
            ...(imageUrl && { imageUrl: imageUrl }),
            rating: 0,
            reviewCount: 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (editingSalonId) {
            // Если редактируем и не загрузили новое изображение, удаляем поле из объекта
            if (imageUrl === null) delete salonData.imageUrl;
            
            const originalSalon = await db.collection('salons').doc(editingSalonId).get();
            
            await db.collection('salons').doc(editingSalonId).update(salonData);
            
            await logAction('update', 'salon', editingSalonId, {
                name: name,
                fields: Object.keys(salonData),
                originalData: originalSalon.exists ? originalSalon.data() : null
            }, name);
            
            showNotification('Салон успешно обновлен');
            
            if (currentSalon && currentSalon.id === editingSalonId) {
                currentSalon = { id: editingSalonId, ...salonData };
            }
        } else {
            salonData.averagePrice = 2500;
            salonData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            
            const newSalonRef = await db.collection('salons').add(salonData);
            
            await logAction('create', 'salon', newSalonRef.id, { name: name }, name);
            
            showNotification('Салон успешно добавлен');
        }
        
        hideModal('add-salon-modal');
        updateAdminTables();
        loadAdminStats();
        
        editingSalonId = null;
        resetSalonForm();
    } catch (error) {
        console.error('Ошибка сохранения салона:', error);
        showNotification('Ошибка при сохранении салона', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Сохранить';
    }
}

async function addService() {
    const name = document.getElementById('service-name').value.trim();
    const price = document.getElementById('service-price').value.trim();
    const salonId = document.getElementById('service-salon').value;
    
    if (!name || !price || !salonId) {
        showNotification('Пожалуйста, заполните все обязательные поля', 'error');
        return;
    }
    
    const fileInput = document.getElementById('service-image-upload');
    const urlInput = document.getElementById('service-image-url');
    let imageUrl = null;
    
    const saveBtn = document.getElementById('save-service');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
    
    try {
        if (fileInput.files.length > 0) {
            imageUrl = await uploadImage(fileInput.files[0], 'services');
        } else if (urlInput.value.trim()) {
            imageUrl = urlInput.value.trim();
        }
        
        const salonDoc = await db.collection('salons').doc(salonId).get();
        if (!salonDoc.exists) {
            showNotification('Выбранный салон не найден', 'error');
            return;
        }
        
        const salon = salonDoc.data();
        
        const serviceData = {
            name: name,
            category: document.getElementById('service-category').value,
            price: parseInt(price),
            duration: parseInt(document.getElementById('service-duration').value) || 60,
            salonId: salonId,
            salonName: salon.name,
            ...(imageUrl && { imageUrl: imageUrl }),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (editingServiceId) {
            if (imageUrl === null) delete serviceData.imageUrl;
            
            const originalService = await db.collection('services').doc(editingServiceId).get();
            
            await db.collection('services').doc(editingServiceId).update(serviceData);
            
            await logAction('update', 'service', editingServiceId, {
                name: name,
                salonId: salonId,
                originalData: originalService.exists ? originalService.data() : null
            }, name);
            
            showNotification('Услуга успешно обновлена');
        } else {
            serviceData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('services').add(serviceData);
            
            await logAction('create', 'service', 'new', { name: name, salonId: salonId }, name);
            
            showNotification('Услуга успешно добавлена');
        }
        
        hideModal('add-service-modal');
        updateAdminTables();
        loadAdminStats();
        
        editingServiceId = null;
        resetServiceForm();
    } catch (error) {
        console.error('Ошибка сохранения услуги:', error);
        showNotification('Ошибка при сохранении услуги', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Сохранить';
    }
}

async function addMaster() {
    const name = document.getElementById('master-name').value.trim();
    const specializationElement = document.getElementById('master-specialization');
    const specialization = specializationElement.tagName === 'SELECT' ? specializationElement.value : specializationElement.value.trim();
    const price = document.getElementById('master-price').value.trim();
    const salonId = document.getElementById('master-salon').value;
    const email = document.getElementById('master-email').value.trim();
    const password = document.getElementById('master-password').value.trim();
    
    if (!name || !specialization || !price || !salonId) {
        showNotification('Пожалуйста, заполните все обязательные поля', 'error');
        return;
    }
    
    if (!editingMasterId && (!email || !password)) {
        showNotification('При добавлении нового мастера необходимо указать email и пароль', 'error');
        return;
    }
    
    if (!editingMasterId && password.length < 6) {
        showNotification('Пароль должен содержать минимум 6 символов', 'error');
        return;
    }
    
    const fileInput = document.getElementById('master-image-upload');
    const urlInput = document.getElementById('master-image-url');
    let imageUrl = null;
    
    const saveBtn = document.getElementById('save-master');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
    
    try {
        if (fileInput.files.length > 0) {
            imageUrl = await uploadImage(fileInput.files[0], 'masters');
        } else if (urlInput.value.trim()) {
            imageUrl = urlInput.value.trim();
        }
        
        const salonDoc = await db.collection('salons').doc(salonId).get();
        const salon = salonDoc.exists ? salonDoc.data() : { name: 'Неизвестный салон' };
        
        const masterData = {
            name: name,
            specialization: specialization,
            price: parseInt(price),
            salonId: salonId,
            salonName: salon.name,
            ...(imageUrl && { imageUrl: imageUrl }),
            rating: 0,
            reviewCount: 0,
            daysOff: [],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (editingMasterId) {
            if (imageUrl === null) delete masterData.imageUrl;
            
            const originalMaster = await db.collection('masters').doc(editingMasterId).get();
            
            await db.collection('masters').doc(editingMasterId).update(masterData);
            
            await logAction('update', 'master', editingMasterId, {
                name: name,
                originalData: originalMaster.exists ? originalMaster.data() : null
            }, name);
            
            showNotification('Мастер успешно обновлен');
        } else {
            // Создаем пользователя в аутентификации
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Создаем запись в коллекции users
            const userData = {
                email: email,
                name: name.split(' ')[0] || name,
                lastname: name.split(' ')[1] || '',
                phone: '',
                role: 'master',
                isAdmin: false,
                registrationDate: firebase.firestore.FieldValue.serverTimestamp(),
                bookings: []
            };
            
            await db.collection('users').doc(user.uid).set(userData);
            
            // Добавляем userId в данные мастера
            masterData.userId = user.uid;
            masterData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            
            await db.collection('masters').add(masterData);
            
            await logAction('create', 'master', 'new', { name: name, email: email }, name);
            await logAction('create', 'user', user.uid, { role: 'master' }, `${userData.name} ${userData.lastname}`);
            
            showNotification('Мастер успешно добавлен');
        }
        
        hideModal('add-master-modal');
        updateAdminTables();
        loadAdminStats();
        
        editingMasterId = null;
        resetMasterForm();
    } catch (error) {
        console.error('Ошибка сохранения мастера:', error);
        if (error.code === 'auth/email-already-in-use') {
            showNotification('Пользователь с таким email уже существует', 'error');
        } else {
            showNotification('Ошибка при сохранении мастера', 'error');
        }
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = 'Сохранить';
    }
}

// ==============================================
// УДАЛЕНИЕ
// ==============================================
async function deleteSalon(salonId) {
    if (!confirm('Вы уверены, что хотите удалить этот салон? Все связанные услуги и мастера также будут удалены.')) return;
    
    try {
        const salonDoc = await db.collection('salons').doc(salonId).get();
        const salonData = salonDoc.exists ? salonDoc.data() : null;
        
        // Удаляем салон
        await db.collection('salons').doc(salonId).delete();
        
        // Удаляем все услуги этого салона
        const servicesSnapshot = await db.collection('services').where('salonId', '==', salonId).get();
        const serviceBatch = db.batch();
        servicesSnapshot.docs.forEach(doc => serviceBatch.delete(doc.ref));
        await serviceBatch.commit();
        
        // Удаляем всех мастеров этого салона
        const mastersSnapshot = await db.collection('masters').where('salonId', '==', salonId).get();
        const masterBatch = db.batch();
        mastersSnapshot.docs.forEach(doc => masterBatch.delete(doc.ref));
        await masterBatch.commit();
        
        await logAction('delete', 'salon', salonId, { originalData: salonData }, 'Салон удален');
        
        showNotification('Салон и все связанные данные удалены');
        
        updateAdminTables();
        loadAdminStats();
    } catch (error) {
        console.error('Ошибка удаления салона:', error);
        showNotification('Ошибка при удалении салона', 'error');
    }
}

async function deleteService(serviceId) {
    if (!confirm('Вы уверены, что хотите удалить эту услугу?')) return;
    
    try {
        const serviceDoc = await db.collection('services').doc(serviceId).get();
        const serviceData = serviceDoc.exists ? serviceDoc.data() : null;
        const serviceName = serviceDoc.exists ? serviceDoc.data().name : 'Неизвестная услуга';
        
        await db.collection('services').doc(serviceId).delete();
        
        await logAction('delete', 'service', serviceId, { originalData: serviceData }, serviceName);
        
        showNotification('Услуга успешно удалена');
        
        updateAdminTables();
        loadAdminStats();
    } catch (error) {
        console.error('Ошибка удаления услуги:', error);
        showNotification('Ошибка при удалении услуги', 'error');
    }
}

async function deleteMaster(masterId) {
    if (!confirm('Вы уверены, что хотите удалить этого мастера? Это действие нельзя отменить.')) return;
    
    try {
        const masterDoc = await db.collection('masters').doc(masterId).get();
        const originalData = masterDoc.exists ? masterDoc.data() : null;
        const masterName = originalData ? originalData.name : 'Неизвестный мастер';
        
        await db.collection('masters').doc(masterId).delete();
        
        // Удаляем и пользователя, если он существует
        if (originalData && originalData.userId) {
            try {
                await db.collection('users').doc(originalData.userId).delete();
            } catch (error) {
                console.error('Ошибка удаления пользователя мастера:', error);
            }
        }
        
        await logAction('delete', 'master', masterId, { originalData }, masterName);
        
        showNotification('Мастер успешно удален');
        
        updateAdminTables();
        loadAdminStats();
    } catch (error) {
        console.error('Ошибка удаления мастера:', error);
        showNotification('Ошибка при удалении мастера', 'error');
    }
}

async function deleteUser(userId) {
    if (!confirm('Вы уверены, что хотите удалить этого пользователя? Это действие нельзя отменить.')) return;
    
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        const originalData = userDoc.exists ? userDoc.data() : null;
        
        await db.collection('users').doc(userId).delete();
        
        // Удаляем всех мастеров, связанных с этим пользователем
        const masters = await getMasters({ userId: userId });
        for (const master of masters) {
            await db.collection('masters').doc(master.id).delete();
        }
        
        await logAction('delete', 'user', userId, { originalData }, 'Пользователь удален');
        
        showNotification('Пользователь успешно удален');
        
        updateAdminTables();
        loadAdminStats();
    } catch (error) {
        console.error('Ошибка удаления пользователя:', error);
        showNotification('Ошибка при удалении пользователя', 'error');
    }
}

// ==============================================
// АДМИН-ПАНЕЛЬ С РАЗДЕЛЕНИЕМ ПРАВ
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
    
    const titleElement = document.getElementById('admin-page-title');
    if (titleElement) {
        if (isAdmin) titleElement.textContent = 'Админ-панель';
        else if (isMaster) titleElement.textContent = 'Мастер-панель';
    }
    
    if (isAdmin) {
        const switcher = document.getElementById('admin-mode-switcher');
        if (switcher) {
            switcher.innerHTML = `
                <button class="mode-btn active" data-mode="admin">Режим администратора</button>
                <button class="mode-btn" data-mode="actions-history">История действий</button>
                <button class="mode-btn" data-mode="reviews-management">Управление отзывами</button>
                <button class="mode-btn" data-mode="users-management">Управление пользователями</button>
            `;
        }
        
        document.getElementById('admin-mode').style.display = 'block';
        document.getElementById('actions-history-mode').style.display = 'none';
        document.getElementById('reviews-management-mode').style.display = 'none';
        document.getElementById('users-management-mode').style.display = 'none';
        document.getElementById('master-mode').style.display = 'none';
        
        updateAdminTables();
        loadSelectOptions();
        loadAdminStats();
        
        // Загружаем список салонов для фильтра отзывов (если вкладка уже активна, но скрыта)
        populateSalonFilterForReviews();
    } else if (isMaster) {
        const switcher = document.getElementById('admin-mode-switcher');
        if (switcher) {
            switcher.innerHTML = `
                <button class="mode-btn active" data-mode="master-bookings">Управление записями</button>
                <button class="mode-btn" data-mode="master-actions-history">Мои действия</button>
            `;
        }
        
        document.getElementById('admin-mode').style.display = 'none';
        document.getElementById('actions-history-mode').style.display = 'none';
        document.getElementById('reviews-management-mode').style.display = 'none';
        document.getElementById('users-management-mode').style.display = 'none';
        document.getElementById('master-mode').style.display = 'block';
        document.getElementById('master-bookings-mode').style.display = 'block';
        document.getElementById('master-actions-history-mode').style.display = 'none';
        
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
    const salons = await getSalons();
    const services = await getServices();
    const masters = await getMasters();
    const users = await getUsers();
    const bookings = await getBookings();
    
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
    
    const servicesTableBody = document.getElementById('services-table-body');
    if (servicesTableBody) {
        servicesTableBody.innerHTML = '';
        
        const salonMap = {};
        salons.forEach(salon => salonMap[salon.id] = salon.name);
        
        services.forEach(service => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${service.name}</td>
                <td>${getCategoryName(service.category)}</td>
                <td>${service.price || 0} ₽</td>
                <td>${salonMap[service.salonId] || 'Неизвестно'}</td>
                <td>
                    <button class="action-btn edit" onclick="editService('${service.id}')">Изменить</button>
                    <button class="action-btn delete" onclick="deleteService('${service.id}')">Удалить</button>
                </td>
            `;
            
            servicesTableBody.appendChild(row);
        });
    }
    
    const mastersTableBody = document.getElementById('masters-table-body');
    if (mastersTableBody) {
        mastersTableBody.innerHTML = '';
        
        const salonMap = {};
        salons.forEach(salon => salonMap[salon.id] = salon.name);
        
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

// ==============================================
// ФУНКЦИИ ИСТОРИИ ДЕЙСТВИЙ
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
        const canUndo = action.status === 'completed' && currentUser.role === 'admin' && action.actionType !== 'booking';
        
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
    
    return actions[action.actionType] || action.actionType || 'Неизвестное действие';
}

function getObjectDescription(action) {
    const objectType = action.objectType || '';
    const objectName = action.objectName || action.objectId || '';
    const details = action.details || {};
    
    switch(objectType) {
        case 'salon':
            if (action.actionType === 'update' && details.fields) {
                const fieldNames = {
                    'name': 'название',
                    'address': 'адрес',
                    'description': 'описание',
                    'specializations': 'специализации',
                    'imageUrl': 'фото',
                    'rating': 'рейтинг'
                };
                
                const changedFields = details.fields.filter(f => fieldNames[f]).map(f => fieldNames[f]).join(', ');
                return `Салон: ${objectName}, изменено: ${changedFields}`;
            }
            return `Салон: ${objectName}`;
        
        case 'service':
            return `Услуга: ${objectName}`;
        
        case 'master':
            return `Мастер: ${objectName}`;
        
        case 'user':
            if (action.actionType === 'user_update') return `Пользователь: ${objectName}, изменено: профиль`;
            return `Пользователь: ${objectName}`;
        
        case 'booking':
            return `Запись: ${details.salonName || objectName}`;
        
        case 'review':
            return `Отзыв: для салона ${details.salonName || objectName}`;
        
        case 'salon_rating':
            return `Рейтинг салона: ${objectName}`;
        
        default:
            return `${objectType}: ${objectName}`;
    }
}

// ==============================================
// ФУНКЦИЯ ОТМЕНЫ ДЕЙСТВИЯ (UNDO)
// ==============================================
async function undoAction(actionId) {
    if (!confirm('Вы уверены, что хотите отменить это действие?')) return;
    
    try {
        const actionDoc = await db.collection('actions_history').doc(actionId).get();
        if (!actionDoc.exists) {
            showNotification('Действие не найдено', 'error');
            return;
        }
        
        const action = actionDoc.data();
        const originalData = action.details?.originalData;
        
        console.log('Попытка отмены действия:', action);
        console.log('originalData:', originalData);
        
        if (!originalData) {
            showNotification('Невозможно отменить это действие (нет данных для восстановления)', 'error');
            return;
        }
        
        let restored = false;
        
        switch(action.objectType) {
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
                } else if (action.actionType === 'update') {
                    await db.collection('reviews').doc(action.objectId).update(originalData);
                    restored = true;
                }
                break;
            
            case 'user':
                if (action.actionType === 'delete') {
                    await db.collection('users').doc(action.objectId).set(originalData);
                    restored = true;
                } else if (action.actionType === 'update') {
                    await db.collection('users').doc(action.objectId).update(originalData);
                    restored = true;
                }
                break;
        }
        
        if (restored) {
            await db.collection('actions_history').doc(actionId).update({
                status: 'undone',
                undoneAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            showNotification('Действие успешно отменено');
            
            loadActionsHistory();
            updateAdminTables();
            
            if (action.objectType === 'salon' && currentSalon && currentSalon.id === action.objectId) {
                loadSalonPage(action.objectId);
            }
        } else {
            showNotification('Невозможно отменить это действие (неподдерживаемый тип или действие)', 'error');
        }
    } catch (error) {
        console.error('Ошибка отмены действия:', error);
        showNotification('Ошибка при отмене действия', 'error');
    }
}

// ==============================================
// ОЧИСТКА ВСЕЙ ИСТОРИИ ДЕЙСТВИЙ (ТОЛЬКО ДЛЯ АДМИНА)
// ==============================================
async function clearActionsHistory() {
    if (!currentUser || currentUser.role !== 'admin') {
        showNotification('Только администратор может очистить историю действий', 'error');
        return;
    }

    if (!confirm('Вы уверены, что хотите удалить ВСЮ историю действий? Это действие необратимо.')) return;

    try {
        const snapshot = await db.collection('actions_history').get();
        if (snapshot.empty) {
            showNotification('История действий уже пуста', 'info');
            return;
        }

        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        showNotification('История действий полностью очищена', 'success');
        loadActionsHistory(); // перезагрузить таблицу
    } catch (error) {
        console.error('Ошибка очистки истории:', error);
        showNotification('Ошибка при очистке истории', 'error');
    }
}

// ==============================================
// ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ ОТЗЫВАМИ (С ФИЛЬТРОМ)
// ==============================================
async function populateSalonFilterForReviews() {
    const select = document.getElementById('review-salon-filter');
    if (!select) return;

    try {
        const salons = await getSalons();
        select.innerHTML = '<option value="all">Все салоны</option>';
        salons.forEach(salon => {
            const option = document.createElement('option');
            option.value = salon.id;
            option.textContent = salon.name;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка загрузки салонов для фильтра:', error);
    }
}

async function loadReviewsManagement() {
    const tableBody = document.getElementById('reviews-management-table');
    if (!tableBody) return;

    const filterSelect = document.getElementById('review-salon-filter');
    const selectedSalonId = filterSelect ? filterSelect.value : 'all';

    let reviews;
    if (selectedSalonId === 'all') {
        reviews = await getReviews();
    } else {
        reviews = await getReviews({ salonId: selectedSalonId });
    }

    tableBody.innerHTML = '';

    for (const review of reviews) {
        let salonName = 'Неизвестный салон';
        if (review.salonId) {
            try {
                const salonDoc = await db.collection('salons').doc(review.salonId).get();
                if (salonDoc.exists) salonName = salonDoc.data().name;
            } catch (error) {
                console.error('Ошибка загрузки салона:', error);
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${review.authorName || 'Анонимный пользователь'}</td>
            <td>${salonName}</td>
            <td>${renderStars(review.rating || 0)} ${review.rating || 0}</td>
            <td>${review.text ? (review.text.length > 100 ? review.text.substring(0, 100) + '...' : review.text) : 'Нет текста'}</td>
            <td>${formatDate(review.date)}</td>
            <td><button class="action-btn delete" onclick="deleteReview('${review.id}')">Удалить</button></td>
        `;
        tableBody.appendChild(row);
    }
}

// ==============================================
// РЕДАКТИРОВАНИЕ ПОЛЬЗОВАТЕЛЯ
// ==============================================
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
        showNotification('Ошибка загрузки данных пользователя', 'error');
    }
}

async function saveUser() {
    const name = document.getElementById('edit-user-name').value.trim();
    const lastname = document.getElementById('edit-user-lastname').value.trim();
    const email = document.getElementById('edit-user-email').value.trim();
    const phone = document.getElementById('edit-user-phone').value.trim();
    const role = document.getElementById('edit-user-role').value;

    if (!name || !email || !role) {
        showNotification('Пожалуйста, заполните обязательные поля', 'error');
        return;
    }

    if (!editingUserId) {
        showNotification('Ошибка: ID пользователя не указан', 'error');
        return;
    }

    try {
        // Получаем старые данные
        const oldUserDoc = await db.collection('users').doc(editingUserId).get();
        const oldData = oldUserDoc.exists ? oldUserDoc.data() : null;

        await db.collection('users').doc(editingUserId).update({ name, lastname, email, phone, role });

        await logAction('user_update', 'user', editingUserId, {
            fields: ['name', 'lastname', 'email', 'phone', 'role'],
            originalData: oldData
        }, `${name} ${lastname}`);

        showNotification('Данные пользователя обновлены');

        hideModal('edit-user-modal');
        updateAdminTables();
        loadAdminStats();

        editingUserId = null;
        resetUserForm();
    } catch (error) {
        console.error('Ошибка обновления пользователя:', error);
        showNotification('Ошибка при обновлении данных пользователя', 'error');
    }
}

// ==============================================
// ОБНОВЛЕНИЕ СТАТУСА ЗАПИСИ
// ==============================================
async function updateBookingStatus(bookingId, newStatus) {
    try {
        // Получаем старые данные до обновления
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        const oldData = bookingDoc.exists ? bookingDoc.data() : null;

        await db.collection('bookings').doc(bookingId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await logAction('update', 'booking', bookingId, {
            field: 'status',
            newValue: newStatus,
            originalData: oldData
        }, 'Статус записи изменен');

        showNotification(`Статус записи изменен на "${newStatus}"`);

        if (document.getElementById('admin-page').classList.contains('active')) updateAdminTables();
        if (document.getElementById('profile-page').classList.contains('active')) loadUserBookings();
        if (document.getElementById('master-mode').style.display !== 'none') {
            loadMasterBookingsForMaster(currentActiveMasterId);
        }
    } catch (error) {
        console.error('Ошибка обновления статуса записи:', error);
        showNotification('Ошибка при изменении статуса', 'error');
    }
}

// ==============================================
// СТАТИСТИКА ДЛЯ АДМИНА
// ==============================================
async function loadAdminStats() {
    try {
        const [salons, services, masters, users, bookings, reviews] = await Promise.all([
            getSalons(),
            getServices(),
            getMasters(),
            getUsers(),
            getBookings(),
            getReviews()
        ]);
        
        const statsContainer = document.getElementById('admin-stats');
        if (!statsContainer) return;
        
        statsContainer.innerHTML = `
            <div class="stat-card"><h3>${salons.length}</h3><p>Салоны</p></div>
            <div class="stat-card"><h3>${services.length}</h3><p>Услуги</p></div>
            <div class="stat-card"><h3>${masters.length}</h3><p>Мастера</p></div>
            <div class="stat-card"><h3>${users.length}</h3><p>Пользователи</p></div>
            <div class="stat-card"><h3>${bookings.length}</h3><p>Записи</p></div>
            <div class="stat-card"><h3>${reviews.length}</h3><p>Отзывы</p></div>
        `;
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// ==============================================
// МАСТЕР-ПАНЕЛЬ С ПЕРЕКЛЮЧЕНИЕМ МЕЖДУ МАСТЕРАМИ
// ==============================================
async function loadAvailableMasters() {
    if (!currentUser) return [];
    
    return await getMasters();
}

async function populateMasterSelect() {
    const select = document.getElementById('master-select');
    if (!select) return;
    
    const masters = await loadAvailableMasters();
    
    select.innerHTML = '<option value="">Выберите мастера</option>';
    
    masters.forEach((master, index) => {
        const option = document.createElement('option');
        option.value = master.id;
        option.textContent = `${master.name} (${master.salonName || 'Неизвестный салон'})`;
        select.appendChild(option);
    });
    
    if (masters.length > 0 && !currentActiveMasterId) {
        currentActiveMasterId = masters[0].id;
        select.value = currentActiveMasterId;
    } else if (currentActiveMasterId) {
        select.value = currentActiveMasterId;
    }
}

async function loadMasterBookingsForMaster(masterId) {
    if (!masterId) return;
    
    const bookings = await getBookings({ masterId: masterId });
    
    const tableBody = document.getElementById('master-bookings-table');
    if (!tableBody) return;
    
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
}

async function setupMasterPanel() {
    if (!currentUser || currentUser.role !== 'master') return;
    
    const titleElement = document.getElementById('master-name-display');
    if (titleElement) titleElement.textContent = `Личный кабинет мастера: ${currentUser.name || ''} ${currentUser.lastname || ''}`;
    
    await populateMasterSelect();
    
    const masters = await loadAvailableMasters();
    
    if (masters.length > 0) {
        const master = masters[0];
        currentActiveMasterId = master.id;
        
        document.getElementById('master-detail-name').textContent = master.name || '';
        document.getElementById('master-detail-lastname').textContent = currentUser.lastname || '';
        document.getElementById('master-detail-email').textContent = currentUser.email || '';
        document.getElementById('master-detail-phone').textContent = currentUser.phone || 'Не указан';
        document.getElementById('master-detail-salon').textContent = master.salonName || 'Неизвестно';
        document.getElementById('master-detail-specialization').textContent = master.specialization || 'Не указана';
        
        await loadMasterBookingsForMaster(currentActiveMasterId);
    } else {
        showNotification('Нет доступных мастеров', 'warning');
    }
}

async function loadMasterDetails() {
    try {
        const masters = await getMasters({ userId: currentUser.id });
        if (masters.length > 0) {
            const master = masters[0];
            
            document.getElementById('master-detail-name').textContent = currentUser.name || '';
            document.getElementById('master-detail-lastname').textContent = currentUser.lastname || '';
            document.getElementById('master-detail-email').textContent = currentUser.email || '';
            document.getElementById('master-detail-phone').textContent = currentUser.phone || 'Не указан';
            document.getElementById('master-detail-salon').textContent = master.salonName || 'Неизвестно';
            document.getElementById('master-detail-specialization').textContent = master.specialization || 'Не указана';
        }
    } catch (error) {
        console.error('Ошибка загрузки данных мастера:', error);
    }
}

async function loadMasterBookings() {
    if (!currentActiveMasterId) return;
    
    await loadMasterBookingsForMaster(currentActiveMasterId);
}

async function loadMasterActionsHistory() {
    if (!currentUser) return;
    
    const actions = await getActionsHistory({ userId: currentUser.id });
    
    const tableBody = document.getElementById('master-actions-history-table');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    actions.forEach(action => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${formatDateTime(action.timestamp)}</td>
            <td>${getActionDescription(action)}</td>
            <td>${getObjectDescription(action)}</td>
            <td>${action.status === 'completed' && action.actionType !== 'booking' ? `<button class="action-btn undo" onclick="undoAction('${action.id}')">Отменить</button>` : action.status === 'undone' ? 'Отменено' : '-'}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

async function editMasterProfile() {
    try {
        const masters = await getMasters({ userId: currentUser.id });
        if (masters.length > 0) {
            const master = masters[0];
            
            document.getElementById('edit-master-name').value = currentUser.name || '';
            document.getElementById('edit-master-lastname').value = currentUser.lastname || '';
            document.getElementById('edit-master-email').value = currentUser.email || '';
            document.getElementById('edit-master-phone').value = currentUser.phone || '';
            
            const specializationSelect = document.getElementById('edit-master-specialization');
            if (specializationSelect) {
                // Если это инпут, заменяем на селект
                if (specializationSelect.tagName === 'INPUT') {
                    const select = document.createElement('select');
                    select.id = 'edit-master-specialization';
                    select.className = 'form-input';
                    select.innerHTML = `
                        <option value="">Выберите специализацию</option>
                        <option value="Парикмахер">Парикмахер</option>
                        <option value="Мастер маникюра">Мастер маникюра</option>
                        <option value="Косметолог">Косметолог</option>
                        <option value="Массажист">Массажист</option>
                        <option value="Барбер">Барбер</option>
                        <option value="Визажист">Визажист</option>
                        <option value="Бровист">Бровист</option>
                        <option value="Лешмейкер">Лешмейкер</option>
                        <option value="Эстетист">Эстетист</option>
                        <option value="Подолог">Подолог</option>
                    `;
                    
                    specializationSelect.parentNode.replaceChild(select, specializationSelect);
                }
                
                const newSelect = document.getElementById('edit-master-specialization');
                if (newSelect && master.specialization) newSelect.value = master.specialization;
            }
            
            document.getElementById('edit-master-password').value = '';
            
            showModal('edit-master-modal');
        }
    } catch (error) {
        console.error('Ошибка загрузки данных мастера:', error);
        showNotification('Ошибка загрузки данных профиля', 'error');
    }
}

async function saveMasterProfile() {
    const name = document.getElementById('edit-master-name').value.trim();
    const lastname = document.getElementById('edit-master-lastname').value.trim();
    const email = document.getElementById('edit-master-email').value.trim();
    const phone = document.getElementById('edit-master-phone').value.trim();
    const specializationElement = document.getElementById('edit-master-specialization');
    const specialization = specializationElement.tagName === 'SELECT' ? specializationElement.value : specializationElement.value.trim();
    const password = document.getElementById('edit-master-password').value.trim();
    
    if (!name || !email || !specialization) {
        showNotification('Пожалуйста, заполните обязательные поля', 'error');
        return;
    }
    
    try {
        // Получаем старые данные пользователя
        const oldUserDoc = await db.collection('users').doc(currentUser.id).get();
        const oldUserData = oldUserDoc.exists ? oldUserDoc.data() : null;

        // Обновляем данные пользователя
        await db.collection('users').doc(currentUser.id).update({ name, lastname, email, phone });
        
        // Обновляем данные мастера
        const masters = await getMasters({ userId: currentUser.id });
        if (masters.length > 0) {
            const master = masters[0];
            await db.collection('masters').doc(master.id).update({
                name: `${name} ${lastname}`,
                specialization
            });
        }
        
        // Обновляем пароль, если указан
        if (password) {
            try {
                const user = auth.currentUser;
                if (user) {
                    await user.updatePassword(password);
                }
            } catch (error) {
                console.error('Ошибка обновления пароля:', error);
                showNotification('Ошибка обновления пароля. Попробуйте более сложный пароль.', 'error');
                return;
            }
        }
        
        // Обновляем текущего пользователя
        currentUser.name = name;
        currentUser.lastname = lastname;
        currentUser.email = email;
        currentUser.phone = phone;
        localStorage.setItem('beautyBookingUser', JSON.stringify(currentUser));
        
        await logAction('user_update', 'user', currentUser.id, {
            fields: ['name', 'lastname', 'email', 'phone', 'specialization'],
            originalData: oldUserData
        }, `${name} ${lastname}`);
        
        showNotification('Профиль успешно обновлен');
        
        hideModal('edit-master-modal');
        setupMasterPanel();
    } catch (error) {
        console.error('Ошибка обновления профиля:', error);
        showNotification('Ошибка при обновлении профиля', 'error');
    }
}

async function deleteMasterProfile() {
    if (!confirm('Вы уверены, что хотите удалить свой профиль? Это действие нельзя отменить.')) return;
    
    try {
        const masters = await getMasters({ userId: currentUser.id });
        
        for (const master of masters) {
            await db.collection('masters').doc(master.id).delete();
        }
        
        await db.collection('users').doc(currentUser.id).delete();
        
        await auth.signOut();
        
        currentUser = null;
        localStorage.removeItem('beautyBookingUser');
        
        updateProfileButton();
        
        showNotification('Ваш профиль успешно удален');
        
        showPage('home-page');
    } catch (error) {
        console.error('Ошибка удаления профиля:', error);
        showNotification('Ошибка при удалении профиля', 'error');
    }
}

// ==============================================
// КАЛЕНДАРЬ МАСТЕРА
// ==============================================
async function loadMasterSchedulePage() {
    if (!currentUser || currentUser.role !== 'master') {
        showNotification('Только мастера могут просматривать это расписание', 'error');
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
    
    let html = `<div class="calendar-grid">
        <div class="calendar-day">Пн</div>
        <div class="calendar-day">Вт</div>
        <div class="calendar-day">Ср</div>
        <div class="calendar-day">Чт</div>
        <div class="calendar-day">Пт</div>
        <div class="calendar-day">Сб</div>
        <div class="calendar-day">Вс</div>`;
    
    const firstDayIndex = (firstDay.getDay() + 6) % 7; // Начинаем с понедельника
    
    // Пустые ячейки до первого дня месяца
    for (let i = 0; i < firstDayIndex; i++) {
        html += '<div class="calendar-date"></div>';
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    // Ячейки с днями месяца
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
    
    // Добавляем обработчики кликов
    container.querySelectorAll('.calendar-date[data-date]').forEach(dateEl => {
        dateEl.addEventListener('click', async function() {
            const selectedDate = this.getAttribute('data-date');
            
            // Убираем выделение со всех дат
            container.querySelectorAll('.calendar-date').forEach(el => el.classList.remove('selected'));
            
            // Выделяем выбранную дату
            this.classList.add('selected');
            
            // Загружаем записи на эту дату
            loadDayBookings(selectedDate);
        });
    });
    
    // Автоматически кликаем на сегодняшний день
    const todayEl = container.querySelector(`.calendar-date[data-date="${today}"]`);
    if (todayEl) {
        todayEl.click();
    }
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
    
    const formattedDate = formatDate(date);
    dateText.textContent = formattedDate;
    
    if (bookings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 40px 20px; color: var(--text-light);">
            <i class="far fa-calendar-check" style="font-size: 48px; margin-bottom: 20px;"></i>
            <p>На эту дату нет записей</p>
        </div>`;
        return;
    }
    
    // Сортируем записи по времени
    bookings.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
    
    let html = '';
    
    bookings.forEach(booking => {
        html += `
            <div class="booking-item">
                <div class="booking-time">${booking.time || 'Не указано'}</div>
                <div class="booking-service">${booking.serviceName || 'Неизвестно'}</div>
                <div class="booking-client">${booking.clientName || ''} ${booking.clientLastname || ''}</div>
                <div class="booking-status confirmed">${booking.status || 'Неизвестно'}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function prevMonth() {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() - 1);
    renderCalendar(currentCalendarMonth);
    loadDayBookings(currentCalendarMonth.toISOString().split('T')[0]);
}

function nextMonth() {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + 1);
    renderCalendar(currentCalendarMonth);
    loadDayBookings(currentCalendarMonth.toISOString().split('T')[0]);
}

// ==============================================
// ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (МОИ ЗАПИСИ)
// ==============================================
async function loadUserBookings() {
    const container = document.getElementById('user-bookings-container');
    if (!container) return;
    
    if (!currentUser || currentUser.role !== 'client') {
        container.innerHTML = `<div class="auth-required-message">
            <p>Для просмотра ваших записей необходимо войти в систему как клиент.</p>
            <button class="btn" onclick="showModal('profile-modal')">Войти</button>
        </div>`;
        return;
    }
    
    const userBookings = await getBookings({ userId: currentUser.id });
    
    if (userBookings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 50px 0; color: var(--text-light);">
            <i class="far fa-calendar-check" style="font-size: 48px; margin-bottom: 20px;"></i>
            <p>У вас пока нет записей.</p>
            <button class="btn" onclick="showPage('salons-page')" style="margin-top: 20px;">
                <i class="fas fa-calendar-plus"></i> Записаться
            </button>
        </div>`;
        return;
    }
    
    container.innerHTML = `
        <h2 style="margin-bottom: 30px;">Мои записи (${userBookings.length})</h2>
        <div class="services-grid">
            ${userBookings.map(booking => `
                <div class="service-card" style="position: relative;">
                    <div style="position: absolute; top: 15px; right: 15px; background: ${getStatusColor(booking.status)}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">${booking.status || 'Неизвестно'}</div>
                    <div class="service-info">
                        <h3 class="service-name">${booking.salonName || 'Неизвестный салон'}</h3>
                        <p><strong>Услуга:</strong> ${booking.serviceName || 'Неизвестно'}</p>
                        <p><strong>Мастер:</strong> ${booking.masterName || 'Неизвестно'}</p>
                        <p><strong>Дата:</strong> ${formatDate(booking.date)}</p>
                        <p><strong>Время:</strong> ${booking.time || 'Не указано'}</p>
                        <p><strong>Цена:</strong> ${booking.totalPrice || 0} ₽</p>
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
        'Отменено': 'var(--error-color)',
        'Перенесено': 'var(--warning-color)'
    };
    
    return colors[status] || 'var(--text-light)';
}

async function cancelUserBooking(bookingId) {
    if (!confirm('Вы уверены, что хотите отменить эту запись?')) return;

    try {
        // Получаем старые данные до изменения
        const bookingDoc = await db.collection('bookings').doc(bookingId).get();
        const oldData = bookingDoc.exists ? bookingDoc.data() : null;

        await db.collection('bookings').doc(bookingId).update({
            status: 'Отменено',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await logAction('update', 'booking', bookingId, {
            field: 'status',
            newValue: 'Отменено',
            userAction: true,
            originalData: oldData
        }, 'Запись отменена');

        showNotification('Запись успешно отменена');
        loadUserBookings();
    } catch (error) {
        console.error('Ошибка отмены записи:', error);
        showNotification('Ошибка при отмене записи', 'error');
    }
}

// ==============================================
// ФУНКЦИЯ ПОИСКА
// ==============================================
async function performSearch() {
    const searchInput = document.getElementById('global-search');
    if (!searchInput) return;
    
    const query = searchInput.value.trim();
    
    if (query.includes('@')) {
        showNotification('Пожалуйста, используйте поиск по названию или адресу салона', 'warning');
        searchInput.value = '';
        return;
    }
    
    loadSalonsWithFilters();
}

// ==============================================
// ФИЛЬТРАЦИЯ
// ==============================================
async function applyFilters() {
    loadSalonsWithFilters();
}

// ==============================================
// ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ
// ==============================================
function resetSalonForm() {
    document.getElementById('salon-name').value = '';
    document.getElementById('salon-address').value = '';
    document.getElementById('salon-district').value = 'center';
    document.getElementById('salon-description').value = '';
    
    document.querySelectorAll('input[name="specialization"]').forEach(cb => cb.checked = false);
    
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
    document.getElementById('service-salon').value = '';
    
    document.getElementById('service-image-upload').value = '';
    document.getElementById('service-image-url').value = '';
    document.getElementById('service-image-preview').innerHTML = '';
    
    document.getElementById('service-modal-title').textContent = 'Добавить услугу';
    
    editingServiceId = null;
}

function resetMasterForm() {
    document.getElementById('master-name').value = '';
    
    const specializationElement = document.getElementById('master-specialization');
    if (specializationElement && specializationElement.tagName === 'SELECT') {
        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'master-specialization';
        input.className = 'form-input';
        input.placeholder = 'Специализация мастера';
        
        specializationElement.parentNode.replaceChild(input, specializationElement);
    } else {
        document.getElementById('master-specialization').value = '';
    }
    
    document.getElementById('master-price').value = '';
    document.getElementById('master-salon').value = '';
    
    document.getElementById('master-email').value = '';
    document.getElementById('master-password').value = '';
    
    // Показываем поля создания пользователя
    document.getElementById('master-email').style.display = 'block';
    document.getElementById('master-password').style.display = 'block';
    document.querySelector('label[for="master-email"]').style.display = 'block';
    document.querySelector('label[for="master-password"]').style.display = 'block';
    
    document.getElementById('master-image-upload').value = '';
    document.getElementById('master-image-url').value = '';
    document.getElementById('master-image-preview').innerHTML = '';
    
    document.getElementById('master-modal-title').textContent = 'Добавить мастера';
    
    editingMasterId = null;
}

function resetUserForm() {
    document.getElementById('edit-user-name').value = '';
    document.getElementById('edit-user-lastname').value = '';
    document.getElementById('edit-user-email').value = '';
    document.getElementById('edit-user-phone').value = '';
    document.getElementById('edit-user-role').value = 'client';
    
    editingUserId = null;
}

async function loadSelectOptions() {
    try {
        const salons = await getSalons();
        
        const salonSelects = [
            document.getElementById('service-salon'),
            document.getElementById('master-salon')
        ];
        
        salonSelects.forEach(select => {
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
    } catch (error) {
        console.error('Ошибка загрузки опций:', error);
    }
}

// ==============================================
// ВОССТАНОВЛЕНИЕ АДМИНА
// ==============================================
async function ensureAdminExists() {
    try {
        const adminEmail = 'admin@beauty.ru';
        const adminPassword = 'admin1';
        
        const users = await getUsers();
        
        const adminExists = users.some(user => 
            user.email === adminEmail && user.role === 'admin'
        );
        
        if (!adminExists) {
            try {
                // Создаем пользователя в аутентификации
                const userCredential = await auth.createUserWithEmailAndPassword(adminEmail, adminPassword);
                const user = userCredential.user;
                
                // Создаем запись в коллекции users
                const adminData = {
                    email: adminEmail,
                    name: 'Администратор',
                    lastname: 'Системы',
                    phone: '+7 (999) 123-45-67',
                    role: 'admin',
                    isAdmin: true,
                    registrationDate: firebase.firestore.FieldValue.serverTimestamp(),
                    bookings: []
                };
                
                await db.collection('users').doc(user.uid).set(adminData);
                
                console.log('Администратор успешно создан');
                showNotification('Администратор восстановлен: admin@beauty.ru / admin1', 'success');
            } catch (error) {
                // Если пользователь уже существует в аутентификации
                if (error.code === 'auth/email-already-in-use') {
                    const user = auth.currentUser;
                    if (user) {
                        const userDoc = await db.collection('users').doc(user.uid).get();
                        if (userDoc.exists) {
                            const userData = userDoc.data();
                            // Если пользователь существует, но не является админом
                            if (userData.role !== 'admin') {
                                await db.collection('users').doc(user.uid).update({
                                    role: 'admin',
                                    isAdmin: true
                                });
                                console.log('Роль администратора восстановлена');
                            }
                        }
                    }
                } else {
                    console.error('Ошибка создания админа:', error);
                }
            }
        }
    } catch (error) {
        console.error('Ошибка проверки админа:', error);
    }
}

// ==============================================
// ИНИЦИАЛИЗАЦИЯ СТРАНИЦЫ
// ==============================================
document.addEventListener('DOMContentLoaded', function() {
    // Очищаем все поля ввода
    document.querySelectorAll('input, textarea').forEach(element => {
        if (element.type !== 'submit' && element.type !== 'button' && element.type !== 'checkbox') {
            element.value = '';
        }
    });
    
    // Очищаем поле поиска
    const searchInput = document.getElementById('global-search');
    if (searchInput) {
        searchInput.value = '';
        
        searchInput.addEventListener('input', function(e) {
            if (this.value.includes('@')) {
                this.value = this.value.replace(/@.*$/, '');
                showNotification('Пожалуйста, используйте поиск по названию салона', 'warning');
            }
        });
    }
    
    // Загружаем сохраненного пользователя из localStorage
    const savedUser = localStorage.getItem('beautyBookingUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateProfileButton();
            setupUserNavigation();
        } catch (error) {
            console.error('Ошибка загрузки пользователя из localStorage:', error);
            localStorage.removeItem('beautyBookingUser');
        }
    }
    
    // Слушатель изменений состояния аутентификации
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    currentUser = { id: user.uid, email: user.email, ...userDoc.data() };
                    localStorage.setItem('beautyBookingUser', JSON.stringify(currentUser));
                }
            } catch (error) {
                console.error('Ошибка загрузки данных пользователя:', error);
            }
        } else {
            currentUser = null;
            localStorage.removeItem('beautyBookingUser');
        }
        
        updateProfileButton();
        setupUserNavigation();
    });
    
    // Обработчики навигации
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const page = this.getAttribute('data-page');
            
            // Убираем активный класс у всех ссылок
            document.querySelectorAll('.nav-link').forEach(navLink => navLink.classList.remove('active'));
            
            // Добавляем активный класс текущей ссылке
            this.classList.add('active');
            
            // Показываем соответствующую страницу
            switch(page) {
                case 'home':
                    showPage('home-page');
                    break;
                case 'salons':
                    showPage('salons-page');
                    break;
                case 'services':
                    showPage('services-page');
                    break;
                case 'masters':
                    showPage('masters-page');
                    break;
                case 'profile':
                    if (currentUser && currentUser.role === 'client') {
                        showPage('profile-page');
                    } else {
                        showModal('profile-modal');
                    }
                    break;
                case 'admin':
                    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'master')) {
                        showPage('admin-page');
                    } else {
                        showNotification('Доступ запрещен', 'error');
                    }
                    break;
                case 'master-schedule':
                    if (currentUser && currentUser.role === 'master') {
                        showPage('master-schedule-page');
                    } else {
                        showNotification('Доступ только для мастеров', 'error');
                    }
                    break;
            }
        });
    });
    
    // Обработчики кнопок входа/выхода
    document.getElementById('profile-modal-btn')?.addEventListener('click', function() {
        if (!currentUser) {
            showModal('profile-modal');
        }
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', logout);
    
    // Обработчики модальных окон
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                hideModal(modal.id);
            }
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                hideModal(this.id);
            }
        });
    });
    
    // Обработчики вкладок авторизации
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabType = this.getAttribute('data-auth-tab');
            
            // Убираем активный класс у всех вкладок
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            
            // Добавляем активный класс текущей вкладке
            this.classList.add('active');
            
            // Скрываем все формы
            document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
            
            // Показываем выбранную форму
            document.getElementById(`${tabType}-form`).classList.add('active');
        });
    });
    
    // Переключение между формами входа и регистрации
    document.getElementById('switch-to-register')?.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector('.auth-tab[data-auth-tab="register"]').click();
    });
    
    document.getElementById('switch-to-login')?.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelector('.auth-tab[data-auth-tab="login"]').click();
    });
    
    // Обработчики кнопок входа и регистрации
    document.getElementById('login-btn')?.addEventListener('click', login);
    document.getElementById('register-btn')?.addEventListener('click', register);
    
    // Обработчики поиска
    document.getElementById('search-btn')?.addEventListener('click', performSearch);
    
    document.getElementById('global-search')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Обработчик фильтров
    document.getElementById('apply-filters')?.addEventListener('click', applyFilters);
    
    // Обработчики звезд рейтинга для салонов
    document.querySelectorAll('#review-stars i').forEach(star => {
        star.addEventListener('click', function() {
            selectedRating = parseInt(this.getAttribute('data-rating'));
            updateRatingDisplay();
        });
        
        star.addEventListener('mouseover', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            document.querySelectorAll('#review-stars i').forEach((s, index) => {
                s.className = index < rating ? 'fas fa-star' : 'far fa-star';
            });
        });
        
        star.addEventListener('mouseout', function() {
            updateRatingDisplay();
        });
    });
    
    // Обработчики звезд для мастера
    document.querySelectorAll('#master-review-stars i').forEach(star => {
        star.addEventListener('click', function() {
            selectedMasterRating = parseInt(this.getAttribute('data-rating'));
            updateMasterRatingDisplay();
        });
        star.addEventListener('mouseover', function() {
            const rating = parseInt(this.getAttribute('data-rating'));
            document.querySelectorAll('#master-review-stars i').forEach((s, index) => {
                s.className = index < rating ? 'fas fa-star' : 'far fa-star';
            });
        });
        star.addEventListener('mouseout', function() {
            updateMasterRatingDisplay();
        });
    });

    // Кнопка отправки отзыва о мастере
    document.getElementById('submit-master-review')?.addEventListener('click', submitMasterReview);
    
    // Обработчик отправки отзыва о салоне
    document.getElementById('submit-review')?.addEventListener('click', submitReview);
    
    // Обработчики кнопок записи на страницах
    document.addEventListener('click', function(e) {
        if (e.target.id === 'book-this-salon' || e.target.closest('#book-this-salon')) {
            startBookingProcess();
        }
        
        if (e.target.id === 'book-this-master' || e.target.closest('#book-this-master')) {
            startBookingForMaster(selectedMaster.id);
        }
        
        if (e.target.id === 'book-this-service' || e.target.closest('#book-this-service')) {
            startBookingForService(selectedService.id);
        }
    });
    
    // Обработчики шагов бронирования
    document.getElementById('to-step-2')?.addEventListener('click', function() {
        if (!selectedService) {
            showNotification('Пожалуйста, выберите услугу', 'error');
            return;
        }
        
        goToStep(2);
        loadMastersForBooking();
    });
    
    document.getElementById('back-to-step-1')?.addEventListener('click', function() {
        goToStep(1);
    });
    
    document.getElementById('to-step-3')?.addEventListener('click', function() {
        if (!selectedMaster) {
            showNotification('Пожалуйста, выберите мастера', 'error');
            return;
        }
        
        goToStep(3);
        
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.getElementById('booking-date');
        
        if (dateInput) {
            dateInput.min = today;
            dateInput.value = today;
            selectedDate = today;
            
            loadTimeSlots(today);
        }
    });
    
    document.getElementById('booking-date')?.addEventListener('change', function() {
        selectedDate = this.value;
        
        if (selectedMaster) {
            loadTimeSlots(selectedDate);
        }
    });
    
    document.getElementById('back-to-step-2')?.addEventListener('click', function() {
        goToStep(2);
    });
    
    document.getElementById('to-step-4')?.addEventListener('click', function() {
        if (!selectedDate || !selectedTime) {
            showNotification('Пожалуйста, выберите дату и время', 'error');
            return;
        }
        
        goToStep(4);
        updateBookingSummary();
        
        // Заполняем форму данными пользователя, если он авторизован
        if (currentUser) {
            const nameInput = document.getElementById('client-name');
            const lastnameInput = document.getElementById('client-lastname');
            const phoneInput = document.getElementById('client-phone');
            
            if (nameInput && currentUser.name) nameInput.value = currentUser.name;
            if (lastnameInput && currentUser.lastname) lastnameInput.value = currentUser.lastname;
            if (phoneInput && currentUser.phone) phoneInput.value = currentUser.phone;
        }
    });
    
    document.getElementById('back-to-step-3')?.addEventListener('click', function() {
        goToStep(3);
    });
    
    document.getElementById('confirm-booking')?.addEventListener('click', confirmBooking);
    
    // Обработчик для переключения вкладок админ-панели
    document.addEventListener('click', function(e) {
        if (e.target.closest('.mode-btn')) {
            const btn = e.target.closest('.mode-btn');
            const mode = btn.getAttribute('data-mode');
            
            // Определяем, в какой панели находимся
            const masterModeVisible = document.getElementById('master-mode')?.style.display === 'block';
            const adminModeVisible = document.getElementById('admin-mode')?.style.display === 'block';
            
            e.preventDefault();
            e.stopPropagation();
            
            // Переключение в мастер-панели
            if (masterModeVisible && (mode === 'master-bookings' || mode === 'master-actions-history')) {
                document.querySelectorAll('#master-mode .mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.getElementById('master-bookings-mode').style.display = 'none';
                document.getElementById('master-actions-history-mode').style.display = 'none';
                
                if (mode === 'master-bookings') {
                    document.getElementById('master-bookings-mode').style.display = 'block';
                    if (currentActiveMasterId) {
                        loadMasterBookingsForMaster(currentActiveMasterId);
                    }
                } else if (mode === 'master-actions-history') {
                    document.getElementById('master-actions-history-mode').style.display = 'block';
                    loadMasterActionsHistory();
                }
            }
            
            // Переключение в админ-панели
            else if (mode && (mode === 'admin' || mode === 'actions-history' || mode === 'reviews-management' || mode === 'users-management')) {
                document.querySelectorAll('#admin-mode-switcher .mode-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.querySelectorAll('.admin-content').forEach(content => {
                    if (content.id !== 'master-mode') {
                        content.style.display = 'none';
                    }
                });
                
                if (mode === 'admin') {
                    document.getElementById('admin-mode').style.display = 'block';
                } else if (mode === 'actions-history') {
                    document.getElementById('actions-history-mode').style.display = 'block';
                    loadActionsHistory();
                } else if (mode === 'reviews-management') {
                    document.getElementById('reviews-management-mode').style.display = 'block';
                    // Загружаем фильтр и таблицу при переключении
                    populateSalonFilterForReviews();
                    loadReviewsManagement();
                } else if (mode === 'users-management') {
                    document.getElementById('users-management-mode').style.display = 'block';
                    updateAdminTables(); // Обновляем таблицы при переключении
                }
            }
        }
    });

    // Обработчики кнопок добавления
    document.getElementById('add-salon-btn')?.addEventListener('click', function() {
        resetSalonForm();
        showModal('add-salon-modal');
    });

    document.getElementById('add-service-admin-btn')?.addEventListener('click', function() {
        resetServiceForm();
        loadSelectOptions(); // чтобы обновить список салонов
        showModal('add-service-modal');
    });

    document.getElementById('add-master-btn')?.addEventListener('click', function() {
        resetMasterForm();
        loadSelectOptions();
        showModal('add-master-modal');
    });

    // Обработчик кнопки применения фильтра отзывов
    document.getElementById('apply-review-filter')?.addEventListener('click', function() {
        loadReviewsManagement();
    });
    
    // Обработчики кнопок обновления
    document.getElementById('refresh-history')?.addEventListener('click', loadActionsHistory);
    
    // Обработчик кнопки очистки истории
    document.getElementById('clear-history')?.addEventListener('click', clearActionsHistory);
    
    // Обработчики модальных окон салона
    document.getElementById('save-salon')?.addEventListener('click', addSalon);
    document.getElementById('cancel-salon')?.addEventListener('click', function() {
        hideModal('add-salon-modal');
        resetSalonForm();
    });
    document.getElementById('add-salon-modal-close')?.addEventListener('click', function() {
        hideModal('add-salon-modal');
        resetSalonForm();
    });
    
    // Обработчики модальных окон услуги
    document.getElementById('save-service')?.addEventListener('click', addService);
    document.getElementById('cancel-service')?.addEventListener('click', function() {
        hideModal('add-service-modal');
        resetServiceForm();
    });
    document.getElementById('add-service-modal-close')?.addEventListener('click', function() {
        hideModal('add-service-modal');
        resetServiceForm();
    });
    
    // Обработчики модальных окон мастера
    document.getElementById('save-master')?.addEventListener('click', addMaster);
    document.getElementById('cancel-master')?.addEventListener('click', function() {
        hideModal('add-master-modal');
        resetMasterForm();
    });
    document.getElementById('add-master-modal-close')?.addEventListener('click', function() {
        hideModal('add-master-modal');
        resetMasterForm();
    });
    
    // Обработчики модальных окон пользователя
    document.getElementById('save-edit-user')?.addEventListener('click', saveUser);
    document.getElementById('cancel-edit-user')?.addEventListener('click', function() {
        hideModal('edit-user-modal');
        resetUserForm();
    });
    document.getElementById('edit-user-modal-close')?.addEventListener('click', function() {
        hideModal('edit-user-modal');
        resetUserForm();
    });
    
    // Обработчики профиля мастера
    document.getElementById('edit-master-profile')?.addEventListener('click', editMasterProfile);
    document.getElementById('delete-master-profile')?.addEventListener('click', deleteMasterProfile);
    document.getElementById('save-edit-master')?.addEventListener('click', saveMasterProfile);
    document.getElementById('cancel-edit-master')?.addEventListener('click', function() {
        hideModal('edit-master-modal');
    });
    document.getElementById('edit-master-modal-close')?.addEventListener('click', function() {
        hideModal('edit-master-modal');
    });
    
    // Обработчики календаря
    document.getElementById('prev-month')?.addEventListener('click', prevMonth);
    document.getElementById('next-month')?.addEventListener('click', nextMonth);
    
    // Форматирование телефона в реальном времени
    document.getElementById('client-phone')?.addEventListener('input', function(e) {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 0) {
            if (value[0] === '7' || value[0] === '8') value = value.substring(1);
            let formattedValue = '+7 ';
            if (value.length > 0) formattedValue += '(' + value.substring(0, 3);
            if (value.length >= 4) formattedValue += ') ' + value.substring(3, 6);
            if (value.length >= 7) formattedValue += '-' + value.substring(6, 8);
            if (value.length >= 9) formattedValue += '-' + value.substring(8, 10);
            this.value = formattedValue;
        }
    });
    
    document.getElementById('register-phone')?.addEventListener('input', function(e) {
        let value = this.value.replace(/\D/g, '');
        if (value.length > 0) {
            if (value[0] === '7' || value[0] === '8') value = value.substring(1);
            let formattedValue = '+7 ';
            if (value.length > 0) formattedValue += '(' + value.substring(0, 3);
            if (value.length >= 4) formattedValue += ') ' + value.substring(3, 6);
            if (value.length >= 7) formattedValue += '-' + value.substring(6, 8);
            if (value.length >= 9) formattedValue += '-' + value.substring(8, 10);
            this.value = formattedValue;
        }
    });
    
    // Предпросмотр изображений при загрузке файла или вставке ссылки
    // Салон
    const salonFileInput = document.getElementById('salon-image-upload');
    const salonUrlInput = document.getElementById('salon-image-url');
    const salonPreview = document.getElementById('salon-image-preview');
    
    if (salonFileInput) {
        salonFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    if (salonPreview) salonPreview.innerHTML = `<img src="${ev.target.result}" style="max-width: 200px; max-height: 200px;">`;
                };
                reader.readAsDataURL(file);
                if (salonUrlInput) salonUrlInput.value = '';
            }
        });
    }
    
    if (salonUrlInput) {
        salonUrlInput.addEventListener('input', function(e) {
            const url = e.target.value.trim();
            if (url) {
                if (salonPreview) salonPreview.innerHTML = `<img src="${url}" style="max-width: 200px; max-height: 200px;" onerror="this.style.display='none'">`;
                if (salonFileInput) salonFileInput.value = '';
            } else {
                if (salonPreview) salonPreview.innerHTML = '';
            }
        });
    }
    
    // Услуга
    const serviceFileInput = document.getElementById('service-image-upload');
    const serviceUrlInput = document.getElementById('service-image-url');
    const servicePreview = document.getElementById('service-image-preview');
    
    if (serviceFileInput) {
        serviceFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    if (servicePreview) servicePreview.innerHTML = `<img src="${ev.target.result}" style="max-width: 200px; max-height: 200px;">`;
                };
                reader.readAsDataURL(file);
                if (serviceUrlInput) serviceUrlInput.value = '';
            }
        });
    }
    
    if (serviceUrlInput) {
        serviceUrlInput.addEventListener('input', function(e) {
            const url = e.target.value.trim();
            if (url) {
                if (servicePreview) servicePreview.innerHTML = `<img src="${url}" style="max-width: 200px; max-height: 200px;" onerror="this.style.display='none'">`;
                if (serviceFileInput) serviceFileInput.value = '';
            } else {
                if (servicePreview) servicePreview.innerHTML = '';
            }
        });
    }
    
    // Мастер
    const masterFileInput = document.getElementById('master-image-upload');
    const masterUrlInput = document.getElementById('master-image-url');
    const masterPreview = document.getElementById('master-image-preview');
    
    if (masterFileInput) {
        masterFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(ev) {
                    if (masterPreview) masterPreview.innerHTML = `<img src="${ev.target.result}" style="max-width: 200px; max-height: 200px;">`;
                };
                reader.readAsDataURL(file);
                if (masterUrlInput) masterUrlInput.value = '';
            }
        });
    }
    
    if (masterUrlInput) {
        masterUrlInput.addEventListener('input', function(e) {
            const url = e.target.value.trim();
            if (url) {
                if (masterPreview) masterPreview.innerHTML = `<img src="${url}" style="max-width: 200px; max-height: 200px;" onerror="this.style.display='none'">`;
                if (masterFileInput) masterFileInput.value = '';
            } else {
                if (masterPreview) masterPreview.innerHTML = '';
            }
        });
    }
    
    // Обработчики для переключения между мастерами
    document.getElementById('switch-master-btn')?.addEventListener('click', function() {
        const select = document.getElementById('master-select');
        const selectedMasterId = select.value;
        
        if (!selectedMasterId) {
            showNotification('Выберите мастера из списка', 'warning');
            return;
        }
        
        window.selectedMasterForSwitch = selectedMasterId; // временное хранение
        showModal('switch-master-password-modal');
    });
    
    document.getElementById('cancel-switch-master')?.addEventListener('click', function() {
        hideModal('switch-master-password-modal');
        document.getElementById('switch-master-password').value = '';
    });
    
    document.getElementById('switch-master-modal-close')?.addEventListener('click', function() {
        hideModal('switch-master-password-modal');
        document.getElementById('switch-master-password').value = '';
    });
    
    document.getElementById('confirm-switch-master')?.addEventListener('click', async function() {
        const passwordInput = document.getElementById('switch-master-password');
        const enteredPassword = passwordInput.value.trim();
        
        if (!enteredPassword) {
            showNotification('Введите пароль', 'error');
            return;
        }
        
        const select = document.getElementById('master-select');
        const selectedIndex = select.selectedIndex; // 0 - первый пункт (пустой)
        const masterIndex = selectedIndex - 1; // индекс в списке мастеров
        
        if (masterIndex < 0) {
            showNotification('Ошибка выбора мастера', 'error');
            return;
        }
        
        // Пароль должен быть номером мастера (индекс + 1)
        const expectedPassword = (masterIndex + 1).toString();
        
        if (enteredPassword !== expectedPassword) {
            showNotification('Неверный пароль', 'error');
            return;
        }
        
        // Пароль верный – переключаемся
        const masterId = select.value;
        
        try {
            const masterDoc = await db.collection('masters').doc(masterId).get();
            if (masterDoc.exists) {
                const master = masterDoc.data();
                currentActiveMasterId = masterId;
                
                // Обновляем детали мастера
                document.getElementById('master-detail-name').textContent = master.name || '';
                document.getElementById('master-detail-specialization').textContent = master.specialization || 'Не указана';
                document.getElementById('master-detail-salon').textContent = master.salonName || 'Неизвестно';
                // email, phone не меняются (они от текущего пользователя)
                
                await loadMasterBookingsForMaster(masterId);
                showNotification(`Переключено на мастера ${master.name}`, 'success');
            }
        } catch (error) {
            console.error('Ошибка при переключении мастера:', error);
            showNotification('Ошибка при загрузке данных мастера', 'error');
        } finally {
            hideModal('switch-master-password-modal');
            passwordInput.value = '';
        }
    });
    
    // Инициализация при загрузке
    initializeSalonRatings();
    
    // Загрузка статистики для админов
    if (currentUser && currentUser.role === 'admin') {
        loadAdminStats();
    }
    
    console.log('Приложение инициализировано');
});

// ==============================================
// ДОПОЛНИТЕЛЬНЫЕ ОБРАБОТЧИКИ
// ==============================================

// Дополнительный обработчик для админ-панели
document.querySelectorAll('.admin-mode-switcher .mode-btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
    });
});

// Обработчик клика на логотип - переход на главную
document.querySelector('.logo')?.addEventListener('click', function(e) {
    e.preventDefault();
    showPage('home-page');
    // Убираем активный класс у всех нав-ссылок и добавляем главной
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.querySelector('.nav-link[data-page="home"]').classList.add('active');
});

// ==============================================
// ВОССТАНОВЛЕНИЕ АДМИНА (дубль для надёжности)
// ==============================================
ensureAdminExists();

// ==============================================
// ФИНАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ
// ==============================================

// Убедимся, что все обработчики загружены
window.addEventListener('load', function() {
    console.log('Страница полностью загружена');
});

// Обработчик ошибок
window.addEventListener('error', function(e) {
    console.error('Произошла ошибка:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Необработанное обещание:', e.reason);
});