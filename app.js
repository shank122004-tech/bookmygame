// app.js - Complete BookMyGame Application with Real Data and Payment System

// ==================== FIREBASE CONFIGURATION ====================
// ==================== FIREBASE CONFIGURATION ====================
// Load config from window object (injected via index.html)
const firebaseConfig = {
    apiKey: window._env_?.FIREBASE_API_KEY || "AIzaSyDKcDIcdXgfBPGPnE74xDptJ-OyJLAi3NA",
    authDomain: window._env_?.FIREBASE_AUTH_DOMAIN || "bookmygame-2149d.firebaseapp.com",
    projectId: window._env_?.FIREBASE_PROJECT_ID || "bookmygame-2149d",
    storageBucket: window._env_?.FIREBASE_STORAGE_BUCKET || "bookmygame-2149d.firebasestorage.app",
    messagingSenderId: window._env_?.FIREBASE_MESSAGING_SENDER_ID || "856468226596",
    appId: window._env_?.FIREBASE_APP_ID || "1:856468226596:web:51b7b1e9676c07950d0eb1",
    measurementId: window._env_?.FIREBASE_MEASUREMENT_ID || "G-85RNY7YD3Q"
};

// Log config loaded (optional - remove in production)
console.log('Firebase config loaded:', firebaseConfig.projectId);
// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();
const storage = firebase.storage();

// Enable Firestore offline persistence
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log('Persistence failed - multiple tabs open');
        } else if (err.code == 'unimplemented') {
            console.log('Persistence not available');
        }
    });

// ==================== CONSTANTS ====================
const COMMISSION_RATE = 0.10; // 10% platform fee
const TOURNAMENT_COMMISSION_RATE = 0.20; // 20% platform fee for tournaments
const CEO_EMAIL = 'ceo@bookmygame.com';
const ADMIN_EMAILS = ['admin@bookmygame.com', 'ceo@bookmygame.com'];

// Owner Types
const OWNER_TYPES = {
    VENUE_OWNER: 'venue_owner',     // Owners with turfs/complexes - no registration fee
    PLOT_OWNER: 'plot_owner'         // Owners with empty plots/grounds - ₹299 fee
};

// Owner Registration Constants
const OWNER_REGISTRATION_FEE = 299;
const OWNER_REGISTRATION_STATUS = {
    PENDING: 'pending',
    PAID: 'paid',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

// Verification Status
const VERIFICATION_STATUS = {
    PENDING: 'pending',
    VERIFIED: 'verified',
    REJECTED: 'rejected'
};

// Payout Status
const PAYOUT_REQUEST_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    PAID: 'paid'
};

// Collections
const COLLECTIONS = {
    USERS: 'users',
    OWNERS: 'owners',
    ADMINS: 'admins',
    VENUES: 'venues',
    GROUNDS: 'grounds',
    SLOTS: 'slots',
    BOOKINGS: 'bookings',
    TOURNAMENTS: 'tournaments',
    TOURNAMENT_REGISTRATIONS: 'tournament_registrations',
    REVIEWS: 'reviews',
    PAYOUTS: 'payouts',
    REPORTS: 'reports',
    PAYMENTS: 'payments',
    OWNER_REGISTRATIONS: 'owner_registrations',
    OWNER_PAYMENTS: 'owner_payments',
    VERIFICATION_REQUESTS: 'verification_requests',
    PAYOUT_REQUESTS: 'payout_requests',
    REFERRALS: 'referrals',
    ISSUES: 'issues',
    PLAYER_MATCHES: 'player_matches'
};

const BOOKING_STATUS = {
    PENDING_PAYMENT: 'pending_payment',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    PAYOUT_PENDING: 'payout_pending',
    PAYOUT_DONE: 'payout_done'
};

const SLOT_STATUS = {
    AVAILABLE: 'available',
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CLOSED: 'closed'
};

const OWNER_STATUS = {
    ACTIVE: 'active',
    BLOCKED: 'blocked'
};

const ADMIN_STATUS = {
    ACTIVE: 'active',
    BLOCKED: 'blocked'
};

const ADMIN_ROLES = {
    SUPER_ADMIN: 'super_admin',
    CONTENT_ADMIN: 'content_admin',
    FINANCE_ADMIN: 'finance_admin',
    SUPPORT_ADMIN: 'support_admin'
};

const TOURNAMENT_STATUS = {
    UPCOMING: 'upcoming',
    ONGOING: 'ongoing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

const TOURNAMENT_FORMATS = {
    KNOCKOUT: 'knockout',
    LEAGUE: 'league',
    GROUP_KNOCKOUT: 'group'
};

const REGISTRATION_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
    REJECTED: 'rejected'
};

const PAYMENT_STATUS = {
    INITIATED: 'initiated',
    PENDING: 'pending',
    SUCCESS: 'success',
    FAILED: 'failed',
    REFUNDED: 'refunded'
};

// ==================== MATCH STATUS CONSTANT ====================
const MATCH_STATUS = {
    OPEN: 'open',
    FULL: 'full',
    IN_PROGRESS: 'in_progress',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed'
};
// Match Payment Status
const MATCH_PAYMENT_STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded'
};
// ==================== GLOBAL STATE ====================
let currentUser = null;
let currentVenue = null;
let currentGround = null;
let currentBooking = null;
let currentTournament = null;
let currentTournamentRegistration = null;
let userLocation = null;
let pageHistory = ['main-page'];
let listeners = {};

let selectedDate = new Date().toISOString().split('T')[0];
let selectedSlot = null;
let currentQRScanner = null;
let logoutTimer = null;
let ownerQRScanner = null;
let infiniteScrollObserver = null;
let lastVenueDoc = null;
let isLoadingMore = false;

// Add this function after the MATCH_STATUS constant (around line 250-260)

// ==================== UPDATE MATCH STATUSES ====================

async function updateMatchStatuses() {
    try {
        const now = new Date();
        const matchesSnapshot = await db.collection(COLLECTIONS.PLAYER_MATCHES).get();
        
        const batch = db.batch();
        let updatesCount = 0;
        
        for (const doc of matchesSnapshot.docs) {
            const match = doc.data();
            
            // Skip if match has no date
            if (!match.date) continue;
            
            const matchDateTime = new Date(`${match.date}T${match.time || '00:00'}`);
            
            // Check if match has started
            if (match.status === MATCH_STATUS.OPEN && matchDateTime <= now) {
                // Update to IN_PROGRESS if match time has passed
                batch.update(doc.ref, {
                    status: MATCH_STATUS.IN_PROGRESS,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                updatesCount++;
            }
            
            // Check if match is full
            if (match.status === MATCH_STATUS.OPEN && 
                match.currentPlayers >= match.totalPlayers) {
                batch.update(doc.ref, {
                    status: MATCH_STATUS.FULL,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                updatesCount++;
            }
            
            // Check if match has been completed (you can add logic for this)
            // For now, we'll consider matches older than 3 hours as completed
            const matchEndTime = new Date(matchDateTime);
            matchEndTime.setHours(matchEndTime.getHours() + 2); // Assume 2 hour match duration
            
            if (match.status === MATCH_STATUS.IN_PROGRESS && matchEndTime <= now) {
                batch.update(doc.ref, {
                    status: MATCH_STATUS.COMPLETED,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                updatesCount++;
            }
        }
        
        if (updatesCount > 0) {
            await batch.commit();
            console.log(`Updated ${updatesCount} match statuses`);
        }
        
    } catch (error) {
        console.error('Error updating match statuses:', error);
    }
}
// ==================== UTILITY FUNCTIONS ====================

function showPage(pageId) {
    if (!pageId) return;
    
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        
        if (pageHistory[pageHistory.length - 1] !== pageId) {
            pageHistory.push(pageId);
        }
        
        window.scrollTo(0, 0);
    }
}

function goBack() {
    if (pageHistory.length > 1) {
        pageHistory.pop();
        const previousPage = pageHistory[pageHistory.length - 1];
        showPage(previousPage);
    } else {
        showPage('main-page');
    }
}

function goHome() {
    pageHistory = ['main-page'];
    showPage('main-page');
    loadMainPage();
}

function showLoading(message = 'Processing...') {
    document.getElementById('loading-overlay').style.display = 'flex';
    document.getElementById('loading-message').textContent = message;
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'check-circle' :
                 type === 'error' ? 'exclamation-circle' :
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';
    
    toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideUp 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function formatCurrency(amount) {
    return '₹' + Number(amount).toLocaleString('en-IN', {
        maximumFractionDigits: 0
    });
}
// ==================== RENDER PAYOUT HISTORY HELPER ====================

function renderPayoutHistory(payoutDocs) {
    if (payoutDocs.length === 0) {
        return `
            <div class="empty-payout-state">
                <i class="fas fa-receipt"></i>
                <h4>No Payout History</h4>
                <p>Your payout requests will appear here once you make your first request.</p>
            </div>
        `;
    }
    
    let html = '';
    
    for (const doc of payoutDocs) {
        const request = doc.data();
        const status = request.status;
        let statusClass = '';
        let statusIcon = '';
        let statusText = '';
        
        switch(status) {
            case 'pending':
                statusClass = 'status-pending';
                statusIcon = 'fa-clock';
                statusText = 'Pending';
                break;
            case 'approved':
                statusClass = 'status-approved';
                statusIcon = 'fa-check-circle';
                statusText = 'Approved';
                break;
            case 'rejected':
                statusClass = 'status-rejected';
                statusIcon = 'fa-times-circle';
                statusText = 'Rejected';
                break;
            case 'paid':
                statusClass = 'status-paid';
                statusIcon = 'fa-check-double';
                statusText = 'Paid';
                break;
            default:
                statusClass = 'status-pending';
                statusIcon = 'fa-clock';
                statusText = 'Pending';
        }
        
        const requestDate = request.createdAt ? new Date(request.createdAt.toDate()) : new Date();
        const formattedDate = requestDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
        const formattedTime = requestDate.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const approvedDate = request.approvedAt ? new Date(request.approvedAt.toDate()) : null;
        const paidDate = request.paidAt ? new Date(request.paidAt.toDate()) : null;
        
        html += `
            <div class="payout-history-card ${statusClass}">
                <div class="payout-history-header">
                    <div class="payout-history-id">
                        <i class="fas fa-receipt"></i>
                        <span>${request.requestId || 'N/A'}</span>
                    </div>
                    <div class="payout-history-status ${statusClass}">
                        <i class="fas ${statusIcon}"></i>
                        <span>${statusText}</span>
                    </div>
                </div>
                
                <div class="payout-history-body">
                    <div class="payout-history-amount">
                        <span class="amount-label">Amount</span>
                        <span class="amount-value">${formatCurrency(request.amount || 0)}</span>
                    </div>
                    
                    <div class="payout-history-details">
                        <div class="detail-item">
                            <i class="fas fa-calendar"></i>
                            <div>
                                <span class="detail-label">Requested</span>
                                <span class="detail-value">${formattedDate} at ${formattedTime}</span>
                            </div>
                        </div>
                        ${approvedDate ? `
                            <div class="detail-item">
                                <i class="fas fa-check-circle"></i>
                                <div>
                                    <span class="detail-label">Approved</span>
                                    <span class="detail-value">${approvedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                            </div>
                        ` : ''}
                        ${paidDate ? `
                            <div class="detail-item">
                                <i class="fas fa-money-bill-wave"></i>
                                <div>
                                    <span class="detail-label">Paid</span>
                                    <span class="detail-value">${paidDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                            </div>
                        ` : ''}
                        <div class="detail-item">
                            <i class="fas fa-qrcode"></i>
                            <div>
                                <span class="detail-label">UPI ID</span>
                                <span class="detail-value">${request.upiId || 'Not set'}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-calendar-check"></i>
                            <div>
                                <span class="detail-label">Bookings</span>
                                <span class="detail-value">${request.bookingIds?.length || 0} bookings</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                ${request.rejectionReason ? `
                    <div class="payout-history-rejection">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Rejection Reason: ${request.rejectionReason}</span>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    return html;
}
// ==================== RENDER ALL PAYOUTS HELPER ====================

function renderAllPayouts(payoutDocs) {
    if (payoutDocs.length === 0) {
        return `
            <div class="empty-payout-state">
                <i class="fas fa-hand-holding-usd"></i>
                <h4>No Payout Requests</h4>
                <p>You haven't made any payout requests yet.</p>
                <button class="make-payout-btn" onclick="showPayoutRequestModal(0)">Request Payout</button>
            </div>
        `;
    }
    
    let html = '';
    
    for (const doc of payoutDocs) {
        const request = doc.data();
        const status = request.status;
        let statusClass = '';
        let statusIcon = '';
        let statusText = '';
        let statusBadgeClass = '';
        
        switch(status) {
            case 'pending':
                statusClass = 'status-pending';
                statusIcon = 'fa-clock';
                statusText = 'Pending Review';
                statusBadgeClass = 'badge-pending';
                break;
            case 'approved':
                statusClass = 'status-approved';
                statusIcon = 'fa-check-circle';
                statusText = 'Approved';
                statusBadgeClass = 'badge-approved';
                break;
            case 'rejected':
                statusClass = 'status-rejected';
                statusIcon = 'fa-times-circle';
                statusText = 'Rejected';
                statusBadgeClass = 'badge-rejected';
                break;
            case 'paid':
                statusClass = 'status-paid';
                statusIcon = 'fa-check-double';
                statusText = 'Payment Completed';
                statusBadgeClass = 'badge-paid';
                break;
            default:
                statusClass = 'status-pending';
                statusIcon = 'fa-clock';
                statusText = 'Pending';
                statusBadgeClass = 'badge-pending';
        }
        
        const requestDate = request.createdAt ? new Date(request.createdAt.toDate()) : new Date();
        const formattedDate = requestDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        const approvedDate = request.approvedAt ? new Date(request.approvedAt.toDate()) : null;
        const paidDate = request.paidAt ? new Date(request.paidAt.toDate()) : null;
        
        html += `
            <div class="all-payout-card ${statusClass}">
                <div class="all-payout-header">
                    <div class="payout-id-badge">
                        <i class="fas fa-hashtag"></i>
                        <span>${escapeHtml(request.requestId || 'N/A')}</span>
                    </div>
                    <div class="status-badge ${statusBadgeClass}">
                        <i class="fas ${statusIcon}"></i>
                        <span>${statusText}</span>
                    </div>
                </div>
                
                <div class="all-payout-amount">
                    <div class="amount-main">${formatCurrency(request.amount || 0)}</div>
                    <div class="amount-sub">Requested on ${formattedDate}</div>
                </div>
                
                <div class="all-payout-details">
                    <div class="detail-row">
                        <div class="detail-cell">
                            <i class="fas fa-qrcode"></i>
                            <div>
                                <span class="detail-label">UPI ID</span>
                                <span class="detail-value">${escapeHtml(request.upiId || 'Not set')}</span>
                            </div>
                        </div>
                        <div class="detail-cell">
                            <i class="fas fa-calendar-check"></i>
                            <div>
                                <span class="detail-label">Bookings</span>
                                <span class="detail-value">${request.bookingIds?.length || 0}</span>
                            </div>
                        </div>
                    </div>
                    
                    ${approvedDate ? `
                        <div class="detail-row">
                            <div class="detail-cell">
                                <i class="fas fa-check-circle"></i>
                                <div>
                                    <span class="detail-label">Approved Date</span>
                                    <span class="detail-value">${approvedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                            </div>
                            <div class="detail-cell">
                                <i class="fas fa-user-check"></i>
                                <div>
                                    <span class="detail-label">Approved By</span>
                                    <span class="detail-value">${escapeHtml(request.approvedBy || 'Admin')}</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${paidDate ? `
                        <div class="detail-row">
                            <div class="detail-cell">
                                <i class="fas fa-money-bill-wave"></i>
                                <div>
                                    <span class="detail-label">Paid Date</span>
                                    <span class="detail-value">${paidDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                            </div>
                            <div class="detail-cell">
                                <i class="fas fa-user-check"></i>
                                <div>
                                    <span class="detail-label">Paid By</span>
                                    <span class="detail-value">${escapeHtml(request.paidBy || 'System')}</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </div>
                
                ${status === 'rejected' && request.rejectionReason ? `
                    <div class="rejection-reason">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Reason:</strong> ${escapeHtml(request.rejectionReason)}
                    </div>
                ` : ''}
                
                ${status === 'approved' && !paidDate ? `
                    <div class="payout-timing-note">
                        <i class="fas fa-info-circle"></i>
                        Payout will be processed within 2-3 business days
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    return html;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function timeAgo(date) {
    if (!date) return 'just now';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';
    
    return 'just now';
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function generateId(prefix) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function uploadFile(file, path) {
    try {
        // Sanitize filename - remove special characters and spaces
        const originalName = file.name;
        const fileExtension = originalName.substring(originalName.lastIndexOf('.'));
        const sanitizedName = originalName
            .substring(0, originalName.lastIndexOf('.'))
            .replace(/[^a-zA-Z0-9]/g, '_') // Replace special chars with underscore
            .substring(0, 100); // Limit length
        
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const finalFileName = `${timestamp}_${random}_${sanitizedName}${fileExtension}`;
        
        const storageRef = storage.ref(`${path}/${finalFileName}`);
        
        // Upload with metadata
        const metadata = {
            contentType: file.type,
            customMetadata: {
                originalName: originalName,
                uploadedBy: currentUser?.uid || 'unknown',
                uploadedAt: new Date().toISOString()
            }
        };
        
        await storageRef.put(file, metadata);
        const downloadURL = await storageRef.getDownloadURL();
        
        console.log('File uploaded successfully:', downloadURL);
        return downloadURL;
        
    } catch (error) {
        console.error('Upload error:', error);
        
        // Try with a simpler filename if the first attempt fails
        try {
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 8);
            const fileExtension = file.name.substring(file.name.lastIndexOf('.'));
            const simpleFileName = `${timestamp}_${random}${fileExtension}`;
            
            const storageRef = storage.ref(`${path}/${simpleFileName}`);
            await storageRef.put(file);
            const downloadURL = await storageRef.getDownloadURL();
            
            console.log('File uploaded with simple name:', downloadURL);
            return downloadURL;
            
        } catch (retryError) {
            console.error('Retry upload also failed:', retryError);
            throw new Error('Failed to upload file. Please try again with a simpler filename (no special characters).');
        }
    }
}

// If you don't have this function, add it
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

function removeAllListeners() {
    Object.values(listeners).forEach(unsubscribe => {
        if (unsubscribe) unsubscribe();
    });
    listeners = {};
}

async function fastLogout() {
    try {
        if (logoutTimer) {
            clearTimeout(logoutTimer);
        }
        
        if (currentQRScanner) {
            try {
                await currentQRScanner.stop();
            } catch (e) {
                console.log('QR Scanner stop error:', e);
            }
        }
        
        if (ownerQRScanner) {
            try {
                await ownerQRScanner.stop();
            } catch (e) {
                console.log('Owner QR Scanner stop error:', e);
            }
        }
        
        removeAllListeners();
        
        currentUser = null;
        currentVenue = null;
        currentGround = null;
        currentBooking = null;
        currentTournament = null;
        currentTournamentRegistration = null;
        userLocation = null;
        selectedSlot = null;
        
        await auth.signOut();
        
        hideLoading();
        showToast('Logged out successfully');
        showPage('login-page');
    } catch (error) {
        console.error('Logout error:', error);
        hideLoading();
        showToast('Error logging out', 'error');
    }
}

// ==================== TOURNAMENT EXPIRY CHECK ====================

async function checkAndUpdateTournamentStatus() {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    try {
        const tournamentsSnapshot = await db.collection(COLLECTIONS.TOURNAMENTS).get();
        
        const batch = db.batch();
        
        tournamentsSnapshot.forEach(doc => {
            const tournament = doc.data();
            const endDate = tournament.endDate;
            const endDateTime = new Date(`${endDate}T${tournament.endTime || '23:59'}`);
            
            if (endDate < today || endDateTime < now) {
                if (tournament.status === TOURNAMENT_STATUS.UPCOMING || tournament.status === TOURNAMENT_STATUS.ONGOING) {
                    batch.update(doc.ref, {
                        status: TOURNAMENT_STATUS.COMPLETED,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
            
            const startDate = tournament.startDate;
            if (startDate <= today && endDate >= today && tournament.status === TOURNAMENT_STATUS.UPCOMING) {
                batch.update(doc.ref, {
                    status: TOURNAMENT_STATUS.ONGOING,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        
        await batch.commit();
        console.log('Tournament statuses updated');
    } catch (error) {
        console.error('Error updating tournament statuses:', error);
    }
}

// Run tournament status check every hour
setInterval(checkAndUpdateTournamentStatus, 3600000);

// ==================== GEOLOCATION ====================

function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}&zoom=18&addressdetails=1`
                    );
                    const data = await response.json();
                    
                    let locationText = '';
                    if (data.address) {
                        const area = data.address.suburb || data.address.neighbourhood || data.address.road || '';
                        const city = data.address.city || data.address.town || data.address.village || '';
                        locationText = area ? `${area}, ${city}` : city || 'Location detected';
                    } else {
                        locationText = `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
                    }
                    
                    document.getElementById('current-location').textContent = locationText;
                } catch (error) {
                    document.getElementById('current-location').textContent = 
                        `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
                }
                
                if (document.getElementById('main-page').classList.contains('active')) {
                    loadNearbyVenues();
                    loadFeaturedTournament();
                    loadLastMinuteDeals();
                    loadPlayerMatches();
                }
            },
            (error) => {
                console.error('Location error:', error);
                document.getElementById('current-location').textContent = 'Location unavailable';
                showToast('Please enable location for better experience', 'warning');
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        document.getElementById('current-location').textContent = 'Geolocation not supported';
    }
}

// ==================== AUTHENTICATION ====================

auth.onAuthStateChanged(async (user) => {
    if (user) {
        try {
            showLoading('Loading your profile...');
            
            await checkAndUpdateTournamentStatus();
            
            console.log('User logged in:', user.email);
            
            // Check if user is CEO
            if (user.email === CEO_EMAIL) {
                console.log('CEO user detected:', user.email);
                
                const ceoRef = db.collection(COLLECTIONS.ADMINS).doc(user.uid);
                const ceoDoc = await ceoRef.get();
                
                if (!ceoDoc.exists) {
                    const ceoData = {
                        uid: user.uid,
                        email: user.email,
                        name: 'CEO',
                        profileImage: user.photoURL || 'https://via.placeholder.com/150',
                        phone: user.phoneNumber || '',
                        adminId: generateId('ADM'),
                        adminRole: ADMIN_ROLES.SUPER_ADMIN,
                        isCEO: true,
                        permissions: {
                            manageOwners: true,
                            manageVenues: true,
                            manageBookings: true,
                            manageTournaments: true,
                            viewPayouts: true,
                            manageSlots: true,
                            manageAdmins: true
                        },
                        status: ADMIN_STATUS.ACTIVE,
                        role: 'ceo',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                        totalLogins: 1
                    };
                    await ceoRef.set(ceoData);
                    currentUser = {
                        uid: user.uid,
                        ...ceoData,
                        role: 'ceo'
                    };
                } else {
                    await ceoRef.update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                        totalLogins: firebase.firestore.FieldValue.increment(1)
                    });
                    
                    currentUser = {
                        uid: user.uid,
                        ...ceoDoc.data(),
                        role: 'ceo'
                    };
                }
                
                console.log('CEO loaded successfully');
            }
            // Check if user exists in admins collection
            else {
                const adminDoc = await db.collection(COLLECTIONS.ADMINS).doc(user.uid).get();
                
                if (adminDoc.exists) {
                    const adminData = adminDoc.data();
                    console.log('Admin found in collection:', adminData);
                    
                    await db.collection(COLLECTIONS.ADMINS).doc(user.uid).update({
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                        totalLogins: firebase.firestore.FieldValue.increment(1)
                    });
                    
                    currentUser = {
                        uid: user.uid,
                        ...adminData,
                        role: 'admin'
                    };
                    
                    console.log('Admin loaded successfully');
                }
                else if (ADMIN_EMAILS.includes(user.email)) {
                    console.log('Admin email detected in ADMIN_EMAILS:', user.email);
                    
                    const adminData = {
                        uid: user.uid,
                        email: user.email,
                        name: user.displayName || 'Admin',
                        profileImage: user.photoURL || 'https://via.placeholder.com/150',
                        phone: user.phoneNumber || '',
                        adminId: generateId('ADM'),
                        adminRole: ADMIN_ROLES.SUPER_ADMIN,
                        permissions: {
                            manageOwners: true,
                            manageVenues: true,
                            manageBookings: true,
                            manageTournaments: true,
                            viewPayouts: true,
                            manageSlots: true,
                            manageAdmins: true
                        },
                        status: ADMIN_STATUS.ACTIVE,
                        role: 'admin',
                        createdBy: 'system',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
                        totalLogins: 1
                    };
                    
                    await db.collection(COLLECTIONS.ADMINS).doc(user.uid).set(adminData);
                    
                    currentUser = {
                        uid: user.uid,
                        ...adminData,
                        role: 'admin'
                    };
                    
                    console.log('Admin created from ADMIN_EMAILS');
                }
               else {
    const ownerDoc = await db.collection(COLLECTIONS.OWNERS).doc(user.uid).get();
    
    if (ownerDoc.exists) {
        const ownerData = ownerDoc.data();
        console.log('Owner data loaded:', {
            ownerType: ownerData.ownerType,
            ownerUniqueId: ownerData.ownerUniqueId,
            ownerName: ownerData.ownerName,
            status: ownerData.status
        });
        
        currentUser = {
            uid: user.uid,
            ...ownerData,
            role: 'owner'
        };
        console.log('Owner loaded successfully with type:', currentUser.ownerType);
    } 
    else {
                        const userDoc = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
                        
                        if (userDoc.exists) {
                            currentUser = {
                                uid: user.uid,
                                ...userDoc.data(),
                                role: 'user'
                            };
                        } else {
                            // Check if user was referred
                            const urlParams = new URLSearchParams(window.location.search);
                            const refCode = urlParams.get('ref');
                            let referredBy = null;
                            
                            if (refCode) {
                                const referralSnapshot = await db.collection(COLLECTIONS.REFERRALS)
                                    .where('code', '==', refCode)
                                    .get();
                                
                                if (!referralSnapshot.empty) {
                                    referredBy = referralSnapshot.docs[0].data().ownerId;
                                }
                            }
                            
                            currentUser = {
                                uid: user.uid,
                                email: user.email,
                                name: user.displayName || 'User',
                                profileImage: user.photoURL || 'https://via.placeholder.com/150',
                                phone: user.phoneNumber || '',
                                role: 'user',
                                referralCode: generateReferralCode(),
                                referredBy,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            };
                            
                            await db.collection(COLLECTIONS.USERS).doc(user.uid).set(currentUser);
                            
                            // Create referral record if referred
                            if (referredBy) {
                                await db.collection(COLLECTIONS.REFERRALS).add({
                                    code: currentUser.referralCode,
                                    userId: user.uid,
                                    referredBy,
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                });
                            }
                            
                            console.log('New user created');
                        }
                    }
                }
            }
            
            console.log('FINAL currentUser role:', currentUser.role);
            
            hideLoading();
            
            setTimeout(() => {
                document.getElementById('splash-screen').classList.add('hide');
            }, 1000);
            
            showPage('main-page');
            loadMainPage();
            updateProfileHeader();
            checkFirstBookingOffer();
            
            const ownerLink = document.getElementById('owner-dashboard-link');
            const adminLink = document.getElementById('admin-dashboard-link');
            const ceoLink = document.getElementById('ceo-dashboard-link');
            
            if (ownerLink) {
                ownerLink.style.display = currentUser.role === 'owner' ? 'flex' : 'none';
            }
            
            if (adminLink) {
                adminLink.style.display = (currentUser.role === 'admin' || currentUser.role === 'ceo') ? 'flex' : 'none';
            }
            
            if (ceoLink) {
                ceoLink.style.display = currentUser.role === 'ceo' ? 'flex' : 'none';
            }
            
            document.getElementById('header-qr-scanner').style.display = currentUser.role === 'owner' ? 'flex' : 'none';
            
            if (currentUser.role === 'user' && currentUser.referralCode) {
                document.getElementById('profile-referral-code').style.display = 'flex';
                document.getElementById('referral-code-value').textContent = currentUser.referralCode;
            }
            
            getUserLocation();
            
        } catch (error) {
            hideLoading();
            console.error('Auth state change error:', error);
            showToast('Error loading user data: ' + error.message, 'error');
        }
    } else {
        currentUser = null;
        removeAllListeners();
        
        setTimeout(() => {
            document.getElementById('splash-screen').classList.add('hide');
        }, 2000);
        
        showPage('login-page');
    }
});

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    
    if (!email || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    showLoading('Signing in...');
    
    try {
        const persistence = rememberMe ? 
            firebase.auth.Auth.Persistence.LOCAL : 
            firebase.auth.Auth.Persistence.SESSION;
        
        await auth.setPersistence(persistence);
        await auth.signInWithEmailAndPassword(email, password);
        
        showToast('Welcome back!');
    } catch (error) {
        hideLoading();
        let errorMessage = 'Login failed';
        if (error.code === 'auth/user-not-found') errorMessage = 'User not found';
        else if (error.code === 'auth/wrong-password') errorMessage = 'Wrong password';
        else if (error.code === 'auth/invalid-email') errorMessage = 'Invalid email';
        else errorMessage = error.message;
        
        showToast(errorMessage, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const phone = document.getElementById('register-phone').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    const agreeTerms = document.getElementById('agree-terms').checked;
    
    if (!agreeTerms) {
        showToast('Please agree to terms and conditions', 'error');
        return;
    }
    
    if (password !== confirm) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    showLoading('Creating account...');
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Check if user was referred
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        let referredBy = null;
        
        if (refCode) {
            const referralSnapshot = await db.collection(COLLECTIONS.REFERRALS)
                .where('code', '==', refCode)
                .get();
            
            if (!referralSnapshot.empty) {
                referredBy = referralSnapshot.docs[0].data().ownerId;
            }
        }
        
        const referralCode = generateReferralCode();
        
        await user.updateProfile({
            displayName: name,
            photoURL: 'https://via.placeholder.com/150'
        });
        
        const userData = {
            uid: user.uid,
            name,
            email,
            phone,
            profileImage: 'https://via.placeholder.com/150',
            role: 'user',
            referralCode,
            referredBy,
            referralCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.USERS).doc(user.uid).set(userData);
        
        // Create referral record if referred
        if (referredBy) {
            await db.collection(COLLECTIONS.REFERRALS).add({
                code: referralCode,
                userId: user.uid,
                referredBy,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        hideLoading();
        showToast('Registration successful!');
        
        document.getElementById('register-form').reset();
    } catch (error) {
        hideLoading();
        let errorMessage = 'Registration failed';
        if (error.code === 'auth/email-already-in-use') errorMessage = 'Email already in use';
        else if (error.code === 'auth/invalid-email') errorMessage = 'Invalid email';
        else errorMessage = error.message;
        
        showToast(errorMessage, 'error');
    }
}

// ==================== VENUE OWNER REGISTRATION ====================

async function handleVenueOwnerRegister(e) {
    e.preventDefault();
    
    const ownerName = document.getElementById('venue-owner-name').value.trim();
    const email = document.getElementById('venue-owner-email').value.trim();
    const phone = document.getElementById('venue-owner-phone').value.trim();
    const password = document.getElementById('venue-owner-password').value;
    const upiId = document.getElementById('venue-owner-upi').value.trim();
    const venueName = document.getElementById('venue-name').value.trim();
    const sportType = document.getElementById('venue-sport').value;
    const address = document.getElementById('venue-address').value.trim();
    const city = document.getElementById('venue-city').value.trim();
    const description = document.getElementById('venue-description').value.trim();
    const venueImages = document.getElementById('venue-images').files;
    const agreeTerms = document.getElementById('venue-owner-agree-terms').checked;
    
    if (!agreeTerms) {
        showToast('Please agree to terms and conditions', 'error');
        return;
    }
    
    if (venueImages.length < 3) {
        showToast('Please upload at least 3 venue photos', 'error');
        return;
    }
    
    showLoading('Creating your account...');
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        const ownerUniqueId = generateId('OWN');
        const referralCode = generateReferralCode();
        
        const imageUrls = [];
        for (let i = 0; i < venueImages.length; i++) {
            const file = venueImages[i];
            const url = await uploadFile(file, `venues/${user.uid}`);
            imageUrls.push(url);
        }
        
        const ownerData = {
            uid: user.uid,
            ownerUniqueId,
            ownerName,
            email,
            phone,
            upiId,
            ownerType: OWNER_TYPES.VENUE_OWNER,
            registrationPaid: true,
            registrationStatus: 'approved',
            verificationStatus: VERIFICATION_STATUS.PENDING,
            isVerified: false,
            status: OWNER_STATUS.ACTIVE,
            totalEarnings: 0,
            totalBookings: 0,
            groundsCount: 0,
            rating: 0,
            totalReviews: 0,
            referralCode,
            referredBy: null,
            referralCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'owner'
        };
        
        await db.collection(COLLECTIONS.OWNERS).doc(user.uid).set(ownerData);
        
        const venueData = {
            ownerId: user.uid,
            ownerName,
            venueName,
            sportType,
            address,
            city,
            images: imageUrls,
            description,
            rating: 0,
            totalReviews: 0,
            hidden: false,
            isVerified: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.VENUES).add(venueData);
        
        await user.updateProfile({
            displayName: ownerName
        });
        
        hideLoading();
        showToast('Venue registered successfully! Your Owner ID: ' + ownerUniqueId);
        
        showPage('login-page');
        
    } catch (error) {
        hideLoading();
        let errorMessage = 'Registration failed';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use';
        } else {
            errorMessage = error.message;
        }
        showToast(errorMessage, 'error');
    }
}

// ==================== PLOT OWNER REGISTRATION ====================

async function handlePlotOwnerRegister(e) {
    e.preventDefault();
    
    const ownerName = document.getElementById('plot-owner-name').value.trim();
    const email = document.getElementById('plot-owner-email').value.trim();
    const phone = document.getElementById('plot-owner-phone').value.trim();
    const password = document.getElementById('plot-owner-password').value;
    const upiId = document.getElementById('plot-owner-upi').value.trim();
    const agreeTerms = document.getElementById('plot-owner-agree-terms').checked;
    
    if (!agreeTerms) {
        showToast('Please agree to terms and conditions', 'error');
        return;
    }
    
    showLoading('Creating your account...');
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        const ownerUniqueId = generateId('OWN');
        const referralCode = generateReferralCode();
        
        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        let referredBy = null;
        
        if (refCode) {
            const referralSnapshot = await db.collection(COLLECTIONS.REFERRALS)
                .where('code', '==', refCode)
                .get();
            
            if (!referralSnapshot.empty) {
                referredBy = referralSnapshot.docs[0].data().ownerId;
            }
        }
        
        const ownerData = {
            uid: user.uid,
            ownerUniqueId,
            ownerName,
            email,
            phone,
            upiId,
            ownerType: OWNER_TYPES.PLOT_OWNER,
            registrationPaid: true,
            registrationStatus: 'approved',
            verificationStatus: VERIFICATION_STATUS.PENDING,
            isVerified: false,
            status: OWNER_STATUS.ACTIVE,
            totalEarnings: 0,
            totalBookings: 0,
            groundsCount: 0,
            rating: 0,
            totalReviews: 0,
            referralCode,
            referredBy,
            referralCount: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            role: 'owner'
        };
        
        await db.collection(COLLECTIONS.OWNERS).doc(user.uid).set(ownerData);
        
        if (referredBy) {
            await db.collection(COLLECTIONS.REFERRALS).add({
                code: referralCode,
                ownerId: user.uid,
                referredBy,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            await db.collection(COLLECTIONS.OWNERS).doc(referredBy).update({
                referralCount: firebase.firestore.FieldValue.increment(1)
            });
        }
        
        await user.updateProfile({
            displayName: ownerName
        });
        
        hideLoading();
        
        showPlotRegistrationSuccess(ownerName);
        
    } catch (error) {
        hideLoading();
        let errorMessage = 'Registration failed';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already registered';
        } else {
            errorMessage = error.message;
        }
        showToast(errorMessage, 'error');
    }
}
// Update showPlotRegistrationSuccess function (around line 870-900)

function showPlotRegistrationSuccess(ownerName) {
    document.getElementById('confirmation-title').textContent = 'Account Created Successfully!';
    document.getElementById('confirmation-message').textContent = 'You can now login and list your grounds for free!';
    document.getElementById('confirmation-status-icon').innerHTML = '<i class="fas fa-check-circle"></i>';
    document.getElementById('confirmation-status-icon').className = 'status-icon success';
    
    const details = document.getElementById('confirmation-details');
    details.innerHTML = `
        <p><strong>Welcome, ${escapeHtml(ownerName)}!</strong></p>
        <p>Your account has been created successfully.</p>
        <p><strong>Next Steps:</strong></p>
        <ul style="margin-left: var(--space-lg);">
            <li>Login to your account</li>
            <li>Go to Owner Dashboard</li>
            <li>Click "Add Ground" to list your grounds for FREE!</li>
            <li>Start earning from bookings!</li>
        </ul>
        <p class="payment-note">Listing grounds is completely FREE! No registration fees.</p>
    `;
    
    document.getElementById('view-entry-pass-btn').style.display = 'none';
    document.getElementById('back-to-home-btn').onclick = () => {
        showPage('login-page');
    };
    
    showPage('confirmation-page');
}

// Update canAddGround function (around line 910-930)

// ==================== CAN ADD GROUND ====================

// ==================== CAN ADD GROUND ====================
async function canAddGround() {
    if (!currentUser || currentUser.role !== 'owner') {
        showToast('Please login as owner', 'error');
        return false;
    }
    
    try {
        // Always fetch fresh data from Firestore to ensure we have the latest
        const ownerDoc = await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).get();
        
        if (!ownerDoc.exists) {
            showToast('Owner data not found. Please contact support.', 'error');
            return false;
        }
        
        const owner = ownerDoc.data();
        
        console.log('Owner data for canAddGround:', {
            ownerType: owner.ownerType,
            ownerUniqueId: owner.ownerUniqueId,
            ownerName: owner.ownerName,
            status: owner.status
        });
        
        // Check if owner is active
        if (owner.status !== OWNER_STATUS.ACTIVE) {
            showToast('Your account is blocked. Please contact support.', 'error');
            return false;
        }
        
        // Check owner type - allow both venue owners and plot owners
        if (owner.ownerType === OWNER_TYPES.VENUE_OWNER || 
            owner.ownerType === OWNER_TYPES.PLOT_OWNER) {
            return true;
        }
        
        // If ownerType is missing or invalid, show appropriate message
        if (!owner.ownerType) {
            console.error('Owner type missing in database for user:', currentUser.uid);
            showToast('Account setup incomplete. Please contact support.', 'error');
            return false;
        }
        
        showToast('Your account type does not allow adding grounds. Only Venue Owners and Plot Owners can add grounds.', 'error');
        return false;
        
    } catch (error) {
        console.error('Error checking ground addition:', error);
        showToast('Error checking permissions. Please try again.', 'error');
        return false;
    }
}

function showRegistrationPaymentModal() {
    const modal = document.getElementById('registration-payment-modal');
    modal.classList.add('active');
}

// ==================== HANDLE ADD GROUND ====================

// ==================== HANDLE ADD GROUND ====================
// Replace your existing handleAddGround function with this one

// ==================== HANDLE ADD GROUND ====================
// ==================== HANDLE ADD GROUND ====================
// ==================== HANDLE ADD GROUND ====================
async function handleAddGround(e) {
    e.preventDefault();
    
    const canAdd = await canAddGround();
    if (!canAdd) return;
    
    const groundName = document.getElementById('ground-name-input').value.trim();
    const sportType = document.getElementById('ground-sport-input').value;
    const pricePerHour = parseFloat(document.getElementById('ground-price-input').value);
    const groundAddress = document.getElementById('ground-address-input').value.trim();
    const fileInput = document.getElementById('ground-images');
    const groundImages = fileInput ? fileInput.files : [];
    
    // Validate inputs
    if (!groundName || !sportType || !pricePerHour) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (pricePerHour < 100) {
        showToast('Minimum price is ₹100 per hour', 'error');
        return;
    }
    
    // IMAGES ARE NOW OPTIONAL - Remove the requirement for 3 images
    // Just show a warning if no images, but allow submission
    if (groundImages.length === 0) {
        showToast('No photos selected. You can add photos later from the ground management page.', 'warning');
    }
    
    // Show upload progress if images are selected
    const uploadProgress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('upload-progress-fill');
    const uploadStatus = document.getElementById('upload-status');
    
    if (uploadProgress && groundImages.length > 0) {
        uploadProgress.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (uploadStatus) uploadStatus.textContent = 'Uploading photos...';
    }
    
    showLoading('Adding ground...');
    
    try {
        const imageUrls = [];
        
        // Upload images if any are selected
        if (groundImages.length > 0) {
            let uploaded = 0;
            
            for (let i = 0; i < groundImages.length; i++) {
                const file = groundImages[i];
                
                // Validate each file
                if (file.size > 5 * 1024 * 1024) {
                    showToast(`${file.name} is too large. Maximum size is 5MB`, 'error');
                    hideLoading();
                    if (uploadProgress) uploadProgress.style.display = 'none';
                    return;
                }
                if (!file.type.startsWith('image/')) {
                    showToast(`${file.name} is not a valid image file`, 'error');
                    hideLoading();
                    if (uploadProgress) uploadProgress.style.display = 'none';
                    return;
                }
                
                const url = await uploadFile(file, `grounds/${currentUser.uid}`);
                imageUrls.push(url);
                
                uploaded++;
                if (uploadProgress && progressFill) {
                    const progress = (uploaded / groundImages.length) * 100;
                    progressFill.style.width = `${progress}%`;
                }
                if (uploadStatus) uploadStatus.textContent = `Uploading ${uploaded} of ${groundImages.length} photos...`;
            }
        }
        
        // Prepare ground data - images array can be empty
        const groundData = {
            ownerId: currentUser.uid,
            groundName: groundName,
            sportType: sportType,
            pricePerHour: pricePerHour,
            groundAddress: groundAddress || '',
            images: imageUrls, // Can be empty array
            rating: 0,
            totalReviews: 0,
            status: 'active',
            isVerified: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add ground to Firestore
        await db.collection(COLLECTIONS.GROUNDS).add(groundData);
        
        // Update owner's grounds count
        await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).update({
            groundsCount: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        
        const message = groundImages.length === 0 ? 
            'Ground added successfully! You can add photos later from the ground management page.' : 
            'Ground added successfully!';
        showToast(message, 'success');
        
        closeModal('add-ground-modal');
        
        // Reset the form
        const form = document.getElementById('add-ground-form');
        if (form) form.reset();
        
        // Reset price preview
        updateEarningsPreview(0);
        
        // Reset price input
        const priceInput = document.getElementById('ground-price-input');
        if (priceInput) priceInput.value = '';
        
        // Reset selected files
        if (typeof selectedFiles !== 'undefined') {
            selectedFiles = [];
        }
        
        // Reset image preview
        const previewGrid = document.getElementById('image-preview-grid');
        if (previewGrid) {
            previewGrid.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-camera"></i>
                    <p>No photos selected yet</p>
                    <span>Photos are optional (you can add them later)</span>
                </div>
            `;
            previewGrid.classList.remove('has-images');
        }
        
        // Reset step to 1
        const steps = document.querySelectorAll('.form-step');
        const progressSteps = document.querySelectorAll('.progress-step');
        
        steps.forEach(step => step.classList.remove('active'));
        progressSteps.forEach(step => step.classList.remove('active', 'completed'));
        
        const firstStep = document.querySelector('.form-step[data-step="1"]');
        const firstProgress = document.querySelector('.progress-step[data-step="1"]');
        if (firstStep) firstStep.classList.add('active');
        if (firstProgress) firstProgress.classList.add('active');
        
        // Reset navigation buttons
        const prevBtn = document.getElementById('prev-step-btn');
        const nextBtn = document.getElementById('next-step-btn');
        const submitBtn = document.getElementById('submit-ground-btn');
        
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.style.display = 'flex';
        if (submitBtn) submitBtn.style.display = 'none';
        
        // Reset current step
        currentGroundStep = 1;
        
        // Refresh owner dashboard if active
        if (document.getElementById('owner-dashboard-page').classList.contains('active')) {
            loadOwnerDashboard('grounds');
        } else {
            loadNearbyVenues();
        }
        
    } catch (error) {
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        console.error('Error adding ground:', error);
        showToast(error.message || 'Error adding ground. Please try again.', 'error');
    }
}
// ==================== PROCESS REGISTRATION PAYMENT ====================

async function processRegistrationPayment(upiApp) {
    if (!currentUser) {
        showToast('Please login first', 'error');
        return;
    }
    
    closeModal('registration-payment-modal');
    showLoading('Processing payment...');
    
    try {
        const initiatePayment = functions.httpsCallable('initiateRegistrationPayment');
        const result = await initiatePayment({
            amount: OWNER_REGISTRATION_FEE,
            upiApp: upiApp,
            ownerId: currentUser.uid
        });
        
        if (result.data.success) {
            window.location.href = result.data.paymentUrl;
        } else {
            throw new Error(result.data.message || 'Payment initiation failed');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Payment error:', error);
        showToast('Payment failed: ' + error.message, 'error');
    }
}

// ==================== HANDLE GOOGLE SIGN IN ====================

async function handleGoogleSignIn() {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    showLoading('Signing in with Google...');
    
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        const userDoc = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
        
        if (!userDoc.exists) {
            const urlParams = new URLSearchParams(window.location.search);
            const refCode = urlParams.get('ref');
            let referredBy = null;
            
            if (refCode) {
                const referralSnapshot = await db.collection(COLLECTIONS.REFERRALS)
                    .where('code', '==', refCode)
                    .get();
                
                if (!referralSnapshot.empty) {
                    referredBy = referralSnapshot.docs[0].data().ownerId;
                }
            }
            
            const userData = {
                uid: user.uid,
                name: user.displayName || 'User',
                email: user.email,
                phone: user.phoneNumber || '',
                profileImage: user.photoURL || 'https://via.placeholder.com/150',
                role: 'user',
                referralCode: generateReferralCode(),
                referredBy,
                referralCount: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection(COLLECTIONS.USERS).doc(user.uid).set(userData);
            
            if (referredBy) {
                await db.collection(COLLECTIONS.REFERRALS).add({
                    code: userData.referralCode,
                    userId: user.uid,
                    referredBy,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        showToast('Login successful!');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function logout() {
    showLoading('Signing out...');
    
    logoutTimer = setTimeout(() => {
        hideLoading();
        showToast('Logout timeout - please try again', 'error');
    }, 5000);
    
    await fastLogout();
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = prompt('Enter your email address:');
    
    if (email) {
        showLoading('Sending reset email...');
        try {
            await auth.sendPasswordResetEmail(email);
            hideLoading();
            showToast('Password reset email sent! Check your inbox.');
        } catch (error) {
            hideLoading();
            let errorMessage = 'Failed to send reset email';
            if (error.code === 'auth/user-not-found') errorMessage = 'Email not registered';
            else errorMessage = error.message;
            
            showToast(errorMessage, 'error');
        }
    }
}

// ==================== PROFILE FUNCTIONS ====================

function showProfile() {
    loadProfilePage();
    showPage('profile-page');
}

async function loadProfilePage() {
    if (!currentUser) return;
    
    console.log('Loading profile for role:', currentUser.role);
    
    document.getElementById('profile-name').textContent = currentUser.name || 'User';
    document.getElementById('profile-email').textContent = currentUser.email;
    document.getElementById('profile-phone').textContent = currentUser.phone || 'Phone not provided';
    document.getElementById('profile-image-large').src = currentUser.profileImage || 'https://via.placeholder.com/120';
    document.getElementById('header-profile-img').src = currentUser.profileImage || 'https://via.placeholder.com/40';
    
    const roleBadge = document.getElementById('profile-role-badge');
    if (currentUser.role === 'owner') {
        roleBadge.textContent = `Owner ID: ${currentUser.ownerUniqueId || 'N/A'}`;
        roleBadge.style.background = 'var(--gradient-secondary)';
    } else if (currentUser.role === 'admin') {
        roleBadge.textContent = `Admin (${currentUser.adminRole?.replace('_', ' ') || 'Administrator'})`;
        roleBadge.style.background = 'var(--gradient-admin)';
    } else if (currentUser.role === 'ceo') {
        roleBadge.textContent = 'CEO (Super Admin)';
        roleBadge.style.background = 'var(--gradient-ceo)';
    } else {
        roleBadge.textContent = 'User';
        roleBadge.style.background = 'var(--gradient-primary)';
    }
    
    const ownerLink = document.getElementById('owner-dashboard-link');
    const adminLink = document.getElementById('admin-dashboard-link');
    const ceoLink = document.getElementById('ceo-dashboard-link');
    
    if (ownerLink) {
        ownerLink.style.display = currentUser.role === 'owner' ? 'flex' : 'none';
    }
    
    if (adminLink) {
        adminLink.style.display = (currentUser.role === 'admin' || currentUser.role === 'ceo') ? 'flex' : 'none';
    }
    
    if (ceoLink) {
        ceoLink.style.display = currentUser.role === 'ceo' ? 'flex' : 'none';
    }
    
    if (currentUser.role === 'user' && currentUser.referralCode) {
        document.getElementById('profile-referral-code').style.display = 'flex';
        document.getElementById('referral-code-value').textContent = currentUser.referralCode;
    }
}

function updateProfileHeader() {
    if (currentUser) {
        document.getElementById('header-profile-img').src = currentUser.profileImage || 'https://via.placeholder.com/40';
    }
}

function editProfile() {
    document.getElementById('edit-name').value = currentUser.name || '';
    document.getElementById('edit-phone').value = currentUser.phone || '';
    document.getElementById('edit-profile-modal').classList.add('active');
}

async function handleEditProfile(e) {
    e.preventDefault();
    
    const name = document.getElementById('edit-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    
    if (!name || !phone) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    showLoading('Updating profile...');
    
    try {
        let collection;
        if (currentUser.role === 'owner') {
            collection = COLLECTIONS.OWNERS;
        } else if (currentUser.role === 'admin' || currentUser.role === 'ceo') {
            collection = COLLECTIONS.ADMINS;
        } else {
            collection = COLLECTIONS.USERS;
        }
        
        await db.collection(collection).doc(currentUser.uid).update({
            name,
            phone,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        currentUser.name = name;
        currentUser.phone = phone;
        
        hideLoading();
        showToast('Profile updated successfully');
        closeModal('edit-profile-modal');
        loadProfilePage();
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

function changeProfilePhoto() {
    showToast('Profile photo will use default image', 'info');
}

// ==================== COPY REFERRAL CODE ====================

document.getElementById('copy-referral-code')?.addEventListener('click', () => {
    const code = document.getElementById('referral-code-value').textContent;
    navigator.clipboard.writeText(code);
    showToast('Referral code copied!', 'success');
});

// ==================== NAVIGATION FUNCTIONS ====================

function showLogin() {
    showPage('login-page');
}

function showRegister() {
    showPage('register-page');
}

function showOwnerTypeSelection() {
    showPage('owner-type-page');
}
function showVenueOwnerRegister() {
    showPage('venue-owner-register-page');
}

function showPlotOwnerRegister() {
    showPage('plot-owner-register-page');
}
function showHome() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.getElementById('nav-home').classList.add('active');
    
    showPage('main-page');
    loadMainPage();
}

function showAllVenues() {
    document.getElementById('global-search').value = '';
    loadAllVenuesPage();
}

function showBookings() {
    if (!currentUser) {
        showToast('Please login to view bookings', 'warning');
        return;
    }
    loadUserBookings('upcoming');
    showPage('bookings-page');
}

function showTournaments() {
    loadAllTournaments();
    showPage('tournaments-page');
}

function showTerms() {
    showPage('terms-page');
}

function showPrivacyPolicy() {
    showPage('privacy-page');
}

function showCancellationPolicy() {
    showPage('cancellation-page');
}

function showRefundPolicy() {
    showPage('refund-page');
}

function showOwnerAgreement() {
    showPage('owner-agreement-page');
}

// ==================== CHECK FIRST BOOKING OFFER ====================

function checkFirstBookingOffer() {
    if (!currentUser) return;
    
    const hasSeenOffer = localStorage.getItem('firstBookingOffer_' + currentUser.uid);
    
    if (!hasSeenOffer && currentUser.role === 'user') {
        document.getElementById('first-booking-offer').style.display = 'flex';
    }
}

document.getElementById('close-offer-banner')?.addEventListener('click', () => {
    document.getElementById('first-booking-offer').style.display = 'none';
    if (currentUser) {
        localStorage.setItem('firstBookingOffer_' + currentUser.uid, 'true');
    }
});

// ==================== OWNER QR SCANNER ====================

function toggleOwnerQRScanner() {
    const modal = document.getElementById('owner-qr-modal');
    if (modal.style.display === 'none' || modal.style.display === '') {
        modal.style.display = 'flex';
        startOwnerQRScanner();
    } else {
        modal.style.display = 'none';
        stopOwnerQRScanner();
    }
}

function startOwnerQRScanner() {
    const html5QrCode = new Html5Qrcode("owner-qr-reader");
    
    const qrConfig = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
    };
    
    html5QrCode.start(
        { facingMode: "environment" },
        qrConfig,
        async (decodedText) => {
            await handleOwnerQRScan(decodedText, html5QrCode);
        },
        (errorMessage) => {
            // Silent error handling
        }
    ).catch((err) => {
        console.log(err);
        document.getElementById('owner-qr-result').innerHTML = 
            '<p class="text-center">Camera access denied. Please ensure camera permissions are granted.</p>';
    });
    
    ownerQRScanner = html5QrCode;
}

function stopOwnerQRScanner() {
    if (ownerQRScanner) {
        ownerQRScanner.stop().catch(e => console.log('Scanner stop error:', e));
        ownerQRScanner = null;
    }
}

// Replace the handleOwnerQRScan function with this corrected version

async function handleOwnerQRScan(decodedText, scanner) {
    try {
        const qrData = JSON.parse(decodedText);
        
        if (!qrData.appId || qrData.appId !== 'BookMyGame') {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--danger); text-align: center;">
                    <i class="fas fa-times-circle" style="font-size: 3rem;"></i>
                    <h3>Invalid QR Code</h3>
                    <p>This QR code was not generated by BookMyGame</p>
                </div>
            `;
            return;
        }
        
        const now = new Date();
        const validFrom = new Date(qrData.validFrom);
        const validTo = new Date(qrData.validTo);
        
        if (now < validFrom || now > validTo) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--danger); text-align: center;">
                    <i class="fas fa-times-circle" style="font-size: 3rem;"></i>
                    <h3>QR Expired</h3>
                    <p>This QR is only valid from ${validFrom.toLocaleString()} to ${validTo.toLocaleString()}</p>
                </div>
            `;
            return;
        }
        
        // Get the booking details
        const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('bookingId', '==', qrData.bookingId)
            .get();
        
        if (snapshot.empty) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--danger); text-align: center;">
                    <i class="fas fa-times-circle" style="font-size: 3rem;"></i>
                    <h3>Invalid QR</h3>
                    <p>Booking not found</p>
                </div>
            `;
            return;
        }
        
        const bookingDoc = snapshot.docs[0];
        const booking = bookingDoc.data();
        
        // CRITICAL: Verify that this owner actually owns the ground
        // Check if the current user (owner) is the owner of the ground
        
        // First, get the ground details to find the owner
        const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(booking.groundId).get();
        
        if (!groundDoc.exists) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--danger); text-align: center;">
                    <i class="fas fa-times-circle" style="font-size: 3rem;"></i>
                    <h3>Invalid QR</h3>
                    <p>Ground not found</p>
                </div>
            `;
            return;
        }
        
        const ground = groundDoc.data();
        
        // Check if the current user is the owner of this ground
        if (ground.ownerId !== currentUser.uid) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--danger); text-align: center;">
                    <i class="fas fa-ban" style="font-size: 3rem;"></i>
                    <h3>Unauthorized Verification</h3>
                    <p>You can only verify bookings for your own grounds.</p>
                    <p style="margin-top: var(--space-sm); font-size: var(--font-xs);">This booking is for: ${booking.groundName}</p>
                </div>
            `;
            return;
        }
        
        // Also verify the groundId matches
        if (booking.groundId !== qrData.groundId) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--danger); text-align: center;">
                    <i class="fas fa-times-circle" style="font-size: 3rem;"></i>
                    <h3>Invalid Ground</h3>
                    <p>This QR code is for a different ground</p>
                </div>
            `;
            return;
        }
        
        // Check if entry has already been used
        if (booking.entryStatus === 'used') {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--warning); text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem;"></i>
                    <h3>QR Already Used</h3>
                    <p>Entry was used at ${booking.entryTime ? new Date(booking.entryTime.toDate()).toLocaleString() : 'unknown time'}</p>
                </div>
            `;
            return;
        }
        
        // Check if booking is confirmed
        if (booking.bookingStatus !== BOOKING_STATUS.CONFIRMED) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--warning); text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem;"></i>
                    <h3>Booking Not Confirmed</h3>
                    <p>Current status: ${booking.bookingStatus.replace(/_/g, ' ')}</p>
                </div>
            `;
            return;
        }
        
        // Check if the date matches today (optional but recommended)
        const today = new Date().toISOString().split('T')[0];
        if (booking.date !== today) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--warning); text-align: center;">
                    <i class="fas fa-calendar-times" style="font-size: 3rem;"></i>
                    <h3>Wrong Date</h3>
                    <p>This booking is for ${booking.date}. Today is ${today}.</p>
                    <p>QR codes are only valid on the booking date.</p>
                </div>
            `;
            return;
        }
        
        // Check current time against slot time
        const nowTime = new Date();
        const [startHour, startMinute] = booking.slotTime.split('-')[0].split(':').map(Number);
        const slotStartTime = new Date(booking.date);
        slotStartTime.setHours(startHour, startMinute, 0);
        
        const slotEndTime = new Date(slotStartTime);
        slotEndTime.setHours(slotStartTime.getHours() + 1);
        
        // Allow entry 15 minutes before and 30 minutes after slot start
        const entryStartTime = new Date(slotStartTime);
        entryStartTime.setMinutes(entryStartTime.getMinutes() - 15);
        
        const entryEndTime = new Date(slotStartTime);
        entryEndTime.setMinutes(entryEndTime.getMinutes() + 30);
        
        if (nowTime < entryStartTime) {
            const minutesToWait = Math.ceil((entryStartTime - nowTime) / 60000);
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--warning); text-align: center;">
                    <i class="fas fa-hourglass-half" style="font-size: 3rem;"></i>
                    <h3>Too Early</h3>
                    <p>Entry will be allowed at ${entryStartTime.toLocaleTimeString()}</p>
                    <p>Please wait ${minutesToWait} minutes.</p>
                </div>
            `;
            return;
        }
        
        if (nowTime > entryEndTime) {
            document.getElementById('owner-qr-result').innerHTML = `
                <div style="color: var(--danger); text-align: center;">
                    <i class="fas fa-clock" style="font-size: 3rem;"></i>
                    <h3>Entry Window Closed</h3>
                    <p>Entry was allowed until ${entryEndTime.toLocaleTimeString()}</p>
                    <p>The booking slot has passed.</p>
                </div>
            `;
            return;
        }
        
        // All checks passed - verify the entry
        await bookingDoc.ref.update({
            entryStatus: 'used',
            entryTime: firebase.firestore.FieldValue.serverTimestamp(),
            verifiedBy: currentUser.uid,
            verifiedByName: currentUser.ownerName || currentUser.name,
            verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Also update the ground's booking count if needed
        await db.collection(COLLECTIONS.GROUNDS).doc(booking.groundId).update({
            lastVerifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
            totalEntriesVerified: firebase.firestore.FieldValue.increment(1)
        });
        
        // Show success message with booking details
        document.getElementById('owner-qr-result').innerHTML = `
            <div style="color: var(--success); text-align: center;">
                <i class="fas fa-check-circle" style="font-size: 3rem;"></i>
                <h3>Entry Verified!</h3>
                <div style="background: rgba(255,255,255,0.1); padding: var(--space-md); border-radius: var(--radius); margin: var(--space-md) 0; text-align: left;">
                    <p><strong>Customer:</strong> ${booking.userName || 'N/A'}</p>
                    <p><strong>Venue:</strong> ${booking.venueName || 'N/A'}</p>
                    <p><strong>Ground:</strong> ${booking.groundName || 'N/A'}</p>
                    <p><strong>Date:</strong> ${booking.date}</p>
                    <p><strong>Time:</strong> ${booking.slotTime}</p>
                    <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
                </div>
                <p>Entry allowed. Enjoy the game!</p>
                <button class="auth-btn" style="margin-top: var(--space-md);" onclick="closeQRScannerAndRefresh()">
                    Close
                </button>
            </div>
        `;
        
        // Optionally stop scanner after successful verification
        setTimeout(() => {
            if (scanner) {
                scanner.stop().catch(e => console.log('Scanner stop error:', e));
            }
        }, 5000);
        
    } catch (error) {
        console.error('QR Scan Error:', error);
        document.getElementById('owner-qr-result').innerHTML = `
            <div style="color: var(--danger); text-align: center;">
                <i class="fas fa-times-circle" style="font-size: 3rem;"></i>
                <h3>Error Verifying QR</h3>
                <p>${error.message || 'Could not verify QR code'}</p>
            </div>
        `;
    }
}

// Helper function to close QR scanner and refresh
function closeQRScannerAndRefresh() {
    const modal = document.getElementById('owner-qr-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    if (ownerQRScanner) {
        ownerQRScanner.stop().catch(e => console.log('Scanner stop error:', e));
        ownerQRScanner = null;
    }
    // Clear result message
    document.getElementById('owner-qr-result').innerHTML = '';
}

// Add this function to verify if owner has any grounds
async function checkOwnerHasGrounds() {
    if (!currentUser || currentUser.role !== 'owner') return false;
    
    try {
        const groundsSnapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        if (groundsSnapshot.empty) {
            showToast('You don\'t have any grounds listed. Please add a ground first.', 'warning');
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error checking grounds:', error);
        return false;
    }
}

// Update the toggleOwnerQRScanner function
function toggleOwnerQRScanner() {
    const modal = document.getElementById('owner-qr-modal');
    if (modal.style.display === 'none' || modal.style.display === '') {
        // Check if owner has grounds before opening scanner
        checkOwnerHasGrounds().then(hasGrounds => {
            if (hasGrounds) {
                modal.style.display = 'flex';
                startOwnerQRScanner();
            } else {
                showToast('Please add a ground first to verify entries', 'warning');
                // Optionally redirect to owner dashboard grounds tab
                setTimeout(() => {
                    showOwnerDashboard();
                    loadOwnerDashboard('grounds');
                }, 2000);
            }
        });
    } else {
        modal.style.display = 'none';
        stopOwnerQRScanner();
    }
}


// ==================== MAIN PAGE ====================

async function loadMainPage() {
    showLoading('Loading venues...');
    
    try {
        await loadCategories();
        await loadNearbyVenues();
        await loadFeaturedTournament();
        await loadLastMinuteDeals();
        await loadPlayerMatches();
        
        hideLoading();
    } catch (error) {
        console.error('Error loading main page:', error);
        hideLoading();
        showToast('Failed to load content', 'error');
    }
}

function loadCategories() {
    const categories = [
        { name: 'Cricket', icon: 'fa-baseball-ball', sport: 'cricket', color: '#2563eb' },
        { name: 'Football', icon: 'fa-futbol', sport: 'football', color: '#10b981' },
        { name: 'Badminton', icon: 'fa-table-tennis', sport: 'badminton', color: '#f59e0b' },
        { name: 'Tennis', icon: 'fa-table-tennis', sport: 'tennis', color: '#ef4444' },
        { name: 'Basketball', icon: 'fa-basketball-ball', sport: 'basketball', color: '#8b5cf6' },
        { name: 'Volleyball', icon: 'fa-volleyball-ball', sport: 'volleyball', color: '#ec4899' },
        { name: 'Swimming', icon: 'fa-swimmer', sport: 'swimming', color: '#3b82f6' },
        { name: 'Multi-Sport', icon: 'fa-dumbbell', sport: 'multi', color: '#6b7280' }
    ];
    
    const grid = document.getElementById('categories-grid');
    grid.innerHTML = categories.map(cat => `
        <div class="category-item" data-sport="${cat.sport}">
            <div class="category-icon" style="background: linear-gradient(135deg, ${cat.color}, ${cat.color}dd);">
                <i class="fas ${cat.icon}"></i>
            </div>
            <span>${cat.name}</span>
        </div>
    `).join('');
    
    document.querySelectorAll('.category-item').forEach(item => {
        item.addEventListener('click', () => {
            filterBySport(item.dataset.sport);
        });
    });
}

function filterBySport(sport) {
    document.getElementById('global-search').value = sport;
    searchVenues(sport);
}

// ==================== LAST MINUTE DEALS ====================

async function loadLastMinuteDeals() {
    const container = document.getElementById('last-minute-deals');
    if (!container) return;
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const currentHour = now.getHours();
        
        const slotsSnapshot = await db.collection(COLLECTIONS.SLOTS)
            .where('date', '==', today)
            .where('status', '==', SLOT_STATUS.AVAILABLE)
            .limit(5)
            .get();
        
        if (slotsSnapshot.empty) {
            container.innerHTML = '';
            document.getElementById('last-minute-deals-section').style.display = 'none';
            return;
        }
        
        const groundIds = [...new Set(slotsSnapshot.docs.map(doc => doc.data().groundId))];
        
        let dealsHtml = '';
        
        for (const groundId of groundIds) {
            const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(groundId).get();
            if (!groundDoc.exists) continue;
            
            const ground = groundDoc.data();
            
            const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
                .where('ownerId', '==', ground.ownerId)
                .get();
            
            if (venueSnapshot.empty) continue;
            
            const venue = venueSnapshot.docs[0].data();
            
            const groundSlots = slotsSnapshot.docs
                .filter(doc => doc.data().groundId === groundId)
                .map(doc => doc.data());
            
            if (groundSlots.length === 0) continue;
            
            const discount = 20; // 20% off for last minute
            
            dealsHtml += `
                <div class="deal-card" onclick="viewGround('${groundId}')">
                    <i class="fas fa-clock"></i>
                    <div class="deal-info">
                        <h4>${ground.groundName}</h4>
                        <p>${venue.venueName}</p>
                        <div class="deal-price">${formatCurrency(ground.pricePerHour * 0.8)} <span class="deal-discount">${discount}% OFF</span></div>
                        <p>${groundSlots.length} slots available today</p>
                    </div>
                </div>
            `;
        }
        
        if (dealsHtml) {
            container.innerHTML = dealsHtml;
            document.getElementById('last-minute-deals-section').style.display = 'block';
        } else {
            document.getElementById('last-minute-deals-section').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error loading last minute deals:', error);
    }
}

// ==================== PLAYER MATCHING ====================

async function loadPlayerMatches() {
    const container = document.getElementById('player-matches');
    if (!container) return;
    
    try {
        showLoading('Loading matches...');
        
        // First update match statuses
        await updateMatchStatuses();
        
        // Get current date and time
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        // Get only OPEN matches that haven't started yet
        const matchesSnapshot = await db.collection(COLLECTIONS.PLAYER_MATCHES)
            .where('status', '==', MATCH_STATUS.OPEN)  // Only show OPEN matches
            .where('date', '>=', today)
            .orderBy('date', 'asc')
            .orderBy('time', 'asc')
            .limit(5)
            .get();
        
        if (matchesSnapshot.empty) {
            container.innerHTML = `
                <div class="empty-matches-state">
                    <i class="fas fa-users-slash"></i>
                    <p>No active matches available. Create one!</p>
                    <button class="create-match-btn" onclick="showCreateMatchModal()">
                        <i class="fas fa-plus"></i> Create Match
                    </button>
                </div>
            `;
            document.getElementById('view-all-matches').style.display = 'none';
            hideLoading();
            return;
        }
        
        document.getElementById('view-all-matches').style.display = 'inline-flex';
        
        let matchesHtml = '';
        let hasValidMatches = false;
        
        for (const doc of matchesSnapshot.docs) {
            const match = doc.data();
            const matchId = doc.id;
            
            // Skip if match has already started
            if (match.status !== MATCH_STATUS.OPEN) {
                continue;
            }
            
            // Check if match time has passed
            const matchDateTime = new Date(`${match.date}T${match.time || '00:00'}`);
            if (matchDateTime <= now) {
                // Update match status to IN_PROGRESS
                await db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId).update({
                    status: MATCH_STATUS.IN_PROGRESS,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                continue;
            }
            
            // Skip sample/fake matches
            if (match.creatorId && (match.creatorId === 'sample1' || match.creatorId === 'sample2' || match.creatorId === 'sample3')) {
                continue;
            }
            
            hasValidMatches = true;
            
            // Get venue details if available
            let venueName = match.venueName || 'Venue TBD';
            let location = match.location || 'Location TBD';
            
            if (match.groundId) {
                const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(match.groundId).get();
                if (groundDoc.exists) {
                    const ground = groundDoc.data();
                    const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
                        .where('ownerId', '==', ground.ownerId)
                        .limit(1)
                        .get();
                    
                    if (!venueSnapshot.empty) {
                        const venue = venueSnapshot.docs[0].data();
                        venueName = venue.venueName;
                        location = venue.address;
                    }
                }
            }
            
            const currentPlayers = match.currentPlayers || 1;
            const totalPlayers = match.totalPlayers || 10;
            const progressPercent = (currentPlayers / totalPlayers) * 100;
            
            // Calculate time remaining until match start
            const timeRemaining = matchDateTime - now;
            const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            
            let timeRemainingText = '';
            if (hoursRemaining > 0) {
                timeRemainingText = `${hoursRemaining}h ${minutesRemaining}m remaining`;
            } else if (minutesRemaining > 0) {
                timeRemainingText = `${minutesRemaining} minutes remaining`;
            } else {
                timeRemainingText = 'Starting soon!';
            }
            
            // Calculate distance if user location available
            let distanceText = '';
            if (userLocation && match.locationLat && match.locationLng) {
                const distance = calculateDistance(
                    userLocation.lat,
                    userLocation.lng,
                    match.locationLat,
                    match.locationLng
                );
                distanceText = `${distance.toFixed(1)} km away`;
            }
            
            const matchDate = new Date(match.date);
            const formattedDate = matchDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short'
            });
            
            matchesHtml += `
                <div class="match-card" data-match-id="${matchId}">
                    <div class="match-sport-badge" style="background: ${getSportColor(match.sportType)}20; color: ${getSportColor(match.sportType)};">
                        <i class="fas ${getSportIcon(match.sportType)}"></i>
                        ${match.sportType || 'Cricket'}
                    </div>
                    <div class="match-info">
                        <div class="match-header">
                            <h4>${escapeHtml(match.title || 'Match')}</h4>
                            <div class="match-time-remaining">
                                <i class="fas fa-hourglass-half"></i>
                                ${timeRemainingText}
                            </div>
                        </div>
                        <div class="match-details">
                            <div class="match-detail">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>${escapeHtml(venueName)}${distanceText ? ` (${distanceText})` : ''}</span>
                            </div>
                            <div class="match-detail">
                                <i class="fas fa-calendar"></i>
                                <span>${formattedDate}</span>
                            </div>
                            <div class="match-detail">
                                <i class="fas fa-clock"></i>
                                <span>${match.time || 'TBD'}</span>
                            </div>
                            <div class="match-detail">
                                <i class="fas fa-money-bill-wave"></i>
                                <span>₹${match.pricePerPlayer || match.entryFee || 0}/player</span>
                            </div>
                        </div>
                        <div class="match-players">
                            <div class="players-progress">
                                <div class="progress-bar" style="width: ${progressPercent}%"></div>
                            </div>
                            <div class="players-count">
                                <span><strong>${currentPlayers}</strong> / ${totalPlayers} players</span>
                                <span class="players-needed">${totalPlayers - currentPlayers} spots left</span>
                            </div>
                        </div>
                        <div class="match-creator">
                            <i class="fas fa-user-circle"></i>
                            <span>Hosted by ${escapeHtml(match.creatorName || 'Player')}</span>
                        </div>
                        <button class="join-match-btn" onclick="joinMatch('${matchId}')" ${currentPlayers >= totalPlayers ? 'disabled' : ''}>
                            ${currentPlayers >= totalPlayers ? 'Match Full' : 'Join Match'}
                        </button>
                    </div>
                </div>
            `;
        }
        
        if (!hasValidMatches || matchesHtml === '') {
            container.innerHTML = `
                <div class="empty-matches-state">
                    <i class="fas fa-calendar-check"></i>
                    <p>No upcoming matches available. Create one!</p>
                    <button class="create-match-btn" onclick="showCreateMatchModal()">
                        <i class="fas fa-plus"></i> Create Match
                    </button>
                </div>
            `;
        } else {
            container.innerHTML = matchesHtml;
        }
        
        hideLoading();
        
    } catch (error) {
        console.error('Error loading player matches:', error);
        container.innerHTML = '<p class="text-center">Failed to load matches</p>';
        hideLoading();
    }
}


// Helper functions for styling
function getSportColor(sport) {
    const colors = {
        'cricket': '#2563eb',
        'football': '#10b981',
        'badminton': '#f59e0b',
        'tennis': '#ef4444',
        'basketball': '#8b5cf6',
        'volleyball': '#ec4899',
        'swimming': '#3b82f6'
    };
    return colors[sport?.toLowerCase()] || '#6b7280';
}

function getSportIcon(sport) {
    const icons = {
        'cricket': 'fa-baseball-ball',
        'football': 'fa-futbol',
        'badminton': 'fa-table-tennis',
        'tennis': 'fa-table-tennis',
        'basketball': 'fa-basketball-ball',
        'volleyball': 'fa-volleyball-ball',
        'swimming': 'fa-swimmer'
    };
    return icons[sport?.toLowerCase()] || 'fa-futbol';
}

function getUrgencyClass(date, time) {
    const matchDateTime = new Date(`${date}T${time || '00:00'}`);
    const now = new Date();
    const hoursDiff = (matchDateTime - now) / (1000 * 60 * 60);
    
    if (hoursDiff < 2 && hoursDiff > 0) return 'urgent';
    if (hoursDiff < 24 && hoursDiff > 0) return 'soon';
    return 'upcoming';
}

function getUrgencyText(date, time) {
    const matchDateTime = new Date(`${date}T${time || '00:00'}`);
    const now = new Date();
    const hoursDiff = (matchDateTime - now) / (1000 * 60 * 60);
    
    if (hoursDiff < 2 && hoursDiff > 0) return '🔥 Urgent';
    if (hoursDiff < 24 && hoursDiff > 0) return '⏰ Starting Soon';
    return '📅 Upcoming';
}
async function loadAllMatchesPage() {
    showLoading('Loading matches...');
    
    try {
        let allMatchesPage = document.getElementById('all-matches-page');
        
        if (!allMatchesPage) {
            allMatchesPage = document.createElement('div');
            allMatchesPage.id = 'all-matches-page';
            allMatchesPage.className = 'page';
            allMatchesPage.innerHTML = `
                <header class="details-header">
                    <button class="back-btn" id="all-matches-back-btn">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <h2>Find Players</h2>
                    <button class="create-match-header-btn" id="create-match-header-btn">
                        <i class="fas fa-plus"></i>
                    </button>
                </header>
                
                <div class="matches-filters-section">
                    <div class="filter-group">
                        <i class="fas fa-filter"></i>
                        <select id="match-sport-filter" class="filter-select">
                            <option value="all">All Sports</option>
                            <option value="cricket">🏏 Cricket</option>
                            <option value="football">⚽ Football</option>
                            <option value="badminton">🏸 Badminton</option>
                            <option value="tennis">🎾 Tennis</option>
                            <option value="basketball">🏀 Basketball</option>
                            <option value="volleyball">🏐 Volleyball</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <i class="fas fa-calendar"></i>
                        <select id="match-date-filter" class="filter-select">
                            <option value="all">All Dates</option>
                            <option value="today">Today</option>
                            <option value="tomorrow">Tomorrow</option>
                            <option value="week">This Week</option>
                            <option value="weekend">This Weekend</option>
                        </select>
                    </div>
                </div>
                
                <div class="matches-stats" id="matches-stats">
                    <div class="stat-chip">
                        <i class="fas fa-users"></i>
                        <span id="total-matches-count">0</span> Matches
                    </div>
                    <div class="stat-chip">
                        <i class="fas fa-user-plus"></i>
                        <span id="spots-available">0</span> Spots Left
                    </div>
                </div>
                
                <div class="all-matches-list" id="all-matches-list">
                    <div class="loading-container">
                        <div class="loader-spinner"></div>
                        <p>Loading matches...</p>
                    </div>
                </div>
                
                <button class="create-match-fab" id="create-match-fab">
                    <i class="fas fa-plus"></i>
                    <span>Create Match</span>
                </button>
            `;
            document.querySelector('.app-container').appendChild(allMatchesPage);
            
            document.getElementById('all-matches-back-btn').addEventListener('click', goBack);
            document.getElementById('create-match-header-btn').addEventListener('click', () => showCreateMatchModal());
            document.getElementById('create-match-fab').addEventListener('click', () => showCreateMatchModal());
            document.getElementById('match-sport-filter').addEventListener('change', () => filterAllMatches());
            document.getElementById('match-date-filter').addEventListener('change', () => filterAllMatches());
        }
        
        await displayAllMatches();
        hideLoading();
        showPage('all-matches-page');
        
    } catch (error) {
        hideLoading();
        console.error('Error loading all matches:', error);
        showToast('Failed to load matches', 'error');
    }
}

let allMatchesData = [];
let currentMatchFilter = {
    sport: 'all',
    date: 'all'
};

async function displayAllMatches() {
    const container = document.getElementById('all-matches-list');
    if (!container) return;
    
    try {
        // First update match statuses
        await updateMatchStatuses();
        
        const now = new Date();
        
        // Get only OPEN matches (not started, not full, not in progress)
        const query = db.collection(COLLECTIONS.PLAYER_MATCHES)
            .where('status', '==', MATCH_STATUS.OPEN)
            .orderBy('date', 'asc')
            .orderBy('time', 'asc');
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-matches-state">
                    <div class="empty-icon">
                        <i class="fas fa-calendar-times"></i>
                    </div>
                    <h3>No Upcoming Matches</h3>
                    <p>Create a match to find players near you!</p>
                    <button class="create-match-btn" onclick="showCreateMatchModal()">
                        <i class="fas fa-plus"></i> Create Match
                    </button>
                </div>
            `;
            document.getElementById('total-matches-count').textContent = '0';
            document.getElementById('spots-available').textContent = '0';
            return;
        }
        
        allMatchesData = [];
        let totalSpots = 0;
        
        for (const doc of snapshot.docs) {
            const match = doc.data();
            const matchDateTime = new Date(`${match.date}T${match.time || '00:00'}`);
            
            // Skip matches that have already started
            if (matchDateTime <= now) {
                // Update status to IN_PROGRESS
                await db.collection(COLLECTIONS.PLAYER_MATCHES).doc(doc.id).update({
                    status: MATCH_STATUS.IN_PROGRESS,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                continue;
            }
            
            // Skip any sample/fake matches
            if (match.creatorId && (match.creatorId === 'sample1' || match.creatorId === 'sample2' || match.creatorId === 'sample3')) {
                continue;
            }
            
            // Skip matches with fake creator names
            if (match.creatorName && (match.creatorName === 'Rajesh Kumar' || match.creatorName === 'Amit Sharma' || match.creatorName === 'Priya Singh')) {
                continue;
            }
            
            allMatchesData.push({ id: doc.id, ...match });
            const availableSpots = (match.totalPlayers || 0) - (match.currentPlayers || 0);
            totalSpots += availableSpots > 0 ? availableSpots : 0;
        }
        
        // Update stats
        document.getElementById('total-matches-count').textContent = allMatchesData.length;
        document.getElementById('spots-available').textContent = totalSpots;
        
        // If no real matches after filtering
        if (allMatchesData.length === 0) {
            container.innerHTML = `
                <div class="empty-matches-state">
                    <div class="empty-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No Upcoming Matches Found</h3>
                    <p>Create a match to find players near you!</p>
                    <button class="create-match-btn" onclick="showCreateMatchModal()">
                        <i class="fas fa-plus"></i> Create Match
                    </button>
                </div>
            `;
            return;
        }
        
        let filteredMatches = [...allMatchesData];
        
        // Apply sport filter
        if (currentMatchFilter.sport !== 'all') {
            filteredMatches = filteredMatches.filter(match => 
                match.sportType && match.sportType.toLowerCase() === currentMatchFilter.sport.toLowerCase()
            );
        }
        
        // Apply date filter
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];
        
        if (currentMatchFilter.date !== 'all') {
            filteredMatches = filteredMatches.filter(match => {
                if (currentMatchFilter.date === 'today') {
                    return match.date === today;
                } else if (currentMatchFilter.date === 'tomorrow') {
                    return match.date === tomorrowStr;
                } else if (currentMatchFilter.date === 'week') {
                    return match.date >= today && match.date <= nextWeekStr;
                } else if (currentMatchFilter.date === 'weekend') {
                    const matchDate = new Date(match.date);
                    const day = matchDate.getDay();
                    return day === 0 || day === 6;
                }
                return true;
            });
        }
        
        if (filteredMatches.length === 0) {
            container.innerHTML = `
                <div class="empty-matches-state">
                    <div class="empty-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No Matches Found</h3>
                    <p>Try changing your filters or create a new match!</p>
                    <button class="clear-filters-btn" onclick="clearMatchFilters()">
                        <i class="fas fa-undo"></i> Clear Filters
                    </button>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        for (const match of filteredMatches) {
            const matchDateTime = new Date(`${match.date}T${match.time || '00:00'}`);
            const timeRemaining = matchDateTime - now;
            const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
            const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
            
            let timeRemainingText = '';
            if (hoursRemaining > 0) {
                timeRemainingText = `Starts in ${hoursRemaining}h ${minutesRemaining}m`;
            } else if (minutesRemaining > 0) {
                timeRemainingText = `Starts in ${minutesRemaining} minutes`;
            } else {
                timeRemainingText = 'Starting soon!';
            }
            
            // Get venue details
            let venueName = match.venueName || 'Venue TBD';
            let location = match.location || 'Location TBD';
            
            if (match.groundId) {
                try {
                    const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(match.groundId).get();
                    if (groundDoc.exists) {
                        const ground = groundDoc.data();
                        const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
                            .where('ownerId', '==', ground.ownerId)
                            .limit(1)
                            .get();
                        
                        if (!venueSnapshot.empty) {
                            const venue = venueSnapshot.docs[0].data();
                            venueName = venue.venueName;
                            location = venue.address;
                        }
                    }
                } catch (e) {
                    console.log('Error fetching venue:', e);
                }
            }
            
            const currentPlayers = match.currentPlayers || 1;
            const totalPlayers = match.totalPlayers || 10;
            const availableSpots = totalPlayers - currentPlayers;
            const progressPercent = (currentPlayers / totalPlayers) * 100;
            
            const matchDate = new Date(match.date);
            const formattedDate = matchDate.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            
            const isUrgent = availableSpots <= 3 && timeRemaining < 24 * 60 * 60 * 1000;
            
            html += `
                <div class="match-card-modern" data-match-id="${match.id}">
                    <div class="match-card-badge ${isUrgent ? 'urgent' : ''}">
                        ${isUrgent ? '🔥 Few Spots Left!' : '📅 Upcoming Match'}
                    </div>
                    
                    <div class="match-card-content">
                        <div class="match-header-section">
                            <div class="match-sport-info">
                                <div class="sport-icon" style="background: ${getSportColor(match.sportType)}20;">
                                    <i class="fas ${getSportIcon(match.sportType)}" style="color: ${getSportColor(match.sportType)};"></i>
                                </div>
                                <div>
                                    <h3>${escapeHtml(match.title || 'Match')}</h3>
                                    <span class="sport-name">${match.sportType || 'Cricket'}</span>
                                </div>
                            </div>
                            <div class="time-remaining-badge">
                                <i class="fas fa-hourglass-half"></i>
                                ${timeRemainingText}
                            </div>
                        </div>
                        
                        <div class="match-info-grid">
                            <div class="info-item">
                                <i class="fas fa-map-marker-alt"></i>
                                <div>
                                    <span class="info-label">Venue</span>
                                    <span class="info-value">${escapeHtml(venueName)}</span>
                                    <span class="info-sub">${escapeHtml(location)}</span>
                                </div>
                            </div>
                            <div class="info-item">
                                <i class="fas fa-calendar-alt"></i>
                                <div>
                                    <span class="info-label">Date & Time</span>
                                    <span class="info-value">${formattedDate}</span>
                                    <span class="info-sub">${match.time || 'TBD'}</span>
                                </div>
                            </div>
                            <div class="info-item">
                                <i class="fas fa-rupee-sign"></i>
                                <div>
                                    <span class="info-label">Entry Fee</span>
                                    <span class="info-value">₹${match.pricePerPlayer || match.entryFee || 0}</span>
                                    <span class="info-sub">per player</span>
                                </div>
                            </div>
                            <div class="info-item">
                                <i class="fas fa-user-friends"></i>
                                <div>
                                    <span class="info-label">Players Needed</span>
                                    <span class="info-value ${availableSpots <= 2 ? 'urgent-text' : ''}">${availableSpots} spots left</span>
                                    <span class="info-sub">Join now!</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="players-progress-container">
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" style="width: ${progressPercent}%; background: ${getSportColor(match.sportType)};"></div>
                            </div>
                            <div class="progress-stats">
                                <span><i class="fas fa-user-check"></i> ${currentPlayers} joined</span>
                                <span><i class="fas fa-user-plus"></i> ${availableSpots} needed</span>
                            </div>
                        </div>
                        
                        <div class="match-creator-section">
                            <div class="creator-avatar">
                                <i class="fas fa-user-circle"></i>
                            </div>
                            <div class="creator-info">
                                <span class="creator-label">Hosted by</span>
                                <span class="creator-name">${escapeHtml(match.creatorName || 'Player')}</span>
                            </div>
                        </div>
                        
                        ${match.description ? `
                            <div class="match-description-box">
                                <i class="fas fa-info-circle"></i>
                                <p>${escapeHtml(match.description)}</p>
                            </div>
                        ` : ''}
                        
                        <button class="join-match-btn-modern" onclick="joinMatch('${match.id}')" ${currentPlayers >= totalPlayers ? 'disabled' : ''}>
                            ${currentPlayers >= totalPlayers ? 'Match Full' : 'Join Match'}
                            ${currentPlayers < totalPlayers ? `<i class="fas fa-arrow-right"></i>` : ''}
                        </button>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error displaying matches:', error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Unable to load matches</h3>
                <p>Please try again later</p>
                <button class="retry-btn" onclick="displayAllMatches()">Retry</button>
            </div>
        `;
    }
}
function getIsUrgent(date, time) {
    const matchDateTime = new Date(`${date}T${time || '00:00'}`);
    const now = new Date();
    const hoursDiff = (matchDateTime - now) / (1000 * 60 * 60);
    return hoursDiff < 24 && hoursDiff > 0;
}

function clearMatchFilters() {
    document.getElementById('match-sport-filter').value = 'all';
    document.getElementById('match-date-filter').value = 'all';
    currentMatchFilter.sport = 'all';
    currentMatchFilter.date = 'all';
    displayAllMatches();
}

function filterAllMatches() {
    currentMatchFilter.sport = document.getElementById('match-sport-filter').value;
    currentMatchFilter.date = document.getElementById('match-date-filter').value;
    displayAllMatches();
}

async function createSampleMatches() {
    // Create sample matches for testing
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 5);
    
    const sampleMatches = [
        {
            matchId: generateId('MCH'),
            sportType: 'cricket',
            title: 'Sunday Morning Cricket',
            date: tomorrow.toISOString().split('T')[0],
            time: '07:00',
            totalPlayers: 11,
            currentPlayers: 5,
            pricePerPlayer: 200,
            location: 'Central Park Ground',
            venueName: 'Central Sports Complex',
            description: 'Looking for cricket enthusiasts! We have a turf booked for 2 hours. Join for a fun game.',
            creatorName: 'Rajesh Kumar',
            creatorId: 'sample1',
            status: MATCH_STATUS.OPEN,
            participants: ['sample1'],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            matchId: generateId('MCH'),
            sportType: 'football',
            title: 'Evening Football Match',
            date: nextWeek.toISOString().split('T')[0],
            time: '18:00',
            totalPlayers: 10,
            currentPlayers: 6,
            pricePerPlayer: 150,
            location: 'City Football Arena',
            venueName: 'City Sports Hub',
            description: '5-a-side football match. All skill levels welcome!',
            creatorName: 'Amit Sharma',
            creatorId: 'sample2',
            status: MATCH_STATUS.OPEN,
            participants: ['sample2'],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        },
        {
            matchId: generateId('MCH'),
            sportType: 'badminton',
            title: 'Badminton Doubles',
            date: today.toISOString().split('T')[0],
            time: '19:00',
            totalPlayers: 4,
            currentPlayers: 2,
            pricePerPlayer: 100,
            location: 'Indoor Sports Complex',
            venueName: 'Smash Badminton Arena',
            description: 'Looking for 2 players for doubles match. Indoor court with AC.',
            creatorName: 'Priya Singh',
            creatorId: 'sample3',
            status: MATCH_STATUS.OPEN,
            participants: ['sample3'],
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }
    ];
    
    const batch = db.batch();
    for (const match of sampleMatches) {
        const docRef = db.collection(COLLECTIONS.PLAYER_MATCHES).doc();
        batch.set(docRef, match);
    }
    await batch.commit();
    console.log('Sample matches created');
}
// ==================== CREATE MATCH MODAL ====================

function showCreateMatchModal() {
    if (!currentUser) {
        showToast('Please login to create a match', 'warning');
        return;
    }
    
    // Check if modal already exists, if not create it
    let modal = document.getElementById('create-match-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="create-match-modal" class="modal">
                <div class="modal-content" style="max-width: 500px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3><i class="fas fa-plus-circle"></i> Create Match</h3>
                        <button class="close-btn" id="close-create-match-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-match-form" class="create-match-form">
                            <div class="form-group-modern">
                                <label><i class="fas fa-futbol"></i> Sport Type *</label>
                                <select id="match-sport" class="form-select-modern" required>
                                    <option value="cricket">🏏 Cricket</option>
                                    <option value="football">⚽ Football</option>
                                    <option value="badminton">🏸 Badminton</option>
                                    <option value="tennis">🎾 Tennis</option>
                                    <option value="basketball">🏀 Basketball</option>
                                    <option value="volleyball">🏐 Volleyball</option>
                                </select>
                            </div>
                            
                            <div class="form-group-modern">
                                <label><i class="fas fa-tag"></i> Match Title *</label>
                                <input type="text" id="match-title" class="form-input-modern" placeholder="e.g., Sunday Morning Cricket" required>
                                <div class="form-hint">Give your match a catchy title</div>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group-modern">
                                    <label><i class="fas fa-calendar"></i> Date *</label>
                                    <input type="date" id="match-date" class="form-input-modern" required>
                                </div>
                                <div class="form-group-modern">
                                    <label><i class="fas fa-clock"></i> Time *</label>
                                    <input type="time" id="match-time" class="form-input-modern" required>
                                </div>
                            </div>
                            
                            <div class="form-group-modern">
                                <label><i class="fas fa-building"></i> Venue (Optional)</label>
                                <select id="match-ground" class="form-select-modern">
                                    <option value="">Select a venue (optional)</option>
                                </select>
                                <div class="form-hint">Select a registered venue or leave blank for custom location</div>
                            </div>
                            
                            <div class="form-group-modern">
                                <label><i class="fas fa-map-marker-alt"></i> Location (if no venue selected)</label>
                                <input type="text" id="match-custom-location" class="form-input-modern" placeholder="e.g., Central Park, Ground No. 3">
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group-modern">
                                    <label><i class="fas fa-users"></i> Total Players *</label>
                                    <input type="number" id="match-total-players" class="form-input-modern" min="2" max="22" value="10" required>
                                </div>
                                <div class="form-group-modern">
                                    <label><i class="fas fa-rupee-sign"></i> Price per Player (₹)</label>
                                    <input type="number" id="match-price" class="form-input-modern" min="0" value="0" required>
                                    <div class="form-hint">Set to 0 for free matches</div>
                                </div>
                            </div>
                            
                            <div class="form-group-modern">
                                <label><i class="fas fa-align-left"></i> Description (Optional)</label>
                                <textarea id="match-description" class="form-textarea-modern" rows="3" placeholder="Add any additional details about the match..."></textarea>
                            </div>
                            
                            <div class="info-note">
                                <i class="fas fa-info-circle"></i>
                                <span>You'll be listed as the match host. Players can join directly.</span>
                            </div>
                            
                            <button type="submit" class="create-match-submit">
                                <i class="fas fa-plus-circle"></i> Create Match
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Add close button listener
        document.getElementById('close-create-match-modal').addEventListener('click', () => {
            closeModal('create-match-modal');
        });
        
        // Load grounds for selection
        loadGroundsForMatchSelect();
        
        // Add form submit listener
        document.getElementById('create-match-form').addEventListener('submit', createMatch);
    }
    
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('match-date');
    if (dateInput) {
        dateInput.min = today;
    }
    
    // Show modal
    modal = document.getElementById('create-match-modal');
    if (modal) {
        modal.classList.add('active');
    }
}

async function loadGroundsForMatchSelect() {
    try {
        const snapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('status', '==', 'active')
            .limit(50)
            .get();
        
        const select = document.getElementById('match-ground');
        if (!select) return;
        
        // Keep the default option
        let options = '<option value="">Select a venue (optional)</option>';
        
        for (const doc of snapshot.docs) {
            const ground = doc.data();
            // Get venue name
            const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
                .where('ownerId', '==', ground.ownerId)
                .limit(1)
                .get();
            
            let venueName = '';
            if (!venueSnapshot.empty) {
                venueName = venueSnapshot.docs[0].data().venueName;
            }
            
            options += `<option value="${doc.id}">${ground.groundName}${venueName ? ` (${venueName})` : ''}</option>`;
        }
        
        select.innerHTML = options;
    } catch (error) {
        console.error('Error loading grounds:', error);
    }
}

async function createMatch(e) {
    e.preventDefault();
    
    // Validate user is logged in
    if (!currentUser) {
        showToast('Please login to create a match', 'error');
        return;
    }
    
    // Validate user is a real user
    if (currentUser.role !== 'user' && currentUser.role !== 'owner') {
        showToast('Only registered users can create matches', 'error');
        return;
    }
    
    // Validate user has a valid name
    if (!currentUser.name && !currentUser.ownerName) {
        showToast('Please complete your profile before creating a match', 'warning');
        return;
    }
    
    const sportType = document.getElementById('match-sport').value;
    const title = document.getElementById('match-title').value.trim();
    const groundId = document.getElementById('match-ground').value;
    const customLocation = document.getElementById('match-custom-location').value.trim();
    const date = document.getElementById('match-date').value;
    const time = document.getElementById('match-time').value;
    const totalPlayers = parseInt(document.getElementById('match-total-players').value);
    const pricePerPlayer = parseFloat(document.getElementById('match-price').value);
    const description = document.getElementById('match-description').value.trim();
    
    // Validation
    if (!title) {
        showToast('Please enter a match title', 'error');
        return;
    }
    
    if (title.length < 3) {
        showToast('Match title must be at least 3 characters', 'error');
        return;
    }
    
    if (!date) {
        showToast('Please select a date', 'error');
        return;
    }
    
    if (!time) {
        showToast('Please select a time', 'error');
        return;
    }
    
    if (totalPlayers < 2) {
        showToast('Minimum 2 players required', 'error');
        return;
    }
    
    if (totalPlayers > 22) {
        showToast('Maximum 22 players allowed', 'error');
        return;
    }
    
    // Check if date is in the past
    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
        showToast('Cannot create match for past dates', 'error');
        return;
    }
    
    // Validate date is not too far in the future (max 30 days)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxDateStr = maxDate.toISOString().split('T')[0];
    if (date > maxDateStr) {
        showToast('Cannot create matches more than 30 days in advance', 'error');
        return;
    }
    
    // If price is 0, set minimum of ₹5
    let finalPrice = pricePerPlayer;
    if (finalPrice === 0 || finalPrice < 5) {
        finalPrice = 5; // Minimum ₹5 for verification
        showToast('Price set to minimum ₹5 for match verification', 'info');
    }
    
    // Validate price is not too high
    if (finalPrice > 5000) {
        showToast('Price per player cannot exceed ₹5000', 'error');
        return;
    }
    
    showLoading('Creating match...');
    
    try {
        let venueName = '';
        let location = '';
        let locationLat = null;
        let locationLng = null;
        
        if (groundId) {
            const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(groundId).get();
            if (groundDoc.exists) {
                const ground = groundDoc.data();
                const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
                    .where('ownerId', '==', ground.ownerId)
                    .limit(1)
                    .get();
                
                if (!venueSnapshot.empty) {
                    const venue = venueSnapshot.docs[0].data();
                    venueName = venue.venueName;
                    location = venue.address;
                    if (venue.location) {
                        locationLat = venue.location.latitude;
                        locationLng = venue.location.longitude;
                    }
                }
            }
        } else if (customLocation) {
            location = customLocation;
            venueName = 'Custom Location';
            
            // Try to get coordinates for custom location using geocoding
            try {
                const geocodeResponse = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(customLocation)}&limit=1`
                );
                const geocodeData = await geocodeResponse.json();
                if (geocodeData && geocodeData.length > 0) {
                    locationLat = parseFloat(geocodeData[0].lat);
                    locationLng = parseFloat(geocodeData[0].lon);
                }
            } catch (e) {
                console.log('Geocoding failed:', e);
            }
        } else {
            location = 'Location TBD';
            venueName = 'Venue TBD';
        }
        
        // Generate a unique match ID
        const matchId = generateId('MCH');
        
        // Create timestamp for now (use JavaScript Date instead of server timestamp for array)
        const now = new Date();
        
        const matchData = {
            matchId: matchId,
            sportType: sportType,
            title: title,
            groundId: groundId || null,
            venueName: venueName,
            location: location,
            locationLat: locationLat,
            locationLng: locationLng,
            date: date,
            time: time,
            totalPlayers: totalPlayers,
            currentPlayers: 1,
            pricePerPlayer: finalPrice,
            description: description,
            creatorId: currentUser.uid,
            creatorName: currentUser.name || currentUser.ownerName || 'Player',
            creatorPhone: currentUser.phone || '',
            creatorUpiId: currentUser.upiId || '',
            participants: [currentUser.uid],
            participantPayments: [{
                userId: currentUser.uid,
                userName: currentUser.name || currentUser.ownerName || 'Player',
                amount: finalPrice,
                status: MATCH_PAYMENT_STATUS.COMPLETED,
                paymentId: `MATCH_PAY_${Date.now()}_${currentUser.uid}`,
                paidAt: now // Use JavaScript Date instead of server timestamp
            }],
            totalAmountCollected: finalPrice,
            status: MATCH_STATUS.OPEN,
            isVerified: false, // New matches need verification
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), // This is fine at root level
            updatedAt: firebase.firestore.FieldValue.serverTimestamp() // This is fine at root level
        };
        
        // Use add() instead of doc() and set() to let Firestore generate the ID
        await db.collection(COLLECTIONS.PLAYER_MATCHES).add(matchData);
        
        hideLoading();
        showToast('Match created successfully!', 'success');
        closeModal('create-match-modal');
        
        // Reset form
        document.getElementById('create-match-form').reset();
        
        // Refresh the match listings
        if (document.getElementById('main-page') && document.getElementById('main-page').classList.contains('active')) {
            loadPlayerMatches();
        } else if (document.getElementById('all-matches-page') && document.getElementById('all-matches-page').classList.contains('active')) {
            displayAllMatches();
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error creating match:', error);
        showToast('Error creating match: ' + error.message, 'error');
    }
}

// Run this function ONCE to clean up existing fake matches
async function cleanupFakeMatches() {
    console.log('Starting cleanup of fake matches...');
    showLoading('Cleaning up fake data...');
    
    try {
        const fakeCreatorIds = ['sample1', 'sample2', 'sample3'];
        const fakeNames = ['Rajesh Kumar', 'Amit Sharma', 'Priya Singh'];
        
        const batch = db.batch();
        let deleteCount = 0;
        
        // Delete matches with fake creator IDs
        for (const creatorId of fakeCreatorIds) {
            const snapshot = await db.collection(COLLECTIONS.PLAYER_MATCHES)
                .where('creatorId', '==', creatorId)
                .get();
            
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
                deleteCount++;
                console.log(`Marked for deletion: ${doc.id}`);
            });
        }
        
        // Also delete matches with fake names (in case they were created without proper creatorId)
        for (const name of fakeNames) {
            const snapshot = await db.collection(COLLECTIONS.PLAYER_MATCHES)
                .where('creatorName', '==', name)
                .get();
            
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
                deleteCount++;
                console.log(`Marked for deletion by name: ${doc.id}`);
            });
        }
        
        // Delete any matches with sample titles
        const titleSnapshot = await db.collection(COLLECTIONS.PLAYER_MATCHES)
            .where('title', 'in', ['Sunday Morning Cricket', 'Evening Football Match', 'Badminton Doubles'])
            .get();
        
        titleSnapshot.forEach(doc => {
            batch.delete(doc.ref);
            deleteCount++;
            console.log(`Marked for deletion by title: ${doc.id}`);
        });
        
        // Commit all deletions
        if (deleteCount > 0) {
            await batch.commit();
            console.log(`Cleaned up ${deleteCount} fake matches`);
            showToast(`Cleaned up ${deleteCount} fake matches`, 'success');
        } else {
            console.log('No fake matches found to clean up');
            showToast('No fake matches found', 'info');
        }
        
        hideLoading();
        
        // Refresh the displays
        if (document.getElementById('main-page') && document.getElementById('main-page').classList.contains('active')) {
            loadPlayerMatches();
        }
        if (document.getElementById('all-matches-page') && document.getElementById('all-matches-page').classList.contains('active')) {
            displayAllMatches();
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error cleaning up fake matches:', error);
        showToast('Error cleaning up: ' + error.message, 'error');
    }
}

// Uncomment and run this line ONCE to clean up existing fake matches
// cleanupFakeMatches();
// ==================== JOIN MATCH WITH PAYMENT ====================

async function joinMatch(matchId) {
    if (!currentUser) {
        showToast('Please login to join a match', 'warning');
        return;
    }
    
    showLoading('Processing...');
    
    try {
        const matchRef = db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId);
        const matchDoc = await matchRef.get();
        
        if (!matchDoc.exists) {
            showToast('Match not found', 'error');
            hideLoading();
            return;
        }
        
        const match = matchDoc.data();
        const now = new Date();
        const matchDateTime = new Date(`${match.date}T${match.time || '00:00'}`);
        
        // Check if match has already started
        if (matchDateTime <= now) {
            showToast('This match has already started. Cannot join now.', 'error');
            hideLoading();
            // Update match status
            await matchRef.update({
                status: MATCH_STATUS.IN_PROGRESS,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            // Refresh matches
            if (document.getElementById('main-page') && document.getElementById('main-page').classList.contains('active')) {
                loadPlayerMatches();
            } else if (document.getElementById('all-matches-page') && document.getElementById('all-matches-page').classList.contains('active')) {
                displayAllMatches();
            }
            return;
        }
        
        // Check if match is in progress
        if (match.status !== MATCH_STATUS.OPEN) {
            if (match.status === MATCH_STATUS.IN_PROGRESS) {
                showToast('This match has already started', 'error');
            } else if (match.status === MATCH_STATUS.COMPLETED) {
                showToast('This match has already ended', 'error');
            } else if (match.status === MATCH_STATUS.FULL) {
                showToast('This match is already full', 'error');
            } else {
                showToast('This match is no longer available', 'error');
            }
            hideLoading();
            return;
        }
        
        if (match.currentPlayers >= match.totalPlayers) {
            showToast('This match is already full', 'error');
            // Update status to FULL
            await matchRef.update({
                status: MATCH_STATUS.FULL,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            hideLoading();
            return;
        }
        
        const participants = match.participants || [];
        if (participants.includes(currentUser.uid)) {
            showToast('You have already joined this match', 'warning');
            hideLoading();
            return;
        }
        
        const pricePerPlayer = match.pricePerPlayer || 5;
        
        showMatchPaymentModal(matchId, match, pricePerPlayer);
        hideLoading();
        
    } catch (error) {
        hideLoading();
        console.error('Error joining match:', error);
        showToast('Error joining match: ' + error.message, 'error');
    }
}

// ==================== MATCH PAYMENT MODAL ====================

function showMatchPaymentModal(matchId, match, amount) {
    let modal = document.getElementById('match-payment-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="match-payment-modal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-money-bill-wave"></i> Confirm Payment</h3>
                        <button class="close-btn" id="close-match-payment-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="payment-details-card">
                            <div class="match-detail-payment">
                                <h4>${escapeHtml(match.title || 'Match')}</h4>
                                <p><i class="fas fa-calendar"></i> ${match.date} at ${match.time}</p>
                                <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(match.venueName || match.location)}</p>
                            </div>
                            <div class="payment-amount-section">
                                <div class="amount-label">Entry Fee</div>
                                <div class="amount-value">${formatCurrency(amount)}</div>
                                <div class="amount-note">Pay to confirm your spot in the match</div>
                            </div>
                            
                            <div class="upi-payment-options">
                                <p class="payment-info-text">Select UPI app to complete payment</p>
                                <div class="upi-apps-grid">
                                    <div class="upi-app" data-upi="phonepe@ybl">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/PhonePe_Logo.svg/1200px-PhonePe_Logo.svg.png" alt="PhonePe" class="upi-logo">
                                        <span>PhonePe</span>
                                    </div>
                                    <div class="upi-app" data-upi="okhdfcbank">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Google_Pay_Logo.svg/1200px-Google_Pay_Logo.svg.png" alt="Google Pay" class="upi-logo">
                                        <span>Google Pay</span>
                                    </div>
                                    <div class="upi-app" data-upi="paytm@paytm">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Paytm_Logo_%28standalone%29.svg/1200px-Paytm_Logo_%28standalone%29.svg.png" alt="Paytm" class="upi-logo">
                                        <span>Paytm</span>
                                    </div>
                                    <div class="upi-app" data-upi="okaxis">
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Amazon_Pay_Logo.svg/1200px-Amazon_Pay_Logo.svg.png" alt="Amazon Pay" class="upi-logo">
                                        <span>Amazon Pay</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="payment-note-box">
                                <i class="fas fa-shield-alt"></i>
                                <span>Payment is secure and processed through PhonePe</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-match-payment-modal').addEventListener('click', () => {
            closeModal('match-payment-modal');
        });
        
        document.querySelectorAll('#match-payment-modal .upi-app').forEach(app => {
            app.addEventListener('click', async function() {
                const upiId = this.dataset.upi;
                await processMatchPayment(matchId, match, amount, upiId);
            });
        });
    }
    
    modal = document.getElementById('match-payment-modal');
    if (modal) {
        modal.classList.add('active');
    }
}


// ==================== PROCESS MATCH PAYMENT ====================

// ==================== PROCESS MATCH PAYMENT (NO CLOUD FUNCTIONS) ====================

// ==================== PROCESS MATCH PAYMENT (NO CLOUD FUNCTIONS) ====================

// ==================== PROCESS MATCH PAYMENT WITH PHONEPE ====================

async function processMatchPayment(matchId, match, amount, upiApp) {
    if (!currentUser) {
        showToast('Please login to continue', 'warning');
        return;
    }
    
    showLoading('Initiating payment...');
    closeModal('match-payment-modal');
    
    try {
        // Get match details if not provided
        if (!match && matchId) {
            const matchDoc = await db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId).get();
            if (matchDoc.exists) {
                match = matchDoc.data();
            }
        }
        
        if (!match) {
            throw new Error('Match information not found');
        }
        
        // Generate unique transaction ID
        const transactionId = generateMatchTransactionId('MATCH_PAY');
        
        // Get user name
        let userName = '';
        if (currentUser.name) {
            userName = currentUser.name;
        } else if (currentUser.ownerName) {
            userName = currentUser.ownerName;
        } else if (currentUser.displayName) {
            userName = currentUser.displayName;
        } else {
            userName = currentUser.email?.split('@')[0] || 'Player';
        }
        
        // Store pending match payment in session storage
        const pendingPayment = {
            matchId: matchId,
            matchTitle: match.title,
            amount: amount,
            transactionId: transactionId,
            initiatedAt: new Date().toISOString(),
            upiApp: upiApp,
            userId: currentUser.uid,
            userName: userName,
            userEmail: currentUser.email,
            userPhone: currentUser.phone || ''
        };
        
        sessionStorage.setItem('pendingMatchPayment', JSON.stringify(pendingPayment));
        
        // Create payment record in Firestore
        const paymentRecord = {
            paymentId: transactionId,
            transactionId: transactionId,
            matchId: matchId,
            matchTitle: match.title,
            userId: currentUser.uid,
            userName: userName,
            userEmail: currentUser.email,
            userPhone: currentUser.phone || '',
            amount: amount,
            status: PAYMENT_STATUS.INITIATED,
            upiApp: upiApp,
            initiatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('match_payments').add(paymentRecord);
        
        // Create a pending participant record in the match
        const matchRef = db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId);
        const matchDoc = await matchRef.get();
        
        if (matchDoc.exists) {
            const matchData = matchDoc.data();
            const pendingParticipants = matchData.pendingParticipants || [];
            
            // Check if user already has a pending payment
            const existingPending = pendingParticipants.find(p => p.userId === currentUser.uid);
            if (!existingPending) {
                const newParticipant = {
                    userId: currentUser.uid,
                    userName: userName,
                    transactionId: transactionId,
                    amount: amount,
                    status: 'pending',
                    initiatedAt: new Date().toISOString()
                };
                
                await matchRef.update({
                    pendingParticipants: firebase.firestore.FieldValue.arrayUnion(newParticipant),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        hideLoading();
        
        // Initiate PhonePe payment
        await initiatePhonePeMatchPayment(matchId, match, amount, upiApp, transactionId, userName);
        
    } catch (error) {
        hideLoading();
        console.error('Match payment error:', error);
        showToast('Payment initiation failed: ' + error.message, 'error');
    }
}

// ==================== INITIATE PHONEPE MATCH PAYMENT ====================

async function initiatePhonePeMatchPayment(matchId, match, amount, upiApp, transactionId, userName) {
    showLoading('Redirecting to payment gateway...');
    
    try {
        // Map UPI app to PhonePe specific parameters
        let upiId = '';
        switch(upiApp) {
            case 'phonepe@ybl':
                upiId = 'bookmygame@phonepe';
                break;
            case 'okhdfcbank':
                upiId = 'bookmygame@okhdfcbank';
                break;
            case 'paytm@paytm':
                upiId = 'bookmygame@paytm';
                break;
            case 'okaxis':
                upiId = 'bookmygame@okaxis';
                break;
            default:
                upiId = 'bookmygame@okhdfcbank';
        }
        
        // PhonePe Test Merchant Credentials
        const merchantId = 'PGTESTPAYUAT';
        const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
        const saltIndex = 1;
        
        // Generate unique merchant transaction ID
        const merchantTransactionId = `MATCH_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        // Amount in paise
        const amountInPaise = Math.round(amount * 100);
        
        // Redirect URL after payment
        const redirectUrl = `${window.location.origin}/match-payment-callback.html?matchId=${matchId}&transactionId=${transactionId}`;
        
        // Create payload for PhonePe
        const payload = {
            merchantId: merchantId,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: currentUser.uid,
            amount: amountInPaise,
            redirectUrl: redirectUrl,
            redirectMode: 'REDIRECT',
            callbackUrl: `${window.location.origin}/match-payment-webhook.html`,
            mobileNumber: currentUser.phone || '9999999999',
            paymentInstrument: {
                type: 'PAY_PAGE'
            },
            deviceContext: {
                deviceOS: 'WEB'
            }
        };
        
        console.log('PhonePe Payload:', payload);
        
        // Encode payload to base64
        const payloadString = JSON.stringify(payload);
        const base64Payload = btoa(unescape(encodeURIComponent(payloadString)));
        
        // Create signature
        const endpoint = '/pg/v1/pay';
        const stringToSign = base64Payload + endpoint + saltKey;
        
        // Generate SHA256 hash
        const encoder = new TextEncoder();
        const data = encoder.encode(stringToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const signature = hashHex + '###' + saltIndex;
        
        // PhonePe API URL (UAT for testing, change to production URL when live)
        const apiUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';
        
        // Make API call to PhonePe
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': signature,
                'accept': 'application/json'
            },
            body: JSON.stringify({
                request: base64Payload
            })
        });
        
        const result = await response.json();
        console.log('PhonePe API Response:', result);
        
        if (result && result.success === true) {
            // Get payment URL from response
            const paymentUrl = result.data.instrumentResponse.redirectInfo.url;
            
            console.log('Payment URL received:', paymentUrl);
            
            // Store transaction details for verification
            sessionStorage.setItem('currentMatchTransaction', transactionId);
            sessionStorage.setItem('currentMatchId', matchId);
            
            // Update payment record with merchant transaction ID
            const paymentQuery = await db.collection('match_payments')
                .where('transactionId', '==', transactionId)
                .get();
            
            if (!paymentQuery.empty) {
                await paymentQuery.docs[0].ref.update({
                    merchantTransactionId: merchantTransactionId,
                    status: PAYMENT_STATUS.PENDING
                });
            }
            
            hideLoading();
            
            // Redirect to PhonePe payment page
            window.location.href = paymentUrl;
            
        } else {
            console.error('PhonePe API Error:', result);
            throw new Error(result.message || result.data?.message || 'Payment initiation failed');
        }
        
    } catch (error) {
        hideLoading();
        console.error('PhonePe Payment Error:', error);
        showToast('Payment initiation failed: ' + error.message, 'error');
        
        // Update payment record as failed
        const paymentQuery = await db.collection('match_payments')
            .where('transactionId', '==', transactionId)
            .get();
        
        if (!paymentQuery.empty) {
            await paymentQuery.docs[0].ref.update({
                status: PAYMENT_STATUS.FAILED,
                errorMessage: error.message
            });
        }
        
        // Remove pending participant
        const matchRef = db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId);
        const matchDoc = await matchRef.get();
        if (matchDoc.exists) {
            const matchData = matchDoc.data();
            const pendingParticipants = (matchData.pendingParticipants || []).filter(p => p.transactionId !== transactionId);
            await matchRef.update({
                pendingParticipants: pendingParticipants
            });
        }
    }
}

// ==================== MATCH PAYMENT CALLBACK HANDLER ====================

async function handleMatchPaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get('transactionId');
    const matchId = urlParams.get('matchId');
    const code = urlParams.get('code');
    
    if (!transactionId || !matchId) return;
    
    console.log('Match payment callback detected');
    console.log('Transaction ID:', transactionId);
    console.log('Match ID:', matchId);
    console.log('Code:', code);
    
    showLoading('Verifying payment...');
    
    try {
        // Verify payment with PhonePe
        const verificationResult = await verifyPhonePePaymentStatus(transactionId);
        
        if (verificationResult.success) {
            // Get the pending match payment from session storage
            const pendingPaymentStr = sessionStorage.getItem('pendingMatchPayment');
            
            if (!pendingPaymentStr) {
                throw new Error('Payment session not found');
            }
            
            const pendingPayment = JSON.parse(pendingPaymentStr);
            
            // Get match reference
            const matchRef = db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId);
            const matchDoc = await matchRef.get();
            
            if (!matchDoc.exists) {
                throw new Error('Match not found');
            }
            
            const match = matchDoc.data();
            const now = new Date();
            const matchDateTime = new Date(`${match.date}T${match.time || '00:00'}`);
            
            // Check if match is still open
            if (matchDateTime <= now) {
                throw new Error('This match has already started. Cannot join now.');
            }
            
            if (match.status !== MATCH_STATUS.OPEN) {
                throw new Error('This match is no longer available for joining.');
            }
            
            if (match.currentPlayers >= match.totalPlayers) {
                throw new Error('This match is already full.');
            }
            
            const participants = match.participants || [];
            if (participants.includes(currentUser.uid)) {
                throw new Error('You have already joined this match.');
            }
            
            const newCurrentPlayers = match.currentPlayers + 1;
            const newStatus = newCurrentPlayers >= match.totalPlayers ? MATCH_STATUS.FULL : MATCH_STATUS.OPEN;
            
            // Get user name
            let userName = '';
            if (currentUser.name) {
                userName = currentUser.name;
            } else if (currentUser.ownerName) {
                userName = currentUser.ownerName;
            } else if (currentUser.displayName) {
                userName = currentUser.displayName;
            } else {
                userName = currentUser.email?.split('@')[0] || 'Player';
            }
            
            const amount = pendingPayment.amount;
            
            // Create payment record
            const paymentRecord = {
                userId: currentUser.uid,
                userName: userName,
                amount: amount,
                status: MATCH_PAYMENT_STATUS.COMPLETED,
                paymentId: transactionId,
                transactionId: transactionId,
                paidAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            // Update match with new participant
            await matchRef.update({
                currentPlayers: newCurrentPlayers,
                participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
                participantPayments: firebase.firestore.FieldValue.arrayUnion(paymentRecord),
                totalAmountCollected: firebase.firestore.FieldValue.increment(amount),
                status: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Remove from pending participants
            const pendingParticipants = match.pendingParticipants || [];
            const updatedPending = pendingParticipants.filter(p => p.userId !== currentUser.uid);
            await matchRef.update({
                pendingParticipants: updatedPending
            });
            
            // Update payment record
            const paymentQuery = await db.collection('match_payments')
                .where('transactionId', '==', transactionId)
                .get();
            
            if (!paymentQuery.empty) {
                await paymentQuery.docs[0].ref.update({
                    status: PAYMENT_STATUS.SUCCESS,
                    verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    paymentStatus: 'success'
                });
            }
            
            hideLoading();
            showToast('Payment successful! You have joined the match.', 'success');
            
            // Clear session storage
            sessionStorage.removeItem('pendingMatchPayment');
            sessionStorage.removeItem('currentMatchTransaction');
            sessionStorage.removeItem('currentMatchId');
            
            // Show success modal
            showMatchJoinSuccessModal(match);
            
            // Refresh match listings
            if (document.getElementById('main-page') && document.getElementById('main-page').classList.contains('active')) {
                loadPlayerMatches();
            } else if (document.getElementById('all-matches-page') && document.getElementById('all-matches-page').classList.contains('active')) {
                displayAllMatches();
            }
            
        } else {
            hideLoading();
            showToast('Payment verification failed. Please contact support.', 'error');
            
            // Update payment record as failed
            const paymentQuery = await db.collection('match_payments')
                .where('transactionId', '==', transactionId)
                .get();
            
            if (!paymentQuery.empty) {
                await paymentQuery.docs[0].ref.update({
                    status: PAYMENT_STATUS.FAILED
                });
            }
        }
        
    } catch (error) {
        hideLoading();
        console.error('Payment verification error:', error);
        showToast('Error verifying payment: ' + error.message, 'error');
    }
}

// ==================== VERIFY PHONEPE PAYMENT STATUS ====================

async function verifyPhonePePaymentStatus(transactionId) {
    try {
        const merchantId = 'PGTESTPAYUAT';
        const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
        const saltIndex = 1;
        
        const endpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
        const stringToSign = endpoint + saltKey;
        
        const encoder = new TextEncoder();
        const data = encoder.encode(stringToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const signature = hashHex + '###' + saltIndex;
        
        const apiUrl = `https://api-preprod.phonepe.com/apis/pg-sandbox${endpoint}`;
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': signature,
                'X-MERCHANT-ID': merchantId
            }
        });
        
        const result = await response.json();
        console.log('Payment verification result:', result);
        
        return {
            success: result.code === 'PAYMENT_SUCCESS',
            data: result
        };
        
    } catch (error) {
        console.error('Payment verification error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}


// Generate transaction ID for match payments
function generateMatchTransactionId(prefix) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const randomStr = random.toString().padStart(6, '0');
    return `${prefix}_${timestamp}_${randomStr}`;
}

// Show payment instructions for match payment
function showMatchPaymentInstructions(matchId, match, amount, upiApp, transactionId) {
    // Get UPI app specific payment details
    let upiId = '';
    let appName = '';
    let appIcon = '';
    
    switch(upiApp) {
        case 'phonepe@ybl':
            upiId = 'bookmygame@phonepe';
            appName = 'PhonePe';
            appIcon = 'fas fa-mobile-alt';
            break;
        case 'okhdfcbank':
            upiId = 'bookmygame@okhdfcbank';
            appName = 'Google Pay';
            appIcon = 'fab fa-google';
            break;
        case 'paytm@paytm':
            upiId = 'bookmygame@paytm';
            appName = 'Paytm';
            appIcon = 'fab fa-paypal';
            break;
        case 'okaxis':
            upiId = 'bookmygame@okaxis';
            appName = 'Amazon Pay';
            appIcon = 'fab fa-amazon';
            break;
        default:
            upiId = 'bookmygame@okhdfcbank';
            appName = 'UPI';
            appIcon = 'fas fa-qrcode';
    }
    
    // Format date and time for display
    const matchDate = new Date(match.date);
    const formattedDate = matchDate.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
    
    // Create payment instructions modal
    let modal = document.getElementById('match-payment-instructions-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="match-payment-instructions-modal" class="modal">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-credit-card"></i> Complete Payment</h3>
                        <button class="close-btn" id="close-match-payment-instructions-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="payment-instructions-container">
                            <div class="payment-amount-highlight">
                                <span class="payment-label">Entry Fee</span>
                                <span class="payment-amount">${formatCurrency(amount)}</span>
                                <span class="payment-note">Pay to confirm your spot in the match</span>
                            </div>
                            
                            <div class="match-details-card">
                                <h4><i class="fas fa-info-circle"></i> Match Details</h4>
                                <p><strong>${escapeHtml(match.title || 'Match')}</strong></p>
                                <p><i class="fas fa-calendar"></i> ${formattedDate} at ${match.time}</p>
                                <p><i class="fas fa-map-marker-alt"></i> ${escapeHtml(match.venueName || match.location)}</p>
                            </div>
                            
                            <div class="payment-instructions-card">
                                <h4><i class="fas ${appIcon}"></i> Pay using ${appName}</h4>
                                <div class="instruction-step">
                                    <div class="step-number">1</div>
                                    <div class="step-text">Open ${appName} app on your phone</div>
                                </div>
                                <div class="instruction-step">
                                    <div class="step-number">2</div>
                                    <div class="step-text">Click on "Send Money" or "Pay"</div>
                                </div>
                                <div class="instruction-step">
                                    <div class="step-number">3</div>
                                    <div class="step-text">Enter UPI ID: <strong class="upi-id-highlight">${upiId}</strong></div>
                                </div>
                                <div class="instruction-step">
                                    <div class="step-number">4</div>
                                    <div class="step-text">Enter amount: <strong>${formatCurrency(amount)}</strong></div>
                                </div>
                                <div class="instruction-step">
                                    <div class="step-number">5</div>
                                    <div class="step-text">Add note: <strong>${transactionId}</strong></div>
                                </div>
                                <div class="instruction-step">
                                    <div class="step-number">6</div>
                                    <div class="step-text">Complete the payment</div>
                                </div>
                            </div>
                            
                            <div class="payment-instructions-card">
                                <h4><i class="fas fa-qrcode"></i> Scan QR Code</h4>
                                <div class="qr-code-container" id="match-payment-qr-container">
                                    <div class="qr-loading">Generating QR Code...</div>
                                </div>
                                <p class="qr-note">Scan this QR code with any UPI app to pay</p>
                            </div>
                            
                            <div class="payment-note-box">
                                <i class="fas fa-clock"></i>
                                <p>After payment, click "I've Completed Payment" below to verify your payment.</p>
                                <p class="small-note">Your spot will be reserved for 30 minutes. Please complete payment within this time.</p>
                            </div>
                            
                            <div class="payment-actions">
                                <button class="payment-verify-btn" id="verify-match-payment-btn">
                                    <i class="fas fa-check-circle"></i> I've Completed Payment
                                </button>
                                <button class="payment-cancel-btn" id="cancel-match-payment-btn">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-match-payment-instructions-modal').addEventListener('click', () => {
            closeModal('match-payment-instructions-modal');
            // Clear pending payment
            sessionStorage.removeItem('pendingMatchPayment');
        });
        
        document.getElementById('cancel-match-payment-btn').addEventListener('click', () => {
            closeModal('match-payment-instructions-modal');
            sessionStorage.removeItem('pendingMatchPayment');
        });
        
        document.getElementById('verify-match-payment-btn').addEventListener('click', async () => {
            await verifyMatchPaymentManually(matchId, transactionId, amount);
        });
    }
    
    // Generate QR code for UPI payment
    const upiUrl = `upi://pay?pa=${upiId}&pn=BookMyGame&am=${amount}&tn=${transactionId}&cu=INR`;
    
    // Generate QR code
    setTimeout(async () => {
        try {
            const qrContainer = document.getElementById('match-payment-qr-container');
            if (qrContainer && typeof QRCode !== 'undefined') {
                qrContainer.innerHTML = '';
                const qrCode = new QRCode(qrContainer, {
                    text: upiUrl,
                    width: 200,
                    height: 200,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            } else if (qrContainer) {
                qrContainer.innerHTML = '<p class="qr-error">QR code not available. Please use UPI ID below.</p>';
            }
        } catch (error) {
            console.error('QR generation error:', error);
            const qrContainer = document.getElementById('match-payment-qr-container');
            if (qrContainer) {
                qrContainer.innerHTML = '<p class="qr-error">Could not generate QR code. Please use UPI ID below.</p>';
            }
        }
    }, 100);
    
    const modalEl = document.getElementById('match-payment-instructions-modal');
    modalEl.classList.add('active');
}

// Manual payment verification for match payments
async function verifyMatchPaymentManually(matchId, transactionId, amount) {
    // Show confirmation modal
    let confirmModal = document.getElementById('match-payment-confirmation-modal');
    
    if (!confirmModal) {
        const modalHtml = `
            <div id="match-payment-confirmation-modal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-question-circle"></i> Confirm Payment</h3>
                        <button class="close-btn" id="close-match-confirmation-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="confirmation-content">
                            <p>Have you completed the payment of <strong>${formatCurrency(amount)}</strong>?</p>
                            <p class="confirmation-note">Please make sure the payment was successful before confirming.</p>
                            <div class="payment-actions" style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
                                <button class="auth-btn" id="confirm-match-payment-yes" style="margin: 0;">Yes, I've Paid</button>
                                <button class="home-btn" id="confirm-match-payment-no" style="margin: 0;">Not Yet</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-match-confirmation-modal').addEventListener('click', () => {
            closeModal('match-payment-confirmation-modal');
        });
    }
    
    const modal = document.getElementById('match-payment-confirmation-modal');
    modal.classList.add('active');
    
    document.getElementById('confirm-match-payment-yes').onclick = async () => {
        closeModal('match-payment-confirmation-modal');
        showLoading('Verifying payment...');
        
        try {
            // Get the pending match payment from session storage
            const pendingPaymentStr = sessionStorage.getItem('pendingMatchPayment');
            
            if (!pendingPaymentStr) {
                throw new Error('Payment session not found. Please try again.');
            }
            
            const pendingPayment = JSON.parse(pendingPaymentStr);
            
            // Get match reference
            const matchRef = db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId);
            const matchDoc = await matchRef.get();
            
            if (!matchDoc.exists) {
                throw new Error('Match not found');
            }
            
            const match = matchDoc.data();
            
            // Check if match is still open
            const now = new Date();
            const matchDateTime = new Date(`${match.date}T${match.time || '00:00'}`);
            
            if (matchDateTime <= now) {
                throw new Error('This match has already started. Cannot join now.');
            }
            
            if (match.status !== MATCH_STATUS.OPEN) {
                throw new Error('This match is no longer available for joining.');
            }
            
            if (match.currentPlayers >= match.totalPlayers) {
                throw new Error('This match is already full.');
            }
            
            const participants = match.participants || [];
            if (participants.includes(currentUser.uid)) {
                throw new Error('You have already joined this match.');
            }
            
            const newCurrentPlayers = match.currentPlayers + 1;
            const newStatus = newCurrentPlayers >= match.totalPlayers ? MATCH_STATUS.FULL : MATCH_STATUS.OPEN;
            
            // Get user name
            let userName = '';
            if (currentUser.name) {
                userName = currentUser.name;
            } else if (currentUser.ownerName) {
                userName = currentUser.ownerName;
            } else if (currentUser.displayName) {
                userName = currentUser.displayName;
            } else {
                userName = currentUser.email?.split('@')[0] || 'Player';
            }
            
            // Create payment record - use regular Date object instead of serverTimestamp
            const paymentRecord = {
                userId: currentUser.uid,
                userName: userName,
                amount: amount,
                status: MATCH_PAYMENT_STATUS.COMPLETED,
                paymentId: transactionId,
                transactionId: transactionId,
                paidAt: new Date().toISOString()
            };
            
            // Update match with new participant
            await matchRef.update({
                currentPlayers: newCurrentPlayers,
                participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
                participantPayments: firebase.firestore.FieldValue.arrayUnion(paymentRecord),
                totalAmountCollected: firebase.firestore.FieldValue.increment(amount),
                status: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Remove from pending participants if exists
            const pendingParticipants = match.pendingParticipants || [];
            const updatedPending = pendingParticipants.filter(p => p.userId !== currentUser.uid);
            
            if (updatedPending.length !== pendingParticipants.length) {
                await matchRef.update({
                    pendingParticipants: updatedPending
                });
            }
            
            // Update payment record in Firestore
            const paymentQuery = await db.collection('match_payments')
                .where('transactionId', '==', transactionId)
                .get();
            
            if (!paymentQuery.empty) {
                await paymentQuery.docs[0].ref.update({
                    status: PAYMENT_STATUS.SUCCESS,
                    verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    verifiedBy: currentUser.uid
                });
            }
            
            hideLoading();
            showToast('Payment successful! You have joined the match.', 'success');
            
            // Close payment instructions modal
            closeModal('match-payment-instructions-modal');
            
            // Clear session storage
            sessionStorage.removeItem('pendingMatchPayment');
            
            // Show success modal
            showMatchJoinSuccessModal(match);
            
            // Refresh match listings
            if (document.getElementById('main-page') && document.getElementById('main-page').classList.contains('active')) {
                loadPlayerMatches();
            } else if (document.getElementById('all-matches-page') && document.getElementById('all-matches-page').classList.contains('active')) {
                displayAllMatches();
            }
            
        } catch (error) {
            hideLoading();
            console.error('Payment verification error:', error);
            showToast('Error verifying payment: ' + error.message, 'error');
        }
    };
    
    document.getElementById('confirm-match-payment-no').onclick = () => {
        closeModal('match-payment-confirmation-modal');
    };
}

// Show match join success modal
function showMatchJoinSuccessModal(match) {
    let modal = document.getElementById('match-success-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="match-success-modal" class="modal">
                <div class="modal-content" style="max-width: 350px; text-align: center;">
                    <div class="modal-header">
                        <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> Successfully Joined!</h3>
                        <button class="close-btn" id="close-match-success-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="success-icon">
                            <i class="fas fa-futbol"></i>
                        </div>
                        <h4>You've joined ${escapeHtml(match.title || 'the match')}</h4>
                        <p><strong>Date:</strong> ${match.date} at ${match.time}</p>
                        <p><strong>Venue:</strong> ${escapeHtml(match.venueName || match.location)}</p>
                        <p><strong>Players:</strong> ${match.currentPlayers + 1}/${match.totalPlayers}</p>
                        <div class="match-details-info" style="background: var(--primary-50); padding: var(--space-md); border-radius: var(--radius); margin: var(--space-lg) 0;">
                            <p><i class="fas fa-info-circle"></i> Check the match details in your bookings section</p>
                        </div>
                        <div class="success-actions">
                            <button class="auth-btn" onclick="goHome()" style="margin-right: var(--space-sm);">Go Home</button>
                            <button class="home-btn" onclick="closeModal('match-success-modal')">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('close-match-success-modal').addEventListener('click', () => {
            closeModal('match-success-modal');
        });
    }
    
    document.getElementById('match-success-modal').classList.add('active');
}
// ==================== HANDLE MATCH PAYMENT CALLBACK ====================

async function handleMatchPaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get('transactionId');
    const code = urlParams.get('code');
    const matchId = urlParams.get('matchId');
    
    if (!transactionId || !matchId) return;
    
    showLoading('Verifying payment...');
    
    try {
        const verifyMatchPayment = functions.httpsCallable('verifyMatchPayment');
        const result = await verifyMatchPayment({ 
            transactionId, 
            code,
            matchId: matchId
        });
        
        if (result.data.success) {
            const matchRef = db.collection(COLLECTIONS.PLAYER_MATCHES).doc(matchId);
            const matchDoc = await matchRef.get();
            
            if (!matchDoc.exists) {
                throw new Error('Match not found');
            }
            
            const match = matchDoc.data();
            const newCurrentPlayers = match.currentPlayers + 1;
            const newStatus = newCurrentPlayers >= match.totalPlayers ? MATCH_STATUS.FULL : MATCH_STATUS.OPEN;
            
            const paymentRecord = {
                userId: currentUser.uid,
                userName: currentUser.name || 'Player',
                amount: result.data.amount,
                status: MATCH_PAYMENT_STATUS.COMPLETED,
                paymentId: result.data.paymentId,
                transactionId: transactionId,
                paidAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await matchRef.update({
                currentPlayers: newCurrentPlayers,
                participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
                participantPayments: firebase.firestore.FieldValue.arrayUnion(paymentRecord),
                totalAmountCollected: firebase.firestore.FieldValue.increment(result.data.amount),
                status: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            hideLoading();
            showToast('Payment successful! You have joined the match.', 'success');
            sessionStorage.removeItem('pendingMatchPayment');
            
            if (document.getElementById('main-page') && document.getElementById('main-page').classList.contains('active')) {
                loadPlayerMatches();
            } else if (document.getElementById('all-matches-page') && document.getElementById('all-matches-page').classList.contains('active')) {
                displayAllMatches();
            }
            
            showMatchJoinSuccess(match);
            
        } else {
            throw new Error(result.data.message || 'Payment verification failed');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Payment verification error:', error);
        showToast('Payment verification failed: ' + error.message, 'error');
    }
}

// ==================== SHOW MATCH JOIN SUCCESS ====================

function showMatchJoinSuccess(match) {
    const modal = document.getElementById('match-success-modal');
    if (!modal) {
        const modalHtml = `
            <div id="match-success-modal" class="modal">
                <div class="modal-content" style="max-width: 350px; text-align: center;">
                    <div class="modal-header">
                        <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> Successfully Joined!</h3>
                        <button class="close-btn" id="close-match-success-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="success-icon">
                            <i class="fas fa-futbol"></i>
                        </div>
                        <h4>You've joined ${escapeHtml(match.title || 'the match')}</h4>
                        <p>Date: ${match.date} at ${match.time}</p>
                        <p>Venue: ${escapeHtml(match.venueName || match.location)}</p>
                        <div class="success-actions">
                            <button class="auth-btn" onclick="goHome()">Go to Home</button>
                            <button class="home-btn" onclick="closeModal('match-success-modal')">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('close-match-success-modal').addEventListener('click', () => {
            closeModal('match-success-modal');
        });
    }
    
    document.getElementById('match-success-modal').classList.add('active');
}

// ==================== VENUES ====================

async function loadNearbyVenues() {
    const container = document.getElementById('nearby-venues');
    
    try {
        let query = db.collection(COLLECTIONS.VENUES).where('hidden', '==', false);
        const snapshot = await query.limit(10).get();
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center" style="color: var(--gray-500); padding: 20px;">No venues found nearby</p>';
            return;
        }
        
        let venues = [];
        snapshot.forEach(doc => {
            venues.push({ id: doc.id, ...doc.data() });
        });
        
        if (userLocation) {
            venues = venues.map(venue => {
                if (venue.location) {
                    const dist = calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        venue.location.latitude,
                        venue.location.longitude
                    );
                    return { ...venue, distance: dist };
                }
                return { ...venue, distance: Infinity };
            }).sort((a, b) => a.distance - b.distance);
            
            venues = venues.filter(venue => venue.distance <= 50);
        }
        
        if (venues.length === 0) {
            container.innerHTML = '<p class="text-center" style="color: var(--gray-500); padding: 20px;">No venues found in your area</p>';
            return;
        }
        
        container.innerHTML = venues.map(venue => {
            let distanceText = '';
            if (venue.distance && venue.distance !== Infinity) {
                distanceText = `${venue.distance.toFixed(1)} km away`;
            }
            
            const verifiedBadge = venue.isVerified ? 
                '<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' : '';
            
            return `
                <div class="venue-card" data-venue-id="${venue.id}">
                    <img src="${venue.images?.[0] || 'https://via.placeholder.com/120'}" 
                         alt="${venue.venueName}" 
                         class="venue-image"
                         onerror="this.src='https://via.placeholder.com/120'">
                    <div class="venue-info">
                        <h3>${venue.venueName} ${verifiedBadge}</h3>
                        <div class="venue-sport">${venue.sportType}</div>
                        <div class="venue-rating">
                            <i class="fas fa-star"></i> ${(venue.rating || 0).toFixed(1)}
                        </div>
                        <div class="venue-distance">
                            <i class="fas fa-map-marker-alt"></i> ${distanceText || 'Distance unavailable'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('.venue-card').forEach(card => {
            card.addEventListener('click', () => {
                viewVenue(card.dataset.venueId);
            });
        });
    } catch (error) {
        console.error('Error loading venues:', error);
        container.innerHTML = '<p class="text-center" style="color: var(--danger);">Failed to load venues</p>';
    }
}

async function viewVenue(venueId) {
    showLoading('Loading venue details...');
    
    try {
        const venueDoc = await db.collection(COLLECTIONS.VENUES).doc(venueId).get();
        
        if (!venueDoc.exists) {
            showToast('Venue not found', 'error');
            return;
        }
        
        currentVenue = { id: venueDoc.id, ...venueDoc.data() };
        
        document.getElementById('venue-name').textContent = currentVenue.venueName;
        document.getElementById('venue-rating').textContent = (currentVenue.rating || 0).toFixed(1);
        document.getElementById('reviews-count').textContent = `(${currentVenue.totalReviews || 0} reviews)`;
        document.getElementById('venue-address').textContent = currentVenue.address;
        document.getElementById('venue-description').textContent = currentVenue.description || 'No description available';
        
        if (currentVenue.isVerified) {
            document.getElementById('venue-verified-badge').style.display = 'inline';
        } else {
            document.getElementById('venue-verified-badge').style.display = 'none';
        }
        
        if (currentVenue.location) {
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${currentVenue.location.latitude},${currentVenue.location.longitude}`;
            document.getElementById('open-maps').href = mapsUrl;
        }
        
        const gallery = document.getElementById('venue-gallery');
        const dots = document.getElementById('gallery-dots');
        
        if (currentVenue.images && currentVenue.images.length > 0) {
            gallery.innerHTML = currentVenue.images.map(img => 
                `<img src="${img}" alt="${currentVenue.venueName}" onerror="this.src='https://via.placeholder.com/400x200'">`
            ).join('');
            
            dots.innerHTML = currentVenue.images.map((_, i) => 
                `<span class="gallery-dot ${i === 0 ? 'active' : ''}"></span>`
            ).join('');
            
            let currentIndex = 0;
            const interval = setInterval(() => {
                if (!document.getElementById('venue-page').classList.contains('active')) {
                    clearInterval(interval);
                    return;
                }
                currentIndex = (currentIndex + 1) % currentVenue.images.length;
                gallery.style.transform = `translateX(-${currentIndex * 100}%)`;
                document.querySelectorAll('.gallery-dot').forEach((dot, i) => {
                    dot.classList.toggle('active', i === currentIndex);
                });
            }, 3000);
        } else {
            gallery.innerHTML = '<img src="https://via.placeholder.com/400x200" alt="No Image">';
            dots.innerHTML = '<span class="gallery-dot active"></span>';
        }
        
        await loadGrounds(venueId);
        
        hideLoading();
        showPage('venue-page');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function loadGrounds(venueId) {
    const container = document.getElementById('grounds-list');
    
    if (!container) {
        console.error('Grounds list container not found');
        return;
    }
    
    try {
        if (!currentVenue) {
            container.innerHTML = '<p class="text-center">Venue information not available</p>';
            return;
        }
        
        const snapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', currentVenue.ownerId)
            .where('status', '==', 'active')
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center">No grounds available at this venue</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const ground = doc.data();
            const verifiedBadge = ground.isVerified ? 
                '<span class="verified-badge"><i class="fas fa-check-circle"></i></span>' : '';
            
            html += `
                <div class="ground-card" data-ground-id="${doc.id}">
                    <div class="ground-card-header">
                        <span class="ground-name">${ground.groundName || 'Unnamed Ground'} ${verifiedBadge}</span>
                        <span class="ground-price">${formatCurrency(ground.pricePerHour || 0)}/hr</span>
                    </div>
                    <div class="ground-sport">${ground.sportType || 'Multi-sport'}</div>
                    ${ground.groundAddress ? `<div class="ground-address-small">${ground.groundAddress}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = html;
        
        document.querySelectorAll('.ground-card').forEach(card => {
            card.addEventListener('click', () => {
                viewGround(card.dataset.groundId);
            });
        });
    } catch (error) {
        console.error('Error loading grounds:', error);
        container.innerHTML = '<p class="text-center">Failed to load grounds</p>';
    }
}

async function viewGround(groundId) {
    showLoading('Loading ground details...');
    
    try {
        const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(groundId).get();
        
        if (!groundDoc.exists) {
            showToast('Ground not found', 'error');
            hideLoading();
            return;
        }
        
        currentGround = { id: groundDoc.id, ...groundDoc.data() };
        
        // Store ground in session storage for recovery
        sessionStorage.setItem('currentGround', JSON.stringify(currentGround));
        
        const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
            .where('ownerId', '==', currentGround.ownerId)
            .get();
        
        let groundAddress = '';
        let ownerInfo = '';
        let ownerVerified = false;
        
        if (!venueSnapshot.empty) {
            const venue = venueSnapshot.docs[0].data();
            currentVenue = { id: venueSnapshot.docs[0].id, ...venue };
            sessionStorage.setItem('currentVenue', JSON.stringify(currentVenue));
            groundAddress = venue.address;
            if (currentGround.groundAddress) {
                groundAddress += ' - ' + currentGround.groundAddress;
            }
            
            const ownerDoc = await db.collection(COLLECTIONS.OWNERS).doc(currentGround.ownerId).get();
            if (ownerDoc.exists) {
                const owner = ownerDoc.data();
                ownerVerified = owner.isVerified || false;
                ownerInfo = `
                    <i class="fas fa-user"></i>
                    <span>Owner: ${owner.ownerName || 'Unknown'} | Phone: ${owner.phone || 'Not available'}</span>
                `;
            }
        } else {
            currentVenue = null;
            sessionStorage.removeItem('currentVenue');
        }
        
        const groundNameEl = document.getElementById('ground-name');
        const groundPriceEl = document.getElementById('ground-price');
        const groundSportEl = document.getElementById('ground-sport');
        const groundAddressEl = document.getElementById('ground-address');
        const groundOwnerContactEl = document.getElementById('ground-owner-contact');
        const ownerVerifiedEl = document.getElementById('owner-verified-badge');
        
        if (!groundNameEl || !groundPriceEl || !groundSportEl || !groundAddressEl || !groundOwnerContactEl) {
            console.error('Ground page elements not found');
            showToast('Error loading ground page - elements missing', 'error');
            hideLoading();
            return;
        }
        
        groundNameEl.textContent = currentGround.groundName || 'Unknown Ground';
        groundPriceEl.textContent = formatCurrency(currentGround.pricePerHour) + '/hour';
        groundSportEl.textContent = currentGround.sportType || 'Multi-sport';
        groundAddressEl.innerHTML = `
            <i class="fas fa-map-pin"></i>
            <span>${groundAddress || 'Address not available'}</span>
        `;
        groundOwnerContactEl.innerHTML = ownerInfo || '<i class="fas fa-user"></i><span>Owner information not available</span>';
        
        if (ownerVerifiedEl) {
            ownerVerifiedEl.style.display = ownerVerified ? 'flex' : 'none';
        }
        
        if (currentUser) {
            document.getElementById('sticky-book-btn').style.display = 'block';
        }
        
        loadDateSelector();
        await loadSlots(groundId, selectedDate);
        await loadGroundReviews(groundId);
        
        hideLoading();
        showPage('ground-page');
    } catch (error) {
        hideLoading();
        console.error('Error loading ground:', error);
        showToast('Error loading ground details: ' + error.message, 'error');
    }
}
function clearBookingSession() {
    sessionStorage.removeItem('currentGround');
    sessionStorage.removeItem('currentVenue');
    sessionStorage.removeItem('selectedDate');
    sessionStorage.removeItem('selectedSlot');
    sessionStorage.removeItem('pendingBooking');
}

document.getElementById('sticky-book-now')?.addEventListener('click', () => {
    if (!selectedSlot) {
        showToast('Please select a time slot first', 'warning');
        return;
    }
    selectSlot(selectedSlot);
});

function loadDateSelector() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        dates.push({
            day: days[date.getDay()],
            date: date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' }),
            value: dateStr
        });
    }
    
    const selector = document.getElementById('date-selector');
    selector.innerHTML = dates.map((d, index) => `
        <div class="date-chip ${index === 0 ? 'active' : ''}" data-date="${d.value}">
            <span class="day">${d.day}</span>
            <span class="date">${d.date}</span>
        </div>
    `).join('');
    
    document.querySelectorAll('.date-chip').forEach(chip => {
        chip.addEventListener('click', async function() {
            document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            selectedDate = this.dataset.date;
            await loadSlots(currentGround.id, selectedDate);
        });
    });
}

// Modified loadSlots function with 24-hour time slots (keeping original look)
async function loadSlots(groundId, date) {
    const container = document.getElementById('time-slots');
    
    if (!container) {
        console.error('Time slots container not found');
        return;
    }
    
    try {
        const snapshot = await db.collection(COLLECTIONS.SLOTS)
            .where('groundId', '==', groundId)
            .where('date', '==', date)
            .get();
        
        // Create 24-hour slots (00:00 to 23:00, hourly slots)
        const defaultSlots = [];
        for (let hour = 0; hour < 24; hour++) {
            const startHour = hour.toString().padStart(2, '0');
            const endHour = (hour + 1).toString().padStart(2, '0');
            defaultSlots.push(`${startHour}:00-${endHour}:00`);
        }
        
        let slotStatus = {};
        snapshot.forEach(doc => {
            const slot = doc.data();
            slotStatus[slot.startTime + '-' + slot.endTime] = slot.status;
        });
        
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const today = new Date().toISOString().split('T')[0];
        
        let slotsHtml = '';
        
        defaultSlots.forEach(slot => {
            const status = slotStatus[slot] || SLOT_STATUS.AVAILABLE;
            let statusClass = '';
            let isDisabled = false;
            
            // Parse slot time for checking if it's in the past
            const [startHour, startMinute] = slot.split('-')[0].split(':').map(Number);
            const slotStartTime = startHour * 60 + (startMinute || 0);
            
            if (date === today && slotStartTime <= currentTime) {
                statusClass = 'closed';
                isDisabled = true;
            }
            
            if (!isDisabled) {
                if (status === SLOT_STATUS.AVAILABLE) statusClass = 'available';
                else if (status === SLOT_STATUS.CONFIRMED) statusClass = 'booked';
                else if (status === SLOT_STATUS.CLOSED) statusClass = 'closed';
                else if (status === SLOT_STATUS.PENDING) statusClass = 'pending';
            }
            
            slotsHtml += `
                <div class="time-slot ${statusClass}" 
                     data-slot="${slot}" 
                     data-status="${isDisabled ? 'closed' : status}"
                     ${statusClass === 'available' && !isDisabled ? 'data-available="true"' : ''}>
                    ${slot}
                </div>
            `;
        });
        
        container.innerHTML = slotsHtml;
        
        document.querySelectorAll('.time-slot.available').forEach(slot => {
            if (slot.dataset.available === 'true') {
                slot.addEventListener('click', function() {
                    selectSlot(this.dataset.slot);
                });
            } else {
                slot.classList.remove('available');
                slot.classList.add('closed');
            }
        });
        
    } catch (error) {
        console.error('Error loading slots:', error);
        container.innerHTML = '<p class="text-center">Failed to load slots</p>';
    }
}
// ==================== BOOKING FUNCTIONS ====================

function selectSlot(slot) {
    if (!currentUser) {
        showToast('Please login to book', 'warning');
        return;
    }
    
    if (!currentGround) {
        showToast('Ground information not found. Please go back and select a ground again.', 'error');
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    if (selectedDate === today) {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startHour, startMinute] = slot.split('-')[0].split(':').map(Number);
        const slotStartTime = startHour * 60 + startMinute;
        
        if (slotStartTime <= currentTime) {
            showToast('This time slot has already passed', 'error');
            loadSlots(currentGround.id, selectedDate);
            return;
        }
    }
    
    selectedSlot = slot;
    
    const groundNameEl = document.getElementById('booking-ground-name');
    const dateEl = document.getElementById('booking-date');
    const timeEl = document.getElementById('booking-time');
    const amountEl = document.getElementById('booking-amount');
    const paymentAmountEl = document.getElementById('payment-amount');
    const platformFeeEl = document.getElementById('platform-fee');
    const finalAmountEl = document.getElementById('final-amount');
    
    if (!groundNameEl || !dateEl || !timeEl || !amountEl || !paymentAmountEl) {
        console.error('Booking page elements not found');
        showToast('Error loading booking page', 'error');
        return;
    }
    
    const amount = currentGround.pricePerHour;
    const platformFee = amount * COMMISSION_RATE;
    const finalAmount = amount; // User pays full amount
    
    groundNameEl.textContent = currentGround.groundName || 'Unknown Ground';
    dateEl.textContent = selectedDate;
    timeEl.textContent = slot;
    amountEl.textContent = formatCurrency(amount);
    paymentAmountEl.textContent = formatCurrency(amount);
    
    if (platformFeeEl) platformFeeEl.textContent = formatCurrency(platformFee);
    if (finalAmountEl) finalAmountEl.textContent = formatCurrency(finalAmount);
    
    // Store current ground and venue in session storage for backup
    if (currentGround) {
        sessionStorage.setItem('currentGround', JSON.stringify(currentGround));
    }
    if (currentVenue) {
        sessionStorage.setItem('currentVenue', JSON.stringify(currentVenue));
    }
    sessionStorage.setItem('selectedDate', selectedDate);
    sessionStorage.setItem('selectedSlot', selectedSlot);
    
    showPage('booking-page');
}
async function checkSlotAvailability(groundId, date, startTime, endTime) {
    try {
        const snapshot = await db.collection(COLLECTIONS.SLOTS)
            .where('groundId', '==', groundId)
            .where('date', '==', date)
            .where('startTime', '==', startTime)
            .where('endTime', '==', endTime)
            .get();
        
        if (snapshot.empty) {
            return true;
        }
        
        const slot = snapshot.docs[0].data();
        return slot.status === SLOT_STATUS.AVAILABLE;
        
    } catch (error) {
        console.error('Error checking slot availability:', error);
        return false;
    }
}

// ==================== PAYMENT FUNCTIONS ====================

function handleUPIPayment(upiApp) {
    if (!currentUser) {
        showToast('Please login to continue', 'warning');
        return;
    }
    
    if (!currentGround || !currentVenue) {
        showToast('Booking information missing', 'error');
        return;
    }
    
    if (!selectedSlot) {
        showToast('Please select a time slot first', 'error');
        return;
    }
    
    const [startTime, endTime] = selectedSlot.split('-');
    checkSlotAvailability(currentGround.id, selectedDate, startTime, endTime).then(isAvailable => {
        if (!isAvailable) {
            showToast('This slot is no longer available. Please select another slot.', 'error');
            loadSlots(currentGround.id, selectedDate);
            return;
        }
        
        const venueAddress = currentVenue ? currentVenue.address : '';
        const groundAddress = currentGround.groundAddress || '';
        const fullAddress = groundAddress ? `${venueAddress} - ${groundAddress}` : venueAddress;
        
        // Check for first booking offer
        let amount = currentGround.pricePerHour;
        const hasFirstBookingOffer = localStorage.getItem('firstBookingOffer_' + currentUser.uid) === 'true' ? false : true;
        
        if (hasFirstBookingOffer) {
            amount = amount * 0.8; // 20% off
        }
        
        const bookingDetails = {
            bookingId: generateId('BKG'),
            userId: currentUser.uid,
            userName: currentUser.name || 'User',
            userEmail: currentUser.email,
            userPhone: currentUser.phone,
            ownerId: currentGround.ownerId,
            groundId: currentGround.id,
            groundName: currentGround.groundName,
            venueName: currentVenue.venueName || 'Unknown Venue',
            venueAddress: venueAddress,
            groundAddress: fullAddress,
            slotTime: selectedSlot,
            date: selectedDate,
            amount: amount,
            originalAmount: currentGround.pricePerHour,
            commission: amount * COMMISSION_RATE,
            ownerAmount: amount * (1 - COMMISSION_RATE),
            sportType: currentGround.sportType,
            appliedOffer: hasFirstBookingOffer ? 'FIRST20' : null
        };
        
        initiatePhonePePayment(bookingDetails);
    });
}

// Add this function to app.js
// ==================== PHONEPE PAYMENT INTEGRATION ====================

/**
 * Initiate PhonePe Payment for Ground Booking
 * @param {Object} bookingDetails - Contains all booking information
 */
async function initiatePhonePePayment(bookingDetails) {
    console.log('=== Initiating PhonePe Payment ===');
    console.log('Booking Details:', bookingDetails);
    
    // Show loading overlay
    showLoading('Initiating payment...');
    
    try {
        // Validate required fields
        if (!bookingDetails) {
            throw new Error('Booking details are missing');
        }
        
        if (!bookingDetails.amount || bookingDetails.amount <= 0) {
            throw new Error('Invalid amount: ' + bookingDetails.amount);
        }
        
        if (!currentUser || !currentUser.uid) {
            throw new Error('User not logged in');
        }
        
        if (!bookingDetails.bookingId) {
            throw new Error('Booking ID is missing');
        }
        
        console.log('Validation passed. Amount: ₹' + bookingDetails.amount);
        
        // Store booking details in session storage for callback
        sessionStorage.setItem('pendingBooking', JSON.stringify({
            bookingId: bookingDetails.bookingId,
            groundId: bookingDetails.groundId,
            date: bookingDetails.date,
            slotTime: bookingDetails.slotTime,
            amount: bookingDetails.amount,
            initiatedAt: new Date().toISOString()
        }));
        
        // ========== OPTION 1: Using Firebase Cloud Functions ==========
        // If your Firebase Functions are deployed, use this:
        
        /*
        const initiatePayment = firebase.functions().httpsCallable('initiateBookingPayment');
        
        const result = await initiatePayment({
            bookingId: bookingDetails.bookingId,
            userId: currentUser.uid,
            userName: currentUser.name || currentUser.displayName || 'User',
            userEmail: currentUser.email,
            userPhone: currentUser.phone || '',
            ownerId: bookingDetails.ownerId,
            groundId: bookingDetails.groundId,
            groundName: bookingDetails.groundName,
            venueName: bookingDetails.venueName,
            slotTime: bookingDetails.slotTime,
            date: bookingDetails.date,
            amount: bookingDetails.amount
        });
        
        if (result.data.success) {
            console.log('Payment initiated successfully');
            console.log('Payment URL:', result.data.paymentUrl);
            
            // Store transaction details
            sessionStorage.setItem('currentTransaction', result.data.transactionId);
            
            // Redirect to PhonePe payment page
            window.location.href = result.data.paymentUrl;
        } else {
            throw new Error(result.data.message || 'Payment initiation failed');
        }
        */
        
        // ========== OPTION 2: Direct PhonePe API Call (No Cloud Functions) ==========
        // Use this if you want to call PhonePe directly from frontend
        
        const merchantId = 'PGTESTPAYUAT'; // Test merchant ID
        const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
        const saltIndex = 1;
        
        // Generate unique transaction ID
        const transactionId = generateTransactionId('TXN');
        const amountInPaise = Math.round(bookingDetails.amount * 100);
        
        console.log('Generated Transaction ID:', transactionId);
        
        // Create payload for PhonePe
        const payload = {
            merchantId: merchantId,
            merchantTransactionId: transactionId,
            merchantUserId: currentUser.uid,
            amount: amountInPaise,
            redirectUrl: `${window.location.origin}/payment-callback.html`,
            redirectMode: 'REDIRECT',
            callbackUrl: `${window.location.origin}/payment-webhook.html`,
            mobileNumber: currentUser.phone || '9999999999',
            paymentInstrument: {
                type: 'PAY_PAGE'
            }
        };
        
        console.log('PhonePe Payload:', payload);
        
        // Encode payload to base64
        const payloadString = JSON.stringify(payload);
        const base64Payload = btoa(unescape(encodeURIComponent(payloadString)));
        
        // Create signature
        const endpoint = '/pg/v1/pay';
        const stringToSign = base64Payload + endpoint + saltKey;
        
        // Generate SHA256 hash
        const encoder = new TextEncoder();
        const data = encoder.encode(stringToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const signature = hashHex + '###' + saltIndex;
        
        console.log('Signature created');
        
        // Determine API URL (UAT for testing)
        const apiUrl = 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay';
        
        // Make API call to PhonePe
        console.log('Calling PhonePe API...');
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': signature,
                'accept': 'application/json'
            },
            body: JSON.stringify({
                request: base64Payload
            })
        });
        
        const result = await response.json();
        console.log('PhonePe API Response:', result);
        
        if (result && result.success === true) {
            // Get payment URL from response
            const paymentUrl = result.data.instrumentResponse.redirectInfo.url;
            
            console.log('Payment URL received:', paymentUrl);
            
            // Store transaction details for verification
            sessionStorage.setItem('currentTransaction', transactionId);
            sessionStorage.setItem('currentBookingDetails', JSON.stringify(bookingDetails));
            
            // Create a pending slot in Firestore
            await createPendingSlot(bookingDetails, transactionId);
            
            // Create payment record in Firestore
            await createPaymentRecord({
                transactionId: transactionId,
                bookingId: bookingDetails.bookingId,
                userId: currentUser.uid,
                amount: bookingDetails.amount,
                status: 'initiated'
            });
            
            hideLoading();
            showToast('Redirecting to payment...', 'info');
            
            // Redirect to PhonePe payment page
            window.location.href = paymentUrl;
            
        } else {
            console.error('PhonePe API Error:', result);
            throw new Error(result.message || result.data?.message || 'Payment initiation failed');
        }
        
    } catch (error) {
        console.error('Payment Initiation Error:', error);
        console.error('Error Stack:', error.stack);
        
        hideLoading();
        
        // Show detailed error message
        let errorMessage = 'Payment failed: ';
        
        if (error.message.includes('Failed to fetch')) {
            errorMessage += 'Network error. Please check your internet connection.';
        } else if (error.message.includes('CORS')) {
            errorMessage += 'CORS error. Please check server configuration.';
        } else {
            errorMessage += error.message;
        }
        
        showToast(errorMessage, 'error');
        
        // Release the pending slot if any
        if (bookingDetails && bookingDetails.groundId && bookingDetails.date && bookingDetails.slotTime) {
            await releasePendingSlot(bookingDetails);
        }
        
        return false;
    }
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate unique transaction ID
 */
function generateTransactionId(prefix) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const randomStr = random.toString().padStart(6, '0');
    return `${prefix}_${timestamp}_${randomStr}`;
}

/**
 * Create a pending slot in Firestore
 */
async function createPendingSlot(bookingDetails, transactionId) {
    try {
        const [startTime, endTime] = bookingDetails.slotTime.split('-');
        
        const slotData = {
            groundId: bookingDetails.groundId,
            date: bookingDetails.date,
            startTime: startTime,
            endTime: endTime,
            status: 'pending',
            bookingId: bookingDetails.bookingId,
            transactionId: transactionId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('slots').add(slotData);
        console.log('Pending slot created');
        
    } catch (error) {
        console.error('Error creating pending slot:', error);
    }
}

/**
 * Create payment record in Firestore
 */
async function createPaymentRecord(paymentData) {
    try {
        const paymentRecord = {
            paymentId: generateTransactionId('PAY'),
            transactionId: paymentData.transactionId,
            bookingId: paymentData.bookingId,
            userId: paymentData.userId,
            amount: paymentData.amount,
            status: paymentData.status,
            initiatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('payments').add(paymentRecord);
        console.log('Payment record created');
        
    } catch (error) {
        console.error('Error creating payment record:', error);
    }
}

/**
 * Release a pending slot if payment fails
 */
async function releasePendingSlot(bookingDetails) {
    try {
        const [startTime, endTime] = bookingDetails.slotTime.split('-');
        
        const snapshot = await db.collection('slots')
            .where('groundId', '==', bookingDetails.groundId)
            .where('date', '==', bookingDetails.date)
            .where('startTime', '==', startTime)
            .where('endTime', '==', endTime)
            .where('status', '==', 'pending')
            .get();
        
        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.update(doc.ref, {
                    status: 'available',
                    bookingId: null,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            console.log('Pending slot released');
        }
        
    } catch (error) {
        console.error('Error releasing pending slot:', error);
    }
}

/**
 * Verify payment status
 */
async function verifyPaymentStatus(transactionId) {
    try {
        const merchantId = 'PGTESTPAYUAT';
        const saltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
        const saltIndex = 1;
        
        const endpoint = `/pg/v1/status/${merchantId}/${transactionId}`;
        const stringToSign = endpoint + saltKey;
        
        const encoder = new TextEncoder();
        const data = encoder.encode(stringToSign);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const signature = hashHex + '###' + saltIndex;
        
        const apiUrl = `https://api-preprod.phonepe.com/apis/pg-sandbox${endpoint}`;
        
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-VERIFY': signature,
                'X-MERCHANT-ID': merchantId
            }
        });
        
        const result = await response.json();
        console.log('Payment verification result:', result);
        
        return {
            success: result.code === 'PAYMENT_SUCCESS',
            data: result
        };
        
    } catch (error) {
        console.error('Payment verification error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ==================== UPDATE EXISTING FUNCTIONS ====================

/**
 * Replace your existing handleUPIPayment function with this
 */
async function handleUPIPayment(upiApp) {
    if (!currentUser) {
        showToast('Please login to continue', 'warning');
        return;
    }
    
    // Try to recover ground and venue from session storage if they're missing
    if (!currentGround || !currentVenue) {
        console.log('Ground or venue missing, attempting to recover from session storage');
        
        const savedGround = sessionStorage.getItem('currentGround');
        const savedVenue = sessionStorage.getItem('currentVenue');
        const savedDate = sessionStorage.getItem('selectedDate');
        const savedSlot = sessionStorage.getItem('selectedSlot');
        
        if (savedGround && savedVenue) {
            currentGround = JSON.parse(savedGround);
            currentVenue = JSON.parse(savedVenue);
            if (savedDate) selectedDate = savedDate;
            if (savedSlot) selectedSlot = savedSlot;
            console.log('Recovered ground and venue from session storage');
        } else {
            showToast('Booking information missing. Please select a ground again.', 'error');
            return;
        }
    }
    
    if (!currentGround || !currentVenue) {
        showToast('Booking information missing. Please go back and select a ground.', 'error');
        return;
    }
    
    if (!selectedSlot) {
        showToast('Please select a time slot first', 'error');
        return;
    }
    
    const [startTime, endTime] = selectedSlot.split('-');
    
    // Check slot availability before proceeding
    const isAvailable = await checkSlotAvailability(currentGround.id, selectedDate, startTime, endTime);
    
    if (!isAvailable) {
        showToast('This slot is no longer available. Please select another slot.', 'error');
        loadSlots(currentGround.id, selectedDate);
        return;
    }
    
    // Calculate amount with first booking offer
    let amount = currentGround.pricePerHour;
    const hasFirstBookingOffer = !localStorage.getItem('firstBookingOffer_' + currentUser.uid);
    
    if (hasFirstBookingOffer) {
        amount = amount * 0.8; // 20% off
    }
    
    // Prepare booking details
    const venueAddress = currentVenue.address || '';
    const groundAddress = currentGround.groundAddress || '';
    const fullAddress = groundAddress ? `${venueAddress} - ${groundAddress}` : venueAddress;
    
    const bookingDetails = {
        bookingId: generateId('BKG'),
        userId: currentUser.uid,
        userName: currentUser.name || 'User',
        userEmail: currentUser.email,
        userPhone: currentUser.phone || '',
        ownerId: currentGround.ownerId,
        groundId: currentGround.id,
        groundName: currentGround.groundName,
        venueName: currentVenue.venueName || 'Unknown Venue',
        venueAddress: venueAddress,
        groundAddress: fullAddress,
        slotTime: selectedSlot,
        date: selectedDate,
        amount: amount,
        originalAmount: currentGround.pricePerHour,
        commission: amount * COMMISSION_RATE,
        ownerAmount: amount * (1 - COMMISSION_RATE),
        sportType: currentGround.sportType,
        appliedOffer: hasFirstBookingOffer ? 'FIRST20' : null
    };
    
    // Initiate PhonePe payment
    await initiatePhonePePayment(bookingDetails);
}
/**
 * Check slot availability
 */
async function checkSlotAvailability(groundId, date, startTime, endTime) {
    try {
        const snapshot = await db.collection(COLLECTIONS.SLOTS)
            .where('groundId', '==', groundId)
            .where('date', '==', date)
            .where('startTime', '==', startTime)
            .where('endTime', '==', endTime)
            .get();
        
        if (snapshot.empty) {
            // No slot record exists, so it's available
            return true;
        }
        
        const slot = snapshot.docs[0].data();
        return slot.status === SLOT_STATUS.AVAILABLE;
        
    } catch (error) {
        console.error('Error checking slot availability:', error);
        // If error, assume slot is available to avoid blocking user
        return true;
    }
}

async function ensureGroundData() {
    if (!currentGround && sessionStorage.getItem('currentGround')) {
        const savedGround = sessionStorage.getItem('currentGround');
        const savedVenue = sessionStorage.getItem('currentVenue');
        if (savedGround) currentGround = JSON.parse(savedGround);
        if (savedVenue) currentVenue = JSON.parse(savedVenue);
        return true;
    }
    return currentGround !== null;
}


async function createOrUpdateSlot(bookingDetails, status) {
    try {
        const [startTime, endTime] = bookingDetails.slotTime.split('-');
        
        const slotsSnapshot = await db.collection(COLLECTIONS.SLOTS)
            .where('groundId', '==', bookingDetails.groundId)
            .where('date', '==', bookingDetails.date)
            .where('startTime', '==', startTime)
            .where('endTime', '==', endTime)
            .get();
        
        if (!slotsSnapshot.empty) {
            await slotsSnapshot.docs[0].ref.update({
                status: status,
                bookingId: bookingDetails.bookingId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await db.collection(COLLECTIONS.SLOTS).add({
                groundId: bookingDetails.groundId,
                date: bookingDetails.date,
                startTime: startTime,
                endTime: endTime,
                status: status,
                bookingId: bookingDetails.bookingId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('Error updating slot:', error);
    }
}

async function releasePendingSlot(bookingDetails) {
    try {
        const [startTime, endTime] = bookingDetails.slotTime.split('-');
        
        const slotsSnapshot = await db.collection(COLLECTIONS.SLOTS)
            .where('groundId', '==', bookingDetails.groundId)
            .where('date', '==', bookingDetails.date)
            .where('startTime', '==', startTime)
            .where('endTime', '==', endTime)
            .where('status', '==', SLOT_STATUS.PENDING)
            .get();
        
        if (!slotsSnapshot.empty) {
            await slotsSnapshot.docs[0].ref.update({
                status: SLOT_STATUS.AVAILABLE,
                bookingId: null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (error) {
        console.error('Error releasing slot:', error);
    }
}

// ==================== PAYMENT SUCCESS HANDLER ====================

// This function will be called when PhonePe redirects back
async function handlePaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get('transactionId');
    const code = urlParams.get('code');
    
    if (!transactionId) return;
    
    showLoading('Verifying payment...');
    
    try {
        const verifyPayment = functions.httpsCallable('verifyPayment');
        const result = await verifyPayment({ transactionId, code });
        
        if (result.data.success) {
            const booking = result.data.booking;
            
            document.getElementById('confirmation-title').textContent = 'Payment Successful!';
            document.getElementById('confirmation-message').textContent = 'Your booking has been confirmed. Show the entry pass at the venue.';
            document.getElementById('confirmation-status-icon').innerHTML = '<i class="fas fa-check-circle"></i>';
            document.getElementById('confirmation-status-icon').className = 'status-icon success';
            
            const details = document.getElementById('confirmation-details');
            details.innerHTML = `
                <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
                <p><strong>Transaction ID:</strong> ${transactionId}</p>
                <p><strong>Venue:</strong> ${booking.venueName}</p>
                <p><strong>Ground:</strong> ${booking.groundName}</p>
                <p><strong>Address:</strong> ${booking.groundAddress || booking.venueAddress}</p>
                <p><strong>Date:</strong> ${booking.date}</p>
                <p><strong>Time:</strong> ${booking.slotTime}</p>
                <p><strong>Amount Paid:</strong> ${formatCurrency(booking.amount)}</p>
                <p><strong>Status:</strong> <span style="color: var(--success);">CONFIRMED</span></p>
            `;
            
            if (booking.appliedOffer) {
                details.innerHTML += `<p><i class="fas fa-gift"></i> 20% first booking offer applied!</p>`;
                localStorage.setItem('firstBookingOffer_' + currentUser.uid, 'true');
            }
            
            document.getElementById('view-entry-pass-btn').style.display = 'block';
            
            if (currentUser.role === 'user' && currentUser.referralCode) {
                document.getElementById('referral-share').style.display = 'block';
            }
            
            showPage('confirmation-page');
        } else {
            showToast('Payment verification failed', 'error');
            goHome();
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Payment verification error:', error);
        showToast('Error verifying payment', 'error');
    }
}

// ==================== REVIEWS ====================

async function loadGroundReviews(groundId) {
    const container = document.getElementById('ground-reviews');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.REVIEWS)
            .where('groundId', '==', groundId)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center">No reviews yet. Be the first to review!</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const review = doc.data();
            html += `
                <div class="review-card">
                    <div class="review-header">
                        <span class="reviewer-name">${review.userName}</span>
                        <span class="review-rating">${'★'.repeat(review.rating)}</span>
                    </div>
                    <p class="review-text">${review.comment}</p>
                    <div class="review-time">${review.createdAt ? timeAgo(review.createdAt) : ''}</div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading reviews:', error);
        container.innerHTML = '<p class="text-center">Failed to load reviews</p>';
    }
}

function showWriteReview() {
    if (!currentUser) {
        showToast('Please login to write a review', 'warning');
        return;
    }
    document.getElementById('review-rating').value = '0';
    document.getElementById('review-text').value = '';
    document.querySelectorAll('#star-rating i').forEach(star => {
        star.className = 'far fa-star';
    });
    document.getElementById('write-review-modal').classList.add('active');
}

function setRating(rating) {
    document.getElementById('review-rating').value = rating;
    
    const stars = document.querySelectorAll('#star-rating i');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.className = 'fas fa-star';
        } else {
            star.className = 'far fa-star';
        }
    });
}

async function submitReview() {
    const rating = parseInt(document.getElementById('review-rating').value);
    const comment = document.getElementById('review-text').value.trim();
    
    if (!rating || rating === 0) {
        showToast('Please select a rating', 'error');
        return;
    }
    
    if (!comment) {
        showToast('Please write a review', 'error');
        return;
    }
    
    const existingReview = await db.collection(COLLECTIONS.REVIEWS)
        .where('groundId', '==', currentGround.id)
        .where('userId', '==', currentUser.uid)
        .get();
    
    if (!existingReview.empty) {
        showToast('You have already reviewed this ground', 'warning');
        closeModal('write-review-modal');
        return;
    }
    
    showLoading('Submitting review...');
    
    try {
        const reviewData = {
            groundId: currentGround.id,
            userId: currentUser.uid,
            userName: currentUser.name,
            rating: rating,
            comment,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.REVIEWS).add(reviewData);
        
        const reviewsSnapshot = await db.collection(COLLECTIONS.REVIEWS)
            .where('groundId', '==', currentGround.id)
            .get();
        
        let totalRating = 0;
        reviewsSnapshot.forEach(doc => {
            totalRating += doc.data().rating;
        });
        
        const avgRating = totalRating / reviewsSnapshot.size;
        
        await db.collection(COLLECTIONS.GROUNDS).doc(currentGround.id).update({
            rating: avgRating,
            totalReviews: reviewsSnapshot.size,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
            .where('ownerId', '==', currentGround.ownerId)
            .get();
        
        if (!venueSnapshot.empty) {
            const venueDoc = venueSnapshot.docs[0];
            await venueDoc.ref.update({
                rating: avgRating,
                totalReviews: reviewsSnapshot.size
            });
        }
        
        hideLoading();
        showToast('Review submitted successfully');
        closeModal('write-review-modal');
        loadGroundReviews(currentGround.id);
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

function shareVenue() {
    if (navigator.share) {
        navigator.share({
            title: currentVenue.venueName,
            text: `Check out ${currentVenue.venueName} on BookMyGame!`,
            url: window.location.href
        }).catch(() => {
            navigator.clipboard.writeText(window.location.href);
            showToast('Link copied to clipboard');
        });
    } else {
        navigator.clipboard.writeText(window.location.href);
        showToast('Link copied to clipboard');
    }
}

// ==================== USER BOOKINGS ====================

async function loadUserBookings(status) {
    if (!currentUser) return;
    
    const container = document.getElementById('user-bookings-list');
    container.innerHTML = '<div class="loading-spinner"><div class="loader-spinner"></div></div>';
    
    try {
        let query = db.collection(COLLECTIONS.BOOKINGS)
            .where('userId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc');
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-times"></i><h3>No bookings found</h3><p>Start booking grounds to see them here</p><button onclick="goHome()">Browse Venues</button></div>';
            return;
        }
        
        let bookings = [];
        snapshot.forEach(doc => {
            bookings.push({ id: doc.id, ...doc.data() });
        });
        
        const today = new Date().toISOString().split('T')[0];
        
        bookings = bookings.filter(booking => {
            if (status === 'upcoming') {
                return booking.date >= today && 
                       (booking.bookingStatus === BOOKING_STATUS.CONFIRMED || 
                        booking.bookingStatus === BOOKING_STATUS.PENDING_PAYMENT);
            } else if (status === 'past') {
                return booking.date < today || 
                       booking.bookingStatus === BOOKING_STATUS.COMPLETED;
            } else if (status === 'cancelled') {
                return booking.bookingStatus === BOOKING_STATUS.CANCELLED;
            }
            return true;
        });
        
        if (bookings.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-${status === 'upcoming' ? 'day' : status === 'past' ? 'check' : 'times'}"></i><h3>No ${status} bookings</h3><p>Your ${status} bookings will appear here</p></div>`;
            return;
        }
        
        container.innerHTML = bookings.map(booking => `
            <div class="booking-card status-${booking.bookingStatus}">
                <div class="booking-status status-${booking.bookingStatus}">
                    ${booking.bookingStatus.replace(/_/g, ' ')}
                </div>
                <h4>${booking.venueName} - ${booking.groundName}</h4>
                <p><i class="fas fa-map-pin"></i> ${booking.groundAddress || booking.venueAddress}</p>
                <p><i class="fas fa-calendar"></i> ${booking.date}</p>
                <p><i class="fas fa-clock"></i> ${booking.slotTime}</p>
                <p><i class="fas fa-rupee-sign"></i> ${formatCurrency(booking.amount)}</p>
                ${booking.appliedOffer ? '<p><i class="fas fa-gift"></i> First booking offer applied</p>' : ''}
                <p><small>Booking ID: ${booking.bookingId}</small></p>
                ${booking.bookingStatus === BOOKING_STATUS.CONFIRMED ? `
                    <button class="auth-btn" onclick="showEntryPass('${booking.bookingId}')">View Entry Pass</button>
                ` : ''}
                ${booking.bookingStatus === BOOKING_STATUS.PENDING_PAYMENT ? `
                    <p><small>Payment pending - waiting for confirmation</small></p>
                ` : ''}
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading bookings:', error);
        container.innerHTML = '<p class="text-center">Failed to load bookings</p>';
    }
}

async function showEntryPass(bookingId) {
    showLoading('Generating entry pass...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('bookingId', '==', bookingId)
            .get();
        
        if (snapshot.empty) {
            showToast('Booking not found', 'error');
            return;
        }
        
        const booking = snapshot.docs[0].data();
        
        if (booking.bookingStatus !== BOOKING_STATUS.CONFIRMED) {
            showToast('Entry pass available only for confirmed bookings', 'warning');
            hideLoading();
            return;
        }
        
        const now = new Date();
        const [startHour] = booking.slotTime.split('-')[0].split(':');
        const bookingTime = new Date(booking.date);
        bookingTime.setHours(parseInt(startHour), 0, 0);
        
        const validFrom = new Date(bookingTime.getTime() - 15 * 60000);
        const validTo = new Date(bookingTime.getTime() + 60 * 60000);
        
        const qrData = JSON.stringify({
            appId: 'BookMyGame',
            bookingId: booking.bookingId,
            groundId: booking.groundId,
            date: booking.date,
            slot: booking.slotTime,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString()
        });
        
        const qrDataUrl = await QRCode.toDataURL(qrData, { width: 200, margin: 2 });
        
        const container = document.getElementById('entry-pass-content');
        container.innerHTML = `
            <div class="entry-pass-card">
                <div class="entry-pass-header">
                    <i class="fas fa-futbol"></i>
                    <h2>BookMyGame</h2>
                    <p>Entry Pass</p>
                </div>
                
                <div class="entry-pass-details">
                    <p><span>Booking ID:</span> <span>${booking.bookingId}</span></p>
                    <p><span>Name:</span> <span>${booking.userName}</span></p>
                    <p><span>Venue:</span> <span>${booking.venueName}</span></p>
                    <p><span>Ground:</span> <span>${booking.groundName}</span></p>
                    <p><span>Address:</span> <span>${booking.groundAddress || booking.venueAddress}</span></p>
                    <p><span>Date:</span> <span>${booking.date}</span></p>
                    <p><span>Time:</span> <span>${booking.slotTime}</span></p>
                </div>
                
                <div class="entry-pass-qr">
                    <img src="${qrDataUrl}" alt="QR Code">
                </div>
                
                <div class="qr-validity">
                    <i class="fas fa-clock"></i> Valid: 15 min before to 1 hour after slot
                </div>
            </div>
            
            <button class="home-btn" id="entry-pass-home">Back to Home</button>
        `;
        
        document.getElementById('entry-pass-home').addEventListener('click', goHome);
        
        hideLoading();
        showPage('entry-pass-page');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

function showEntryPassFromConfirmation() {
    const bookingId = document.querySelector('#confirmation-details p:first-child span:last-child')?.textContent;
    if (bookingId) {
        showEntryPass(bookingId);
    } else {
        showToast('Booking ID not found', 'error');
    }
}

// ==================== TOURNAMENTS ====================

// ==================== UPDATED TOURNAMENT FUNCTIONS ====================

async function loadFeaturedTournament() {
    const container = document.getElementById('featured-tournament');
    if (!container) return;
    
    try {
        await checkAndUpdateTournamentStatus();
        
        const today = new Date().toISOString().split('T')[0];
        
        // Only get upcoming tournaments that haven't ended
        const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
            .where('status', '==', TOURNAMENT_STATUS.UPCOMING)
            .where('startDate', '>=', today)
            .orderBy('prizeAmount', 'desc')
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="tournament-empty-state" style="padding: var(--space-xl); text-align: center;">
                    <i class="fas fa-trophy" style="font-size: 2rem; color: var(--gray-400);"></i>
                    <p style="margin-top: var(--space-sm); color: var(--gray-500);">No upcoming tournaments</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        for (const doc of snapshot.docs) {
            const tournament = doc.data();
            const tournamentId = doc.id;
            
            const startDate = new Date(tournament.startDate);
            const endDate = new Date(tournament.endDate);
            const todayDate = new Date();
            
            const formattedStartDate = startDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
            
            const registeredTeams = tournament.registeredTeams?.length || 0;
            const maxTeams = tournament.maxTeams || 0;
            const progressPercent = (registeredTeams / maxTeams) * 100;
            const spotsLeft = maxTeams - registeredTeams;
            
            html += `
                <div class="tournament-card-modern" data-tournament-id="${tournamentId}">
                    <div class="tournament-card-content">
                        <div class="tournament-header-section">
                            <div class="tournament-info">
                                <div class="tournament-icon">
                                    <i class="fas fa-trophy"></i>
                                </div>
                                <div class="tournament-details">
                                    <h3>${escapeHtml(tournament.tournamentName)}</h3>
                                    <div class="tournament-meta">
                                        <span>${tournament.sportType || 'Multi-sport'}</span>
                                        <span>•</span>
                                        <span>${formattedStartDate}</span>
                                        <span>•</span>
                                        <span class="tournament-status-badge upcoming">
                                            <i class="fas fa-calendar"></i> Upcoming
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="tournament-stats-grid">
                            <div class="tournament-stat-item">
                                <span class="tournament-stat-label">Prize Pool</span>
                                <span class="tournament-stat-value tournament-prize-value">${formatCurrency(tournament.prizeAmount)}</span>
                            </div>
                            <div class="tournament-stat-item">
                                <span class="tournament-stat-label">Entry Fee</span>
                                <span class="tournament-stat-value">${formatCurrency(tournament.entryFee)}</span>
                            </div>
                            <div class="tournament-stat-item">
                                <span class="tournament-stat-label">Teams</span>
                                <span class="tournament-stat-value">${registeredTeams}/${maxTeams}</span>
                            </div>
                        </div>
                        
                        <div class="tournament-progress">
                            <div class="progress-bar-container">
                                <div class="progress-bar-fill-tournament" style="width: ${progressPercent}%"></div>
                            </div>
                            <div class="progress-stats">
                                <span>${registeredTeams} teams registered</span>
                                <span>${spotsLeft} spots left</span>
                            </div>
                        </div>
                        
                        <div class="tournament-actions">
                            <button class="tournament-btn tournament-btn-primary" onclick="showTournamentRegistration('${tournamentId}')" 
                                ${registeredTeams >= maxTeams ? 'disabled' : ''}>
                                <i class="fas fa-user-plus"></i>
                                ${registeredTeams >= maxTeams ? 'Tournament Full' : 'Register Now'}
                            </button>
                            <button class="tournament-btn tournament-btn-secondary" onclick="viewTournamentDetails('${tournamentId}')">
                                <i class="fas fa-info-circle"></i> Details
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading featured tournament:', error);
        container.innerHTML = '<p class="text-center">Failed to load featured tournament</p>';
    }
}

async function loadAllTournaments(filterStatus = 'upcoming') {
    const container = document.getElementById('tournaments-list');
    if (!container) return;
    
    container.innerHTML = `
        <div class="loading-spinner">
            <div class="loader-spinner"></div>
        </div>
    `;
    
    try {
        await checkAndUpdateTournamentStatus();
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        let tournaments = [];
        const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
            .orderBy('startDate', 'asc')
            .get();
        
        for (const doc of snapshot.docs) {
            const tournament = doc.data();
            const tournamentId = doc.id;
            
            // Determine actual status based on dates
            let actualStatus = tournament.status;
            const startDate = new Date(tournament.startDate);
            const endDate = new Date(tournament.endDate);
            const endDateTime = new Date(`${tournament.endDate}T${tournament.endTime || '23:59'}`);
            
            // Update status based on dates
            if (endDateTime < today) {
                actualStatus = TOURNAMENT_STATUS.COMPLETED;
                // Update in database if needed
                if (tournament.status !== TOURNAMENT_STATUS.COMPLETED) {
                    await db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId).update({
                        status: TOURNAMENT_STATUS.COMPLETED,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } else if (startDate <= today && endDate >= todayStr) {
                actualStatus = TOURNAMENT_STATUS.ONGOING;
                if (tournament.status !== TOURNAMENT_STATUS.ONGOING) {
                    await db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId).update({
                        status: TOURNAMENT_STATUS.ONGOING,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
            } else if (startDate > today) {
                actualStatus = TOURNAMENT_STATUS.UPCOMING;
            }
            
            tournaments.push({
                id: tournamentId,
                ...tournament,
                actualStatus: actualStatus
            });
        }
        
        // Filter based on selected status
        let filteredTournaments = tournaments;
        if (filterStatus !== 'all') {
            filteredTournaments = tournaments.filter(t => t.actualStatus === filterStatus);
        }
        
        // Update stats
        const statsHtml = `
            <div class="tournament-stats-bar">
                <div class="tournament-stat-chip">
                    <i class="fas fa-calendar"></i>
                    <span><strong>${tournaments.filter(t => t.actualStatus === 'upcoming').length}</strong> Upcoming</span>
                </div>
                <div class="tournament-stat-chip">
                    <i class="fas fa-play-circle"></i>
                    <span><strong>${tournaments.filter(t => t.actualStatus === 'ongoing').length}</strong> Ongoing</span>
                </div>
                <div class="tournament-stat-chip">
                    <i class="fas fa-check-circle"></i>
                    <span><strong>${tournaments.filter(t => t.actualStatus === 'completed').length}</strong> Completed</span>
                </div>
                
            </div>
        `;
        
        if (filteredTournaments.length === 0) {
            container.innerHTML = statsHtml + `
                <div class="tournament-empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>No ${filterStatus === 'all' ? '' : filterStatus} Tournaments</h3>
                    <p>${filterStatus === 'upcoming' ? 'Check back later for upcoming tournaments!' : filterStatus === 'ongoing' ? 'No tournaments are currently in progress.' : 'No completed tournaments to show.'}</p>
                </div>
            `;
            return;
        }
        
        let html = statsHtml;
        
        for (const tournament of filteredTournaments) {
            const startDate = new Date(tournament.startDate);
            const endDate = new Date(tournament.endDate);
            const todayDate = new Date();
            
            const formattedStartDate = startDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            const formattedEndDate = endDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            const registeredTeams = tournament.registeredTeams?.length || 0;
            const maxTeams = tournament.maxTeams || 0;
            const progressPercent = (registeredTeams / maxTeams) * 100;
            const spotsLeft = maxTeams - registeredTeams;
            
            let statusClass = '';
            let statusIcon = '';
            let statusText = '';
            let isExpired = false;
            let isUpcoming = false;
            let isOngoing = false;
            
            // Check if tournament has expired (end date passed)
            const endDateTime = new Date(`${tournament.endDate}T${tournament.endTime || '23:59'}`);
            if (endDateTime < todayDate) {
                isExpired = true;
                statusClass = 'completed';
                statusIcon = 'fa-check-circle';
                statusText = 'Completed';
            } else if (tournament.actualStatus === TOURNAMENT_STATUS.UPCOMING) {
                isUpcoming = true;
                statusClass = 'upcoming';
                statusIcon = 'fa-calendar';
                statusText = 'Upcoming';
            } else if (tournament.actualStatus === TOURNAMENT_STATUS.ONGOING) {
                isOngoing = true;
                statusClass = 'ongoing';
                statusIcon = 'fa-play-circle';
                statusText = 'Ongoing';
            } else {
                statusClass = 'completed';
                statusIcon = 'fa-check-circle';
                statusText = 'Completed';
            }
            
            // Calculate days remaining for upcoming tournaments
            let daysRemaining = '';
            if (isUpcoming) {
                const daysDiff = Math.ceil((startDate - todayDate) / (1000 * 60 * 60 * 24));
                daysRemaining = `Starts in ${daysDiff} day${daysDiff !== 1 ? 's' : ''}`;
            }
            
            html += `
                <div class="tournament-card-modern ${isExpired ? 'expired' : isOngoing ? 'ongoing' : ''}" data-tournament-id="${tournament.id}">
                    <div class="tournament-card-content">
                        <div class="tournament-header-section">
                            <div class="tournament-info">
                                <div class="tournament-icon">
                                    <i class="fas fa-trophy"></i>
                                </div>
                                <div class="tournament-details">
                                    <h3>${escapeHtml(tournament.tournamentName)}</h3>
                                    <div class="tournament-meta">
                                        <span>${tournament.sportType || 'Multi-sport'}</span>
                                        <span>•</span>
                                        <span>${formattedStartDate}</span>
                                        <span>•</span>
                                        <span>${formattedEndDate}</span>
                                        <span>•</span>
                                        <span class="tournament-status-badge ${statusClass}">
                                            <i class="fas ${statusIcon}"></i> ${statusText}
                                        </span>
                                        ${daysRemaining ? `<span><i class="fas fa-hourglass-half"></i> ${daysRemaining}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="tournament-stats-grid">
                            <div class="tournament-stat-item">
                                <span class="tournament-stat-label">Prize Pool</span>
                                <span class="tournament-stat-value tournament-prize-value">${formatCurrency(tournament.prizeAmount)}</span>
                            </div>
                            <div class="tournament-stat-item">
                                <span class="tournament-stat-label">Entry Fee</span>
                                <span class="tournament-stat-value">${formatCurrency(tournament.entryFee)}</span>
                            </div>
                            <div class="tournament-stat-item">
                                <span class="tournament-stat-label">Teams</span>
                                <span class="tournament-stat-value">${registeredTeams}/${maxTeams}</span>
                            </div>
                            <div class="tournament-stat-item">
                                <span class="tournament-stat-label">Format</span>
                                <span class="tournament-stat-value">${tournament.format === 'knockout' ? 'Knockout' : tournament.format === 'league' ? 'League' : 'Group Stage'}</span>
                            </div>
                        </div>
                        
                        <div class="tournament-info-grid">
                            <div class="tournament-info-item">
                                <i class="fas fa-map-marker-alt"></i>
                                <div>
                                    <span class="tournament-info-label">Venue</span>
                                    <span class="tournament-info-value">${escapeHtml(tournament.venueName || 'TBD')}</span>
                                </div>
                            </div>
                            <div class="tournament-info-item">
                                <i class="fas fa-clock"></i>
                                <div>
                                    <span class="tournament-info-label">Time</span>
                                    <span class="tournament-info-value">${tournament.startTime} - ${tournament.endTime}</span>
                                </div>
                            </div>
                            <div class="tournament-info-item">
                                <i class="fas fa-users"></i>
                                <div>
                                    <span class="tournament-info-label">Team Size</span>
                                    <span class="tournament-info-value">${tournament.teamSize || 11} players</span>
                                </div>
                            </div>
                        </div>
                        
                        ${!isExpired && !isOngoing ? `
                            <div class="tournament-progress">
                                <div class="progress-bar-container">
                                    <div class="progress-bar-fill-tournament" style="width: ${progressPercent}%"></div>
                                </div>
                                <div class="progress-stats">
                                    <span>${registeredTeams} teams registered</span>
                                    <span>${spotsLeft} spots left</span>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="tournament-actions">
                            ${!isExpired ? `
                                ${isUpcoming ? `
                                    <button class="tournament-btn tournament-btn-primary" onclick="showTournamentRegistration('${tournament.id}')" 
                                        ${registeredTeams >= maxTeams ? 'disabled' : ''}>
                                        <i class="fas fa-user-plus"></i>
                                        ${registeredTeams >= maxTeams ? 'Tournament Full' : 'Register Now'}
                                    </button>
                                ` : isOngoing ? `
                                    <button class="tournament-btn tournament-btn-primary" disabled>
                                        <i class="fas fa-play-circle"></i> Tournament In Progress
                                    </button>
                                ` : ''}
                            ` : `
                                <button class="tournament-btn tournament-btn-primary" disabled>
                                    <i class="fas fa-check-circle"></i> Tournament Completed
                                </button>
                            `}
                            <button class="tournament-btn tournament-btn-secondary" onclick="viewTournamentDetails('${tournament.id}')">
                                <i class="fas fa-info-circle"></i> View Details
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading tournaments:', error);
        container.innerHTML = '<p class="text-center">Failed to load tournaments</p>';
    }
}

function filterTournaments(status) {
    loadAllTournaments(status);
}

async function viewTournamentDetails(tournamentId) {
    showLoading('Loading tournament details...');
    
    try {
        const tournamentDoc = await db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId).get();
        
        if (!tournamentDoc.exists) {
            showToast('Tournament not found', 'error');
            hideLoading();
            return;
        }
        
        currentTournament = { id: tournamentDoc.id, ...tournamentDoc.data() };
        
        const today = new Date();
        const startDate = new Date(currentTournament.startDate);
        const endDate = new Date(currentTournament.endDate);
        const endDateTime = new Date(`${currentTournament.endDate}T${currentTournament.endTime || '23:59'}`);
        
        // Determine if tournament is expired
        const isExpired = endDateTime < today;
        const isUpcoming = startDate > today && !isExpired;
        const isOngoing = startDate <= today && endDate >= today && !isExpired;
        
        const formattedStartDate = startDate.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const formattedEndDate = endDate.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const formatMap = {
            'knockout': 'Knockout',
            'league': 'League',
            'group': 'Group Stage + Knockout'
        };
        
        let userRegistration = null;
        let isOwner = false;
        
        if (currentUser) {
            const regSnapshot = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
                .where('tournamentId', '==', tournamentId)
                .where('userId', '==', currentUser.uid)
                .get();
            
            if (!regSnapshot.empty) {
                userRegistration = regSnapshot.docs[0].data();
            }
            
            isOwner = currentUser.role === 'owner' && currentUser.uid === currentTournament.ownerId;
        }
        
        const registeredTeams = currentTournament.registeredTeams?.length || 0;
        const maxTeams = currentTournament.maxTeams || 0;
        const spotsLeft = maxTeams - registeredTeams;
        const progressPercent = (registeredTeams / maxTeams) * 100;
        
        // Calculate days remaining
        let daysRemainingHtml = '';
        if (isUpcoming) {
            const daysDiff = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
            daysRemainingHtml = `
                <div class="tournament-info-item" style="background: var(--primary-50); margin-top: var(--space-md); padding: var(--space-md); border-radius: var(--radius);">
                    <i class="fas fa-hourglass-half"></i>
                    <div>
                        <span class="tournament-info-label">Starts In</span>
                        <span class="tournament-info-value" style="color: var(--primary); font-weight: 700;">${daysDiff} day${daysDiff !== 1 ? 's' : ''}</span>
                    </div>
                </div>
            `;
        }
        
        const container = document.getElementById('tournament-details-content');
        container.innerHTML = `
            <div class="tournament-card-modern" style="margin: var(--space-lg);">
                <div class="tournament-card-content">
                    <div class="tournament-header-section">
                        <div class="tournament-info">
                            <div class="tournament-icon" style="width: 80px; height: 80px;">
                                <i class="fas fa-trophy" style="font-size: 2.5rem;"></i>
                            </div>
                            <div class="tournament-details">
                                <h2 style="font-size: var(--font-2xl);">${escapeHtml(currentTournament.tournamentName)}</h2>
                                <div class="tournament-meta">
                                    <span class="tournament-status-badge ${isExpired ? 'completed' : isOngoing ? 'ongoing' : 'upcoming'}">
                                        <i class="fas ${isExpired ? 'fa-check-circle' : isOngoing ? 'fa-play-circle' : 'fa-calendar'}"></i>
                                        ${isExpired ? 'Completed' : isOngoing ? 'Ongoing' : 'Upcoming'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="tournament-stats-grid">
                        <div class="tournament-stat-item">
                            <span class="tournament-stat-label">Prize Pool</span>
                            <span class="tournament-stat-value tournament-prize-value" style="font-size: 1.8rem;">${formatCurrency(currentTournament.prizeAmount)}</span>
                        </div>
                        <div class="tournament-stat-item">
                            <span class="tournament-stat-label">Entry Fee</span>
                            <span class="tournament-stat-value">${formatCurrency(currentTournament.entryFee)}</span>
                        </div>
                        <div class="tournament-stat-item">
                            <span class="tournament-stat-label">Teams</span>
                            <span class="tournament-stat-value">${registeredTeams}/${maxTeams}</span>
                        </div>
                        <div class="tournament-stat-item">
                            <span class="tournament-stat-label">Spots Left</span>
                            <span class="tournament-stat-value" style="color: ${spotsLeft > 0 ? 'var(--success)' : 'var(--danger)'};">${spotsLeft}</span>
                        </div>
                    </div>
                    
                    ${!isExpired && !isOngoing ? `
                        <div class="tournament-progress">
                            <div class="progress-bar-container">
                                <div class="progress-bar-fill-tournament" style="width: ${progressPercent}%"></div>
                            </div>
                            <div class="progress-stats">
                                <span>${registeredTeams} teams registered</span>
                                <span>${spotsLeft} spots left</span>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="tournament-info-grid">
                        <div class="tournament-info-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <div>
                                <span class="tournament-info-label">Venue</span>
                                <span class="tournament-info-value">${escapeHtml(currentTournament.venueName)}</span>
                            </div>
                        </div>
                        <div class="tournament-info-item">
                            <i class="fas fa-location-dot"></i>
                            <div>
                                <span class="tournament-info-label">Tournament Address</span>
                                <span class="tournament-info-value">${escapeHtml(currentTournament.tournamentAddress || currentTournament.venueAddress || 'Address not specified')}</span>
                            </div>
                        </div>
                        <div class="tournament-info-item">
                            <i class="fas fa-map-pin"></i>
                            <div>
                                <span class="tournament-info-label">Ground</span>
                                <span class="tournament-info-value">${escapeHtml(currentTournament.groundName)}</span>
                            </div>
                        </div>
                        <div class="tournament-info-item">
                            <i class="fas fa-calendar-alt"></i>
                            <div>
                                <span class="tournament-info-label">Dates</span>
                                <span class="tournament-info-value">${formattedStartDate} - ${formattedEndDate}</span>
                            </div>
                        </div>
                        <div class="tournament-info-item">
                            <i class="fas fa-clock"></i>
                            <div>
                                <span class="tournament-info-label">Time</span>
                                <span class="tournament-info-value">${currentTournament.startTime} - ${currentTournament.endTime}</span>
                            </div>
                        </div>
                        <div class="tournament-info-item">
                            <i class="fas fa-users"></i>
                            <div>
                                <span class="tournament-info-label">Team Size</span>
                                <span class="tournament-info-value">${currentTournament.teamSize || 11} players per team</span>
                            </div>
                        </div>
                        <div class="tournament-info-item">
                            <i class="fas fa-sitemap"></i>
                            <div>
                                <span class="tournament-info-label">Format</span>
                                <span class="tournament-info-value">${formatMap[currentTournament.format] || 'Knockout'}</span>
                            </div>
                        </div>
                        ${daysRemainingHtml}
                    </div>
                    
                    <!-- Google Maps Link (NEW) -->
                    ${currentTournament.tournamentAddress ? `
                        <div class="tournament-map-link" style="margin: var(--space-lg) 0; text-align: center;">
                            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(currentTournament.tournamentAddress)}" 
                               target="_blank" 
                               class="open-maps-btn"
                               style="display: inline-flex; align-items: center; gap: var(--space-sm); padding: var(--space-md) var(--space-xl); background: var(--primary); color: white; border-radius: var(--radius); text-decoration: none; transition: all var(--transition);">
                                <i class="fas fa-directions"></i>
                                Get Directions
                            </a>
                        </div>
                    ` : ''}
                    
                    <div class="tournament-rules-section" style="margin: var(--space-xl) 0; padding: var(--space-lg); background: var(--gray-50); border-radius: var(--radius);">
                        <h4 style="margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
                            <i class="fas fa-file-alt" style="color: var(--primary);"></i>
                            Rules & Regulations
                        </h4>
                        <p style="color: var(--gray-600); line-height: 1.6;">${escapeHtml(currentTournament.rules || 'No specific rules provided. Standard tournament rules apply.')}</p>
                    </div>
                    
                    <div class="tournament-teams-section" style="margin: var(--space-xl) 0;">
                        <h4 style="margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
                            <i class="fas fa-users"></i>
                            Registered Teams (${registeredTeams}/${maxTeams})
                        </h4>
                        <div class="teams-list" style="display: flex; flex-direction: column; gap: var(--space-sm);">
                            ${currentTournament.registeredTeams?.map((team, index) => `
                                <div class="team-item" style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-md); background: var(--gray-50); border-radius: var(--radius);">
                                    <div style="display: flex; align-items: center; gap: var(--space-md);">
                                        <span style="font-weight: 600; color: var(--primary);">#${index + 1}</span>
                                        <span>${escapeHtml(team.teamName)}</span>
                                    </div>
                                    <span class="team-status-badge" style="padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-full); font-size: var(--font-xs); font-weight: 500; background: ${team.status === 'confirmed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; color: ${team.status === 'confirmed' ? 'var(--success)' : 'var(--warning)'};">${team.status === 'confirmed' ? 'Confirmed' : 'Pending'}</span>
                                </div>
                            `).join('') || '<p class="text-center" style="color: var(--gray-500); padding: var(--space-xl);">No teams registered yet</p>'}
                        </div>
                    </div>
                    
                    <div class="tournament-contact-section" style="margin: var(--space-xl) 0; padding: var(--space-lg); background: var(--primary-50); border-radius: var(--radius);">
                        <h4 style="margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
                            <i class="fas fa-headset"></i>
                            Contact for Queries
                        </h4>
                        <p><i class="fas fa-phone"></i> ${escapeHtml(currentTournament.contactInfo)}</p>
                        ${currentTournament.contactEmail ? `<p><i class="fas fa-envelope"></i> ${escapeHtml(currentTournament.contactEmail)}</p>` : ''}
                    </div>
                    
                    <div class="tournament-actions" style="margin-top: var(--space-xl);">
                        ${!isExpired ? `
                            ${isUpcoming ? `
                                ${!userRegistration ? `
                                    <button class="tournament-btn tournament-btn-primary" onclick="showTournamentRegistration('${tournamentId}')" 
                                        ${registeredTeams >= maxTeams ? 'disabled' : ''}>
                                        <i class="fas fa-user-plus"></i>
                                        ${registeredTeams >= maxTeams ? 'Tournament Full' : 'Register Now'}
                                    </button>
                                ` : `
                                    <div class="registration-status-card" style="background: ${userRegistration.status === 'confirmed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; padding: var(--space-lg); border-radius: var(--radius); text-align: center;">
                                        <i class="fas ${userRegistration.status === 'confirmed' ? 'fa-check-circle' : 'fa-clock'}" style="font-size: 1.5rem; color: ${userRegistration.status === 'confirmed' ? 'var(--success)' : 'var(--warning)'};"></i>
                                        <h4 style="margin: var(--space-sm) 0;">Registration ${userRegistration.status === 'confirmed' ? 'Confirmed' : 'Pending'}</h4>
                                        <p>Team: ${escapeHtml(userRegistration.teamName)}</p>
                                        ${userRegistration.status === 'pending' ? '<p>Your registration is under review</p>' : ''}
                                    </div>
                                `}
                            ` : isOngoing ? `
                                <button class="tournament-btn tournament-btn-primary" disabled>
                                    <i class="fas fa-play-circle"></i> Tournament In Progress
                                </button>
                            ` : ''}
                        ` : `
                            <button class="tournament-btn tournament-btn-primary" disabled>
                                <i class="fas fa-check-circle"></i> Tournament Completed
                            </button>
                        `}
                        <button class="tournament-btn tournament-btn-secondary" onclick="goBack()">
                            <i class="fas fa-arrow-left"></i> Back
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        hideLoading();
        showPage('tournament-details-page');
        
    } catch (error) {
        hideLoading();
        console.error('Error loading tournament details:', error);
        showToast(error.message, 'error');
    }
}


// ==================== PROFESSIONAL TOURNAMENT REGISTRATION ====================

// ==================== UPDATED TOURNAMENT REGISTRATION (FULL PAYMENT) ====================

function showTournamentRegistration(tournamentId) {
    if (!currentUser) {
        showToast('Please login to register', 'warning');
        return;
    }
    
    showLoading('Loading registration form...');
    
    db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId).get()
        .then(async (doc) => {
            if (!doc.exists) {
                showToast('Tournament not found', 'error');
                hideLoading();
                return;
            }
            
            const tournament = doc.data();
            currentTournament = { id: doc.id, ...tournament };
            
            // Check if already registered
            const existingReg = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
                .where('tournamentId', '==', tournamentId)
                .where('userId', '==', currentUser.uid)
                .get();
            
            if (!existingReg.empty) {
                hideLoading();
                showAlreadyRegisteredModal(existingReg.docs[0].data());
                return;
            }
            
            const container = document.getElementById('tournament-registration-content');
            const startDate = new Date(tournament.startDate);
            const formattedDate = startDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            const registeredTeams = tournament.registeredTeams?.length || 0;
            const spotsLeft = tournament.maxTeams - registeredTeams;
            const teamSize = tournament.teamSize || 11;
            
            // Generate player list HTML (simplified - no payment per player)
            let playersHtml = '';
            for (let i = 1; i < teamSize; i++) {
                playersHtml += `
                    <div class="player-item-modern" data-player-index="${i}">
                        <div class="player-number">${i + 1}</div>
                        <input type="text" class="player-input-modern" 
                               placeholder="Player ${i + 1} Name" 
                               data-player="${i}">
                    </div>
                `;
            }
            
            container.innerHTML = `
                <div class="tournament-registration-container">
                    <div class="registration-card-modern">
                        <!-- Tournament Header Banner -->
                        <div class="registration-banner">
                            <div class="banner-overlay"></div>
                            <div class="banner-content">
                                <div class="tournament-icon-large">
                                    <i class="fas fa-trophy"></i>
                                </div>
                                <h2>${escapeHtml(tournament.tournamentName)}</h2>
                                <p>Register your team and compete for glory!</p>
                            </div>
                        </div>
                        
                        <!-- Tournament Quick Info -->
                        <div class="tournament-quick-info">
                            <div class="info-card">
                                <i class="fas fa-calendar-alt"></i>
                                <div>
                                    <span class="info-label">Date</span>
                                    <span class="info-value">${formattedDate}</span>
                                </div>
                            </div>
                            <div class="info-card">
                                <i class="fas fa-map-marker-alt"></i>
                                <div>
                                    <span class="info-label">Venue</span>
                                    <span class="info-value">${escapeHtml(tournament.venueName || 'TBD')}</span>
                                </div>
                            </div>
                            <div class="info-card">
                                <i class="fas fa-rupee-sign"></i>
                                <div>
                                    <span class="info-label">Entry Fee (Per Team)</span>
                                    <span class="info-value" style="color: var(--success); font-size: 1.2rem;">${formatCurrency(tournament.entryFee)}</span>
                                </div>
                            </div>
                            <div class="info-card">
                                <i class="fas fa-users"></i>
                                <div>
                                    <span class="info-label">Spots Left</span>
                                    <span class="info-value ${spotsLeft <= 5 ? 'urgent' : ''}">${spotsLeft}/${tournament.maxTeams}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Registration Form -->
                        <form id="tournament-registration-form" class="registration-form-modern">
                            <!-- Team Information Section -->
                            <div class="form-section-modern">
                                <div class="section-title-modern">
                                    <i class="fas fa-users"></i>
                                    <h3>Team Information</h3>
                                    <span class="team-size-badge">${teamSize} Players Required</span>
                                </div>
                                
                                <div class="form-group-modern-reg">
                                    <label>Team Name *</label>
                                    <div class="input-wrapper">
                                        <i class="fas fa-tag input-icon-modern"></i>
                                        <input type="text" id="team-name" class="form-input-modern-reg" 
                                               placeholder="e.g., Warriors, Strikers, Eagles" required>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Captain Information Section -->
                            <div class="form-section-modern">
                                <div class="section-title-modern">
                                    <i class="fas fa-crown"></i>
                                    <h3>Captain Information</h3>
                                </div>
                                
                                <div class="form-row-modern">
                                    <div class="form-group-modern-reg">
                                        <label>Captain Name *</label>
                                        <div class="input-wrapper">
                                            <i class="fas fa-user input-icon-modern"></i>
                                            <input type="text" id="captain-name" class="form-input-modern-reg" 
                                                   value="${escapeHtml(currentUser.name || currentUser.ownerName || '')}" required>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group-modern-reg">
                                        <label>Captain Phone *</label>
                                        <div class="input-wrapper">
                                            <i class="fas fa-phone input-icon-modern"></i>
                                            <input type="tel" id="captain-phone" class="form-input-modern-reg" 
                                                   value="${escapeHtml(currentUser.phone || '')}" 
                                                   placeholder="10-digit mobile number" maxlength="10" required>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="form-group-modern-reg">
                                    <label>Contact Number (for updates) *</label>
                                    <div class="input-wrapper">
                                        <i class="fas fa-mobile-alt input-icon-modern"></i>
                                        <input type="tel" id="contact-number" class="form-input-modern-reg" 
                                               value="${escapeHtml(currentUser.phone || '')}" 
                                               placeholder="Alternate contact number" maxlength="10" required>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Team Members Section -->
                            <div class="form-section-modern">
                                <div class="section-title-modern">
                                    <i class="fas fa-user-friends"></i>
                                    <h3>Team Members</h3>
                                    <span class="team-size-badge">${teamSize - 1} More Needed</span>
                                </div>
                                
                                <div class="players-container">
                                    <div class="players-header-modern">
                                        <span>Player List</span>
                                        <span>Add all team members</span>
                                    </div>
                                    <div id="player-list-container" class="player-list-modern">
                                        ${playersHtml}
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Payment Summary Section (Full Amount) -->
                            <div class="payment-summary-modern">
                                <div class="summary-header-modern">
                                    <i class="fas fa-receipt"></i>
                                    <h4>Registration Summary</h4>
                                </div>
                                <div class="summary-details-modern">
                                    <div class="summary-row">
                                        <span>Tournament Entry Fee (per team)</span>
                                        <span class="summary-value">${formatCurrency(tournament.entryFee)}</span>
                                    </div>
                                    <div class="summary-row">
                                        <span>Platform Fee (20%)</span>
                                        <span class="summary-value">${formatCurrency(tournament.entryFee * 0.2)}</span>
                                    </div>
                                    <div class="summary-row total">
                                        <span>Total to Pay</span>
                                        <span class="summary-value total-amount">${formatCurrency(tournament.entryFee)}</span>
                                    </div>
                                </div>
                                <div class="payment-note-modern">
                                    <i class="fas fa-info-circle"></i>
                                    <span>Captain pays full entry fee. Your spot is reserved for 30 minutes.</span>
                                </div>
                            </div>
                            
                            <!-- Terms & Conditions -->
                            <div class="terms-checkbox-modern">
                                <input type="checkbox" id="agree-terms-reg" required>
                                <label for="agree-terms-reg">
                                    I confirm that all information provided is accurate and I agree to the 
                                    <a href="#" onclick="showTerms(); return false;">Terms & Conditions</a> and 
                                    <a href="#" onclick="showCancellationPolicy(); return false;">Cancellation Policy</a>.
                                </label>
                            </div>
                            
                            <button type="submit" class="register-submit-btn-modern" id="register-submit-btn">
                                <i class="fas fa-credit-card"></i>
                                <span>Pay ${formatCurrency(tournament.entryFee)} & Register</span>
                                <i class="fas fa-arrow-right"></i>
                            </button>
                        </form>
                    </div>
                </div>
            `;
            
            // Add event listeners
            const form = document.getElementById('tournament-registration-form');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    processTournamentRegistration(tournamentId);
                });
            }
            
            // Add phone input validation
            const phoneInputs = ['captain-phone', 'contact-number'];
            phoneInputs.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.addEventListener('input', function() {
                        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
                    });
                }
            });
            
            // Add player input validation
            document.querySelectorAll('.player-input-modern').forEach(input => {
                input.addEventListener('input', function() {
                    if (this.value.trim() === '') {
                        this.classList.add('error');
                    } else {
                        this.classList.remove('error');
                    }
                });
            });
            
            window.scrollTo(0, 0);
            hideLoading();
            showPage('tournament-registration-page');
        })
        .catch(error => {
            hideLoading();
            console.error('Error loading tournament:', error);
            showToast('Error loading tournament details', 'error');
        });
}


// ==================== UPDATED PROCESS TOURNAMENT REGISTRATION ====================

// ==================== UPDATED PROCESS TOURNAMENT REGISTRATION (NO PAYMENT WITHOUT CONFIRMATION) ====================

async function processTournamentRegistration(tournamentId) {
    const teamName = document.getElementById('team-name')?.value.trim();
    const captainName = document.getElementById('captain-name')?.value.trim();
    const captainPhone = document.getElementById('captain-phone')?.value.trim();
    const contactNumber = document.getElementById('contact-number')?.value.trim();
    const agreeTerms = document.getElementById('agree-terms-reg')?.checked;
    
    // Get all player names
    const playerInputs = document.querySelectorAll('.player-input-modern');
    const players = [captainName];
    playerInputs.forEach(input => {
        if (input.value.trim()) {
            players.push(input.value.trim());
        }
    });
    
    // Validation with visual feedback
    let isValid = true;
    
    // Clear previous error styles
    document.querySelectorAll('.form-input-modern-reg').forEach(input => {
        input.classList.remove('error');
    });
    
    if (!teamName) {
        showFieldError('team-name', 'Please enter your team name');
        isValid = false;
    } else if (teamName.length < 3) {
        showFieldError('team-name', 'Team name must be at least 3 characters');
        isValid = false;
    }
    
    if (!captainName) {
        showFieldError('captain-name', 'Please enter captain name');
        isValid = false;
    }
    
    if (!captainPhone) {
        showFieldError('captain-phone', 'Please enter captain phone number');
        isValid = false;
    } else if (captainPhone.length !== 10) {
        showFieldError('captain-phone', 'Please enter a valid 10-digit phone number');
        isValid = false;
    }
    
    if (!contactNumber) {
        showFieldError('contact-number', 'Please enter contact number');
        isValid = false;
    } else if (contactNumber.length !== 10) {
        showFieldError('contact-number', 'Please enter a valid 10-digit contact number');
        isValid = false;
    }
    
    if (!agreeTerms) {
        showToast('Please agree to the tournament terms and conditions', 'error');
        isValid = false;
    }
    
    // Check team size
    const tournament = currentTournament;
    const expectedTeamSize = tournament.teamSize || 11;
    
    console.log('Expected team size:', expectedTeamSize);
    console.log('Players collected:', players);
    console.log('Number of players:', players.length);
    
    if (players.length !== expectedTeamSize) {
        showToast(`Team must have exactly ${expectedTeamSize} players (including captain). Currently you have ${players.length} players.`, 'error');
        isValid = false;
    }
    
    // Also check if any player names are empty
    const emptyPlayers = players.filter(p => !p || p === '');
    if (emptyPlayers.length > 0 && isValid) {
        showToast(`Please fill in all player names. ${emptyPlayers.length} player(s) missing.`, 'error');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show loading on button
    const submitBtn = document.getElementById('register-submit-btn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    submitBtn.disabled = true;
    
    showLoading('Preparing registration...');
    
    try {
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId);
        const tournamentDoc = await tournamentRef.get();
        
        if (!tournamentDoc.exists) {
            throw new Error('Tournament not found');
        }
        
        const tournamentData = tournamentDoc.data();
        
        // Check if tournament is full
        if (tournamentData.registeredTeams && tournamentData.registeredTeams.length >= tournamentData.maxTeams) {
            throw new Error('Tournament is full. Cannot register at this time.');
        }
        
        // Check if tournament has started
        const today = new Date();
        const startDate = new Date(tournamentData.startDate);
        if (startDate <= today) {
            throw new Error('Registration closed. Tournament has already started.');
        }
        
        const registrationId = generateId('REG');
        
        // Get user name from currentUser
        let userName = '';
        if (currentUser.name) {
            userName = currentUser.name;
        } else if (currentUser.ownerName) {
            userName = currentUser.ownerName;
        } else if (currentUser.displayName) {
            userName = currentUser.displayName;
        } else {
            userName = currentUser.email?.split('@')[0] || 'Player';
        }
        
        // Store registration data in session storage temporarily
        const pendingRegistration = {
            registrationId: registrationId,
            tournamentId: tournamentId,
            tournamentName: tournamentData.tournamentName,
            teamName: teamName,
            captainName: captainName,
            captainPhone: captainPhone,
            contactNumber: contactNumber,
            players: players,
            entryFee: tournamentData.entryFee,
            userId: currentUser.uid,
            userName: userName,
            userEmail: currentUser.email,
            userPhone: currentUser.phone
        };
        
        sessionStorage.setItem('pendingTournamentRegistration', JSON.stringify(pendingRegistration));
        
        hideLoading();
        
        // Reset button
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        
        // Show payment modal - NO DATABASE WRITE YET
        showTournamentPayment(tournamentData, registrationId, teamName);
        
    } catch (error) {
        hideLoading();
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        console.error('Error preparing registration:', error);
        showToast(error.message, 'error');
    }
}

// Show registration success with Razorpay payment option
function showRegistrationSuccessWithRazorpay(tournament, registrationId, teamName) {
    let modal = document.getElementById('registration-success-razorpay-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="registration-success-razorpay-modal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> Registration Successful!</h3>
                        <button class="close-btn" id="close-success-razorpay-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="text-align: center;">
                            <div style="width: 80px; height: 80px; background: linear-gradient(135deg, var(--success), #059669); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-xl);">
                                <i class="fas fa-trophy" style="font-size: 2.5rem; color: white;"></i>
                            </div>
                            <h3 style="font-size: var(--font-xl); margin-bottom: var(--space-md);">Team Registered!</h3>
                            <p style="color: var(--gray-600); margin-bottom: var(--space-xl);">Your team has been successfully registered for the tournament.</p>
                            
                            <div style="background: var(--gray-50); border-radius: var(--radius); padding: var(--space-lg); text-align: left; margin-bottom: var(--space-xl);">
                                <p><strong>🏆 Tournament:</strong> ${escapeHtml(tournament.tournamentName)}</p>
                                <p><strong>👥 Team Name:</strong> ${escapeHtml(teamName)}</p>
                                <p><strong>📋 Registration ID:</strong> ${registrationId}</p>
                                <p><strong>💰 Entry Fee:</strong> ${formatCurrency(tournament.entryFee)}</p>
                                <p><strong>⏳ Status:</strong> <span style="color: var(--warning);">Pending Payment</span></p>
                            </div>
                            
                            <div style="background: var(--primary-50); padding: var(--space-md); border-radius: var(--radius); margin-bottom: var(--space-xl);">
                                <i class="fas fa-credit-card"></i>
                                <span style="margin-left: var(--space-sm);">Complete payment to confirm your registration</span>
                            </div>
                            
                            <div style="display: flex; gap: var(--space-md);">
                                <button id="proceed-to-razorpay" style="flex: 2; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer;">
                                    <i class="fas fa-arrow-right"></i> Proceed to Payment
                                </button>
                                <button id="view-details-razorpay" style="flex: 1; background: var(--gray-100); color: var(--gray-700); border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer;">
                                    <i class="fas fa-eye"></i> Details
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-success-razorpay-modal').addEventListener('click', () => {
            closeModal('registration-success-razorpay-modal');
            goBack();
        });
    }
    
    const modalEl = document.getElementById('registration-success-razorpay-modal');
    modalEl.classList.add('active');
    
    document.getElementById('proceed-to-razorpay').onclick = () => {
        closeModal('registration-success-razorpay-modal');
        showTournamentPayment(tournament, registrationId, teamName);
    };
    
    document.getElementById('view-details-razorpay').onclick = () => {
        closeModal('registration-success-razorpay-modal');
        if (currentTournament) {
            viewTournamentDetails(currentTournament.id);
        } else {
            goBack();
        }
    };
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('error');
        field.focus();
        showToast(message, 'error');
        
        // Remove error class after 3 seconds
        setTimeout(() => {
            field.classList.remove('error');
        }, 3000);
    } else {
        showToast(message, 'error');
    }
}

function showModernRegistrationSuccessModal(tournament, registrationId, teamName) {
    // Remove any existing modal
    const existingModal = document.getElementById('registration-success-modern-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHtml = `
        <div id="registration-success-modern-modal" class="modal">
            <div class="modal-content success-modal-content">
                <div class="success-modal-header">
                    <div class="success-animation">
                        <div class="success-circle">
                            <i class="fas fa-check"></i>
                        </div>
                    </div>
                    <button class="close-btn-modal" onclick="closeModal('registration-success-modern-modal')">&times;</button>
                </div>
                <div class="success-modal-body">
                    <h2>Registration Successful!</h2>
                    <p>Your team has been successfully registered for the tournament.</p>
                    
                    <div class="registration-details-card">
                        <div class="detail-row">
                            <span class="detail-label">Tournament</span>
                            <span class="detail-value">${escapeHtml(tournament.tournamentName)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Team Name</span>
                            <span class="detail-value">${escapeHtml(teamName)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Registration ID</span>
                            <span class="detail-value highlight">${registrationId}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Entry Fee</span>
                            <span class="detail-value">${formatCurrency(tournament.entryFee)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value status-pending">Pending Payment</span>
                        </div>
                    </div>
                    
                    <div class="payment-action-card">
                        <i class="fas fa-credit-card"></i>
                        <div>
                            <h4>Complete Payment to Confirm</h4>
                            <p>Your spot is reserved for 30 minutes. Complete payment to secure your registration.</p>
                        </div>
                    </div>
                    
                    <div class="success-buttons">
                        <button class="btn-primary-modern" id="proceed-to-payment-modern">
                            <i class="fas fa-arrow-right"></i> Proceed to Payment
                        </button>
                        <button class="btn-secondary-modern" id="view-registration-modern">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modal = document.getElementById('registration-success-modern-modal');
    modal.classList.add('active');
    
    document.getElementById('proceed-to-payment-modern').onclick = () => {
        closeModal('registration-success-modern-modal');
        showTournamentPayment(tournament, registrationId, teamName);
    };
    
    document.getElementById('view-registration-modern').onclick = () => {
        closeModal('registration-success-modern-modal');
        if (currentTournament) {
            viewTournamentDetails(currentTournament.id);
        } else {
            goHome();
        }
    };
}

function showAlreadyRegisteredModal(registration) {
    const modal = document.getElementById('already-registered-modal');
    if (!modal) {
        const modalHtml = `
            <div id="already-registered-modal" class="modal">
                <div class="modal-content" style="max-width: 350px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-info-circle" style="color: var(--warning);"></i> Already Registered</h3>
                        <button class="close-btn" id="close-already-registered-modal">&times;</button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <div style="font-size: 3rem; margin-bottom: var(--space-lg);">
                            <i class="fas fa-check-circle" style="color: var(--success);"></i>
                        </div>
                        <h4>You have already registered for this tournament!</h4>
                        <p style="margin: var(--space-md) 0;"><strong>Team:</strong> ${escapeHtml(registration.teamName)}</p>
                        <p><strong>Status:</strong> <span class="registration-status ${registration.status}">${registration.status}</span></p>
                        <p style="margin-top: var(--space-md);">You will be notified when your registration is confirmed.</p>
                        <button class="auth-btn" onclick="closeModal('already-registered-modal')" style="margin-top: var(--space-lg);">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('close-already-registered-modal').addEventListener('click', () => {
            closeModal('already-registered-modal');
            goBack();
        });
    }
    
    document.getElementById('already-registered-modal').classList.add('active');
}
// ==================== TOURNAMENT REGISTRATIONS MANAGEMENT ====================

function showTournamentRegistrations(tournamentId) {
    showLoading('Loading registrations...');
    
    db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
        .where('tournamentId', '==', tournamentId)
        .orderBy('registeredAt', 'desc')
        .get()
        .then(async (snapshot) => {
            const container = document.getElementById('tournament-registrations-list');
            
            if (!container) {
                console.error('Container not found');
                hideLoading();
                return;
            }
            
            // Get tournament details
            const tournamentDoc = await db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId).get();
            const tournament = tournamentDoc.data();
            
            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="registrations-empty">
                        <i class="fas fa-users-slash"></i>
                        <h3>No Registrations Yet</h3>
                        <p>No teams have registered for this tournament yet.</p>
                        <button class="auth-btn" onclick="closeModal('tournament-registration-modal')" style="margin-top: var(--space-lg);">Close</button>
                    </div>
                `;
                hideLoading();
                document.getElementById('tournament-registration-modal').classList.add('active');
                return;
            }
            
            const pendingCount = snapshot.docs.filter(doc => doc.data().status === 'pending').length;
            const confirmedCount = snapshot.docs.filter(doc => doc.data().status === 'confirmed').length;
            const rejectedCount = snapshot.docs.filter(doc => doc.data().status === 'rejected').length;
            
            let html = `
                <div class="registrations-summary-card">
                    <h3>Tournament Registrations</h3>
                    <p>${tournament.tournamentName}</p>
                    <div class="summary-stats">
                        <div class="stat-box">
                            <span class="stat-number">${snapshot.size}</span>
                            <span class="stat-label">Total</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-number" style="color: var(--warning);">${pendingCount}</span>
                            <span class="stat-label">Pending</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-number" style="color: var(--success);">${confirmedCount}</span>
                            <span class="stat-label">Approved</span>
                        </div>
                        <div class="stat-box">
                            <span class="stat-number" style="color: var(--danger);">${rejectedCount}</span>
                            <span class="stat-label">Rejected</span>
                        </div>
                    </div>
                </div>
            `;
            
            for (const doc of snapshot.docs) {
                const reg = doc.data();
                const registrationDate = reg.registeredAt ? new Date(reg.registeredAt.toDate()) : new Date();
                const formattedDate = registrationDate.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                });
                const formattedTime = registrationDate.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
                const paymentStatus = reg.paymentStatus || 'pending';
                const paymentStatusClass = paymentStatus === 'success' ? 'success' : paymentStatus === 'pending' ? 'pending' : 'failed';
                const paymentStatusIcon = paymentStatus === 'success' ? 'fa-check-circle' : paymentStatus === 'pending' ? 'fa-clock' : 'fa-times-circle';
                const paymentStatusText = paymentStatus === 'success' ? 'Payment Completed' : paymentStatus === 'pending' ? 'Payment Pending' : 'Payment Failed';
                
                const statusClass = reg.status === 'confirmed' ? 'confirmed' : reg.status === 'pending' ? 'pending' : 'rejected';
                const statusIcon = reg.status === 'confirmed' ? 'fa-check-circle' : reg.status === 'pending' ? 'fa-clock' : 'fa-times-circle';
                const statusText = reg.status === 'confirmed' ? 'Approved' : reg.status === 'pending' ? 'Pending Approval' : 'Rejected';
                
                html += `
                    <div class="registration-item" data-reg-id="${reg.registrationId}">
                        <div class="registration-header">
                            <div class="registration-team-name">
                                <i class="fas fa-users"></i>
                                ${escapeHtml(reg.teamName)}
                            </div>
                            <div class="registration-badges">
                                <span class="registration-status ${statusClass}">
                                    <i class="fas ${statusIcon}"></i>
                                    ${statusText}
                                </span>
                                <span class="payment-status-badge ${paymentStatusClass}">
                                    <i class="fas ${paymentStatusIcon}"></i>
                                    ${paymentStatusText}
                                </span>
                            </div>
                        </div>
                        
                        <div class="registration-details-grid">
                            <div class="registration-detail-card">
                                <div class="detail-header">
                                    <i class="fas fa-crown"></i>
                                    <span>Captain Info</span>
                                </div>
                                <div class="detail-content">
                                    <div class="detail-row">
                                        <span class="detail-label">Name:</span>
                                        <span class="detail-value">${escapeHtml(reg.captainName)}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Phone:</span>
                                        <span class="detail-value">${escapeHtml(reg.captainPhone)}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Email:</span>
                                        <span class="detail-value">${escapeHtml(reg.userEmail || 'Not provided')}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="registration-detail-card">
                                <div class="detail-header">
                                    <i class="fas fa-info-circle"></i>
                                    <span>Registration Info</span>
                                </div>
                                <div class="detail-content">
                                    <div class="detail-row">
                                        <span class="detail-label">Registration ID:</span>
                                        <span class="detail-value">${reg.registrationId}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Date:</span>
                                        <span class="detail-value">${formattedDate}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Time:</span>
                                        <span class="detail-value">${formattedTime}</span>
                                    </div>
                                    <div class="detail-row">
                                        <span class="detail-label">Entry Fee:</span>
                                        <span class="detail-value highlight">${formatCurrency(reg.entryFee)}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="players-section">
                                <div class="players-header">
                                    <i class="fas fa-user-friends"></i>
                                    <h4>Team Members</h4>
                                    <span>${reg.players?.length || 0} Players</span>
                                </div>
                                <div class="players-grid-modern">
                                    ${reg.players?.map((player, idx) => `
                                        <div class="player-item-modern-card">
                                            <div class="player-number-badge">${idx + 1}</div>
                                            <span class="player-name-text">${escapeHtml(player)}</span>
                                        </div>
                                    `).join('') || '<div class="player-item-modern-card">No players listed</div>'}
                                </div>
                            </div>
                        </div>
                        
                        ${reg.status === 'pending' ? `
                            <div class="registration-actions-bar">
                                <button class="approve-btn" onclick="approveTournamentRegistration('${reg.registrationId}')">
                                    <i class="fas fa-check"></i> Approve Registration
                                </button>
                                <button class="reject-btn" onclick="rejectTournamentRegistration('${reg.registrationId}')">
                                    <i class="fas fa-times"></i> Reject Registration
                                </button>
                            </div>
                        ` : reg.status === 'confirmed' ? `
                            <div class="registration-status-card confirmed">
                                <div class="status-icon-large confirmed">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                                <div class="status-title">Registration Approved</div>
                                <div class="status-message">This team has been confirmed for the tournament.</div>
                                ${paymentStatus === 'success' ? 
                                    '<div class="detail-row"><span class="detail-label">Payment Status:</span><span class="detail-value" style="color: var(--success);">Payment Received ✓</span></div>' : 
                                    '<div class="detail-row"><span class="detail-label">Payment Status:</span><span class="detail-value" style="color: var(--warning);">Payment Pending</span></div>'}
                            </div>
                        ` : reg.status === 'rejected' ? `
                            <div class="registration-status-card rejected">
                                <div class="status-icon-large rejected">
                                    <i class="fas fa-times-circle"></i>
                                </div>
                                <div class="status-title">Registration Rejected</div>
                                <div class="status-message">This registration has been rejected.</div>
                                ${reg.rejectionReason ? `
                                    <div class="rejection-reason-box">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        <strong>Reason:</strong> ${escapeHtml(reg.rejectionReason)}
                                    </div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            }
            
            container.innerHTML = html;
            hideLoading();
            document.getElementById('tournament-registration-modal').classList.add('active');
        })
        .catch(error => {
            hideLoading();
            console.error('Error loading registrations:', error);
            showToast('Error loading registrations: ' + error.message, 'error');
            const container = document.getElementById('tournament-registrations-list');
            if (container) {
                container.innerHTML = `
                    <div class="registrations-empty">
                        <i class="fas fa-exclamation-circle"></i>
                        <h3>Error Loading Registrations</h3>
                        <p>${error.message}</p>
                        <button class="auth-btn" onclick="closeModal('tournament-registration-modal')" style="margin-top: var(--space-lg);">Close</button>
                    </div>
                `;
            }
        });
}

// Enhanced approve function
async function approveTournamentRegistration(registrationId) {
    if (!confirm('Approve this team for the tournament? This will confirm their participation.')) return;
    
    showLoading('Approving registration...');
    
    try {
        const regSnapshot = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('registrationId', '==', registrationId)
            .get();
        
        if (regSnapshot.empty) {
            throw new Error('Registration not found');
        }
        
        const registration = regSnapshot.docs[0].data();
        const registrationRef = regSnapshot.docs[0].ref;
        
        // Update registration status
        await registrationRef.update({
            status: REGISTRATION_STATUS.CONFIRMED,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update tournament registered teams
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(registration.tournamentId);
        const tournamentDoc = await tournamentRef.get();
        
        if (tournamentDoc.exists) {
            const tournament = tournamentDoc.data();
            const updatedTeams = (tournament.registeredTeams || []).map(team => {
                if (team.registrationId === registrationId) {
                    return { 
                        ...team, 
                        status: REGISTRATION_STATUS.CONFIRMED,
                        approvedAt: new Date().toISOString(),
                        approvedBy: currentUser.uid
                    };
                }
                return team;
            });
            
            await tournamentRef.update({
                registeredTeams: updatedTeams,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        hideLoading();
        showToast('Registration approved successfully!', 'success');
        
        // Refresh the registrations view
        showTournamentRegistrations(registration.tournamentId);
        
    } catch (error) {
        hideLoading();
        console.error('Error approving registration:', error);
        showToast('Error approving registration: ' + error.message, 'error');
    }
}

// Enhanced reject function
async function rejectTournamentRegistration(registrationId) {
    const reason = prompt('Please provide a reason for rejection (optional):');
    
    if (!confirm('Reject this team from the tournament? This action cannot be undone.')) return;
    
    showLoading('Rejecting registration...');
    
    try {
        const regSnapshot = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('registrationId', '==', registrationId)
            .get();
        
        if (regSnapshot.empty) {
            throw new Error('Registration not found');
        }
        
        const registration = regSnapshot.docs[0].data();
        
        await regSnapshot.docs[0].ref.update({
            status: REGISTRATION_STATUS.REJECTED,
            rejectionReason: reason || 'No reason provided',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(registration.tournamentId);
        const tournamentDoc = await tournamentRef.get();
        
        if (tournamentDoc.exists) {
            const tournament = tournamentDoc.data();
            const updatedTeams = (tournament.registeredTeams || []).map(team => {
                if (team.registrationId === registrationId) {
                    return { 
                        ...team, 
                        status: REGISTRATION_STATUS.REJECTED,
                        rejectionReason: reason || 'No reason provided',
                        rejectedAt: new Date().toISOString(),
                        rejectedBy: currentUser.uid
                    };
                }
                return team;
            });
            
            await tournamentRef.update({
                registeredTeams: updatedTeams,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        hideLoading();
        showToast('Registration rejected', 'info');
        
        // Refresh the registrations view
        showTournamentRegistrations(registration.tournamentId);
        
    } catch (error) {
        hideLoading();
        console.error('Error rejecting registration:', error);
        showToast('Error rejecting registration: ' + error.message, 'error');
    }
}
// ==================== PROFESSIONAL TOURNAMENT REGISTRATION ====================

// ==================== PROFESSIONAL TOURNAMENT REGISTRATION ====================

function showTournamentRegistration(tournamentId) {
    if (!currentUser) {
        showToast('Please login to register', 'warning');
        return;
    }
    
    showLoading('Loading registration form...');
    
    // Get user name from currentUser
    let userName = '';
    if (currentUser.name) {
        userName = currentUser.name;
    } else if (currentUser.ownerName) {
        userName = currentUser.ownerName;
    } else if (currentUser.displayName) {
        userName = currentUser.displayName;
    } else {
        userName = currentUser.email?.split('@')[0] || 'Player';
    }
    
    // Get user phone
    let userPhone = currentUser.phone || '';
    
    // Get tournament details
    db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId).get()
        .then(async (doc) => {
            if (!doc.exists) {
                showToast('Tournament not found', 'error');
                hideLoading();
                return;
            }
            
            const tournament = doc.data();
            currentTournament = { id: doc.id, ...tournament };
            
            // Check if already registered
            const existingReg = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
                .where('tournamentId', '==', tournamentId)
                .where('userId', '==', currentUser.uid)
                .get();
            
            if (!existingReg.empty) {
                hideLoading();
                showAlreadyRegisteredModal(existingReg.docs[0].data());
                return;
            }
            
            const container = document.getElementById('tournament-registration-content');
            const startDate = new Date(tournament.startDate);
            const formattedDate = startDate.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            const registeredTeams = tournament.registeredTeams?.length || 0;
            const spotsLeft = tournament.maxTeams - registeredTeams;
            
            // Create player list HTML
            let playersHtml = '';
            for (let i = 1; i < tournament.teamSize; i++) {
                playersHtml += `
                    <div class="player-item-modern" data-player-index="${i}">
                        <div class="player-number">${i + 1}</div>
                        <input type="text" class="player-input-modern" 
                               placeholder="Player ${i + 1} Name" 
                               data-player="${i}">
                    </div>
                `;
            }
            
            container.innerHTML = `
                <div class="tournament-registration-container">
                    <div class="registration-card-modern">
                        <!-- Tournament Header Banner -->
                        <div class="registration-banner">
                            <div class="banner-overlay"></div>
                            <div class="banner-content">
                                <div class="tournament-icon-large">
                                    <i class="fas fa-trophy"></i>
                                </div>
                                <h2>${escapeHtml(tournament.tournamentName)}</h2>
                                <p>Register your team and compete for glory!</p>
                            </div>
                        </div>
                        
                        <!-- Tournament Quick Info -->
                        <div class="tournament-quick-info">
                            <div class="info-card">
                                <i class="fas fa-calendar-alt"></i>
                                <div>
                                    <span class="info-label">Date</span>
                                    <span class="info-value">${formattedDate}</span>
                                </div>
                            </div>
                            <div class="info-card">
                                <i class="fas fa-map-marker-alt"></i>
                                <div>
                                    <span class="info-label">Venue</span>
                                    <span class="info-value">${escapeHtml(tournament.venueName || 'TBD')}</span>
                                </div>
                            </div>
                            <div class="info-card">
                                <i class="fas fa-rupee-sign"></i>
                                <div>
                                    <span class="info-label">Entry Fee</span>
                                    <span class="info-value">${formatCurrency(tournament.entryFee)}</span>
                                </div>
                            </div>
                            <div class="info-card">
                                <i class="fas fa-users"></i>
                                <div>
                                    <span class="info-label">Spots Left</span>
                                    <span class="info-value ${spotsLeft <= 5 ? 'urgent' : ''}">${spotsLeft}/${tournament.maxTeams}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Registration Form -->
                        <form id="tournament-registration-form" class="registration-form-modern">
                            <!-- Team Information Section -->
                            <div class="form-section-modern">
                                <div class="section-title-modern">
                                    <i class="fas fa-users"></i>
                                    <h3>Team Information</h3>
                                    <span class="team-size-badge">${tournament.teamSize} Players Required</span>
                                </div>
                                
                                <div class="form-group-modern-reg">
                                    <label>Team Name *</label>
                                    <div class="input-wrapper">
                                        <i class="fas fa-tag input-icon-modern"></i>
                                        <input type="text" id="team-name" class="form-input-modern-reg" 
                                               placeholder="e.g., Warriors, Strikers, Eagles" 
                                               required>
                                    </div>
                                    <div class="form-hint-modern">Choose a unique and catchy team name</div>
                                </div>
                            </div>
                            
                            <!-- Captain Information Section -->
                            <div class="form-section-modern">
                                <div class="section-title-modern">
                                    <i class="fas fa-crown"></i>
                                    <h3>Captain Information</h3>
                                </div>
                                
                                <div class="form-row-modern">
                                    <div class="form-group-modern-reg">
                                        <label>Captain Name *</label>
                                        <div class="input-wrapper">
                                            <i class="fas fa-user input-icon-modern"></i>
                                            <input type="text" id="captain-name" class="form-input-modern-reg" 
                                                   value="${escapeHtml(userName)}" required>
                                        </div>
                                    </div>
                                    
                                    <div class="form-group-modern-reg">
                                        <label>Captain Phone *</label>
                                        <div class="input-wrapper">
                                            <i class="fas fa-phone input-icon-modern"></i>
                                            <input type="tel" id="captain-phone" class="form-input-modern-reg" 
                                                   value="${escapeHtml(userPhone)}" 
                                                   placeholder="10-digit mobile number" 
                                                   maxlength="10" required>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="form-group-modern-reg">
                                    <label>Contact Number (for updates) *</label>
                                    <div class="input-wrapper">
                                        <i class="fas fa-mobile-alt input-icon-modern"></i>
                                        <input type="tel" id="contact-number" class="form-input-modern-reg" 
                                               value="${escapeHtml(userPhone)}" 
                                               placeholder="Alternate contact number" 
                                               maxlength="10" required>
                                    </div>
                                    <div class="form-hint-modern">We'll send important updates to this number</div>
                                </div>
                            </div>
                            
                            <!-- Team Members Section -->
                            <div class="form-section-modern">
                                <div class="section-title-modern">
                                    <i class="fas fa-user-friends"></i>
                                    <h3>Team Members</h3>
                                    <span class="team-size-badge">${tournament.teamSize - 1} More Needed</span>
                                </div>
                                
                                <div class="players-container">
                                    <div class="players-header-modern">
                                        <span>Player List</span>
                                        <span>Add all team members</span>
                                    </div>
                                    <div id="player-list-container" class="player-list-modern">
                                        ${playersHtml}
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Payment Summary Section -->
                            <div class="payment-summary-modern">
                                <div class="summary-header-modern">
                                    <i class="fas fa-receipt"></i>
                                    <h4>Registration Summary</h4>
                                </div>
                                <div class="summary-details-modern">
                                    <div class="summary-row">
                                        <span>Entry Fee (per team)</span>
                                        <span class="summary-value">${formatCurrency(tournament.entryFee)}</span>
                                    </div>
                                    <div class="summary-row">
                                        <span>Platform Fee (20%)</span>
                                        <span class="summary-value">${formatCurrency(tournament.entryFee * 0.2)}</span>
                                    </div>
                                    <div class="summary-row total">
                                        <span>Total to Pay</span>
                                        <span class="summary-value total-amount">${formatCurrency(tournament.entryFee)}</span>
                                    </div>
                                </div>
                                <div class="payment-note-modern">
                                    <i class="fas fa-shield-alt"></i>
                                    <span>Secure payment through UPI. Your spot is reserved for 30 minutes.</span>
                                </div>
                            </div>
                            
                            <!-- Terms & Conditions -->
                            <div class="terms-checkbox-modern">
                                <input type="checkbox" id="agree-terms-reg" required>
                                <label for="agree-terms-reg">
                                    I confirm that all information provided is accurate and I agree to the 
                                    <a href="#" onclick="showTerms(); return false;">Terms & Conditions</a> and 
                                    <a href="#" onclick="showCancellationPolicy(); return false;">Cancellation Policy</a>.
                                </label>
                            </div>
                            
                            <button type="submit" class="register-submit-btn-modern" id="register-submit-btn">
                                <i class="fas fa-credit-card"></i>
                                <span>Proceed to Payment</span>
                                <i class="fas fa-arrow-right"></i>
                            </button>
                        </form>
                    </div>
                </div>
            `;
            
            // Add event listeners
            const form = document.getElementById('tournament-registration-form');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    processTournamentRegistration(tournamentId);
                });
            }
            
            // Add phone input validation
            const phoneInputs = ['captain-phone', 'contact-number'];
            phoneInputs.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.addEventListener('input', function() {
                        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
                    });
                }
            });
            
            // Add player input validation
            document.querySelectorAll('.player-input-modern').forEach(input => {
                input.addEventListener('input', function() {
                    if (this.value.trim() === '') {
                        this.classList.add('error');
                    } else {
                        this.classList.remove('error');
                    }
                });
            });
            
            // Scroll to top
            window.scrollTo(0, 0);
            
            hideLoading();
            showPage('tournament-registration-page');
        })
        .catch(error => {
            hideLoading();
            console.error('Error loading tournament:', error);
            showToast('Error loading tournament details', 'error');
        });
}

async function processTournamentRegistration(tournamentId) {
    const teamName = document.getElementById('team-name')?.value.trim();
    const captainName = document.getElementById('captain-name')?.value.trim();
    const captainPhone = document.getElementById('captain-phone')?.value.trim();
    const contactNumber = document.getElementById('contact-number')?.value.trim();
    const agreeTerms = document.getElementById('agree-terms-reg')?.checked;
    
    // Get all player names
    const playerInputs = document.querySelectorAll('.player-input-modern');
    const players = [captainName];
    playerInputs.forEach(input => {
        if (input.value.trim()) {
            players.push(input.value.trim());
        }
    });
    
    // Validation with visual feedback
    let isValid = true;
    
    // Clear previous error styles
    document.querySelectorAll('.form-input-modern-reg').forEach(input => {
        input.classList.remove('error');
    });
    
    if (!teamName) {
        showFieldError('team-name', 'Please enter your team name');
        isValid = false;
    } else if (teamName.length < 3) {
        showFieldError('team-name', 'Team name must be at least 3 characters');
        isValid = false;
    }
    
    if (!captainName) {
        showFieldError('captain-name', 'Please enter captain name');
        isValid = false;
    }
    
    if (!captainPhone) {
        showFieldError('captain-phone', 'Please enter captain phone number');
        isValid = false;
    } else if (captainPhone.length !== 10) {
        showFieldError('captain-phone', 'Please enter a valid 10-digit phone number');
        isValid = false;
    }
    
    if (!contactNumber) {
        showFieldError('contact-number', 'Please enter contact number');
        isValid = false;
    } else if (contactNumber.length !== 10) {
        showFieldError('contact-number', 'Please enter a valid 10-digit contact number');
        isValid = false;
    }
    
    if (!agreeTerms) {
        showToast('Please agree to the tournament terms and conditions', 'error');
        isValid = false;
    }
    
    // Check team size
    const tournament = currentTournament;
    if (players.length !== tournament.teamSize) {
        showToast(`Team must have exactly ${tournament.teamSize} players (including captain)`, 'error');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show loading on button
    const submitBtn = document.getElementById('register-submit-btn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    submitBtn.disabled = true;
    
    showLoading('Processing registration...');
    
    try {
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId);
        const tournamentDoc = await tournamentRef.get();
        
        if (!tournamentDoc.exists) {
            throw new Error('Tournament not found');
        }
        
        const tournamentData = tournamentDoc.data();
        
        // Check if tournament is full
        if (tournamentData.registeredTeams && tournamentData.registeredTeams.length >= tournamentData.maxTeams) {
            throw new Error('Tournament is full. Cannot register at this time.');
        }
        
        // Check if tournament has started
        const today = new Date();
        const startDate = new Date(tournamentData.startDate);
        if (startDate <= today) {
            throw new Error('Registration closed. Tournament has already started.');
        }
        
        const registrationId = generateId('REG');
        
        // Get user name from currentUser
        let userName = '';
        if (currentUser.name) {
            userName = currentUser.name;
        } else if (currentUser.ownerName) {
            userName = currentUser.ownerName;
        } else if (currentUser.displayName) {
            userName = currentUser.displayName;
        } else {
            userName = currentUser.email?.split('@')[0] || 'Player';
        }
        
        const registrationData = {
            registrationId: registrationId,
            tournamentId: tournamentId,
            tournamentName: tournamentData.tournamentName,
            userId: currentUser.uid,
            userName: userName,
            userEmail: currentUser.email || '',
            userPhone: currentUser.phone || '',
            teamName: teamName,
            captainName: captainName,
            captainPhone: captainPhone,
            contactNumber: contactNumber,
            players: players,
            entryFee: tournamentData.entryFee,
            status: REGISTRATION_STATUS.PENDING,
            paymentStatus: PAYMENT_STATUS.PENDING,
            registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Remove any undefined fields
        Object.keys(registrationData).forEach(key => {
            if (registrationData[key] === undefined) {
                delete registrationData[key];
            }
        });
        
        await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS).add(registrationData);
        
        await tournamentRef.update({
            registeredTeams: firebase.firestore.FieldValue.arrayUnion({
                teamName: teamName,
                userId: currentUser.uid,
                userName: userName,
                captainName: captainName,
                players: players,
                registrationId: registrationId,
                status: REGISTRATION_STATUS.PENDING,
                paymentStatus: PAYMENT_STATUS.PENDING,
                registeredAt: new Date().toISOString()
            })
        });
        
        hideLoading();
        
        // Reset button
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        
        // Show success modal with modern design
        showModernRegistrationSuccessModal(tournamentData, registrationId, teamName);
        
    } catch (error) {
        hideLoading();
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        console.error('Error processing registration:', error);
        showToast(error.message, 'error');
    }
}

function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.classList.add('error');
        field.focus();
        showToast(message, 'error');
        
        // Remove error class after 3 seconds
        setTimeout(() => {
            field.classList.remove('error');
        }, 3000);
    } else {
        showToast(message, 'error');
    }
}

function showModernRegistrationSuccessModal(tournament, registrationId, teamName) {
    // Remove any existing modal
    const existingModal = document.getElementById('registration-success-modern-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHtml = `
        <div id="registration-success-modern-modal" class="modal">
            <div class="modal-content success-modal-content">
                <div class="success-modal-header">
                    <div class="success-animation">
                        <div class="success-circle">
                            <i class="fas fa-check"></i>
                        </div>
                    </div>
                    <button class="close-btn-modal" onclick="closeModal('registration-success-modern-modal')">&times;</button>
                </div>
                <div class="success-modal-body">
                    <h2>Registration Successful!</h2>
                    <p>Your team has been successfully registered for the tournament.</p>
                    
                    <div class="registration-details-card">
                        <div class="detail-row">
                            <span class="detail-label">Tournament</span>
                            <span class="detail-value">${escapeHtml(tournament.tournamentName)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Team Name</span>
                            <span class="detail-value">${escapeHtml(teamName)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Registration ID</span>
                            <span class="detail-value highlight">${registrationId}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Entry Fee</span>
                            <span class="detail-value">${formatCurrency(tournament.entryFee)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value status-pending">Pending Payment</span>
                        </div>
                    </div>
                    
                    <div class="payment-action-card">
                        <i class="fas fa-credit-card"></i>
                        <div>
                            <h4>Complete Payment to Confirm</h4>
                            <p>Your spot is reserved for 30 minutes. Complete payment to secure your registration.</p>
                        </div>
                    </div>
                    
                    <div class="success-buttons">
                        <button class="btn-primary-modern" id="proceed-to-payment-modern">
                            <i class="fas fa-arrow-right"></i> Proceed to Payment
                        </button>
                        <button class="btn-secondary-modern" id="view-registration-modern">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const modal = document.getElementById('registration-success-modern-modal');
    modal.classList.add('active');
    
    document.getElementById('proceed-to-payment-modern').onclick = () => {
        closeModal('registration-success-modern-modal');
        showTournamentPayment(tournament, registrationId, teamName);
    };
    
    document.getElementById('view-registration-modern').onclick = () => {
        closeModal('registration-success-modern-modal');
        if (currentTournament) {
            viewTournamentDetails(currentTournament.id);
        } else {
            goHome();
        }
    };
}

function showAlreadyRegisteredModal(registration) {
    // Remove any existing modal
    const existingModal = document.getElementById('already-registered-modal-modern');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modalHtml = `
        <div id="already-registered-modal-modern" class="modal">
            <div class="modal-content" style="max-width: 350px;">
                <div class="success-modal-header">
                    <div class="already-icon">
                        <i class="fas fa-info-circle"></i>
                    </div>
                    <button class="close-btn-modal" onclick="closeModal('already-registered-modal-modern')">&times;</button>
                </div>
                <div class="success-modal-body" style="text-align: center;">
                    <h2>Already Registered!</h2>
                    <p style="margin: var(--space-md) 0;">You have already registered for this tournament.</p>
                    
                    <div class="registration-details-card" style="margin: var(--space-lg) 0;">
                        <div class="detail-row">
                            <span class="detail-label">Team Name</span>
                            <span class="detail-value">${escapeHtml(registration.teamName)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Registration ID</span>
                            <span class="detail-value highlight">${registration.registrationId}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Status</span>
                            <span class="detail-value status-${registration.status}">${registration.status === 'pending' ? 'Pending Approval' : registration.status === 'confirmed' ? 'Confirmed' : 'Rejected'}</span>
                        </div>
                    </div>
                    
                    <p>You will be notified when your registration is confirmed.</p>
                    
                    <div class="success-buttons" style="margin-top: var(--space-xl);">
                        <button class="btn-primary-modern" onclick="closeModal('already-registered-modal-modern'); goBack();">
                            OK
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('already-registered-modal-modern').classList.add('active');
}

function addMorePlayers() {
    const container = document.getElementById('player-list-container');
    const currentPlayers = container.querySelectorAll('.player-item-modern').length;
    const newIndex = currentPlayers + 1;
    
    const newPlayerHtml = `
        <div class="player-item-modern" data-player-index="${currentPlayers}">
            <div class="player-input-wrapper">
                <span class="player-number">${newIndex + 1}</span>
                <input type="text" class="player-input" 
                       placeholder="Player ${newIndex + 2} Name" 
                       data-player="${currentPlayers}">
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', newPlayerHtml);
    
    // Animate new player entry
    const newPlayer = container.lastElementChild;
    newPlayer.style.animation = 'slideUp 0.3s ease';
    
    // Show toast
    showToast('Player added. You can add more if needed.', 'info');
}

function showAlreadyRegisteredModal(registration) {
    const modal = document.getElementById('already-registered-modal');
    if (!modal) {
        const modalHtml = `
            <div id="already-registered-modal" class="modal">
                <div class="modal-content" style="max-width: 350px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-info-circle" style="color: var(--warning);"></i> Already Registered</h3>
                        <button class="close-btn" id="close-already-registered-modal">&times;</button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <div style="font-size: 3rem; margin-bottom: var(--space-lg);">
                            <i class="fas fa-check-circle" style="color: var(--success);"></i>
                        </div>
                        <h4>You have already registered for this tournament!</h4>
                        <p style="margin: var(--space-md) 0;">Team: <strong>${escapeHtml(registration.teamName)}</strong></p>
                        <p>Status: <span class="registration-status ${registration.status}">${registration.status}</span></p>
                        <p style="margin-top: var(--space-md);">You will be notified when your registration is confirmed.</p>
                        <button class="auth-btn" onclick="closeModal('already-registered-modal')" style="margin-top: var(--space-lg);">OK</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.getElementById('close-already-registered-modal').addEventListener('click', () => {
            closeModal('already-registered-modal');
            goBack();
        });
    }
    
    document.getElementById('already-registered-modal').classList.add('active');
}

// Replace the existing processTournamentRegistration function with this corrected version

async function processTournamentRegistration(tournamentId) {
    const teamName = document.getElementById('team-name')?.value.trim();
    const captainName = document.getElementById('captain-name')?.value.trim();
    const captainPhone = document.getElementById('captain-phone')?.value.trim();
    const contactNumber = document.getElementById('contact-number')?.value.trim();
    const agreeTerms = document.getElementById('agree-terms-reg')?.checked;
    
    // Get all player names - IMPROVED COLLECTION
    const playerInputs = document.querySelectorAll('.player-input-modern');
    const players = [captainName];
    
    // Add all player names from inputs
    playerInputs.forEach(input => {
        const playerName = input.value.trim();
        if (playerName) {
            players.push(playerName);
        }
    });
    
    // Validation with visual feedback
    let isValid = true;
    
    // Clear previous error styles
    document.querySelectorAll('.form-input-modern-reg').forEach(input => {
        input.classList.remove('error');
    });
    
    if (!teamName) {
        showFieldError('team-name', 'Please enter your team name');
        isValid = false;
    } else if (teamName.length < 3) {
        showFieldError('team-name', 'Team name must be at least 3 characters');
        isValid = false;
    }
    
    if (!captainName) {
        showFieldError('captain-name', 'Please enter captain name');
        isValid = false;
    }
    
    if (!captainPhone) {
        showFieldError('captain-phone', 'Please enter captain phone number');
        isValid = false;
    } else if (captainPhone.length !== 10) {
        showFieldError('captain-phone', 'Please enter a valid 10-digit phone number');
        isValid = false;
    }
    
    if (!contactNumber) {
        showFieldError('contact-number', 'Please enter contact number');
        isValid = false;
    } else if (contactNumber.length !== 10) {
        showFieldError('contact-number', 'Please enter a valid 10-digit contact number');
        isValid = false;
    }
    
    if (!agreeTerms) {
        showToast('Please agree to the tournament terms and conditions', 'error');
        isValid = false;
    }
    
    // Check team size - FIXED: Show proper error message with actual counts
    const tournament = currentTournament;
    const expectedTeamSize = tournament.teamSize || 11;
    
    console.log('Expected team size:', expectedTeamSize);
    console.log('Players collected:', players);
    console.log('Number of players:', players.length);
    
    if (players.length !== expectedTeamSize) {
        showToast(`Team must have exactly ${expectedTeamSize} players (including captain). Currently you have ${players.length} players.`, 'error');
        isValid = false;
    }
    
    // Also check if any player names are empty
    const emptyPlayers = players.filter(p => !p || p === '');
    if (emptyPlayers.length > 0 && isValid) {
        showToast(`Please fill in all player names. ${emptyPlayers.length} player(s) missing.`, 'error');
        isValid = false;
    }
    
    if (!isValid) return;
    
    // Show loading on button
    const submitBtn = document.getElementById('register-submit-btn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> Processing...';
    submitBtn.disabled = true;
    
    showLoading('Processing registration...');
    
    try {
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId);
        const tournamentDoc = await tournamentRef.get();
        
        if (!tournamentDoc.exists) {
            throw new Error('Tournament not found');
        }
        
        const tournamentData = tournamentDoc.data();
        
        // Check if tournament is full
        if (tournamentData.registeredTeams && tournamentData.registeredTeams.length >= tournamentData.maxTeams) {
            throw new Error('Tournament is full. Cannot register at this time.');
        }
        
        // Check if tournament has started
        const today = new Date();
        const startDate = new Date(tournamentData.startDate);
        if (startDate <= today) {
            throw new Error('Registration closed. Tournament has already started.');
        }
        
        const registrationId = generateId('REG');
        
        // Get user name from currentUser
        let userName = '';
        if (currentUser.name) {
            userName = currentUser.name;
        } else if (currentUser.ownerName) {
            userName = currentUser.ownerName;
        } else if (currentUser.displayName) {
            userName = currentUser.displayName;
        } else {
            userName = currentUser.email?.split('@')[0] || 'Player';
        }
        
        const registrationData = {
            registrationId: registrationId,
            tournamentId: tournamentId,
            tournamentName: tournamentData.tournamentName,
            userId: currentUser.uid,
            userName: userName,
            userEmail: currentUser.email || '',
            userPhone: currentUser.phone || '',
            teamName: teamName,
            captainName: captainName,
            captainPhone: captainPhone,
            contactNumber: contactNumber,
            players: players, // This now includes captain + all other players
            entryFee: tournamentData.entryFee,
            status: REGISTRATION_STATUS.PENDING,
            paymentStatus: PAYMENT_STATUS.PENDING,
            registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Remove any undefined fields
        Object.keys(registrationData).forEach(key => {
            if (registrationData[key] === undefined) {
                delete registrationData[key];
            }
        });
        
        await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS).add(registrationData);
        
        await tournamentRef.update({
            registeredTeams: firebase.firestore.FieldValue.arrayUnion({
                teamName: teamName,
                userId: currentUser.uid,
                userName: userName,
                captainName: captainName,
                players: players,
                registrationId: registrationId,
                status: REGISTRATION_STATUS.PENDING,
                paymentStatus: PAYMENT_STATUS.PENDING,
                registeredAt: new Date().toISOString()
            })
        });
        
        hideLoading();
        
        // Reset button
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        
        // Show success modal with modern design
        showModernRegistrationSuccessModal(tournamentData, registrationId, teamName);
        
    } catch (error) {
        hideLoading();
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
        console.error('Error processing registration:', error);
        showToast(error.message, 'error');
    }
}

function showRegistrationSuccessModal(tournament, registrationId, teamName) {
    const modal = document.getElementById('registration-success-modal');
    if (!modal) {
        const modalHtml = `
            <div id="registration-success-modal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> Registration Successful!</h3>
                        <button class="close-btn" id="close-success-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="registration-success-modal">
                            <div class="success-icon-large">
                                <i class="fas fa-trophy"></i>
                            </div>
                            <h3 class="success-title">Team Registered!</h3>
                            <p class="success-message">Your team has been successfully registered for the tournament.</p>
                            
                            <div class="success-details">
                                <p><strong>🏆 Tournament:</strong> ${escapeHtml(tournament.tournamentName)}</p>
                                <p><strong>👥 Team Name:</strong> ${escapeHtml(teamName)}</p>
                                <p><strong>📋 Registration ID:</strong> ${registrationId}</p>
                                <p><strong>💰 Entry Fee:</strong> ${formatCurrency(tournament.entryFee)}</p>
                                <p><strong>⏳ Status:</strong> <span style="color: var(--warning);">Pending Payment</span></p>
                            </div>
                            
                            <div class="payment-note" style="background: var(--primary-50); padding: var(--space-md); border-radius: var(--radius); margin-bottom: var(--space-lg);">
                                <i class="fas fa-credit-card"></i>
                                <span>Complete payment to confirm your registration</span>
                            </div>
                            
                            <div class="success-actions">
                                <button class="btn-primary" id="proceed-to-payment">
                                    <i class="fas fa-arrow-right"></i> Proceed to Payment
                                </button>
                                <button class="btn-secondary" id="view-registration-details">
                                    <i class="fas fa-eye"></i> View Details
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-success-modal').addEventListener('click', () => {
            closeModal('registration-success-modal');
            goBack();
        });
    }
    
    const modalEl = document.getElementById('registration-success-modal');
    modalEl.classList.add('active');
    
    document.getElementById('proceed-to-payment').onclick = () => {
        closeModal('registration-success-modal');
        showTournamentPayment(tournament, registrationId, teamName);
    };
    
    document.getElementById('view-registration-details').onclick = () => {
        closeModal('registration-success-modal');
        if (currentTournament) {
            viewTournamentDetails(currentTournament.id);
        } else {
            goBack();
        }
    };
}

// ==================== PROFESSIONAL TOURNAMENT PAYMENT ====================

// ==================== UPDATED SHOW TOURNAMENT PAYMENT WITH RAZORPAY ====================

function showTournamentPayment(tournament, registrationId, teamName) {
    const amount = tournament.entryFee;
    const commission = amount * TOURNAMENT_COMMISSION_RATE;
    const ownerAmount = amount * (1 - TOURNAMENT_COMMISSION_RATE);
    
    const startDate = new Date(tournament.startDate);
    const formattedDate = startDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
    
    const container = document.getElementById('tournament-payment-content');
    
    container.innerHTML = `
        <div class="tournament-payment-container">
            <div class="payment-card">
                <div class="payment-header">
                    <div class="payment-header-icon">
                        <i class="fas fa-credit-card"></i>
                    </div>
                    <h2>Secure Payment</h2>
                    <p>Complete your tournament registration</p>
                </div>
                
                <div class="payment-amount-card">
                    <span class="payment-amount-label">Total Amount to Pay</span>
                    <div class="payment-amount-value">${formatCurrency(amount)}</div>
                    <span class="payment-amount-note">Includes platform fee</span>
                </div>
                
                <div class="tournament-summary-card">
                    <div class="summary-header">
                        <i class="fas fa-trophy"></i>
                        <h3>Tournament Details</h3>
                    </div>
                    <div class="summary-details">
                        <div class="summary-detail-item">
                            <i class="fas fa-tag"></i>
                            <div class="summary-detail-content">
                                <span class="summary-detail-label">Tournament Name</span>
                                <span class="summary-detail-value">${escapeHtml(tournament.tournamentName)}</span>
                            </div>
                        </div>
                        <div class="summary-detail-item">
                            <i class="fas fa-calendar-alt"></i>
                            <div class="summary-detail-content">
                                <span class="summary-detail-label">Start Date</span>
                                <span class="summary-detail-value">${formattedDate}</span>
                            </div>
                        </div>
                        <div class="summary-detail-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <div class="summary-detail-content">
                                <span class="summary-detail-label">Venue</span>
                                <span class="summary-detail-value">${escapeHtml(tournament.venueName)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="team-details-card">
                    <div class="team-details-header">
                        <i class="fas fa-users"></i>
                        <h3>Team Details</h3>
                    </div>
                    <div class="team-info-grid">
                        <div class="team-info-item">
                            <span class="team-info-label">Team Name</span>
                            <span class="team-info-value">${escapeHtml(teamName)}</span>
                        </div>
                        <div class="team-info-item">
                            <span class="team-info-label">Registration ID</span>
                            <span class="team-info-value">${registrationId}</span>
                        </div>
                    </div>
                </div>
                
                <div class="fee-breakdown-card">
                    <div class="fee-breakdown-header">
                        <i class="fas fa-chart-line"></i>
                        <h3>Fee Breakdown</h3>
                    </div>
                    <div class="fee-items">
                        <div class="fee-item">
                            <span class="fee-label">Tournament Entry Fee</span>
                            <span class="fee-amount">${formatCurrency(amount)}</span>
                        </div>
                        <div class="fee-item">
                            <span class="fee-label">Platform Fee (20%)</span>
                            <span class="fee-amount">${formatCurrency(commission)}</span>
                        </div>
                        <div class="fee-item total">
                            <span class="fee-label">You Pay</span>
                            <span class="fee-amount">${formatCurrency(amount)}</span>
                        </div>
                    </div>
                </div>
                
                <!-- Razorpay Payment Button -->
                <div style="margin: var(--space-xl);">
                    <button class="razorpay-payment-btn" id="razorpay-pay-btn" 
                            style="width: 100%; padding: var(--space-lg); background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; border-radius: var(--radius); font-size: var(--font-lg); font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: var(--space-md); transition: all var(--transition);">
                        <i class="fas fa-lock"></i>
                        Pay ${formatCurrency(amount)} via Razorpay
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <p class="payment-note-modern" style="margin-top: var(--space-md); text-align: center;">
                        <i class="fas fa-shield-alt"></i>
                        Secured by Razorpay | PCI DSS Compliant
                    </p>
                </div>
                
                <div class="security-badge" style="display: flex; justify-content: center; gap: var(--space-md); padding: var(--space-md); background: var(--gray-50); border-radius: var(--radius); margin: 0 var(--space-xl) var(--space-xl);">
                    <i class="fas fa-lock"></i>
                    <span>256-bit Encryption</span>
                    <i class="fas fa-shield-alt"></i>
                    <span>PCI DSS Compliant</span>
                </div>
            </div>
        </div>
    `;
    
    // Add click handler for Razorpay button
    const payBtn = document.getElementById('razorpay-pay-btn');
    if (payBtn) {
        payBtn.addEventListener('click', async () => {
            await initiateRazorpayPayment(tournament, registrationId, teamName);
        });
    }
    
    showPage('tournament-payment-page');
}
async function initiateTournamentPayment(tournament, registrationId, teamName, upiApp) {
    showLoading('Processing tournament payment...');
    
    try {
        // Get tournament details from currentTournament if not provided
        if (!tournament && currentTournament) {
            tournament = currentTournament;
        }
        
        if (!tournament) {
            throw new Error('Tournament information not found');
        }
        
        const amount = tournament.entryFee;
        
        // Generate unique transaction ID
        const transactionId = generateTransactionId('TRN_PAY');
        
        // Store pending tournament payment in session storage
        const pendingPayment = {
            registrationId: registrationId,
            tournamentId: tournament.tournamentId || tournament.id,
            tournamentName: tournament.tournamentName,
            teamName: teamName,
            amount: amount,
            transactionId: transactionId,
            initiatedAt: new Date().toISOString(),
            upiApp: upiApp
        };
        
        sessionStorage.setItem('pendingTournamentPayment', JSON.stringify(pendingPayment));
        
        // Create payment record in Firestore
        const paymentRecord = {
            paymentId: transactionId,
            transactionId: transactionId,
            registrationId: registrationId,
            tournamentId: tournament.tournamentId || tournament.id,
            tournamentName: tournament.tournamentName,
            userId: currentUser.uid,
            userName: currentUser.name || currentUser.ownerName || 'User',
            userEmail: currentUser.email,
            amount: amount,
            status: PAYMENT_STATUS.INITIATED,
            upiApp: upiApp,
            initiatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('tournament_payments').add(paymentRecord);
        
        // Update tournament registration with payment initiated status
        const registrationQuery = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('registrationId', '==', registrationId)
            .get();
        
        if (!registrationQuery.empty) {
            await registrationQuery.docs[0].ref.update({
                paymentStatus: PAYMENT_STATUS.INITIATED,
                transactionId: transactionId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        hideLoading();
        
        // Show payment instructions modal with UPI payment details
        showTournamentPaymentInstructions(tournament, registrationId, teamName, amount, upiApp, transactionId);
        
    } catch (error) {
        hideLoading();
        console.error('Tournament payment error:', error);
        showToast('Payment initiation failed: ' + error.message, 'error');
    }
}

// New function to show payment instructions
// ==================== SHOW TOURNAMENT PAYMENT INSTRUCTIONS ====================

function showTournamentPaymentInstructions(tournament, registrationId, teamName, amount, upiApp, transactionId) {
    // Get UPI app specific payment details
    let upiId = '';
    let appName = '';
    let appIcon = '';
    
    // YOUR REAL UPI ID - CHANGE THIS
    const YOUR_UPI_ID = 'yourrealupi@phonepe'; // CHANGE THIS TO YOUR REAL UPI ID
    
    switch(upiApp) {
        case 'phonepe@ybl':
            upiId = YOUR_UPI_ID;
            appName = 'PhonePe';
            appIcon = 'fas fa-mobile-alt';
            break;
        case 'okhdfcbank':
            upiId = YOUR_UPI_ID;
            appName = 'Google Pay';
            appIcon = 'fab fa-google';
            break;
        case 'paytm@paytm':
            upiId = YOUR_UPI_ID;
            appName = 'Paytm';
            appIcon = 'fab fa-paypal';
            break;
        case 'okaxis':
            upiId = YOUR_UPI_ID;
            appName = 'Amazon Pay';
            appIcon = 'fab fa-amazon';
            break;
        default:
            upiId = YOUR_UPI_ID;
            appName = 'UPI';
            appIcon = 'fas fa-qrcode';
    }
    
    // Create payment instructions modal
    let modal = document.getElementById('tournament-payment-instructions-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="tournament-payment-instructions-modal" class="modal">
                <div class="modal-content" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-credit-card"></i> Complete Payment</h3>
                        <button class="close-btn" id="close-payment-instructions-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="payment-instructions-container">
                            <div class="payment-amount-highlight" style="background: linear-gradient(135deg, var(--primary), var(--primary-dark)); color: white; text-align: center; padding: var(--space-xl); border-radius: var(--radius); margin-bottom: var(--space-xl);">
                                <div class="payment-label" style="font-size: var(--font-sm); opacity: 0.9;">Amount to Pay</div>
                                <div class="payment-amount" style="font-size: 2rem; font-weight: 800;">${formatCurrency(amount)}</div>
                                <div class="payment-note" style="font-size: var(--font-xs); opacity: 0.8;">Tournament Registration Fee</div>
                            </div>
                            
                            <div class="payment-details-card" style="background: var(--gray-50); border-radius: var(--radius); padding: var(--space-lg); margin-bottom: var(--space-xl);">
                                <h4 style="margin-bottom: var(--space-md);"><i class="fas fa-info-circle"></i> Tournament Details</h4>
                                <p><strong>Tournament:</strong> ${escapeHtml(tournament.tournamentName)}</p>
                                <p><strong>Team Name:</strong> ${escapeHtml(teamName)}</p>
                                <p><strong>Registration ID:</strong> ${registrationId}</p>
                            </div>
                            
                            <div class="payment-instructions-card" style="background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius); padding: var(--space-xl); margin-bottom: var(--space-xl);">
                                <h4 style="margin-bottom: var(--space-lg); display: flex; align-items: center; gap: var(--space-sm);">
                                    <i class="fas ${appIcon}" style="color: var(--primary);"></i>
                                    Pay using ${appName}
                                </h4>
                                <div class="instruction-step" style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                                    <div class="step-number" style="width: 32px; height: 32px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">1</div>
                                    <div class="step-text">Open ${appName} app on your phone</div>
                                </div>
                                <div class="instruction-step" style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                                    <div class="step-number" style="width: 32px; height: 32px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">2</div>
                                    <div class="step-text">Click on "Send Money" or "Pay"</div>
                                </div>
                                <div class="instruction-step" style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                                    <div class="step-number" style="width: 32px; height: 32px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">3</div>
                                    <div class="step-text">Enter UPI ID: <strong class="upi-id-highlight" style="background: var(--primary-50); padding: var(--space-xs) var(--space-md); border-radius: var(--radius); font-family: monospace;">${upiId}</strong></div>
                                </div>
                                <div class="instruction-step" style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                                    <div class="step-number" style="width: 32px; height: 32px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">4</div>
                                    <div class="step-text">Enter amount: <strong>${formatCurrency(amount)}</strong></div>
                                </div>
                                <div class="instruction-step" style="display: flex; align-items: center; gap: var(--space-md); margin-bottom: var(--space-lg);">
                                    <div class="step-number" style="width: 32px; height: 32px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">5</div>
                                    <div class="step-text">Add note: <strong style="background: var(--gray-100); padding: var(--space-xs) var(--space-md); border-radius: var(--radius); font-family: monospace;">${registrationId}</strong></div>
                                </div>
                                <div class="instruction-step" style="display: flex; align-items: center; gap: var(--space-md);">
                                    <div class="step-number" style="width: 32px; height: 32px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600;">6</div>
                                    <div class="step-text">Complete the payment</div>
                                </div>
                            </div>
                            
                            <div class="payment-instructions-card" style="background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius); padding: var(--space-xl); margin-bottom: var(--space-xl);">
                                <h4 style="margin-bottom: var(--space-lg);"><i class="fas fa-qrcode"></i> Scan QR Code</h4>
                                <div class="qr-code-container" id="payment-qr-container" style="text-align: center;">
                                    <div class="qr-loading">Generating QR Code...</div>
                                </div>
                                <p class="qr-note" style="text-align: center; font-size: var(--font-xs); color: var(--gray-500); margin-top: var(--space-md);">Scan this QR code with any UPI app to pay</p>
                            </div>
                            
                            <div class="payment-note-box" style="background: var(--primary-50); padding: var(--space-md); border-radius: var(--radius); margin-bottom: var(--space-xl); display: flex; gap: var(--space-sm);">
                                <i class="fas fa-clock" style="color: var(--primary);"></i>
                                <p style="margin: 0; font-size: var(--font-sm);">After payment, click "I've Completed Payment" below to verify your payment.</p>
                            </div>
                            
                            <div class="payment-actions" style="display: flex; gap: var(--space-md);">
                                <button class="payment-verify-btn" id="verify-tournament-payment-btn" style="flex: 2; background: var(--gradient-primary); color: white; border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer;">
                                    <i class="fas fa-check-circle"></i> I've Completed Payment
                                </button>
                                <button class="payment-cancel-btn" id="cancel-tournament-payment-btn" style="flex: 1; background: var(--gray-100); color: var(--gray-700); border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer;">
                                    <i class="fas fa-times"></i> Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-payment-instructions-modal').addEventListener('click', () => {
            closeModal('tournament-payment-instructions-modal');
            sessionStorage.removeItem('pendingTournamentPayment');
            goBack();
        });
        
        document.getElementById('cancel-tournament-payment-btn').addEventListener('click', () => {
            closeModal('tournament-payment-instructions-modal');
            sessionStorage.removeItem('pendingTournamentPayment');
            goBack();
        });
        
        document.getElementById('verify-tournament-payment-btn').addEventListener('click', async () => {
            await verifyTournamentPaymentManually(registrationId, transactionId, amount);
        });
    }
    
    // Generate QR code for UPI payment
    const upiUrl = `upi://pay?pa=${upiId}&pn=BookMyGame&am=${amount}&tn=${registrationId}&cu=INR`;
    
    // Generate QR code
    setTimeout(async () => {
        try {
            const qrContainer = document.getElementById('payment-qr-container');
            if (qrContainer && typeof QRCode !== 'undefined') {
                qrContainer.innerHTML = '';
                new QRCode(qrContainer, {
                    text: upiUrl,
                    width: 200,
                    height: 200,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        } catch (error) {
            console.error('QR generation error:', error);
            const qrContainer = document.getElementById('payment-qr-container');
            if (qrContainer) {
                qrContainer.innerHTML = '<p class="qr-error">Could not generate QR code. Please use UPI ID below.</p>';
            }
        }
    }, 100);
    
    const modalEl = document.getElementById('tournament-payment-instructions-modal');
    modalEl.classList.add('active');
}

// Manual payment verification function
// ==================== VERIFY TOURNAMENT PAYMENT MANUALLY ====================

async function verifyTournamentPaymentManually(registrationId, transactionId, amount) {
    // Show confirmation modal
    let confirmModal = document.getElementById('payment-confirmation-modal');
    
    if (!confirmModal) {
        const modalHtml = `
            <div id="payment-confirmation-modal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-question-circle"></i> Confirm Payment</h3>
                        <button class="close-btn" id="close-confirmation-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="confirmation-content">
                            <p>Have you completed the payment of <strong>${formatCurrency(amount)}</strong>?</p>
                            <p class="confirmation-note">Please make sure the payment was successful before confirming.</p>
                            <div class="payment-actions" style="display: flex; gap: var(--space-md); margin-top: var(--space-xl);">
                                <button class="auth-btn" id="confirm-payment-yes" style="margin: 0;">Yes, I've Paid</button>
                                <button class="home-btn" id="confirm-payment-no" style="margin: 0;">Not Yet</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-confirmation-modal').addEventListener('click', () => {
            closeModal('payment-confirmation-modal');
        });
    }
    
    const modal = document.getElementById('payment-confirmation-modal');
    modal.classList.add('active');
    
    document.getElementById('confirm-payment-yes').onclick = async () => {
        closeModal('payment-confirmation-modal');
        showLoading('Verifying payment...');
        
        try {
            const pendingPaymentStr = sessionStorage.getItem('pendingTournamentPayment');
            
            if (!pendingPaymentStr) {
                throw new Error('Payment session not found. Please try again.');
            }
            
            const pendingPayment = JSON.parse(pendingPaymentStr);
            
            // Update tournament registration with payment success
            const registrationQuery = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
                .where('registrationId', '==', registrationId)
                .get();
            
            if (registrationQuery.empty) {
                throw new Error('Registration not found');
            }
            
            const registrationRef = registrationQuery.docs[0].ref;
            const registration = registrationQuery.docs[0].data();
            
            // Update registration status to CONFIRMED
            await registrationRef.update({
                paymentStatus: PAYMENT_STATUS.SUCCESS,
                status: REGISTRATION_STATUS.CONFIRMED,
                paymentId: transactionId,
                transactionId: transactionId,
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update tournament registered teams
            const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(registration.tournamentId);
            const tournamentDoc = await tournamentRef.get();
            
            if (tournamentDoc.exists) {
                const tournament = tournamentDoc.data();
                const updatedTeams = (tournament.registeredTeams || []).map(team => {
                    if (team.registrationId === registrationId) {
                        return { 
                            ...team, 
                            paymentStatus: PAYMENT_STATUS.SUCCESS,
                            status: REGISTRATION_STATUS.CONFIRMED,
                            paidAt: new Date().toISOString()
                        };
                    }
                    return team;
                });
                
                await tournamentRef.update({
                    registeredTeams: updatedTeams,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            // Update payment record
            const paymentQuery = await db.collection('tournament_payments')
                .where('transactionId', '==', transactionId)
                .get();
            
            if (!paymentQuery.empty) {
                await paymentQuery.docs[0].ref.update({
                    status: PAYMENT_STATUS.SUCCESS,
                    verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    verifiedBy: currentUser.uid
                });
            }
            
            hideLoading();
            showToast('Payment verified successfully! Tournament registration confirmed!', 'success');
            
            // Close payment instructions modal
            closeModal('tournament-payment-instructions-modal');
            
            // Clear session storage
            sessionStorage.removeItem('pendingTournamentPayment');
            
            // Show success modal
            showPaymentSuccessModal(registrationId, amount, registration.tournamentName, pendingPayment.teamName);
            
        } catch (error) {
            hideLoading();
            console.error('Payment verification error:', error);
            showToast('Error verifying payment: ' + error.message, 'error');
        }
    };
    
    document.getElementById('confirm-payment-no').onclick = () => {
        closeModal('payment-confirmation-modal');
    };
}

// Generate transaction ID helper
function generateTransactionId(prefix) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const randomStr = random.toString().padStart(6, '0');
    return `${prefix}_${timestamp}_${randomStr}`;
}
function showPaymentProcessingModal() {
    let modal = document.getElementById('payment-processing-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="payment-processing-modal" class="modal">
                <div class="modal-content" style="max-width: 350px;">
                    <div class="modal-body">
                        <div class="payment-processing-modal">
                            <div class="processing-animation">
                                <div class="processing-circle"></div>
                                <div class="processing-check">
                                    <i class="fas fa-check-circle"></i>
                                </div>
                            </div>
                            <h3 class="processing-title">Processing Payment</h3>
                            <p class="processing-message">Please wait while we redirect you to the payment gateway...</p>
                            <div class="payment-note-modern" style="margin-top: var(--space-lg);">
                                <i class="fas fa-spinner fa-pulse"></i>
                                <span>Do not close this window</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.getElementById('payment-processing-modal').classList.add('active');
}

function hidePaymentProcessingModal() {
    const modal = document.getElementById('payment-processing-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Update the payment callback handler
async function handleTournamentPaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get('transactionId');
    const code = urlParams.get('code');
    const registrationId = urlParams.get('registrationId');
    
    if (!transactionId || !registrationId) return;
    
    showLoading('Verifying payment...');
    
    try {
        const verifyTournamentPayment = functions.httpsCallable('verifyTournamentPayment');
        const result = await verifyTournamentPayment({ 
            transactionId, 
            code,
            registrationId: registrationId
        });
        
        if (result.data.success) {
            // Update registration status
            const regSnapshot = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
                .where('registrationId', '==', registrationId)
                .get();
            
            if (!regSnapshot.empty) {
                const registrationRef = regSnapshot.docs[0].ref;
                await registrationRef.update({
                    paymentStatus: PAYMENT_STATUS.SUCCESS,
                    status: REGISTRATION_STATUS.CONFIRMED,
                    paymentId: result.data.paymentId,
                    transactionId: transactionId,
                    paidAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update tournament registered teams
                const tournamentId = result.data.tournamentId;
                const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId);
                const tournamentDoc = await tournamentRef.get();
                
                if (tournamentDoc.exists) {
                    const tournament = tournamentDoc.data();
                    const updatedTeams = (tournament.registeredTeams || []).map(team => {
                        if (team.registrationId === registrationId) {
                            return { 
                                ...team, 
                                paymentStatus: PAYMENT_STATUS.SUCCESS,
                                status: REGISTRATION_STATUS.CONFIRMED,
                                paidAt: new Date().toISOString()
                            };
                        }
                        return team;
                    });
                    
                    await tournamentRef.update({
                        registeredTeams: updatedTeams
                    });
                }
            }
            
            hideLoading();
            
            // Show success modal
            showPaymentSuccessModal(registrationId, result.data.amount);
            
            // Clear stored payment info
            sessionStorage.removeItem('pendingTournamentPayment');
            
        } else {
            throw new Error(result.data.message || 'Payment verification failed');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Payment verification error:', error);
        showToast('Payment verification failed: ' + error.message, 'error');
        
        // Show payment failed modal
        showPaymentFailedModal();
    }
}

// ==================== SHOW PAYMENT SUCCESS MODAL ====================

function showPaymentSuccessModal(registrationId, amount, tournamentName, teamName) {
    let modal = document.getElementById('payment-success-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="payment-success-modal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> Registration Confirmed!</h3>
                        <button class="close-btn" id="close-payment-success-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="registration-success-modal" style="text-align: center;">
                            <div class="success-icon-large" style="width: 80px; height: 80px; background: linear-gradient(135deg, var(--success), #059669); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-xl);">
                                <i class="fas fa-check-circle" style="font-size: 2.5rem; color: white;"></i>
                            </div>
                            <h3 class="success-title" style="font-size: var(--font-xl); margin-bottom: var(--space-md);">Payment Successful!</h3>
                            <p class="success-message" style="color: var(--gray-600); margin-bottom: var(--space-xl);">Your payment of ${formatCurrency(amount)} was successful. Your team is now officially registered for the tournament.</p>
                            
                            <div class="success-details" style="background: var(--gray-50); border-radius: var(--radius); padding: var(--space-lg); text-align: left; margin-bottom: var(--space-xl);">
                                <p><strong>🏆 Tournament:</strong> ${escapeHtml(tournamentName)}</p>
                                <p><strong>👥 Team Name:</strong> ${escapeHtml(teamName)}</p>
                                <p><strong>📋 Registration ID:</strong> ${registrationId}</p>
                                <p><strong>✅ Status:</strong> <span style="color: var(--success);">Confirmed</span></p>
                                <p><strong>📧 Confirmation sent to:</strong> ${currentUser.email}</p>
                            </div>
                            
                            <div class="success-actions" style="display: flex; gap: var(--space-md);">
                                <button class="btn-primary" id="view-registration-confirmation" style="flex: 1; background: var(--gradient-primary); color: white; border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer;">
                                    <i class="fas fa-eye"></i> View Tournament
                                </button>
                                <button class="btn-secondary" id="go-to-home" style="flex: 1; background: var(--gray-100); color: var(--gray-700); border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer;">
                                    <i class="fas fa-home"></i> Go Home
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-payment-success-modal').addEventListener('click', () => {
            closeModal('payment-success-modal');
            goHome();
        });
    }
    
    const modalEl = document.getElementById('payment-success-modal');
    modalEl.classList.add('active');
    
    document.getElementById('view-registration-confirmation').onclick = () => {
        closeModal('payment-success-modal');
        if (currentTournament) {
            viewTournamentDetails(currentTournament.id);
        } else {
            goHome();
        }
    };
    
    document.getElementById('go-to-home').onclick = () => {
        closeModal('payment-success-modal');
        goHome();
    };
}


function showPaymentFailedModal() {
    let modal = document.getElementById('payment-failed-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="payment-failed-modal" class="modal">
                <div class="modal-content" style="max-width: 350px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-circle" style="color: var(--danger);"></i> Payment Failed</h3>
                        <button class="close-btn" id="close-payment-failed-modal">&times;</button>
                    </div>
                    <div class="modal-body" style="text-align: center;">
                        <div style="font-size: 4rem; margin-bottom: var(--space-lg);">
                            <i class="fas fa-times-circle" style="color: var(--danger);"></i>
                        </div>
                        <h4>Payment could not be processed</h4>
                        <p style="margin: var(--space-md) 0;">Your payment was not successful. Please try again or contact support.</p>
                        <div class="success-actions">
                            <button class="btn-primary" id="retry-payment">
                                <i class="fas fa-redo"></i> Try Again
                            </button>
                            <button class="btn-secondary" id="contact-support">
                                <i class="fas fa-headset"></i> Contact Support
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-payment-failed-modal').addEventListener('click', () => {
            closeModal('payment-failed-modal');
        });
    }
    
    const modalEl = document.getElementById('payment-failed-modal');
    modalEl.classList.add('active');
    
    document.getElementById('retry-payment').onclick = () => {
        closeModal('payment-failed-modal');
        // Go back to payment page
        goBack();
    };
    
    document.getElementById('contact-support').onclick = () => {
        closeModal('payment-failed-modal');
        showToast('Contact support at support@bookmygame.com', 'info');
    };
}

// ==================== INITIATE TOURNAMENT PAYMENT (WITH REAL UPI) ====================

// Replace YOUR_UPI_ID with your real PhonePe UPI ID
const YOUR_UPI_ID = 'yourrealupi@phonepe'; // CHANGE THIS TO YOUR REAL UPI ID

async function initiateTournamentPayment(tournament, registrationId, teamName, upiApp) {
    if (!currentUser) {
        showToast('Please login to continue', 'warning');
        return;
    }
    
    showLoading('Processing tournament payment...');
    
    try {
        if (!tournament && currentTournament) {
            tournament = currentTournament;
        }
        
        if (!tournament) {
            throw new Error('Tournament information not found');
        }
        
        const amount = tournament.entryFee;
        
        // Generate unique transaction ID
        const transactionId = generateTransactionId('TRN_PAY');
        
        // Store pending tournament payment in session storage
        const pendingPayment = {
            registrationId: registrationId,
            tournamentId: tournament.tournamentId || tournament.id,
            tournamentName: tournament.tournamentName,
            teamName: teamName,
            amount: amount,
            transactionId: transactionId,
            initiatedAt: new Date().toISOString(),
            upiApp: upiApp
        };
        
        sessionStorage.setItem('pendingTournamentPayment', JSON.stringify(pendingPayment));
        
        // Create payment record in Firestore
        const paymentRecord = {
            paymentId: transactionId,
            transactionId: transactionId,
            registrationId: registrationId,
            tournamentId: tournament.tournamentId || tournament.id,
            tournamentName: tournament.tournamentName,
            userId: currentUser.uid,
            userName: currentUser.name || currentUser.ownerName || 'User',
            userEmail: currentUser.email,
            userPhone: currentUser.phone || '',
            amount: amount,
            status: PAYMENT_STATUS.INITIATED,
            upiApp: upiApp,
            initiatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('tournament_payments').add(paymentRecord);
        
        // Update tournament registration with payment initiated status
        const registrationQuery = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('registrationId', '==', registrationId)
            .get();
        
        if (!registrationQuery.empty) {
            await registrationQuery.docs[0].ref.update({
                paymentStatus: PAYMENT_STATUS.INITIATED,
                transactionId: transactionId,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        hideLoading();
        
        // Show payment instructions with YOUR REAL UPI ID
        showTournamentPaymentInstructions(tournament, registrationId, teamName, amount, upiApp, transactionId);
        
    } catch (error) {
        hideLoading();
        console.error('Tournament payment error:', error);
        showToast('Payment initiation failed: ' + error.message, 'error');
    }
}
async function approveTournamentRegistration(registrationId) {
    if (!confirm('Approve this team for the tournament? This will confirm their participation.')) return;
    
    showLoading('Approving registration...');
    
    try {
        const regSnapshot = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('registrationId', '==', registrationId)
            .get();
        
        if (regSnapshot.empty) {
            throw new Error('Registration not found');
        }
        
        const registration = regSnapshot.docs[0].data();
        const registrationRef = regSnapshot.docs[0].ref;
        
        await registrationRef.update({
            status: REGISTRATION_STATUS.CONFIRMED,
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.uid
        });
        
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(registration.tournamentId);
        const tournamentDoc = await tournamentRef.get();
        const tournament = tournamentDoc.data();
        
        const updatedTeams = (tournament.registeredTeams || []).map(team => {
            if (team.registrationId === registrationId) {
                return { 
                    ...team, 
                    status: REGISTRATION_STATUS.CONFIRMED,
                    approvedAt: new Date().toISOString()
                };
            }
            return team;
        });
        
        await tournamentRef.update({
            registeredTeams: updatedTeams
        });
        
        hideLoading();
        showToast('Registration approved successfully', 'success');
        
        closeModal('tournament-registration-modal');
        viewTournamentDetails(registration.tournamentId);
        
    } catch (error) {
        hideLoading();
        console.error('Error approving registration:', error);
        showToast('Error approving registration: ' + error.message, 'error');
    }
}

async function rejectTournamentRegistration(registrationId) {
    if (!confirm('Reject this team from the tournament?')) return;
    
    showLoading('Rejecting registration...');
    
    try {
        const regSnapshot = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('registrationId', '==', registrationId)
            .get();
        
        if (regSnapshot.empty) {
            throw new Error('Registration not found');
        }
        
        const registration = regSnapshot.docs[0].data();
        
        await regSnapshot.docs[0].ref.update({
            status: REGISTRATION_STATUS.REJECTED,
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: currentUser.uid
        });
        
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(registration.tournamentId);
        const tournamentDoc = await tournamentRef.get();
        const tournament = tournamentDoc.data();
        
        const updatedTeams = tournament.registeredTeams.map(team => {
            if (team.registrationId === registrationId) {
                return { ...team, status: REGISTRATION_STATUS.REJECTED };
            }
            return team;
        });
        
        await tournamentRef.update({
            registeredTeams: updatedTeams
        });
        
        hideLoading();
        showToast('Registration rejected');
        viewTournamentDetails(registration.tournamentId);
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function loadOwnerTournaments(container) {
    showLoading('Loading tournaments...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
            .where('ownerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <button class="auth-btn" id="create-tournament-btn" style="margin-bottom: var(--space-xl);">
                <i class="fas fa-plus"></i> Create Tournament
            </button>
            <div id="tournaments-list-container">
        `;
        
        if (snapshot.empty) {
            html += `
                <div class="empty-state">
                    <i class="fas fa-trophy"></i>
                    <h3>No Tournaments Created</h3>
                    <p>Click "Create Tournament" to start your first tournament!</p>
                </div>
            `;
        } else {
            for (const doc of snapshot.docs) {
                const tournament = doc.data();
                const tournamentId = doc.id;
                const startDate = new Date(tournament.startDate);
                const endDate = new Date(tournament.endDate);
                const formattedStartDate = startDate.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
                
                const registeredTeams = tournament.registeredTeams?.length || 0;
                const maxTeams = tournament.maxTeams || 0;
                const pendingRegistrations = tournament.registeredTeams?.filter(t => t.status === 'pending').length || 0;
                const confirmedRegistrations = tournament.registeredTeams?.filter(t => t.status === 'confirmed').length || 0;
                
                let statusClass = '';
                let statusText = '';
                let canDelete = false;
                const today = new Date();
                
                if (tournament.status === 'upcoming') {
                    statusClass = 'upcoming';
                    statusText = 'Upcoming';
                    canDelete = true; // Can delete upcoming tournaments
                } else if (tournament.status === 'ongoing') {
                    statusClass = 'ongoing';
                    statusText = 'Ongoing';
                    canDelete = false; // Cannot delete ongoing tournaments
                } else if (tournament.status === 'completed') {
                    statusClass = 'completed';
                    statusText = 'Completed';
                    canDelete = true; // Can delete completed tournaments
                }
                
                html += `
                    <div class="tournament-card-modern" data-tournament-id="${tournamentId}">
                        <div class="tournament-card-content">
                            <div class="tournament-header-section">
                                <div class="tournament-info">
                                    <div class="tournament-icon">
                                        <i class="fas fa-trophy"></i>
                                    </div>
                                    <div class="tournament-details">
                                        <h3>${escapeHtml(tournament.tournamentName)}</h3>
                                        <div class="tournament-meta">
                                            <span>${tournament.sportType || 'Multi-sport'}</span>
                                            <span>•</span>
                                            <span>${formattedStartDate}</span>
                                            <span>•</span>
                                            <span class="tournament-status-badge ${statusClass}">${statusText}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="tournament-stats-grid">
                                <div class="tournament-stat-item">
                                    <span class="tournament-stat-label">Entry Fee</span>
                                    <span class="tournament-stat-value">${formatCurrency(tournament.entryFee)}</span>
                                </div>
                                <div class="tournament-stat-item">
                                    <span class="tournament-stat-label">Prize Pool</span>
                                    <span class="tournament-stat-value tournament-prize-value">${formatCurrency(tournament.prizeAmount)}</span>
                                </div>
                                <div class="tournament-stat-item">
                                    <span class="tournament-stat-label">Teams</span>
                                    <span class="tournament-stat-value">${registeredTeams}/${maxTeams}</span>
                                </div>
                                <div class="tournament-stat-item">
                                    <span class="tournament-stat-label">Format</span>
                                    <span class="tournament-stat-value">${tournament.format === 'knockout' ? 'Knockout' : tournament.format === 'league' ? 'League' : 'Group Stage'}</span>
                                </div>
                            </div>
                            
                            <div class="tournament-info-grid" style="margin-bottom: var(--space-lg);">
                                <div class="tournament-info-item">
                                    <i class="fas fa-map-marker-alt"></i>
                                    <div>
                                        <span class="tournament-info-label">Venue</span>
                                        <span class="tournament-info-value">${escapeHtml(tournament.venueName || 'TBD')}</span>
                                    </div>
                                </div>
                                <div class="tournament-info-item">
                                    <i class="fas fa-clock"></i>
                                    <div>
                                        <span class="tournament-info-label">Time</span>
                                        <span class="tournament-info-value">${tournament.startTime} - ${tournament.endTime}</span>
                                    </div>
                                </div>
                                <div class="tournament-info-item">
                                    <i class="fas fa-location-dot"></i>
                                    <div>
                                        <span class="tournament-info-label">Address</span>
                                        <span class="tournament-info-value">${escapeHtml(tournament.tournamentAddress || tournament.venueAddress || 'Address not specified')}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="registration-stats" style="display: flex; gap: var(--space-md); margin-bottom: var(--space-lg);">
                                <div style="flex: 1; background: var(--gray-50); padding: var(--space-md); border-radius: var(--radius); text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--warning);">${pendingRegistrations}</div>
                                    <div style="font-size: var(--font-xs); color: var(--gray-500);">Pending Approvals</div>
                                </div>
                                <div style="flex: 1; background: var(--gray-50); padding: var(--space-md); border-radius: var(--radius); text-align: center;">
                                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--success);">${confirmedRegistrations}</div>
                                    <div style="font-size: var(--font-xs); color: var(--gray-500);">Confirmed Teams</div>
                                </div>
                            </div>
                            
                            <div class="tournament-actions">
                                <button class="tournament-btn tournament-btn-secondary" onclick="viewTournamentDetails('${tournamentId}')">
                                    <i class="fas fa-eye"></i> View Details
                                </button>
                                ${pendingRegistrations > 0 ? `
                                    <button class="tournament-btn tournament-btn-primary" onclick="showTournamentRegistrations('${tournamentId}')">
                                        <i class="fas fa-users"></i> Manage Registrations (${pendingRegistrations})
                                    </button>
                                ` : `
                                    <button class="tournament-btn tournament-btn-primary" onclick="showTournamentRegistrations('${tournamentId}')">
                                        <i class="fas fa-users"></i> View Registrations
                                    </button>
                                `}
                                ${canDelete ? `
                                    <button class="tournament-btn tournament-btn-danger" onclick="deleteTournament('${tournamentId}', '${escapeHtml(tournament.tournamentName)}')">
                                        <i class="fas fa-trash-alt"></i> Delete Tournament
                                    </button>
                                ` : `
                                    <button class="tournament-btn tournament-btn-disabled" disabled style="opacity: 0.5; cursor: not-allowed;">
                                        <i class="fas fa-ban"></i> Cannot Delete (Tournament ${statusText})
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                `;
            }
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        document.getElementById('create-tournament-btn')?.addEventListener('click', showCreateTournamentModal);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading tournaments:', error);
        container.innerHTML = '<p class="text-center">Failed to load tournaments</p>';
    }
}

// ==================== DELETE TOURNAMENT ====================

async function deleteTournament(tournamentId, tournamentName) {
    // Show confirmation dialog
    const confirmed = await showDeleteConfirmationModal(
        'Delete Tournament',
        `Are you sure you want to delete "${tournamentName}"?`,
        'This action cannot be undone. All registrations and data will be permanently removed.'
    );
    
    if (!confirmed) return;
    
    showLoading('Deleting tournament...');
    
    try {
        // Get tournament data
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(tournamentId);
        const tournamentDoc = await tournamentRef.get();
        
        if (!tournamentDoc.exists) {
            throw new Error('Tournament not found');
        }
        
        const tournament = tournamentDoc.data();
        
        // Check if tournament can be deleted (only upcoming or completed)
        const today = new Date();
        const endDateTime = new Date(`${tournament.endDate}T${tournament.endTime || '23:59'}`);
        
        if (tournament.status === 'ongoing') {
            showToast('Cannot delete an ongoing tournament. Please wait until it completes.', 'error');
            hideLoading();
            return;
        }
        
        // Get all registrations for this tournament
        const registrationsSnapshot = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('tournamentId', '==', tournamentId)
            .get();
        
        // Start a batch operation for all deletions
        const batch = db.batch();
        
        // Delete all tournament registrations
        registrationsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Delete the tournament itself
        batch.delete(tournamentRef);
        
        // Commit all deletions
        await batch.commit();
        
        hideLoading();
        showToast(`Tournament "${tournamentName}" deleted successfully!`, 'success');
        
        // Refresh the tournaments list
        if (document.getElementById('owner-dashboard-page').classList.contains('active')) {
            loadOwnerDashboard('tournaments');
        } else if (document.getElementById('tournaments-page').classList.contains('active')) {
            loadAllTournaments('upcoming');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error deleting tournament:', error);
        showToast('Error deleting tournament: ' + error.message, 'error');
    }
}

// ==================== SHOW DELETE CONFIRMATION MODAL ====================

function showDeleteConfirmationModal(title, message, detail) {
    return new Promise((resolve) => {
        let modal = document.getElementById('delete-confirmation-modal');
        
        if (!modal) {
            const modalHtml = `
                <div id="delete-confirmation-modal" class="modal">
                    <div class="modal-content" style="max-width: 400px;">
                        <div class="modal-header">
                            <h3><i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> ${title}</h3>
                            <button class="close-btn" id="close-delete-confirmation-modal">&times;</button>
                        </div>
                        <div class="modal-body">
                            <div class="delete-confirmation-content">
                                <div class="warning-icon" style="font-size: 3rem; color: var(--danger); text-align: center; margin-bottom: var(--space-lg);">
                                    <i class="fas fa-trash-alt"></i>
                                </div>
                                <h4 class="confirmation-title" style="text-align: center; margin-bottom: var(--space-md);">${message}</h4>
                                <p class="confirmation-detail" style="text-align: center; color: var(--gray-600); margin-bottom: var(--space-xl);">${detail}</p>
                                <div class="confirmation-actions" style="display: flex; gap: var(--space-md);">
                                    <button class="confirmation-btn confirm delete" id="confirm-delete-btn" style="flex: 1; background: var(--danger); color: white; padding: var(--space-md); border: none; border-radius: var(--radius); font-weight: 600; cursor: pointer;">
                                        <i class="fas fa-trash-alt"></i> Delete Permanently
                                    </button>
                                    <button class="confirmation-btn cancel" id="cancel-delete-btn" style="flex: 1; background: var(--gray-100); color: var(--gray-700); padding: var(--space-md); border: none; border-radius: var(--radius); font-weight: 600; cursor: pointer;">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            document.getElementById('close-delete-confirmation-modal').addEventListener('click', () => {
                closeModal('delete-confirmation-modal');
                resolve(false);
            });
            
            document.getElementById('cancel-delete-btn').addEventListener('click', () => {
                closeModal('delete-confirmation-modal');
                resolve(false);
            });
        }
        
        // Update modal content with dynamic values
        const modalTitle = document.querySelector('#delete-confirmation-modal .modal-header h3');
        const modalMessage = document.querySelector('#delete-confirmation-modal .confirmation-title');
        const modalDetail = document.querySelector('#delete-confirmation-modal .confirmation-detail');
        
        if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> ${title}`;
        if (modalMessage) modalMessage.textContent = message;
        if (modalDetail) modalDetail.textContent = detail;
        
        const modalEl = document.getElementById('delete-confirmation-modal');
        modalEl.classList.add('active');
        
        // Add event listener for confirm button
        const confirmBtn = document.getElementById('confirm-delete-btn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        newConfirmBtn.addEventListener('click', () => {
            closeModal('delete-confirmation-modal');
            resolve(true);
        });
        
        // Handle modal close via backdrop click
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) {
                closeModal('delete-confirmation-modal');
                resolve(false);
            }
        });
    });
}


// ==================== OWNER DASHBOARD ====================

function showOwnerDashboard() {
    if (!currentUser || currentUser.role !== 'owner') {
        showToast('Access denied', 'error');
        return;
    }
    
    document.getElementById('owner-id-display').innerHTML = `
        <i class="fas fa-id-card"></i> Owner ID: ${currentUser.ownerUniqueId || 'N/A'} | UPI: ${currentUser.upiId || 'Not set'}
    `;
    
    loadOwnerDashboard('overview');
    showPage('owner-dashboard-page');
}

async function loadOwnerDashboard(tab) {
    const container = document.getElementById('owner-dashboard-content');
    
    document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`owner-${tab}-tab`).classList.add('active');
    
    container.innerHTML = '<div class="loading-spinner"><div class="loader-spinner"></div></div>';
    
    if (tab === 'overview') {
        await loadOwnerOverview(container);
    } else if (tab === 'grounds') {
        await loadOwnerGrounds(container);
    } else if (tab === 'bookings') {
        await loadOwnerBookings(container);
    } else if (tab === 'earnings') {
        await loadOwnerEarnings(container);
    } else if (tab === 'tournaments') {
        await loadOwnerTournaments(container);
    } else if (tab === 'payouts') {
        await loadOwnerPayouts(container);
    } else if (tab === 'verification') {
        await loadOwnerVerification(container);
    }
}

async function loadOwnerOverview(container) {
    showLoading('Loading dashboard...');
    
    try {
        const groundsSnapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', currentUser.uid)
            .get();
        
        const today = new Date().toISOString().split('T')[0];
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', currentUser.uid)
            .where('date', '==', today)
            .where('bookingStatus', '==', BOOKING_STATUS.CONFIRMED)
            .get();
        
        let todayEarnings = 0;
        bookingsSnapshot.forEach(doc => {
            todayEarnings += doc.data().ownerAmount || 0;
        });
        
        const allBookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', currentUser.uid)
            .where('bookingStatus', '==', BOOKING_STATUS.CONFIRMED)
            .get();
        
        let totalEarnings = 0;
        allBookingsSnapshot.forEach(doc => {
            totalEarnings += doc.data().ownerAmount || 0;
        });
        
        const tournamentsSnapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
            .where('ownerId', '==', currentUser.uid)
            .get();
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${groundsSnapshot.size}</div>
                    <div class="stat-label">Total Grounds</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${bookingsSnapshot.size}</div>
                    <div class="stat-label">Today's Bookings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCurrency(todayEarnings)}</div>
                    <div class="stat-label">Today's Earnings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCurrency(totalEarnings)}</div>
                    <div class="stat-label">Total Earnings</div>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card" style="background: var(--gradient-warning);">
                    <div class="stat-value">${formatCurrency(0)}</div>
                    <div class="stat-label">Pending Payouts</div>
                </div>
                <div class="stat-card" style="background: var(--gradient-accent);">
                    <div class="stat-value">${tournamentsSnapshot.size}</div>
                    <div class="stat-label">Your Tournaments</div>
                </div>
            </div>
            
            <div class="ground-actions" style="margin-top: var(--space-xl);">
                <button class="manage-slots-btn" id="manage-grounds-btn">Manage Grounds</button>
                <button class="view-details-btn" id="view-bookings-btn">View Bookings</button>
                <button class="close-day-btn" id="view-earnings-btn">View Earnings</button>
            </div>
        `;
        
        const manageGroundsBtn = document.getElementById('manage-grounds-btn');
        const viewBookingsBtn = document.getElementById('view-bookings-btn');
        const viewEarningsBtn = document.getElementById('view-earnings-btn');
        
        if (manageGroundsBtn) {
            const newBtn = manageGroundsBtn.cloneNode(true);
            manageGroundsBtn.parentNode.replaceChild(newBtn, manageGroundsBtn);
            newBtn.addEventListener('click', () => loadOwnerDashboard('grounds'));
        }
        
        if (viewBookingsBtn) {
            const newBtn = viewBookingsBtn.cloneNode(true);
            viewBookingsBtn.parentNode.replaceChild(newBtn, viewBookingsBtn);
            newBtn.addEventListener('click', () => loadOwnerDashboard('bookings'));
        }
        
        if (viewEarningsBtn) {
            const newBtn = viewEarningsBtn.cloneNode(true);
            viewEarningsBtn.parentNode.replaceChild(newBtn, viewEarningsBtn);
            newBtn.addEventListener('click', () => loadOwnerDashboard('earnings'));
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading overview:', error);
        container.innerHTML = '<p class="text-center">Failed to load dashboard</p>';
    }
}
// Update loadOwnerGrounds function to remove payment banner (around line 3690-3730)

async function loadOwnerGrounds(container) {
    showLoading('Loading grounds...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = '<h3>Your Grounds</h3>';
        
        html += `
            <button class="auth-btn" id="add-ground-btn" style="margin-bottom: var(--space-xl);">
                <i class="fas fa-plus"></i> Add New Ground
            </button>
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">You haven\'t listed any grounds yet. Click "Add New Ground" to get started!</p>';
        } else {
            snapshot.forEach(doc => {
                const ground = doc.data();
                const verifiedBadge = ground.isVerified ? 
                    '<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' : '';
                
                html += `
                    <div class="ground-management-card" data-ground-id="${doc.id}">
                        <div class="ground-management-header">
                            <h4>${escapeHtml(ground.groundName)} ${verifiedBadge}</h4>
                            <span>${escapeHtml(ground.sportType)}</span>
                        </div>
                        <div>Price: ${formatCurrency(ground.pricePerHour)}/hr</div>
                        <div>Address: ${escapeHtml(ground.groundAddress || 'Main Location')}</div>
                        <div class="ground-actions">
                            <button class="manage-slots-btn" data-ground-id="${doc.id}" data-ground-name="${escapeHtml(ground.groundName)}">Manage Slots</button>
                            <button class="close-day-btn" data-ground-id="${doc.id}">Close Full Day</button>
                            <button class="view-details-btn" data-ground-id="${doc.id}">View Details</button>
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        
        // Add event listener for Add Ground button
        const addBtn = document.getElementById('add-ground-btn');
        if (addBtn) {
            const newAddBtn = addBtn.cloneNode(true);
            addBtn.parentNode.replaceChild(newAddBtn, addBtn);
            newAddBtn.addEventListener('click', function(e) {
                e.preventDefault();
                showAddGroundModal();
            });
        }
        
        // Add event listeners for other buttons
        document.querySelectorAll('.manage-slots-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                manageSlots(newBtn.dataset.groundId, newBtn.dataset.groundName);
            });
        });
        
        document.querySelectorAll('.close-day-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                closeFullDay(newBtn.dataset.groundId);
            });
        });
        
        document.querySelectorAll('.view-details-btn').forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', () => {
                viewGround(newBtn.dataset.groundId);
            });
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading grounds:', error);
        container.innerHTML = '<p class="text-center">Failed to load grounds</p>';
    }
}

// Update showAddGroundModal function to remove payment check (around line 3820-3840)

function showAddGroundModal() {
    // Reset form
    const form = document.getElementById('add-ground-form');
    if (form) form.reset();
    
    // Reset image preview with optional message
    const previewGrid = document.getElementById('image-preview-grid');
    if (previewGrid) {
        previewGrid.innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-camera"></i>
                <p>No photos selected yet</p>
                <span>Photos are optional (you can add them later)</span>
            </div>
        `;
        previewGrid.classList.remove('has-images');
    }
    
    // Reset upload progress
    const uploadProgress = document.getElementById('upload-progress');
    if (uploadProgress) uploadProgress.style.display = 'none';
    
    // Reset to step 1
    const steps = document.querySelectorAll('.form-step');
    const progressSteps = document.querySelectorAll('.progress-step');
    
    steps.forEach(step => step.classList.remove('active'));
    progressSteps.forEach(step => step.classList.remove('active', 'completed'));
    
    const firstStep = document.querySelector('.form-step[data-step="1"]');
    const firstProgress = document.querySelector('.progress-step[data-step="1"]');
    if (firstStep) firstStep.classList.add('active');
    if (firstProgress) firstProgress.classList.add('active');
    
    // Reset navigation buttons
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const submitBtn = document.getElementById('submit-ground-btn');
    
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.style.display = 'flex';
    if (submitBtn) submitBtn.style.display = 'none';
    
    // Reset price preview
    updateEarningsPreview(0);
    
    // Reset price input
    const priceInput = document.getElementById('ground-price-input');
    if (priceInput) priceInput.value = '';
    
    // Reset selectedFiles if it exists
    if (typeof selectedFiles !== 'undefined') {
        selectedFiles = [];
    }
    
    // Show modal
    const modal = document.getElementById('add-ground-modal');
    if (modal) modal.classList.add('active');
}
// Initialize step navigation
function initializeStepNavigation() {
    let currentStep = 1;
    const totalSteps = 3;
    
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const submitBtn = document.getElementById('submit-ground-btn');
    
    function updateStep(step) {
        // Hide all steps
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.progress-step').forEach(s => s.classList.remove('active'));
        
        // Show current step
        document.querySelector(`.form-step[data-step="${step}"]`).classList.add('active');
        document.querySelector(`.progress-step[data-step="${step}"]`).classList.add('active');
        
        // Mark previous steps as completed
        for (let i = 1; i < step; i++) {
            document.querySelector(`.progress-step[data-step="${i}"]`).classList.add('completed');
        }
        
        // Update buttons
        prevBtn.disabled = (step === 1);
        
        if (step === totalSteps) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'flex';
        } else {
            nextBtn.style.display = 'flex';
            submitBtn.style.display = 'none';
        }
        
        currentStep = step;
    }
    
    prevBtn.addEventListener('click', () => {
        if (currentStep > 1) {
            updateStep(currentStep - 1);
        }
    });
    
    nextBtn.addEventListener('click', () => {
        // Validate current step before proceeding
        if (validateStep(currentStep)) {
            if (currentStep < totalSteps) {
                updateStep(currentStep + 1);
            }
        }
    });
    
    // Add click handlers for progress steps
    document.querySelectorAll('.progress-step').forEach(step => {
        step.addEventListener('click', () => {
            const stepNum = parseInt(step.dataset.step);
            if (stepNum < currentStep) {
                updateStep(stepNum);
            }
        });
    });
    
    function validateStep(step) {
    if (step === 1) {
        const groundName = document.getElementById('ground-name-input')?.value.trim();
        const sportType = document.getElementById('ground-sport-input')?.value;
        
        if (!groundName) {
            showToast('Please enter ground name', 'error');
            document.getElementById('ground-name-input')?.focus();
            return false;
        }
        if (!sportType) {
            showToast('Please select sport type', 'error');
            return false;
        }
        return true;
    }
    
    if (step === 2) {
        const price = parseFloat(document.getElementById('ground-price-input')?.value);
        if (!price || price <= 0) {
            showToast('Please enter a valid price per hour', 'error');
            document.getElementById('ground-price-input')?.focus();
            return false;
        }
        if (price < 100) {
            showToast('Minimum price is ₹100 per hour', 'error');
            return false;
        }
        return true;
    }
    
    // Step 3 validation - REMOVED image requirement
    if (step === 3) {
        // Images are optional - always return true
        return true;
    }
    
    return true;
}
}

// ==================== RESET ADD GROUND MODAL ====================
function resetAddGroundModal() {
    const form = document.getElementById('add-ground-form');
    if (form) form.reset();
    
    selectedFiles = [];
    
    const fileInput = document.getElementById('ground-images');
    if (fileInput) fileInput.value = '';
    
    const previewGrid = document.getElementById('image-preview-grid');
    if (previewGrid) {
        previewGrid.innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-camera"></i>
                <p>No photos selected yet</p>
                <span>Photos are optional (you can add them later)</span>
            </div>
        `;
        previewGrid.classList.remove('has-images');
    }
    
    const uploadProgress = document.getElementById('upload-progress');
    if (uploadProgress) uploadProgress.style.display = 'none';
    
    const steps = document.querySelectorAll('.form-step');
    const progressSteps = document.querySelectorAll('.progress-step');
    
    steps.forEach(step => step.classList.remove('active'));
    progressSteps.forEach(step => step.classList.remove('active', 'completed'));
    
    const firstStep = document.querySelector('.form-step[data-step="1"]');
    const firstProgress = document.querySelector('.progress-step[data-step="1"]');
    if (firstStep) firstStep.classList.add('active');
    if (firstProgress) firstProgress.classList.add('active');
    
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const submitBtn = document.getElementById('submit-ground-btn');
    
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.style.display = 'flex';
    if (submitBtn) submitBtn.style.display = 'none';
    
    currentGroundStep = 1;
    
    updateEarningsPreview(0);
    
    const priceInput = document.getElementById('ground-price-input');
    if (priceInput) priceInput.value = '';
}
// ==================== SHOW ADD GROUND MODAL ====================
// ==================== SHOW ADD GROUND MODAL ====================
function showAddGroundModal() {
    // Reset form
    const form = document.getElementById('add-ground-form');
    if (form) form.reset();
    
    // Reset image preview with optional message
    const previewGrid = document.getElementById('image-preview-grid');
    if (previewGrid) {
        previewGrid.innerHTML = `
            <div class="preview-placeholder">
                <i class="fas fa-camera"></i>
                <p>No photos selected yet</p>
                <span>Photos are optional (you can add them later)</span>
            </div>
        `;
        previewGrid.classList.remove('has-images');
    }
    
    // Reset upload progress
    const uploadProgress = document.getElementById('upload-progress');
    if (uploadProgress) uploadProgress.style.display = 'none';
    
    // Reset to step 1
    const steps = document.querySelectorAll('.form-step');
    const progressSteps = document.querySelectorAll('.progress-step');
    
    steps.forEach(step => step.classList.remove('active'));
    progressSteps.forEach(step => step.classList.remove('active', 'completed'));
    
    const firstStep = document.querySelector('.form-step[data-step="1"]');
    const firstProgress = document.querySelector('.progress-step[data-step="1"]');
    if (firstStep) firstStep.classList.add('active');
    if (firstProgress) firstProgress.classList.add('active');
    
    // Reset navigation buttons
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const submitBtn = document.getElementById('submit-ground-btn');
    
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.style.display = 'flex';
    if (submitBtn) submitBtn.style.display = 'none';
    
    // Reset price preview
    updateEarningsPreview(0);
    
    // Reset price input
    const priceInput = document.getElementById('ground-price-input');
    if (priceInput) priceInput.value = '';
    
    // Reset selectedFiles if it exists
    if (typeof selectedFiles !== 'undefined') {
        selectedFiles = [];
    }
    
    // Show modal
    const modal = document.getElementById('add-ground-modal');
    if (modal) modal.classList.add('active');
}

// ==================== HANDLE ADD GROUND ====================
// ==================== HANDLE ADD GROUND ====================
async function handleAddGround(e) {
    e.preventDefault();
    
    const canAdd = await canAddGround();
    if (!canAdd) return;
    
    const groundName = document.getElementById('ground-name-input').value.trim();
    const sportType = document.getElementById('ground-sport-input').value;
    const pricePerHour = parseFloat(document.getElementById('ground-price-input').value);
    const groundAddress = document.getElementById('ground-address-input').value.trim();
    const fileInput = document.getElementById('ground-images');
    const groundImages = fileInput ? fileInput.files : [];
    
    // Validate inputs
    if (!groundName || !sportType || !pricePerHour) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (pricePerHour < 100) {
        showToast('Minimum price is ₹100 per hour', 'error');
        return;
    }
    
    // IMAGES ARE NOW OPTIONAL - Show warning only, no requirement
    if (groundImages.length === 0) {
        showToast('No photos selected. You can add photos later from the ground management page.', 'warning');
    }
    
    // Validate file sizes and types if images are selected
    for (let i = 0; i < groundImages.length; i++) {
        const file = groundImages[i];
        if (file.size > 5 * 1024 * 1024) {
            showToast(`${file.name} is too large. Maximum size is 5MB`, 'error');
            return;
        }
        if (!file.type.startsWith('image/')) {
            showToast(`${file.name} is not a valid image file`, 'error');
            return;
        }
    }
    
    // Show upload progress if images are selected
    const uploadProgress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('upload-progress-fill');
    const uploadStatus = document.getElementById('upload-status');
    
    if (uploadProgress && groundImages.length > 0) {
        uploadProgress.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (uploadStatus) uploadStatus.textContent = 'Uploading photos...';
    }
    
    showLoading('Adding ground...');
    
    try {
        const imageUrls = [];
        
        // Upload images if any are selected
        if (groundImages.length > 0) {
            let uploaded = 0;
            
            for (let i = 0; i < groundImages.length; i++) {
                const file = groundImages[i];
                const url = await uploadFile(file, `grounds/${currentUser.uid}`);
                imageUrls.push(url);
                
                uploaded++;
                if (uploadProgress && progressFill) {
                    const progress = (uploaded / groundImages.length) * 100;
                    progressFill.style.width = `${progress}%`;
                }
                if (uploadStatus) uploadStatus.textContent = `Uploading ${uploaded} of ${groundImages.length} photos...`;
            }
        }
        
        // Prepare ground data - images array can be empty
        const groundData = {
            ownerId: currentUser.uid,
            groundName: groundName,
            sportType: sportType,
            pricePerHour: pricePerHour,
            groundAddress: groundAddress || '',
            images: imageUrls, // Can be empty array
            rating: 0,
            totalReviews: 0,
            status: 'active',
            isVerified: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add ground to Firestore
        await db.collection(COLLECTIONS.GROUNDS).add(groundData);
        
        // Update owner's grounds count
        await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).update({
            groundsCount: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        
        const message = groundImages.length === 0 ? 
            'Ground added successfully! You can add photos later from the ground management page.' : 
            'Ground added successfully!';
        showToast(message, 'success');
        
        closeModal('add-ground-modal');
        
        // Reset the form
        const form = document.getElementById('add-ground-form');
        if (form) form.reset();
        
        // Reset price preview
        updateEarningsPreview(0);
        
        // Reset price input
        const priceInput = document.getElementById('ground-price-input');
        if (priceInput) priceInput.value = '';
        
        // Reset selected files
        if (typeof selectedFiles !== 'undefined') {
            selectedFiles = [];
        }
        
        // Reset image preview
        const previewGrid = document.getElementById('image-preview-grid');
        if (previewGrid) {
            previewGrid.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-camera"></i>
                    <p>No photos selected yet</p>
                    <span>Photos are optional (you can add them later)</span>
                </div>
            `;
            previewGrid.classList.remove('has-images');
        }
        
        // Reset step to 1
        const steps = document.querySelectorAll('.form-step');
        const progressSteps = document.querySelectorAll('.progress-step');
        
        steps.forEach(step => step.classList.remove('active'));
        progressSteps.forEach(step => step.classList.remove('active', 'completed'));
        
        const firstStep = document.querySelector('.form-step[data-step="1"]');
        const firstProgress = document.querySelector('.progress-step[data-step="1"]');
        if (firstStep) firstStep.classList.add('active');
        if (firstProgress) firstProgress.classList.add('active');
        
        // Reset navigation buttons
        const prevBtn = document.getElementById('prev-step-btn');
        const nextBtn = document.getElementById('next-step-btn');
        const submitBtn = document.getElementById('submit-ground-btn');
        
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.style.display = 'flex';
        if (submitBtn) submitBtn.style.display = 'none';
        
        // Reset current step
        currentGroundStep = 1;
        
        // Refresh owner dashboard if active
        if (document.getElementById('owner-dashboard-page').classList.contains('active')) {
            loadOwnerDashboard('grounds');
        } else {
            loadNearbyVenues();
        }
        
    } catch (error) {
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        console.error('Error adding ground:', error);
        showToast(error.message || 'Error adding ground. Please try again.', 'error');
    }
}
// ==================== CAN ADD GROUND ====================
async function canAddGround() {
    if (!currentUser || currentUser.role !== 'owner') {
        showToast('Please login as owner', 'error');
        return false;
    }
    
    try {
        const ownerDoc = await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).get();
        const owner = ownerDoc.data();
        
        if (!owner) {
            showToast('Owner data not found', 'error');
            return false;
        }
        
        if (owner.ownerType === OWNER_TYPES.VENUE_OWNER || owner.ownerType === OWNER_TYPES.PLOT_OWNER) {
            return true;
        }
        
        showToast('Your account type does not allow adding grounds', 'error');
        return false;
        
    } catch (error) {
        console.error('Error checking ground addition:', error);
        showToast('Error checking permissions', 'error');
        return false;
    }
}

// ==================== INITIALIZE ADD GROUND MODAL ====================
function initializeAddGroundModal() {
    setTimeout(() => {
        initializeStepNavigation();
        initializeImageUpload();
        initializePriceHandlers();
    }, 100);
}

// ==================== ADD GROUND MODAL CLOSE HANDLER ====================
function setupAddGroundModalClose() {
    const closeBtn = document.getElementById('close-add-ground-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal('add-ground-modal');
            resetAddGroundModal();
        });
    }
}

// Update earnings preview
// ==================== UPDATE EARNINGS PREVIEW ====================
function updateEarningsPreview(price) {
    const platformFee = price * 0.10;
    const ownerEarning = price - platformFee;
    
    const customerPriceEl = document.querySelector('.customer-price');
    const platformFeeEl = document.querySelector('.platform-fee');
    const ownerEarningEl = document.querySelector('.owner-earning');
    
    if (customerPriceEl) customerPriceEl.textContent = `₹${price.toLocaleString()}`;
    if (platformFeeEl) platformFeeEl.textContent = `₹${platformFee.toLocaleString()}`;
    if (ownerEarningEl) ownerEarningEl.textContent = `₹${ownerEarning.toLocaleString()}`;
}

// Enhanced image upload handling
function initializeImageUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('ground-images');
    const selectPhotosBtn = document.getElementById('select-photos-btn');
    let selectedFiles = [];
    
    function updateImagePreview() {
        const previewGrid = document.getElementById('image-preview-grid');
        
        if (!previewGrid) return;
        
        if (selectedFiles.length === 0) {
            previewGrid.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-camera"></i>
                    <p>No photos selected yet</p>
                    <span>Photos are optional (you can add them later)</span>
                </div>
            `;
            previewGrid.classList.remove('has-images');
            return;
        }
        
        previewGrid.classList.add('has-images');
        previewGrid.innerHTML = selectedFiles.map((file, index) => `
            <div class="image-preview-item" data-index="${index}">
                <img src="${URL.createObjectURL(file)}" alt="Preview ${index + 1}">
                <button type="button" class="image-preview-remove" data-index="${index}">
                    <i class="fas fa-times"></i>
                </button>
                <span class="image-preview-badge">${index + 1}</span>
            </div>
        `).join('');
        
        // Add remove handlers
        document.querySelectorAll('.image-preview-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                selectedFiles.splice(index, 1);
                updateImagePreview();
                
                // Update file input
                const dataTransfer = new DataTransfer();
                selectedFiles.forEach(file => dataTransfer.items.add(file));
                fileInput.files = dataTransfer.files;
            });
        });
    }
    
    function handleFiles(files) {
        const validFiles = Array.from(files).filter(file => {
            const isValidType = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/jpg';
            const isValidSize = file.size <= 5 * 1024 * 1024;
            if (!isValidType) showToast(`${file.name}: Only JPEG/PNG files allowed`, 'error');
            if (!isValidSize) showToast(`${file.name}: File size must be less than 5MB`, 'error');
            return isValidType && isValidSize;
        });
        
        if (validFiles.length === 0) return;
        
        if (selectedFiles.length + validFiles.length > 10) {
            showToast('Maximum 10 photos allowed', 'error');
            return;
        }
        
        selectedFiles.push(...validFiles);
        updateFileInputFromSelectedFiles();
        updateImagePreview();
        
        // Remove the warning about needing 3 photos
        // Just show how many photos are selected
        showToast(`${selectedFiles.length} photo${selectedFiles.length !== 1 ? 's' : ''} selected.`, 'info');
    }
    
    function updateFileInputFromSelectedFiles() {
        const fileInput = document.getElementById('ground-images');
        if (!fileInput) return;
        
        const dataTransfer = new DataTransfer();
        selectedFiles.forEach(file => {
            dataTransfer.items.add(file);
        });
        fileInput.files = dataTransfer.files;
    }
    
    const newUploadArea = uploadArea.cloneNode(true);
    uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
    
    if (selectPhotosBtn) {
        const newSelectPhotosBtn = selectPhotosBtn.cloneNode(true);
        selectPhotosBtn.parentNode.replaceChild(newSelectPhotosBtn, selectPhotosBtn);
        
        newSelectPhotosBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
    }
    
    newUploadArea.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
            handleFiles(e.target.files);
        }
    });
    
    newUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        newUploadArea.style.borderColor = 'var(--primary)';
        newUploadArea.style.background = 'var(--primary-50)';
    });
    
    newUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        newUploadArea.style.borderColor = 'var(--gray-300)';
        newUploadArea.style.background = 'var(--gray-50)';
    });
    
    newUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        newUploadArea.style.borderColor = 'var(--gray-300)';
        newUploadArea.style.background = 'var(--gray-50)';
        const files = e.dataTransfer.files;
        if (files.length) {
            handleFiles(files);
        }
    });
    
    return () => selectedFiles;
}
// Enhanced handle add ground
// ==================== HANDLE ADD GROUND ====================
async function handleAddGround(e) {
    e.preventDefault();
    
    const canAdd = await canAddGround();
    if (!canAdd) return;
    
    const groundName = document.getElementById('ground-name-input').value.trim();
    const sportType = document.getElementById('ground-sport-input').value;
    const pricePerHour = parseFloat(document.getElementById('ground-price-input').value);
    const groundAddress = document.getElementById('ground-address-input').value.trim();
    const fileInput = document.getElementById('ground-images');
    const groundImages = fileInput ? fileInput.files : [];
    
    // Validate inputs
    if (!groundName || !sportType || !pricePerHour) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (pricePerHour < 100) {
        showToast('Minimum price is ₹100 per hour', 'error');
        return;
    }
    
    // IMAGES ARE NOW OPTIONAL - Show warning only, no requirement
    if (groundImages.length === 0) {
        showToast('No photos selected. You can add photos later from the ground management page.', 'warning');
    }
    
    // Validate file sizes and types if images are selected
    for (let i = 0; i < groundImages.length; i++) {
        const file = groundImages[i];
        if (file.size > 5 * 1024 * 1024) {
            showToast(`${file.name} is too large. Maximum size is 5MB`, 'error');
            return;
        }
        if (!file.type.startsWith('image/')) {
            showToast(`${file.name} is not a valid image file`, 'error');
            return;
        }
    }
    
    // Show upload progress if images are selected
    const uploadProgress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('upload-progress-fill');
    const uploadStatus = document.getElementById('upload-status');
    
    if (uploadProgress && groundImages.length > 0) {
        uploadProgress.style.display = 'block';
        if (progressFill) progressFill.style.width = '0%';
        if (uploadStatus) uploadStatus.textContent = 'Uploading photos...';
    }
    
    showLoading('Adding ground...');
    
    try {
        const imageUrls = [];
        
        // Upload images if any are selected
        if (groundImages.length > 0) {
            let uploaded = 0;
            
            for (let i = 0; i < groundImages.length; i++) {
                const file = groundImages[i];
                const url = await uploadFile(file, `grounds/${currentUser.uid}`);
                imageUrls.push(url);
                
                uploaded++;
                if (uploadProgress && progressFill) {
                    const progress = (uploaded / groundImages.length) * 100;
                    progressFill.style.width = `${progress}%`;
                }
                if (uploadStatus) uploadStatus.textContent = `Uploading ${uploaded} of ${groundImages.length} photos...`;
            }
        }
        
        // Prepare ground data - images array can be empty
        const groundData = {
            ownerId: currentUser.uid,
            groundName: groundName,
            sportType: sportType,
            pricePerHour: pricePerHour,
            groundAddress: groundAddress || '',
            images: imageUrls, // Can be empty array
            rating: 0,
            totalReviews: 0,
            status: 'active',
            isVerified: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add ground to Firestore
        await db.collection(COLLECTIONS.GROUNDS).add(groundData);
        
        // Update owner's grounds count
        await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).update({
            groundsCount: firebase.firestore.FieldValue.increment(1),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        
        const message = groundImages.length === 0 ? 
            'Ground added successfully! You can add photos later from the ground management page.' : 
            'Ground added successfully!';
        showToast(message, 'success');
        
        closeModal('add-ground-modal');
        
        // Reset the form
        const form = document.getElementById('add-ground-form');
        if (form) form.reset();
        
        // Reset price preview
        updateEarningsPreview(0);
        
        // Reset price input
        const priceInput = document.getElementById('ground-price-input');
        if (priceInput) priceInput.value = '';
        
        // Reset selected files
        if (typeof selectedFiles !== 'undefined') {
            selectedFiles = [];
        }
        
        // Reset image preview
        const previewGrid = document.getElementById('image-preview-grid');
        if (previewGrid) {
            previewGrid.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-camera"></i>
                    <p>No photos selected yet</p>
                    <span>Photos are optional (you can add them later)</span>
                </div>
            `;
            previewGrid.classList.remove('has-images');
        }
        
        // Reset step to 1
        const steps = document.querySelectorAll('.form-step');
        const progressSteps = document.querySelectorAll('.progress-step');
        
        steps.forEach(step => step.classList.remove('active'));
        progressSteps.forEach(step => step.classList.remove('active', 'completed'));
        
        const firstStep = document.querySelector('.form-step[data-step="1"]');
        const firstProgress = document.querySelector('.progress-step[data-step="1"]');
        if (firstStep) firstStep.classList.add('active');
        if (firstProgress) firstProgress.classList.add('active');
        
        // Reset navigation buttons
        const prevBtn = document.getElementById('prev-step-btn');
        const nextBtn = document.getElementById('next-step-btn');
        const submitBtn = document.getElementById('submit-ground-btn');
        
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.style.display = 'flex';
        if (submitBtn) submitBtn.style.display = 'none';
        
        // Reset current step
        currentGroundStep = 1;
        
        // Refresh owner dashboard if active
        if (document.getElementById('owner-dashboard-page').classList.contains('active')) {
            loadOwnerDashboard('grounds');
        } else {
            loadNearbyVenues();
        }
        
    } catch (error) {
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        console.error('Error adding ground:', error);
        showToast(error.message || 'Error adding ground. Please try again.', 'error');
    }
}


// Add event listeners for price input
function initializePriceHandlers() {
    const priceInput = document.getElementById('ground-price-input');
    priceInput.addEventListener('input', (e) => {
        const price = parseFloat(e.target.value) || 0;
        updateEarningsPreview(price);
    });
    
    // Price suggestion badges
    document.querySelectorAll('.suggestion-badge').forEach(badge => {
        badge.addEventListener('click', () => {
            const price = parseInt(badge.dataset.price);
            priceInput.value = price;
            updateEarningsPreview(price);
        });
    });
}

// Initialize everything when modal is opened
function initializeAddGroundModal() {
    initializeStepNavigation();
    initializeImageUpload();
    initializePriceHandlers();
}

// Call this when the page loads

document.addEventListener('DOMContentLoaded', () => {
    initializeAddGroundModal();
});
// Add this inside your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', function() {
    // ... your existing initialization code ...
    
    initializeAddGroundModal();
    setupAddGroundModalClose();
    
    // Make sure form submit listener is attached
    const addGroundForm = document.getElementById('add-ground-form');
    if (addGroundForm) {
        addGroundForm.addEventListener('submit', handleAddGround);
    }
});

// Check for match payment callback on page load
function checkMatchPaymentCallback() {
    const paymentResult = localStorage.getItem('matchPaymentResult');
    if (paymentResult) {
        const result = JSON.parse(paymentResult);
        localStorage.removeItem('matchPaymentResult');
        
        if (result.success) {
            // Show success message
            showToast('Payment successful! You have joined the match.', 'success');
            // Refresh matches
            if (document.getElementById('main-page') && document.getElementById('main-page').classList.contains('active')) {
                loadPlayerMatches();
            }
            if (document.getElementById('all-matches-page') && document.getElementById('all-matches-page').classList.contains('active')) {
                displayAllMatches();
            }
        } else {
            showToast('Payment failed. Please try again.', 'error');
        }
    }
}

// Call this in DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    checkMatchPaymentCallback();
});


async function loadOwnerBookings(container) {
    showLoading('Loading bookings...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <h3>No Bookings Found</h3>
                    <p>Your bookings will appear here when customers make reservations.</p>
                </div>
            `;
            hideLoading();
            return;
        }
        
        let html = '<div class="booking-management-container">';
        
        for (const doc of snapshot.docs) {
            const booking = doc.data();
            const bookingDate = new Date(booking.date);
            const formattedDate = bookingDate.toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            });
            
            const createdAt = booking.createdAt ? new Date(booking.createdAt.toDate()) : new Date();
            const formattedCreatedAt = createdAt.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const statusClass = booking.bookingStatus === 'confirmed' ? 'confirmed' : 
                               booking.bookingStatus === 'pending_payment' ? 'pending' :
                               booking.bookingStatus === 'cancelled' ? 'cancelled' : 'completed';
            
            const statusIcon = booking.bookingStatus === 'confirmed' ? 'fa-check-circle' : 
                              booking.bookingStatus === 'pending_payment' ? 'fa-clock' :
                              booking.bookingStatus === 'cancelled' ? 'fa-times-circle' : 'fa-check-double';
            
            const statusText = booking.bookingStatus === 'confirmed' ? 'Confirmed' : 
                              booking.bookingStatus === 'pending_payment' ? 'Pending Payment' :
                              booking.bookingStatus === 'cancelled' ? 'Cancelled' : 'Completed';
            
            const payoutStatus = booking.payoutStatus || 'pending';
            const payoutStatusClass = payoutStatus === 'payout_done' ? 'success' : 'pending';
            const payoutStatusText = payoutStatus === 'payout_done' ? 'Paid' : 'Pending';
            
            html += `
                <div class="booking-card-modern ${statusClass}" data-booking-id="${booking.bookingId}">
                    <div class="booking-header">
                        <div class="booking-id-section">
                            <div class="booking-icon">
                                <i class="fas fa-receipt"></i>
                            </div>
                            <div class="booking-info">
                                <h4>${escapeHtml(booking.userName || 'Guest User')}</h4>
                                <div class="booking-id">Booking ID: ${booking.bookingId}</div>
                            </div>
                        </div>
                        <div class="booking-status-section">
                            <span class="booking-status-badge ${statusClass}">
                                <i class="fas ${statusIcon}"></i>
                                ${statusText}
                            </span>
                            <span class="payment-status-modern ${payoutStatusClass}">
                                <i class="fas fa-money-bill-wave"></i>
                                Payout: ${payoutStatusText}
                            </span>
                        </div>
                    </div>
                    
                    <div class="booking-details-grid">
                        <div class="booking-detail-card">
                            <div class="detail-header-booking">
                                <i class="fas fa-map-marker-alt"></i>
                                <span>Venue & Ground</span>
                            </div>
                            <div class="detail-content-booking">
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Venue:</span>
                                    <span class="detail-value-booking">${escapeHtml(booking.venueName || 'N/A')}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Ground:</span>
                                    <span class="detail-value-booking">${escapeHtml(booking.groundName || 'N/A')}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Address:</span>
                                    <span class="detail-value-booking">${escapeHtml(booking.groundAddress || booking.venueAddress || 'N/A')}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="booking-detail-card">
                            <div class="detail-header-booking">
                                <i class="fas fa-calendar-alt"></i>
                                <span>Schedule</span>
                            </div>
                            <div class="detail-content-booking">
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Date:</span>
                                    <span class="detail-value-booking">${formattedDate}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Time:</span>
                                    <span class="detail-value-booking">${booking.slotTime || 'N/A'}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Booked On:</span>
                                    <span class="detail-value-booking">${formattedCreatedAt}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="booking-detail-card">
                            <div class="detail-header-booking">
                                <i class="fas fa-user"></i>
                                <span>Customer Details</span>
                            </div>
                            <div class="detail-content-booking">
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Name:</span>
                                    <span class="detail-value-booking">${escapeHtml(booking.userName || 'N/A')}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Phone:</span>
                                    <span class="detail-value-booking">${escapeHtml(booking.userPhone || 'N/A')}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Email:</span>
                                    <span class="detail-value-booking">${escapeHtml(booking.userEmail || 'N/A')}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="booking-detail-card">
                            <div class="detail-header-booking">
                                <i class="fas fa-credit-card"></i>
                                <span>Payment Details</span>
                            </div>
                            <div class="detail-content-booking">
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Payment ID:</span>
                                    <span class="detail-value-booking">${booking.paymentId || 'N/A'}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Transaction ID:</span>
                                    <span class="detail-value-booking">${booking.transactionId || 'N/A'}</span>
                                </div>
                                <div class="detail-row-booking">
                                    <span class="detail-label-booking">Payment Status:</span>
                                    <span class="detail-value-booking ${booking.paymentStatus === 'success' ? 'success' : 'warning'}">
                                        ${booking.paymentStatus === 'success' ? 'Completed' : booking.paymentStatus === 'pending' ? 'Pending' : 'Failed'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="amount-section">
                        <span class="amount-label-large">Total Amount</span>
                        <div class="amount-value-large">${formatCurrency(booking.amount)}</div>
                        <div class="amount-breakdown">
                            <div class="breakdown-item">
                                <span class="breakdown-label">Your Share (90%)</span>
                                <span class="breakdown-value">${formatCurrency(booking.ownerAmount || booking.amount * 0.9)}</span>
                            </div>
                            <div class="breakdown-item">
                                <span class="breakdown-label">Platform Fee (10%)</span>
                                <span class="breakdown-value">${formatCurrency(booking.commission || booking.amount * 0.1)}</span>
                            </div>
                        </div>
                    </div>
                    
                    ${booking.bookingStatus === 'confirmed' && (!booking.entryStatus || booking.entryStatus !== 'used') ? `
                        <div class="booking-timeline">
                            <div class="timeline-steps">
                                <div class="timeline-step completed">
                                    <div class="step-icon">
                                        <i class="fas fa-check"></i>
                                    </div>
                                    <div class="step-label">Booked</div>
                                </div>
                                <div class="timeline-step active">
                                    <div class="step-icon">
                                        <i class="fas fa-hourglass-half"></i>
                                    </div>
                                    <div class="step-label">Awaiting Entry</div>
                                </div>
                                <div class="timeline-step">
                                    <div class="step-icon">
                                        <i class="fas fa-flag-checkered"></i>
                                    </div>
                                    <div class="step-label">Completed</div>
                                </div>
                            </div>
                        </div>
                    ` : booking.bookingStatus === 'completed' ? `
                        <div class="booking-timeline">
                            <div class="timeline-steps">
                                <div class="timeline-step completed">
                                    <div class="step-icon">
                                        <i class="fas fa-check"></i>
                                    </div>
                                    <div class="step-label">Booked</div>
                                </div>
                                <div class="timeline-step completed">
                                    <div class="step-icon">
                                        <i class="fas fa-door-open"></i>
                                    </div>
                                    <div class="step-label">Entry Used</div>
                                </div>
                                <div class="timeline-step completed">
                                    <div class="step-icon">
                                        <i class="fas fa-check-double"></i>
                                    </div>
                                    <div class="step-label">Completed</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="booking-actions-section">
                        ${booking.bookingStatus === 'confirmed' ? `
                            <button class="action-btn complete" onclick="markBookingCompleted('${booking.bookingId}')">
                                <i class="fas fa-check-double"></i> Mark as Completed
                            </button>
                        ` : booking.bookingStatus === 'pending_payment' ? `
                            <button class="action-btn approve" onclick="confirmBookingPayment('${booking.bookingId}')">
                                <i class="fas fa-check-circle"></i> Confirm Payment & Approve
                            </button>
                            <button class="action-btn reject" onclick="rejectBookingPayment('${booking.bookingId}')">
                                <i class="fas fa-times-circle"></i> Cancel Booking
                            </button>
                        ` : booking.bookingStatus === 'completed' ? `
                            <button class="action-btn" disabled style="opacity: 0.6; cursor: not-allowed;">
                                <i class="fas fa-check-double"></i> Completed
                            </button>
                        ` : booking.bookingStatus === 'cancelled' ? `
                            <button class="action-btn" disabled style="opacity: 0.6; cursor: not-allowed;">
                                <i class="fas fa-times-circle"></i> Cancelled
                            </button>
                        ` : ''}
                        
                        <button class="action-btn" onclick="viewBookingDetails('${booking.bookingId}')" style="background: var(--gray-100); color: var(--gray-700);">
                            <i class="fas fa-eye"></i> View Details
                        </button>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        container.innerHTML = html;
        hideLoading();
        
    } catch (error) {
        hideLoading();
        console.error('Error loading bookings:', error);
        container.innerHTML = '<p class="text-center">Failed to load bookings</p>';
    }
}

// Add these helper functions
async function confirmBookingPayment(bookingId) {
    showConfirmationModal({
        title: 'Confirm Booking',
        message: 'Are you sure you want to confirm this booking? This will mark the payment as completed and confirm the booking.',
        icon: 'approve',
        confirmText: 'Confirm Booking',
        onConfirm: async () => {
            showLoading('Confirming booking...');
            try {
                const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
                    .where('bookingId', '==', bookingId)
                    .get();
                
                if (snapshot.empty) throw new Error('Booking not found');
                
                const bookingRef = snapshot.docs[0].ref;
                await bookingRef.update({
                    bookingStatus: BOOKING_STATUS.CONFIRMED,
                    paymentStatus: PAYMENT_STATUS.SUCCESS,
                    confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                hideLoading();
                showToast('Booking confirmed successfully!', 'success');
                loadOwnerDashboard('bookings');
            } catch (error) {
                hideLoading();
                showToast('Error confirming booking: ' + error.message, 'error');
            }
        }
    });
}

async function rejectBookingPayment(bookingId) {
    const reason = prompt('Please provide a reason for cancellation (optional):');
    
    showConfirmationModal({
        title: 'Cancel Booking',
        message: 'Are you sure you want to cancel this booking? This action cannot be undone.',
        icon: 'reject',
        confirmText: 'Cancel Booking',
        onConfirm: async () => {
            showLoading('Cancelling booking...');
            try {
                const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
                    .where('bookingId', '==', bookingId)
                    .get();
                
                if (snapshot.empty) throw new Error('Booking not found');
                
                const booking = snapshot.docs[0].data();
                const bookingRef = snapshot.docs[0].ref;
                
                await bookingRef.update({
                    bookingStatus: BOOKING_STATUS.CANCELLED,
                    cancellationReason: reason || 'No reason provided',
                    cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Release the slot
                const [startTime, endTime] = booking.slotTime.split('-');
                const slotsSnapshot = await db.collection(COLLECTIONS.SLOTS)
                    .where('groundId', '==', booking.groundId)
                    .where('date', '==', booking.date)
                    .where('startTime', '==', startTime)
                    .where('endTime', '==', endTime)
                    .get();
                
                if (!slotsSnapshot.empty) {
                    await slotsSnapshot.docs[0].ref.update({
                        status: SLOT_STATUS.AVAILABLE,
                        bookingId: null,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                hideLoading();
                showToast('Booking cancelled successfully', 'info');
                loadOwnerDashboard('bookings');
            } catch (error) {
                hideLoading();
                showToast('Error cancelling booking: ' + error.message, 'error');
            }
        }
    });
}

async function markBookingCompleted(bookingId) {
    showConfirmationModal({
        title: 'Mark as Completed',
        message: 'Has this booking been successfully completed? This will mark it for payout.',
        icon: 'approve',
        confirmText: 'Mark Completed',
        onConfirm: async () => {
            showLoading('Updating booking status...');
            try {
                const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
                    .where('bookingId', '==', bookingId)
                    .get();
                
                if (snapshot.empty) throw new Error('Booking not found');
                
                const bookingRef = snapshot.docs[0].ref;
                await bookingRef.update({
                    bookingStatus: BOOKING_STATUS.COMPLETED,
                    completedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    entryStatus: 'used',
                    entryTime: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                hideLoading();
                showToast('Booking marked as completed!', 'success');
                loadOwnerDashboard('bookings');
            } catch (error) {
                hideLoading();
                showToast('Error updating booking: ' + error.message, 'error');
            }
        }
    });
}

function showConfirmationModal({ title, message, icon, confirmText, onConfirm }) {
    let modal = document.getElementById('booking-confirmation-modal');
    
    if (!modal) {
        const modalHtml = `
            <div id="booking-confirmation-modal" class="modal">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3>Confirmation</h3>
                        <button class="close-btn" id="close-confirmation-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="confirmation-modal-content">
                            <div class="confirmation-icon ${icon}" id="confirmation-icon">
                                <i class="fas ${icon === 'approve' ? 'fa-check-circle' : 'fa-exclamation-triangle'}"></i>
                            </div>
                            <h4 class="confirmation-title" id="confirmation-title">${title}</h4>
                            <p class="confirmation-message" id="confirmation-message">${message}</p>
                            <div class="confirmation-actions">
                                <button class="confirmation-btn confirm" id="confirm-action">${confirmText}</button>
                                <button class="confirmation-btn cancel" id="cancel-action">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('close-confirmation-modal').addEventListener('click', () => {
            closeModal('booking-confirmation-modal');
        });
        
        document.getElementById('cancel-action').addEventListener('click', () => {
            closeModal('booking-confirmation-modal');
        });
    }
    
    // Update modal content
    document.getElementById('confirmation-icon').className = `confirmation-icon ${icon}`;
    document.getElementById('confirmation-title').textContent = title;
    document.getElementById('confirmation-message').textContent = message;
    
    const confirmBtn = document.getElementById('confirm-action');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    
    newConfirmBtn.addEventListener('click', () => {
        closeModal('booking-confirmation-modal');
        if (onConfirm) onConfirm();
    });
    
    document.getElementById('booking-confirmation-modal').classList.add('active');
}

function viewBookingDetails(bookingId) {
    // You can implement a modal to show full booking details
    showToast('View details functionality coming soon', 'info');
}

// ==================== UPDATED OWNER EARNINGS SECTION ====================

// Replace the loadOwnerEarnings function with this corrected version

// ==================== UPDATED OWNER EARNINGS SECTION ====================

async function loadOwnerEarnings(container) {
    showLoading('Loading earnings...');
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        const weekStart = lastWeek.toISOString().split('T')[0];
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const monthStart = lastMonth.toISOString().split('T')[0];
        
        // Get all confirmed bookings for this owner
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', currentUser.uid)
            .where('bookingStatus', '==', BOOKING_STATUS.CONFIRMED)
            .get();
        
        // Get ALL payout requests for this owner (pending, approved, paid, rejected)
        const allPayoutRequests = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
            .where('ownerId', '==', currentUser.uid)
            .get();
        
        // Get only pending payout requests
        const pendingPayoutRequests = allPayoutRequests.docs.filter(doc => 
            doc.data().status === PAYOUT_REQUEST_STATUS.PENDING
        );
        
        // Calculate earnings from confirmed bookings
        let todayEarnings = 0;
        let weekEarnings = 0;
        let monthEarnings = 0;
        let totalEarnings = 0;
        let totalRequestedPayout = 0;
        let totalPaidOut = 0;
        let totalRejectedPayout = 0;
        
        // Calculate total earnings from confirmed bookings
        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            const bookingDate = booking.date;
            const ownerAmount = booking.ownerAmount || 0;
            
            totalEarnings += ownerAmount;
            
            if (bookingDate === today) {
                todayEarnings += ownerAmount;
            }
            
            if (bookingDate >= weekStart) {
                weekEarnings += ownerAmount;
            }
            
            if (bookingDate >= monthStart) {
                monthEarnings += ownerAmount;
            }
        });
        
        // Calculate total requested payouts (pending + approved + paid)
        // But NOT rejected ones (they should be available again)
        allPayoutRequests.forEach(doc => {
            const payout = doc.data();
            const amount = payout.amount || 0;
            const status = payout.status;
            
            if (status === PAYOUT_REQUEST_STATUS.PENDING || 
                status === PAYOUT_REQUEST_STATUS.APPROVED || 
                status === PAYOUT_REQUEST_STATUS.PAID) {
                totalRequestedPayout += amount;
            }
            
            if (status === PAYOUT_REQUEST_STATUS.PAID) {
                totalPaidOut += amount;
            }
            
            if (status === PAYOUT_REQUEST_STATUS.REJECTED) {
                totalRejectedPayout += amount;
            }
        });
        
        // Calculate available balance:
        // Total Earnings - (Pending + Approved + Paid) + Rejected (since rejected amounts become available again)
        // But careful: if a payout was rejected, those bookings should be available again
        // For simplicity, we'll subtract only pending + approved + paid from total earnings
        // The rejected amounts are already included in total earnings and not subtracted
        let availableBalance = totalEarnings - totalRequestedPayout;
        
        // If available balance is negative (shouldn't happen), set to 0
        if (availableBalance < 0) {
            availableBalance = 0;
        }
        
        // Get pending count
        const pendingCount = pendingPayoutRequests.length;
        
        // Calculate success rate
        const totalRequests = allPayoutRequests.size;
        const completedRequests = allPayoutRequests.docs.filter(doc => 
            doc.data().status === PAYOUT_REQUEST_STATUS.PAID
        ).length;
        const successRate = totalRequests > 0 ? Math.round((completedRequests / totalRequests) * 100) : 0;
        
        // Get payout history for display (sorted by newest first)
        const payoutRequestsSnapshot = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
            .where('ownerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        container.innerHTML = `
            <!-- Earnings Overview Cards -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${formatCurrency(todayEarnings)}</div>
                    <div class="stat-label">Today's Earnings</div>
                    <i class="fas fa-calendar-day stat-icon"></i>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCurrency(weekEarnings)}</div>
                    <div class="stat-label">This Week</div>
                    <i class="fas fa-calendar-week stat-icon"></i>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCurrency(monthEarnings)}</div>
                    <div class="stat-label">This Month</div>
                    <i class="fas fa-calendar-alt stat-icon"></i>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${formatCurrency(totalEarnings)}</div>
                    <div class="stat-label">Total Earnings</div>
                    <i class="fas fa-chart-line stat-icon"></i>
                </div>
            </div>
            
            <!-- Payout Summary Cards -->
            <div class="payout-summary-grid">
                <div class="payout-summary-card">
                    <div class="payout-summary-icon pending">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="payout-summary-info">
                        <span class="payout-summary-label">Pending Payout Requests</span>
                        <span class="payout-summary-amount">${pendingCount}</span>
                    </div>
                </div>
                <div class="payout-summary-card">
                    <div class="payout-summary-icon paid">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="payout-summary-info">
                        <span class="payout-summary-label">Total Paid</span>
                        <span class="payout-summary-amount">${formatCurrency(totalPaidOut)}</span>
                    </div>
                </div>
                <div class="payout-summary-card">
                    <div class="payout-summary-icon rate">
                        <i class="fas fa-percent"></i>
                    </div>
                    <div class="payout-summary-info">
                        <span class="payout-summary-label">Success Rate</span>
                        <span class="payout-summary-amount">${successRate}%</span>
                    </div>
                </div>
            </div>
            
            <!-- Available Balance Card -->
            <div class="available-balance-card">
                <div class="available-balance-header">
                    <i class="fas fa-wallet"></i>
                    <h3>Available for Payout</h3>
                </div>
                <div class="available-balance-amount">${formatCurrency(availableBalance)}</div>
                <p class="available-balance-note">Platform commission (10%) already deducted</p>
                ${availableBalance >= 500 && pendingCount === 0 ? `
                    <button class="request-payout-btn-enhanced" onclick="showPayoutRequestModal(${availableBalance})">
                        <i class="fas fa-money-bill-wave"></i> Request Payout
                    </button>
                ` : availableBalance >= 500 && pendingCount > 0 ? `
                    <p class="no-funds-note">You have a pending payout request. Wait for it to be processed.</p>
                ` : availableBalance > 0 && availableBalance < 500 ? `
                    <p class="no-funds-note">Minimum payout amount is ₹500. Need ₹${(500 - availableBalance).toFixed(0)} more to request payout.</p>
                ` : `
                    <p class="no-funds-note">No funds available for payout</p>
                `}
            </div>
            
            <!-- Payout History Section -->
            <div class="payout-history-section">
                <div class="section-header-enhanced">
                    <h4><i class="fas fa-history"></i> Payout History</h4>
                    ${payoutRequestsSnapshot.size > 0 ? `<span class="total-count">${payoutRequestsSnapshot.size} Requests</span>` : ''}
                </div>
                
                <div class="payout-history-list" id="payout-history-list">
                    ${renderPayoutHistory(payoutRequestsSnapshot.docs)}
                </div>
            </div>
        `;
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading earnings:', error);
        container.innerHTML = '<p class="text-center">Failed to load earnings</p>';
    }
}
// Replace the loadOwnerEarnings function with this corrected version



// Update the showPayoutRequestModal function

// Update the showPayoutRequestModal function

function showPayoutRequestModal(availableAmount) {
    // Check if there's already a pending payout request
    db.collection(COLLECTIONS.PAYOUT_REQUESTS)
        .where('ownerId', '==', currentUser.uid)
        .where('status', '==', 'pending')
        .get()
        .then((snapshot) => {
            if (!snapshot.empty) {
                showToast('You already have a pending payout request. Please wait for it to be processed.', 'warning');
                return;
            }
            
            const modal = document.getElementById('payout-request-modal');
            const content = document.getElementById('payout-request-content');
            
            content.innerHTML = `
                <div class="available-balance">
                    <h4>Available Balance</h4>
                    <div class="balance-amount">${formatCurrency(availableAmount)}</div>
                    <p class="balance-note">Minimum payout: ₹500</p>
                </div>
                
                <div class="form-group">
                    <label>UPI ID for Payout</label>
                    <input type="text" id="payout-upi" class="modal-input" value="${currentUser.upiId || ''}" readonly>
                </div>
                
                <div class="form-group">
                    <label>Amount to Withdraw</label>
                    <input type="number" id="payout-amount" class="modal-input" 
                           value="${Math.min(availableAmount, 5000)}" 
                           min="500" max="${availableAmount}" step="500">
                    <div class="form-hint">You can request up to ${formatCurrency(availableAmount)}</div>
                </div>
                
                <button class="request-payout-btn" onclick="requestPayout(${availableAmount})">
                    <i class="fas fa-money-bill-wave"></i> Request Payout
                </button>
            `;
            
            modal.classList.add('active');
        })
        .catch(error => {
            console.error('Error checking pending payouts:', error);
            showToast('Error checking pending payouts', 'error');
        });
}
// Add this function to sync owner earnings after payout

async function updateOwnerEarningsAfterPayout(ownerId, amount) {
    try {
        const ownerRef = db.collection(COLLECTIONS.OWNERS).doc(ownerId);
        
        // Update owner's total paid amount
        await ownerRef.update({
            totalPaidOut: firebase.firestore.FieldValue.increment(amount),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Updated owner ${ownerId} earnings after payout of ${amount}`);
        
    } catch (error) {
        console.error('Error updating owner earnings:', error);
    }
}

// Call this function in markPayoutAsPaid
async function markPayoutAsPaid(requestId) {
    if (!confirm('Mark this payout as paid? This will update the status to PAID.')) return;
    
    showLoading('Updating payout status...');
    
    try {
        const payoutRef = db.collection(COLLECTIONS.PAYOUT_REQUESTS).doc(requestId);
        const payoutDoc = await payoutRef.get();
        
        if (!payoutDoc.exists) {
            throw new Error('Payout request not found');
        }
        
        const payout = payoutDoc.data();
        
        // Update payout request status
        await payoutRef.update({
            status: 'paid',
            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
            paidBy: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update owner's earnings
        await updateOwnerEarningsAfterPayout(payout.ownerId, payout.amount);
        
        // Update related bookings payout status
        if (payout.bookingIds && payout.bookingIds.length > 0) {
            const batch = db.batch();
            
            for (const bookingId of payout.bookingIds) {
                const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
                    .where('bookingId', '==', bookingId)
                    .get();
                
                if (!bookingsSnapshot.empty) {
                    bookingsSnapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            payoutStatus: BOOKING_STATUS.PAYOUT_DONE,
                            payoutPaidAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                }
            }
            
            await batch.commit();
        }
        
        hideLoading();
        showToast('Payout marked as paid successfully', 'success');
        
        // Refresh the current view
        if (document.getElementById('admin-dashboard-page').classList.contains('active')) {
            loadAdminDashboard('payouts');
        } else if (document.getElementById('ceo-dashboard-page').classList.contains('active')) {
            loadCEODashboard('payouts');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error marking payout as paid:', error);
        showToast('Error marking payout as paid: ' + error.message, 'error');
    }
}

// Replace the requestPayout function with this corrected version

// Replace the requestPayout function with this corrected version

async function requestPayout(availableAmount) {
    const amount = parseFloat(document.getElementById('payout-amount').value);
    
    if (amount < 500) {
        showToast('Minimum payout amount is ₹500', 'error');
        return;
    }
    
    if (amount > availableAmount) {
        showToast('Amount exceeds available balance', 'error');
        return;
    }
    
    if (!confirm(`Request payout of ${formatCurrency(amount)}? This will be processed within 2-3 business days.`)) {
        return;
    }
    
    showLoading('Processing payout request...');
    
    try {
        // Get all confirmed bookings for this owner
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', currentUser.uid)
            .where('bookingStatus', '==', BOOKING_STATUS.CONFIRMED)
            .get();
        
        // Get all existing payout requests for this owner
        const existingPayouts = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
            .where('ownerId', '==', currentUser.uid)
            .where('status', 'in', ['pending', 'approved'])
            .get();
        
        // If there's already a pending or approved payout, prevent new request
        if (!existingPayouts.empty) {
            hideLoading();
            showToast('You already have a pending payout request. Please wait for it to be processed.', 'warning');
            closeModal('payout-request-modal');
            return;
        }
        
        // Find pending bookings (those not marked for payout and not already requested)
        const pendingBookings = [];
        
        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            // Check if booking has not been requested for payout yet
            if (!booking.payoutRequestId && 
                booking.payoutStatus !== BOOKING_STATUS.PAYOUT_DONE &&
                booking.payoutStatus !== BOOKING_STATUS.PAYOUT_PENDING) {
                pendingBookings.push({
                    id: doc.id,
                    bookingId: booking.bookingId,
                    ownerAmount: booking.ownerAmount || 0,
                    date: booking.date,
                    ...booking
                });
            }
        });
        
        if (pendingBookings.length === 0) {
            hideLoading();
            showToast('No pending bookings found for payout', 'error');
            return;
        }
        
        // Sort bookings by date (oldest first) to process FIFO
        pendingBookings.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Select bookings to cover the requested amount (FIFO)
        const selectedBookings = [];
        let selectedAmount = 0;
        
        for (const booking of pendingBookings) {
            if (selectedAmount < amount) {
                selectedBookings.push(booking);
                selectedAmount += booking.ownerAmount;
            } else {
                break;
            }
        }
        
        const bookingIds = selectedBookings.map(b => b.bookingId);
        const actualAmount = selectedBookings.reduce((sum, b) => sum + b.ownerAmount, 0);
        
        if (actualAmount < 500) {
            hideLoading();
            showToast(`Selected bookings total ${formatCurrency(actualAmount)}. Minimum payout is ₹500.`, 'error');
            closeModal('payout-request-modal');
            return;
        }
        
        // Create payout request
        const payoutRequestData = {
            requestId: generateId('POUT'),
            ownerId: currentUser.uid,
            ownerName: currentUser.ownerName || currentUser.name,
            ownerEmail: currentUser.email,
            ownerPhone: currentUser.phone || '',
            upiId: currentUser.upiId,
            amount: actualAmount,
            requestedAmount: amount,
            bookingIds: bookingIds,
            status: PAYOUT_REQUEST_STATUS.PENDING,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add payout request
        await db.collection(COLLECTIONS.PAYOUT_REQUESTS).add(payoutRequestData);
        
        // Update selected bookings with payout request ID and status
        const batch = db.batch();
        selectedBookings.forEach(booking => {
            const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc(booking.id);
            batch.update(bookingRef, {
                payoutStatus: BOOKING_STATUS.PAYOUT_PENDING,
                payoutRequestId: payoutRequestData.requestId,
                payoutRequestedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        
        hideLoading();
        showToast(`Payout request of ${formatCurrency(actualAmount)} submitted successfully!`, 'success');
        closeModal('payout-request-modal');
        
        // Refresh the earnings page to show updated balance
        loadOwnerDashboard('earnings');
        
    } catch (error) {
        hideLoading();
        console.error('Error requesting payout:', error);
        showToast('Error requesting payout: ' + error.message, 'error');
    }
}
// Add this function to handle payout approval and update available balance

async function processPayoutApproval(requestId) {
    if (!confirm('Approve this payout request? This will mark the amount as processed.')) return;
    
    showLoading('Processing payout approval...');
    
    try {
        const payoutRef = db.collection(COLLECTIONS.PAYOUT_REQUESTS).doc(requestId);
        const payoutDoc = await payoutRef.get();
        
        if (!payoutDoc.exists) {
            throw new Error('Payout request not found');
        }
        
        const payout = payoutDoc.data();
        
        // Update payout request status
        await payoutRef.update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update related bookings (they already have payout_pending status)
        if (payout.bookingIds && payout.bookingIds.length > 0) {
            const batch = db.batch();
            
            for (const bookingId of payout.bookingIds) {
                const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
                    .where('bookingId', '==', bookingId)
                    .get();
                
                if (!bookingsSnapshot.empty) {
                    bookingsSnapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            payoutStatus: BOOKING_STATUS.PAYOUT_DONE,
                            payoutApprovedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                }
            }
            
            await batch.commit();
        }
        
        hideLoading();
        showToast('Payout approved successfully', 'success');
        
        // Refresh the current view
        if (document.getElementById('admin-dashboard-page').classList.contains('active')) {
            loadAdminDashboard('payouts');
        } else if (document.getElementById('ceo-dashboard-page').classList.contains('active')) {
            loadCEODashboard('payouts');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error approving payout:', error);
        showToast('Error approving payout: ' + error.message, 'error');
    }
}

async function loadOwnerPayouts(container) {
    showLoading('Loading payouts...');
    
    try {
        const payoutRequestsSnapshot = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
            .where('ownerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        // Calculate statistics
        const totalRequests = payoutRequestsSnapshot.size;
        const pendingCount = payoutRequestsSnapshot.docs.filter(doc => doc.data().status === 'pending').length;
        const approvedCount = payoutRequestsSnapshot.docs.filter(doc => doc.data().status === 'approved').length;
        const paidCount = payoutRequestsSnapshot.docs.filter(doc => doc.data().status === 'paid').length;
        const rejectedCount = payoutRequestsSnapshot.docs.filter(doc => doc.data().status === 'rejected').length;
        
        let totalRequestedAmount = 0;
        let totalPaidAmount = 0;
        
        payoutRequestsSnapshot.forEach(doc => {
            const request = doc.data();
            totalRequestedAmount += request.amount || 0;
            if (request.status === 'paid') {
                totalPaidAmount += request.amount || 0;
            }
        });
        
        container.innerHTML = `
            <!-- Payout Statistics Cards -->
            <div class="payout-stats-grid">
                <div class="payout-stat-card">
                    <div class="payout-stat-icon total">
                        <i class="fas fa-receipt"></i>
                    </div>
                    <div class="payout-stat-info">
                        <span class="payout-stat-value">${totalRequests}</span>
                        <span class="payout-stat-label">Total Requests</span>
                    </div>
                </div>
                <div class="payout-stat-card">
                    <div class="payout-stat-icon pending">
                        <i class="fas fa-clock"></i>
                    </div>
                    <div class="payout-stat-info">
                        <span class="payout-stat-value">${pendingCount}</span>
                        <span class="payout-stat-label">Pending</span>
                    </div>
                </div>
                <div class="payout-stat-card">
                    <div class="payout-stat-icon approved">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <div class="payout-stat-info">
                        <span class="payout-stat-value">${approvedCount}</span>
                        <span class="payout-stat-label">Approved</span>
                    </div>
                </div>
                <div class="payout-stat-card">
                    <div class="payout-stat-icon paid">
                        <i class="fas fa-money-bill-wave"></i>
                    </div>
                    <div class="payout-stat-info">
                        <span class="payout-stat-value">${paidCount}</span>
                        <span class="payout-stat-label">Paid</span>
                    </div>
                </div>
            </div>
            
            <div class="payout-stats-grid">
                <div class="payout-stat-card highlight">
                    <div class="payout-stat-icon requested">
                        <i class="fas fa-chart-line"></i>
                    </div>
                    <div class="payout-stat-info">
                        <span class="payout-stat-value">${formatCurrency(totalRequestedAmount)}</span>
                        <span class="payout-stat-label">Total Requested</span>
                    </div>
                </div>
                <div class="payout-stat-card highlight">
                    <div class="payout-stat-icon received">
                        <i class="fas fa-hand-holding-usd"></i>
                    </div>
                    <div class="payout-stat-info">
                        <span class="payout-stat-value">${formatCurrency(totalPaidAmount)}</span>
                        <span class="payout-stat-label">Total Received</span>
                    </div>
                </div>
                <div class="payout-stat-card highlight">
                    <div class="payout-stat-icon success">
                        <i class="fas fa-chart-pie"></i>
                    </div>
                    <div class="payout-stat-info">
                        <span class="payout-stat-value">${totalRequests > 0 ? Math.round((paidCount / totalRequests) * 100) : 0}%</span>
                        <span class="payout-stat-label">Success Rate</span>
                    </div>
                </div>
            </div>
            
            <!-- All Payout Requests Section -->
            <div class="all-payouts-section">
                <div class="section-header-enhanced">
                    <h4><i class="fas fa-list-ul"></i> All Payout Requests</h4>
                    <span class="total-count">${totalRequests} Total</span>
                </div>
                
                <div class="all-payouts-list" id="all-payouts-list">
                    ${renderAllPayouts(payoutRequestsSnapshot.docs)}
                </div>
            </div>
        `;
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading payouts:', error);
        container.innerHTML = '<p class="text-center">Failed to load payouts</p>';
    }
}
async function loadOwnerVerification(container) {
    showLoading('Loading verification status...');
    
    try {
        const ownerDoc = await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).get();
        const owner = ownerDoc.data();
        
        const verificationSnapshot = await db.collection(COLLECTIONS.VERIFICATION_REQUESTS)
            .where('ownerId', '==', currentUser.uid)
            .orderBy('submittedAt', 'desc')
            .limit(1)
            .get();
        
        const hasVerificationRequest = !verificationSnapshot.empty;
        const verification = hasVerificationRequest ? verificationSnapshot.docs[0].data() : null;
        
        let statusIcon = '';
        let statusBadgeClass = '';
        let statusText = '';
        let statusMessage = '';
        
        if (owner.isVerified) {
            statusIcon = 'verified';
            statusBadgeClass = 'verified';
            statusText = 'Verified';
            statusMessage = 'Your account has been verified. You can now enjoy full platform benefits!';
        } else if (hasVerificationRequest && verification.status === 'pending') {
            statusIcon = 'pending';
            statusBadgeClass = 'pending';
            statusText = 'Under Review';
            statusMessage = 'Your verification request is being reviewed. This usually takes 2-3 business days.';
        } else if (hasVerificationRequest && verification.status === 'rejected') {
            statusIcon = 'rejected';
            statusBadgeClass = 'rejected';
            statusText = 'Verification Failed';
            statusMessage = 'Your verification request was rejected. Please check the reason below and resubmit.';
        } else {
            statusIcon = 'not-verified';
            statusBadgeClass = 'not-verified';
            statusText = 'Not Verified';
            statusMessage = 'Get verified to build trust with customers and increase your bookings!';
        }
        
        let html = `
            <!-- Verification Status Card -->
            <div class="verification-status-card">
                <div class="verification-status-header">
                    <div class="verification-status-icon ${statusIcon}">
                        <i class="fas ${statusIcon === 'verified' ? 'fa-check-circle' : statusIcon === 'pending' ? 'fa-clock' : statusIcon === 'rejected' ? 'fa-times-circle' : 'fa-shield-alt'}"></i>
                    </div>
                    <div class="verification-status-info">
                        <div class="verification-status-title">Verification Status</div>
                        <div class="verification-status-badge ${statusBadgeClass}">
                            <i class="fas ${statusIcon === 'verified' ? 'fa-check-circle' : statusIcon === 'pending' ? 'fa-clock' : statusIcon === 'rejected' ? 'fa-times-circle' : 'fa-exclamation-circle'}"></i>
                            ${statusText}
                        </div>
                        <div class="verification-status-message">
                            <i class="fas ${statusIcon === 'verified' ? 'fa-check' : statusIcon === 'pending' ? 'fa-hourglass-half' : statusIcon === 'rejected' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i>
                            ${statusMessage}
                        </div>
                    </div>
                </div>
                
                <!-- Progress Steps -->
                <div class="verification-progress">
                    <div class="progress-steps">
                        <div class="progress-step ${owner.isVerified || hasVerificationRequest ? 'completed' : 'active'}">
                            <div class="step-circle">1</div>
                            <div class="step-label">Submit Documents</div>
                        </div>
                        <div class="progress-step ${hasVerificationRequest && verification.status === 'pending' ? 'active' : hasVerificationRequest && (verification.status === 'approved' || owner.isVerified) ? 'completed' : ''}">
                            <div class="step-circle">2</div>
                            <div class="step-label">Under Review</div>
                        </div>
                        <div class="progress-step ${owner.isVerified ? 'completed' : ''}">
                            <div class="step-circle">3</div>
                            <div class="step-label">Verified</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Show existing verification request if pending
        if (hasVerificationRequest && verification.status === 'pending') {
            html += `
                <div class="verification-request-card">
                    <div class="verification-request-header">
                        <div class="request-id">
                            <i class="fas fa-receipt"></i>
                            <span>Request ID: ${verification.requestId || 'N/A'}</span>
                        </div>
                        <div class="request-date">
                            <i class="fas fa-calendar"></i>
                            <span>Submitted: ${verification.submittedAt ? new Date(verification.submittedAt.toDate()).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                    <div class="request-details">
                        <div class="request-detail-item">
                            <i class="fas fa-id-card"></i>
                            <span>Aadhaar: ${verification.aadhaarNumber ? verification.aadhaarNumber.substring(0, 4) + '******' + verification.aadhaarNumber.substring(10) : '******'}</span>
                        </div>
                        <div class="request-detail-item">
                            <i class="fas fa-file-invoice"></i>
                            <span>PAN: ${verification.panNumber ? verification.panNumber.substring(0, 5) + '*****' : '*****'}</span>
                        </div>
                        <div class="request-detail-item">
                            <i class="fas fa-image"></i>
                            <span>Documents: 3 uploaded</span>
                        </div>
                    </div>
                    <div class="request-status-badge pending">
                        <i class="fas fa-clock"></i>
                        Pending Review
                    </div>
                </div>
            `;
        }
        
        // Show rejection reason if rejected
        if (hasVerificationRequest && verification.status === 'rejected' && verification.rejectionReason) {
            html += `
                <div class="verification-request-card" style="border-left-color: var(--danger);">
                    <div class="verification-request-header">
                        <div class="request-id">
                            <i class="fas fa-receipt"></i>
                            <span>Request ID: ${verification.requestId || 'N/A'}</span>
                        </div>
                        <div class="request-date">
                            <i class="fas fa-calendar"></i>
                            <span>Rejected: ${verification.rejectedAt ? new Date(verification.rejectedAt.toDate()).toLocaleDateString() : 'N/A'}</span>
                        </div>
                    </div>
                    <div class="rejection-reason" style="margin: var(--space-md);">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Rejection Reason:</strong> ${escapeHtml(verification.rejectionReason)}
                    </div>
                    <div class="verification-actions">
                        <button class="action-btn view" onclick="showResubmitVerification()">
                            <i class="fas fa-redo"></i> Resubmit
                        </button>
                    </div>
                </div>
            `;
        }
        
        // Show verification form if not verified and no pending request
        if (!owner.isVerified && (!hasVerificationRequest || verification.status === 'rejected')) {
            html += `
                <div class="verification-form-card">
                    <div class="verification-form-title">
                        <i class="fas fa-id-card"></i>
                        <span>Submit Verification Documents</span>
                    </div>
                    <div class="verification-form-subtitle">
                        Please provide the following information to verify your identity. This helps build trust with customers.
                    </div>
                    
                    <form id="owner-verification-form" enctype="multipart/form-data">
                        <div class="verification-form-fields">
                            <div class="field-group">
                                <label class="field-label">
                                    <i class="fas fa-id-card"></i> Aadhaar Number
                                </label>
                                <input type="text" id="aadhaar-number" class="field-input" maxlength="12" placeholder="Enter 12-digit Aadhaar number" required pattern="[0-9]{12}" title="Please enter a valid 12-digit Aadhaar number">
                                <div class="field-hint">Enter the 12-digit number on your Aadhaar card (only numbers)</div>
                            </div>
                            
                            <div class="field-group">
                                <label class="field-label">
                                    <i class="fas fa-file-invoice"></i> PAN Number
                                </label>
                                <input type="text" id="pan-number" class="field-input" maxlength="10" placeholder="Enter 10-digit PAN number" required pattern="[A-Z]{5}[0-9]{4}[A-Z]{1}" title="Please enter a valid PAN number (e.g., ABCDE1234F)">
                                <div class="field-hint">Enter your PAN card number (e.g., ABCDE1234F)</div>
                            </div>
                        </div>
                        
                        <div class="document-upload-grid">
                            <div class="document-card" id="aadhaar-front-card" data-required="true">
                                <div class="document-icon">
                                    <i class="fas fa-id-card"></i>
                                </div>
                                <div class="document-name">Aadhaar Card (Front)</div>
                                <div class="document-requirement">Required - JPEG, PNG or PDF (Max 5MB)</div>
                                <div class="document-status pending" id="aadhaar-front-status">
                                    <i class="fas fa-clock"></i> No file selected
                                </div>
                                <div class="file-name" id="aadhaar-front-filename" style="font-size: 11px; color: var(--gray-500); margin-top: 5px;"></div>
                                <input type="file" id="aadhaar-front" class="document-input" accept="image/jpeg,image/png,application/pdf" required>
                            </div>
                            
                            <div class="document-card" id="aadhaar-back-card" data-required="true">
                                <div class="document-icon">
                                    <i class="fas fa-id-card"></i>
                                </div>
                                <div class="document-name">Aadhaar Card (Back)</div>
                                <div class="document-requirement">Required - JPEG, PNG or PDF (Max 5MB)</div>
                                <div class="document-status pending" id="aadhaar-back-status">
                                    <i class="fas fa-clock"></i> No file selected
                                </div>
                                <div class="file-name" id="aadhaar-back-filename" style="font-size: 11px; color: var(--gray-500); margin-top: 5px;"></div>
                                <input type="file" id="aadhaar-back" class="document-input" accept="image/jpeg,image/png,application/pdf" required>
                            </div>
                            
                            <div class="document-card" id="pan-card" data-required="true">
                                <div class="document-icon">
                                    <i class="fas fa-file-invoice"></i>
                                </div>
                                <div class="document-name">PAN Card</div>
                                <div class="document-requirement">Required - JPEG, PNG or PDF (Max 5MB)</div>
                                <div class="document-status pending" id="pan-status">
                                    <i class="fas fa-clock"></i> No file selected
                                </div>
                                <div class="file-name" id="pan-filename" style="font-size: 11px; color: var(--gray-500); margin-top: 5px;"></div>
                                <input type="file" id="pan-image" class="document-input" accept="image/jpeg,image/png,application/pdf" required>
                            </div>
                        </div>
                        
                        <button type="submit" class="verification-submit-btn" id="verification-submit-btn">
                            <i class="fas fa-paper-plane"></i> Submit for Verification
                        </button>
                    </form>
                </div>
            `;
        }
        
        container.innerHTML = html;
        
        // Add file upload handlers after HTML is inserted
        if (!owner.isVerified && (!hasVerificationRequest || verification.status === 'rejected')) {
            initializeFileUploadHandlers();
        }
        
        document.getElementById('owner-verification-form')?.addEventListener('submit', submitVerification);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading verification:', error);
        container.innerHTML = '<p class="text-center">Failed to load verification status</p>';
    }
}

// Initialize file upload handlers
function initializeFileUploadHandlers() {
    // Aadhaar Front
    const aadhaarFrontInput = document.getElementById('aadhaar-front');
    if (aadhaarFrontInput) {
        aadhaarFrontInput.addEventListener('change', function(e) {
            handleFileSelect(this, 'aadhaar-front-status', 'aadhaar-front-card', 'aadhaar-front-filename');
        });
    }
    
    // Aadhaar Back
    const aadhaarBackInput = document.getElementById('aadhaar-back');
    if (aadhaarBackInput) {
        aadhaarBackInput.addEventListener('change', function(e) {
            handleFileSelect(this, 'aadhaar-back-status', 'aadhaar-back-card', 'aadhaar-back-filename');
        });
    }
    
    // PAN Card
    const panInput = document.getElementById('pan-image');
    if (panInput) {
        panInput.addEventListener('change', function(e) {
            handleFileSelect(this, 'pan-status', 'pan-card', 'pan-filename');
        });
    }
}

// Handle file selection
function handleFileSelect(inputElement, statusId, cardId, filenameId) {
    const statusSpan = document.getElementById(statusId);
    const card = document.getElementById(cardId);
    const filenameSpan = document.getElementById(filenameId);
    
    if (inputElement.files && inputElement.files[0]) {
        const file = inputElement.files[0];
        const fileSizeMB = file.size / 1024 / 1024;
        const fileType = file.type;
        
        // Validate file size (max 5MB)
        if (fileSizeMB > 5) {
            showToast('File size should be less than 5MB', 'error');
            inputElement.value = '';
            statusSpan.innerHTML = '<i class="fas fa-times-circle"></i> File too large (max 5MB)';
            statusSpan.className = 'document-status error';
            card.classList.remove('uploaded');
            if (filenameSpan) filenameSpan.textContent = '';
            return;
        }
        
        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (!allowedTypes.includes(fileType)) {
            showToast('Please upload JPEG, PNG, or PDF files only', 'error');
            inputElement.value = '';
            statusSpan.innerHTML = '<i class="fas fa-times-circle"></i> Invalid file type';
            statusSpan.className = 'document-status error';
            card.classList.remove('uploaded');
            if (filenameSpan) filenameSpan.textContent = '';
            return;
        }
        
        // Check if filename has problematic characters
        const fileName = file.name;
        const hasProblematicChars = /[<>:"|?*\\/]/.test(fileName);
        if (hasProblematicChars) {
            showToast('Filename contains invalid characters. Please rename the file before uploading.', 'warning');
        }
        
        // Display file name
        if (filenameSpan) {
            filenameSpan.textContent = fileName.length > 30 ? fileName.substring(0, 27) + '...' : fileName;
        }
        
        // Update status
        statusSpan.innerHTML = `<i class="fas fa-check-circle"></i> File selected: ${fileName.substring(0, 25)}${fileName.length > 25 ? '...' : ''}`;
        statusSpan.className = 'document-status uploaded';
        card.classList.add('uploaded');
        
        // Show preview for images
        if (fileType.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const iconDiv = card.querySelector('.document-icon');
                if (iconDiv && !iconDiv.querySelector('img')) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.style.width = '40px';
                    img.style.height = '40px';
                    img.style.objectFit = 'cover';
                    img.style.borderRadius = '8px';
                    iconDiv.innerHTML = '';
                    iconDiv.appendChild(img);
                }
            };
            reader.readAsDataURL(file);
        }
    } else {
        // Reset if no file selected
        statusSpan.innerHTML = '<i class="fas fa-clock"></i> No file selected';
        statusSpan.className = 'document-status pending';
        card.classList.remove('uploaded');
        if (filenameSpan) filenameSpan.textContent = '';
        
        // Reset icon
        const iconDiv = card.querySelector('.document-icon');
        if (iconDiv) {
            const iconClass = cardId.includes('pan') ? 'fa-file-invoice' : 'fa-id-card';
            iconDiv.innerHTML = `<i class="fas ${iconClass}"></i>`;
        }
    }
}

// Update the submitVerification function to properly handle file uploads
async function submitVerification(e) {
    e.preventDefault();
    
    const aadhaarNumber = document.getElementById('aadhaar-number').value.trim();
    const panNumber = document.getElementById('pan-number').value.trim();
    const aadhaarFront = document.getElementById('aadhaar-front').files[0];
    const aadhaarBack = document.getElementById('aadhaar-back').files[0];
    const panImage = document.getElementById('pan-image').files[0];
    
    // Validate inputs
    if (!aadhaarNumber || !panNumber) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    // Validate Aadhaar format
    if (!/^\d{12}$/.test(aadhaarNumber)) {
        showToast('Please enter a valid 12-digit Aadhaar number', 'error');
        return;
    }
    
    // Validate PAN format
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panNumber)) {
        showToast('Please enter a valid PAN number (e.g., ABCDE1234F)', 'error');
        return;
    }
    
    if (!aadhaarFront || !aadhaarBack || !panImage) {
        showToast('Please upload all required documents', 'error');
        return;
    }
    
    // Validate file sizes
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (aadhaarFront.size > maxSize || aadhaarBack.size > maxSize || panImage.size > maxSize) {
        showToast('Each file must be less than 5MB', 'error');
        return;
    }
    
    // Validate file types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(aadhaarFront.type) || 
        !allowedTypes.includes(aadhaarBack.type) || 
        !allowedTypes.includes(panImage.type)) {
        showToast('Please upload JPEG, PNG, or PDF files only', 'error');
        return;
    }
    
    showLoading('Submitting verification request...');
    
    try {
        let aadhaarFrontUrl, aadhaarBackUrl, panImageUrl;
        
        // Upload files one by one with error handling
        try {
            aadhaarFrontUrl = await uploadFile(aadhaarFront, `verification/${currentUser.uid}/aadhaar_front`);
        } catch (error) {
            throw new Error('Failed to upload Aadhaar Front: ' + error.message);
        }
        
        try {
            aadhaarBackUrl = await uploadFile(aadhaarBack, `verification/${currentUser.uid}/aadhaar_back`);
        } catch (error) {
            throw new Error('Failed to upload Aadhaar Back: ' + error.message);
        }
        
        try {
            panImageUrl = await uploadFile(panImage, `verification/${currentUser.uid}/pan`);
        } catch (error) {
            throw new Error('Failed to upload PAN Card: ' + error.message);
        }
        
        const requestId = generateId('VER');
        
        const verificationData = {
            requestId: requestId,
            ownerId: currentUser.uid,
            ownerName: currentUser.ownerName || currentUser.name,
            ownerEmail: currentUser.email,
            aadhaarNumber: aadhaarNumber,
            panNumber: panNumber,
            aadhaarFront: aadhaarFrontUrl,
            aadhaarBack: aadhaarBackUrl,
            panImage: panImageUrl,
            status: VERIFICATION_STATUS.PENDING,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.VERIFICATION_REQUESTS).add(verificationData);
        
        await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).update({
            verificationStatus: VERIFICATION_STATUS.PENDING,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('Verification request submitted successfully!', 'success');
        
        // Reload the verification page
        loadOwnerDashboard('verification');
        
    } catch (error) {
        hideLoading();
        console.error('Error submitting verification:', error);
        showToast('Error submitting verification: ' + error.message, 'error');
    }
}

function addFileUploadHandlers() {
    const fileInputs = [
        { id: 'aadhaar-front', statusId: 'aadhaar-front-status', cardId: 'aadhaar-front-card' },
        { id: 'aadhaar-back', statusId: 'aadhaar-back-status', cardId: 'aadhaar-back-card' },
        { id: 'pan-image', statusId: 'pan-status', cardId: 'pan-card' }
    ];
    
    fileInputs.forEach(input => {
        const element = document.getElementById(input.id);
        if (element) {
            element.addEventListener('change', function(e) {
                const statusSpan = document.getElementById(input.statusId);
                const card = document.getElementById(input.cardId);
                
                if (this.files && this.files[0]) {
                    const fileName = this.files[0].name;
                    statusSpan.innerHTML = `<i class="fas fa-check-circle"></i> Uploaded: ${fileName.substring(0, 30)}${fileName.length > 30 ? '...' : ''}`;
                    statusSpan.className = 'document-status uploaded';
                    card.classList.add('uploaded');
                } else {
                    statusSpan.innerHTML = '<i class="fas fa-clock"></i> Pending';
                    statusSpan.className = 'document-status pending';
                    card.classList.remove('uploaded');
                }
            });
        }
    });
}
async function submitVerification(e) {
    e.preventDefault();
    
    const aadhaarNumber = document.getElementById('aadhaar-number').value.trim();
    const panNumber = document.getElementById('pan-number').value.trim();
    const aadhaarFront = document.getElementById('aadhaar-front').files[0];
    const aadhaarBack = document.getElementById('aadhaar-back').files[0];
    const panImage = document.getElementById('pan-image').files[0];
    
    if (!aadhaarNumber || !panNumber || !aadhaarFront || !aadhaarBack || !panImage) {
        showToast('Please fill all fields and upload all documents', 'error');
        return;
    }
    
    showLoading('Submitting verification request...');
    
    try {
        const aadhaarFrontUrl = await uploadFile(aadhaarFront, `verification/${currentUser.uid}/aadhaar_front`);
        const aadhaarBackUrl = await uploadFile(aadhaarBack, `verification/${currentUser.uid}/aadhaar_back`);
        const panImageUrl = await uploadFile(panImage, `verification/${currentUser.uid}/pan`);
        
        const verificationData = {
            ownerId: currentUser.uid,
            ownerName: currentUser.ownerName,
            ownerEmail: currentUser.email,
            aadhaarNumber,
            panNumber,
            aadhaarFront: aadhaarFrontUrl,
            aadhaarBack: aadhaarBackUrl,
            panImage: panImageUrl,
            status: VERIFICATION_STATUS.PENDING,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.VERIFICATION_REQUESTS).add(verificationData);
        
        await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).update({
            verificationStatus: VERIFICATION_STATUS.PENDING
        });
        
        hideLoading();
        showToast('Verification request submitted successfully!', 'success');
        loadOwnerDashboard('verification');
        
    } catch (error) {
        hideLoading();
        console.error('Error submitting verification:', error);
        showToast('Error submitting verification: ' + error.message, 'error');
    }
}

async function loadOwnerTournaments(container) {
    showLoading('Loading tournaments...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
            .where('ownerId', '==', currentUser.uid)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <button class="auth-btn" id="create-tournament-btn" style="margin-bottom: var(--space-xl);">
                <i class="fas fa-plus"></i> Create Tournament
            </button>
            <div id="tournaments-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No tournaments created yet</p>';
        } else {
            snapshot.forEach(doc => {
                const tournament = doc.data();
                const startDate = new Date(tournament.startDate).toLocaleDateString('en-IN');
                
                const pendingRegistrations = tournament.registeredTeams?.filter(t => t.status === 'pending').length || 0;
                
                html += `
                    <div class="tournament-card" data-tournament-id="${doc.id}">
                        <div class="tournament-header">
                            <div class="tournament-icon">
                                <i class="fas fa-trophy"></i>
                            </div>
                            <div class="tournament-details">
                                <div class="tournament-name">${tournament.tournamentName}</div>
                                <div class="tournament-meta">${tournament.sportType} | ${startDate}</div>
                            </div>
                        </div>
                        <div>Entry: ${formatCurrency(tournament.entryFee)} | Prize: ${formatCurrency(tournament.prizeAmount)}</div>
                        <div>Teams: ${tournament.registeredTeams?.length || 0}/${tournament.maxTeams}</div>
                        <div>Pending Approvals: <span style="color: var(--warning); font-weight: 600;">${pendingRegistrations}</span></div>
                        <div class="ground-actions" style="margin-top: var(--space-md);">
                            <button class="manage-slots-btn" onclick="viewTournamentDetails('${doc.id}')">View</button>
                            <button class="view-details-btn" onclick="showTournamentRegistrations('${doc.id}')">Registrations (${pendingRegistrations})</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        document.getElementById('create-tournament-btn')?.addEventListener('click', showCreateTournamentModal);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading tournaments:', error);
        container.innerHTML = '<p class="text-center">Failed to load tournaments</p>';
    }
}
// ==================== ESCAPE HTML HELPER ====================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// ==================== TOURNAMENT CREATION FUNCTIONS ====================

// ==================== TOURNAMENT CREATION FUNCTIONS - WORKING VERSION ====================

let tournamentCurrentStep = 1;
const tournamentTotalSteps = 4;

function showCreateTournamentModal() {
    if (!currentUser || currentUser.role !== 'owner') {
        showToast('Only owners can create tournaments', 'error');
        return;
    }
    
    // Reset form
    const form = document.getElementById('create-tournament-form');
    if (form) form.reset();
    
    // Reset step to 1
    tournamentCurrentStep = 1;
    updateTournamentStep(tournamentCurrentStep);
    
    // Load grounds for selection
    loadGroundsForTournament();
    
    // Set min dates
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('tournament-start-date');
    const endDateInput = document.getElementById('tournament-end-date');
    
    if (startDateInput) startDateInput.min = today;
    if (endDateInput) endDateInput.min = today;
    
    // Add event listeners for preview updates
    const entryFeeInput = document.getElementById('tournament-entry-fee');
    const maxTeamsInput = document.getElementById('tournament-max-teams');
    
    if (entryFeeInput) {
        entryFeeInput.addEventListener('input', updateTournamentEarningsPreview);
    }
    if (maxTeamsInput) {
        maxTeamsInput.addEventListener('input', updateTournamentEarningsPreview);
    }
    
    // Add date validation
    if (startDateInput) {
        startDateInput.addEventListener('change', function() {
            if (endDateInput && endDateInput.value && this.value > endDateInput.value) {
                showToast('Start date cannot be after end date', 'error');
                this.value = '';
            }
            if (endDateInput) endDateInput.min = this.value;
        });
    }
    
    if (endDateInput) {
        endDateInput.addEventListener('change', function() {
            if (startDateInput && startDateInput.value && this.value < startDateInput.value) {
                showToast('End date cannot be before start date', 'error');
                this.value = '';
            }
        });
    }
    
    // Show modal
    const modal = document.getElementById('create-tournament-modal');
    if (modal) modal.classList.add('active');
    
    // Initialize step navigation
    initializeTournamentStepNavigation();
    
    // Force update earnings preview
    updateTournamentEarningsPreview();
}

function initializeTournamentStepNavigation() {
    const prevBtn = document.getElementById('tournament-prev-btn');
    const nextBtn = document.getElementById('tournament-next-btn');
    const submitBtn = document.getElementById('tournament-submit-btn');
    
    if (!prevBtn || !nextBtn || !submitBtn) {
        console.error('Tournament navigation buttons not found');
        return;
    }
    
    // Remove existing listeners by cloning
    const newPrevBtn = prevBtn.cloneNode(true);
    const newNextBtn = nextBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    
    newPrevBtn.addEventListener('click', () => {
        if (tournamentCurrentStep > 1) {
            tournamentCurrentStep--;
            updateTournamentStep(tournamentCurrentStep);
        }
    });
    
    newNextBtn.addEventListener('click', () => {
        if (validateTournamentStep(tournamentCurrentStep)) {
            if (tournamentCurrentStep < tournamentTotalSteps) {
                tournamentCurrentStep++;
                updateTournamentStep(tournamentCurrentStep);
            }
        }
    });
    
    // Add click handlers for progress steps
    const progressSteps = document.querySelectorAll('#tournament-progress-steps .progress-step');
    progressSteps.forEach(step => {
        const newStep = step.cloneNode(true);
        step.parentNode.replaceChild(newStep, step);
        
        newStep.addEventListener('click', () => {
            const stepNum = parseInt(newStep.dataset.step);
            if (stepNum < tournamentCurrentStep) {
                tournamentCurrentStep = stepNum;
                updateTournamentStep(tournamentCurrentStep);
            }
        });
    });
}

function updateTournamentStep(step) {
    // Hide all form steps
    const formSteps = document.querySelectorAll('#create-tournament-form .form-step');
    formSteps.forEach(s => {
        s.classList.remove('active');
    });
    
    // Show current step
    const currentStepEl = document.querySelector(`#create-tournament-form .form-step[data-step="${step}"]`);
    if (currentStepEl) currentStepEl.classList.add('active');
    
    // Update progress steps
    const progressSteps = document.querySelectorAll('#tournament-progress-steps .progress-step');
    progressSteps.forEach((s, index) => {
        const stepNum = index + 1;
        s.classList.remove('active', 'completed');
        
        if (stepNum === step) {
            s.classList.add('active');
        } else if (stepNum < step) {
            s.classList.add('completed');
        }
    });
    
    // Update navigation buttons
    const prevBtn = document.getElementById('tournament-prev-btn');
    const nextBtn = document.getElementById('tournament-next-btn');
    const submitBtn = document.getElementById('tournament-submit-btn');
    
    if (prevBtn) prevBtn.disabled = (step === 1);
    
    if (step === tournamentTotalSteps) {
        if (nextBtn) nextBtn.style.display = 'none';
        if (submitBtn) submitBtn.style.display = 'flex';
    } else {
        if (nextBtn) nextBtn.style.display = 'flex';
        if (submitBtn) submitBtn.style.display = 'none';
    }
    
    // Scroll to top of modal
    const modalContent = document.querySelector('#create-tournament-modal .modal-content');
    if (modalContent) modalContent.scrollTop = 0;
}

function validateTournamentStep(step) {
    if (step === 1) {
        const tournamentName = document.getElementById('tournament-name')?.value.trim();
        const sportType = document.getElementById('tournament-sport')?.value;
        const groundId = document.getElementById('tournament-ground')?.value;
        const format = document.getElementById('tournament-format')?.value;
        
        if (!tournamentName) {
            showToast('Please enter tournament name', 'error');
            document.getElementById('tournament-name')?.focus();
            return false;
        }
        if (tournamentName.length < 3) {
            showToast('Tournament name must be at least 3 characters', 'error');
            return false;
        }
        if (!sportType) {
            showToast('Please select sport type', 'error');
            return false;
        }
        if (!groundId) {
            showToast('Please select a ground', 'error');
            return false;
        }
        if (!format) {
            showToast('Please select tournament format', 'error');
            return false;
        }
        return true;
    }
    
    if (step === 2) {
        const startDate = document.getElementById('tournament-start-date')?.value;
        const endDate = document.getElementById('tournament-end-date')?.value;
        const startTime = document.getElementById('tournament-start-time')?.value;
        const endTime = document.getElementById('tournament-end-time')?.value;
        const teamSize = parseInt(document.getElementById('tournament-team-size')?.value);
        const maxTeams = parseInt(document.getElementById('tournament-max-teams')?.value);
        
        if (!startDate) {
            showToast('Please select start date', 'error');
            return false;
        }
        if (!endDate) {
            showToast('Please select end date', 'error');
            return false;
        }
        if (startDate > endDate) {
            showToast('Start date cannot be after end date', 'error');
            return false;
        }
        if (!startTime) {
            showToast('Please select start time', 'error');
            return false;
        }
        if (!endTime) {
            showToast('Please select end time', 'error');
            return false;
        }
        if (!teamSize || teamSize < 1) {
            showToast('Please enter valid team size (minimum 1)', 'error');
            return false;
        }
        if (!maxTeams || maxTeams < 2) {
            showToast('Please enter valid max teams (minimum 2)', 'error');
            return false;
        }
        if (maxTeams > 64) {
            showToast('Maximum teams cannot exceed 64', 'error');
            return false;
        }
        return true;
    }
    
    if (step === 3) {
        const entryFee = parseFloat(document.getElementById('tournament-entry-fee')?.value);
        const prizeAmount = parseFloat(document.getElementById('tournament-prize')?.value);
        const rules = document.getElementById('tournament-rules')?.value.trim();
        
        if (isNaN(entryFee)) {
            showToast('Please enter valid entry fee', 'error');
            return false;
        }
        if (entryFee < 0) {
            showToast('Entry fee cannot be negative', 'error');
            return false;
        }
        if (entryFee > 50000) {
            showToast('Entry fee cannot exceed ₹50,000', 'error');
            return false;
        }
        if (isNaN(prizeAmount)) {
            showToast('Please enter valid prize amount', 'error');
            return false;
        }
        if (prizeAmount < 0) {
            showToast('Prize amount cannot be negative', 'error');
            return false;
        }
        if (prizeAmount > 500000) {
            showToast('Prize amount cannot exceed ₹5,00,000', 'error');
            return false;
        }
        if (!rules) {
            showToast('Please enter tournament rules', 'error');
            document.getElementById('tournament-rules')?.focus();
            return false;
        }
        if (rules.length < 20) {
            showToast('Please provide detailed rules (at least 20 characters)', 'error');
            return false;
        }
        return true;
    }
    
    if (step === 4) {
        const contactInfo = document.getElementById('tournament-contact')?.value.trim();
        
        if (!contactInfo) {
            showToast('Please enter contact number', 'error');
            document.getElementById('tournament-contact')?.focus();
            return false;
        }
        if (contactInfo.length < 10) {
            showToast('Please enter a valid contact number (at least 10 digits)', 'error');
            return false;
        }
        return true;
    }
    
    return true;
}

function updateTournamentEarningsPreview() {
    const entryFee = parseFloat(document.getElementById('tournament-entry-fee')?.value) || 0;
    const maxTeams = parseInt(document.getElementById('tournament-max-teams')?.value) || 0;
    
    const maxRevenue = entryFee * maxTeams;
    const platformFee = maxRevenue * 0.20;
    const ownerEarnings = maxRevenue - platformFee;
    
    const previewEntryFee = document.getElementById('preview-entry-fee');
    const previewMaxTeams = document.getElementById('preview-max-teams');
    const previewRevenue = document.getElementById('preview-revenue');
    const previewPlatformFee = document.getElementById('preview-platform-fee');
    const previewEarnings = document.getElementById('preview-earnings');
    
    if (previewEntryFee) previewEntryFee.textContent = formatCurrency(entryFee);
    if (previewMaxTeams) previewMaxTeams.textContent = maxTeams;
    if (previewRevenue) previewRevenue.textContent = formatCurrency(maxRevenue);
    if (previewPlatformFee) previewPlatformFee.textContent = formatCurrency(platformFee);
    if (previewEarnings) previewEarnings.textContent = formatCurrency(ownerEarnings);
}

async function loadGroundsForTournament() {
    try {
        const snapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', currentUser.uid)
            .where('status', '==', 'active')
            .get();
        
        const select = document.getElementById('tournament-ground');
        if (!select) return;
        
        let options = '<option value="" disabled selected>Select a ground</option>';
        
        for (const doc of snapshot.docs) {
            const ground = doc.data();
            options += `<option value="${doc.id}">${escapeHtml(ground.groundName)} (${ground.sportType}) - ${formatCurrency(ground.pricePerHour)}/hr</option>`;
        }
        
        if (snapshot.empty) {
            options = '<option value="" disabled>No grounds available. Please add a ground first.</option>';
        }
        
        select.innerHTML = options;
        
    } catch (error) {
        console.error('Error loading grounds:', error);
        const select = document.getElementById('tournament-ground');
        if (select) {
            select.innerHTML = '<option value="" disabled>Error loading grounds</option>';
        }
    }
}

async function handleCreateTournament(e) {
    e.preventDefault();
    
    console.log('Create tournament form submitted');
    
    // Get all form values - ensure we get them correctly
    const tournamentName = document.getElementById('tournament-name')?.value.trim();
    const sportType = document.getElementById('tournament-sport')?.value;
    const groundId = document.getElementById('tournament-ground')?.value;
    const tournamentAddress = document.getElementById('tournament-address')?.value.trim();
    const format = document.getElementById('tournament-format')?.value;
    const startDate = document.getElementById('tournament-start-date')?.value;
    const endDate = document.getElementById('tournament-end-date')?.value;
    const startTime = document.getElementById('tournament-start-time')?.value;
    const endTime = document.getElementById('tournament-end-time')?.value;
    const teamSize = parseInt(document.getElementById('tournament-team-size')?.value);
    const maxTeams = parseInt(document.getElementById('tournament-max-teams')?.value);
    const entryFee = parseFloat(document.getElementById('tournament-entry-fee')?.value);
    const prizeAmount = parseFloat(document.getElementById('tournament-prize')?.value);
    const rules = document.getElementById('tournament-rules')?.value.trim();
    const contactInfo = document.getElementById('tournament-contact')?.value.trim();
    const contactEmail = document.getElementById('tournament-contact-email')?.value.trim();
    
    // Remove required attribute from hidden fields to prevent the error
    const hiddenFields = document.querySelectorAll('#create-tournament-form .form-step:not(.active) input, #create-tournament-form .form-step:not(.active) select, #create-tournament-form .form-step:not(.active) textarea');
    hiddenFields.forEach(field => {
        field.removeAttribute('required');
    });
    
    // Add required attribute back to visible fields
    const visibleFields = document.querySelectorAll('#create-tournament-form .form-step.active input, #create-tournament-form .form-step.active select, #create-tournament-form .form-step.active textarea');
    visibleFields.forEach(field => {
        if (field.hasAttribute('data-original-required') || field.getAttribute('data-required') === 'true') {
            field.setAttribute('required', 'required');
        }
    });
    
    // Validate all required fields (check if they have values)
    if (!tournamentName || !sportType || !groundId || !tournamentAddress || !format || !startDate || !endDate || 
        !startTime || !endTime || !teamSize || !maxTeams || !rules || !contactInfo) {
        showToast('Please fill all required fields', 'error');
        console.log('Missing fields:', { 
            tournamentName, sportType, groundId, tournamentAddress, format, 
            startDate, endDate, startTime, endTime, teamSize, maxTeams, rules, contactInfo 
        });
        return;
    }
    
    showLoading('Creating tournament...');
    
    try {
        // Get ground details
        const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(groundId).get();
        if (!groundDoc.exists) {
            throw new Error('Ground not found');
        }
        
        const ground = groundDoc.data();
        
        // Get venue details
        const venueSnapshot = await db.collection(COLLECTIONS.VENUES)
            .where('ownerId', '==', currentUser.uid)
            .limit(1)
            .get();
        
        let venueName = '';
        let venueAddress = '';
        let city = '';
        
        if (!venueSnapshot.empty) {
            const venue = venueSnapshot.docs[0].data();
            venueName = venue.venueName;
            venueAddress = venue.address;
            city = venue.city;
        }
        
        const tournamentId = generateId('TRN');
        
        const tournamentData = {
            tournamentId: tournamentId,
            tournamentName: tournamentName,
            sportType: sportType,
            groundId: groundId,
            groundName: ground.groundName,
            tournamentAddress: tournamentAddress,
            ownerId: currentUser.uid,
            ownerName: currentUser.ownerName || currentUser.name,
            venueName: venueName,
            venueAddress: venueAddress,
            city: city,
            entryFee: entryFee,
            maxTeams: maxTeams,
            prizeAmount: prizeAmount,
            prizeDistribution: null,
            startDate: startDate,
            endDate: endDate,
            startTime: startTime,
            endTime: endTime,
            format: format,
            teamSize: teamSize,
            rules: rules,
            contactInfo: contactInfo,
            contactEmail: contactEmail || '',
            registeredTeams: [],
            status: TOURNAMENT_STATUS.UPCOMING,
            createdBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.TOURNAMENTS).add(tournamentData);
        
        hideLoading();
        showToast('Tournament created successfully!', 'success');
        closeModal('create-tournament-modal');
        
        // Reset step for next time
        tournamentCurrentStep = 1;
        
        // Refresh the tournaments list
        if (document.getElementById('owner-dashboard-page').classList.contains('active')) {
            loadOwnerDashboard('tournaments');
        } else if (document.getElementById('tournaments-page').classList.contains('active')) {
            loadAllTournaments('upcoming');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error creating tournament:', error);
        showToast('Error creating tournament: ' + error.message, 'error');
    }
}

// Add this function to prevent the invalid form control error
function disableHiddenRequiredFields() {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            // Disable required attribute on hidden fields
            const hiddenRequired = this.querySelectorAll('.form-step:not(.active) [required]');
            hiddenRequired.forEach(field => {
                field.removeAttribute('required');
                field.setAttribute('data-was-required', 'true');
            });
        });
    });
}

// Call this on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    disableHiddenRequiredFields();
});
// ==================== SLOT MANAGEMENT ====================

async function manageSlots(groundId, groundName) {
    showLoading('Loading slots...');
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.collection(COLLECTIONS.SLOTS)
            .where('groundId', '==', groundId)
            .where('date', '==', today)
            .get();
        
        const defaultSlots = [
            '06:00-07:00', '07:00-08:00', '08:00-09:00',
            '16:00-17:00', '17:00-18:00', '18:00-19:00',
            '19:00-20:00', '20:00-21:00', '21:00-22:00'
        ];
        
        let slotStatus = {};
        snapshot.forEach(doc => {
            const slot = doc.data();
            slotStatus[slot.startTime + '-' + slot.endTime] = {
                status: slot.status,
                id: doc.id
            };
        });
        
        const content = document.getElementById('slot-management-content');
        content.innerHTML = `
            <h4>${groundName} - ${today}</h4>
            <div class="slot-controls">
                <button class="slot-action-btn available" id="close-all-slots">Close All</button>
                <button class="slot-action-btn closed" id="open-all-slots">Open All</button>
                <button class="slot-action-btn reset" id="reset-all-slots">Reset</button>
            </div>
            <div class="slots-grid">
                ${defaultSlots.map(slot => {
                    const status = slotStatus[slot]?.status || SLOT_STATUS.AVAILABLE;
                    const slotId = slotStatus[slot]?.id || '';
                    return `
                        <div class="slot-control-item">
                            <div>${slot}</div>
                            <select data-slot-id="${slotId}" data-ground-id="${groundId}" data-date="${today}" data-start="${slot.split('-')[0]}" data-end="${slot.split('-')[1]}">
                                <option value="available" ${status === 'available' ? 'selected' : ''}>Available</option>
                                <option value="closed" ${status === 'closed' ? 'selected' : ''}>Closed</option>
                            </select>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        
        document.querySelectorAll('#slot-management-content select').forEach(select => {
            select.addEventListener('change', function() {
                updateSlotStatus(
                    this.dataset.slotId,
                    this.dataset.groundId,
                    this.dataset.date,
                    this.dataset.start,
                    this.dataset.end,
                    this.value
                );
            });
        });
        
        document.getElementById('close-all-slots')?.addEventListener('click', () => closeAllSlots(groundId, today));
        document.getElementById('open-all-slots')?.addEventListener('click', () => openAllSlots(groundId, today));
        document.getElementById('reset-all-slots')?.addEventListener('click', () => resetAllSlots(groundId, today));
        
        hideLoading();
        document.getElementById('slot-management-modal').classList.add('active');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function updateSlotStatus(slotId, groundId, date, startTime, endTime, status) {
    showLoading('Updating slot...');
    
    try {
        if (slotId) {
            await db.collection(COLLECTIONS.SLOTS).doc(slotId).update({
                status,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            await db.collection(COLLECTIONS.SLOTS).add({
                groundId,
                date,
                startTime,
                endTime,
                status,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        hideLoading();
        showToast('Slot updated successfully');
        manageSlots(groundId, '');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function closeAllSlots(groundId, date) {
    if (!confirm('Are you sure you want to close all slots for this day?')) return;
    
    showLoading('Closing slots...');
    
    try {
        const slots = [
            '06:00-07:00', '07:00-08:00', '08:00-09:00',
            '16:00-17:00', '17:00-18:00', '18:00-19:00',
            '19:00-20:00', '20:00-21:00', '21:00-22:00'
        ];
        
        const batch = db.batch();
        
        for (const slot of slots) {
            const [start, end] = slot.split('-');
            const snapshot = await db.collection(COLLECTIONS.SLOTS)
                .where('groundId', '==', groundId)
                .where('date', '==', date)
                .where('startTime', '==', start)
                .where('endTime', '==', end)
                .get();
            
            if (snapshot.empty) {
                const newSlotRef = db.collection(COLLECTIONS.SLOTS).doc();
                batch.set(newSlotRef, {
                    groundId,
                    date,
                    startTime: start,
                    endTime: end,
                    status: SLOT_STATUS.CLOSED,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                batch.update(snapshot.docs[0].ref, {
                    status: SLOT_STATUS.CLOSED,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        await batch.commit();
        
        hideLoading();
        showToast('All slots closed');
        manageSlots(groundId, '');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function openAllSlots(groundId, date) {
    if (!confirm('Open all slots for this day?')) return;
    
    showLoading('Opening slots...');
    
    try {
        const slots = [
            '06:00-07:00', '07:00-08:00', '08:00-09:00',
            '16:00-17:00', '17:00-18:00', '18:00-19:00',
            '19:00-20:00', '20:00-21:00', '21:00-22:00'
        ];
        
        const batch = db.batch();
        
        for (const slot of slots) {
            const [start, end] = slot.split('-');
            const snapshot = await db.collection(COLLECTIONS.SLOTS)
                .where('groundId', '==', groundId)
                .where('date', '==', date)
                .where('startTime', '==', start)
                .where('endTime', '==', end)
                .get();
            
            if (snapshot.empty) {
                const newSlotRef = db.collection(COLLECTIONS.SLOTS).doc();
                batch.set(newSlotRef, {
                    groundId,
                    date,
                    startTime: start,
                    endTime: end,
                    status: SLOT_STATUS.AVAILABLE,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                batch.update(snapshot.docs[0].ref, {
                    status: SLOT_STATUS.AVAILABLE,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        await batch.commit();
        
        hideLoading();
        showToast('All slots opened');
        manageSlots(groundId, '');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function resetAllSlots(groundId, date) {
    if (!confirm('Reset all slots to available for this day?')) return;
    
    showLoading('Resetting slots...');
    
    try {
        const slots = [
            '06:00-07:00', '07:00-08:00', '08:00-09:00',
            '16:00-17:00', '17:00-18:00', '18:00-19:00',
            '19:00-20:00', '20:00-21:00', '21:00-22:00'
        ];
        
        const batch = db.batch();
        
        for (const slot of slots) {
            const [start, end] = slot.split('-');
            const snapshot = await db.collection(COLLECTIONS.SLOTS)
                .where('groundId', '==', groundId)
                .where('date', '==', date)
                .where('startTime', '==', start)
                .where('endTime', '==', end)
                .get();
            
            if (snapshot.empty) {
                const newSlotRef = db.collection(COLLECTIONS.SLOTS).doc();
                batch.set(newSlotRef, {
                    groundId,
                    date,
                    startTime: start,
                    endTime: end,
                    status: SLOT_STATUS.AVAILABLE,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            } else {
                batch.update(snapshot.docs[0].ref, {
                    status: SLOT_STATUS.AVAILABLE,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        await batch.commit();
        
        hideLoading();
        showToast('All slots reset to available');
        manageSlots(groundId, '');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function closeFullDay(groundId) {
    const date = prompt('Enter date (YYYY-MM-DD) to close all slots:');
    if (!date) return;
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
        showToast('Please enter date in YYYY-MM-DD format', 'error');
        return;
    }
    
    await closeAllSlots(groundId, date);
}

// ==================== REPORT ISSUE ====================

document.getElementById('report-venue-issue')?.addEventListener('click', () => {
    if (!currentUser) {
        showToast('Please login to report an issue', 'warning');
        return;
    }
    document.getElementById('report-issue-modal').classList.add('active');
});

document.getElementById('report-issue-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const issueType = document.getElementById('issue-type').value;
    const description = document.getElementById('issue-description').value.trim();
    const issueImages = document.getElementById('issue-images').files;
    
    if (!issueType || !description) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    
    showLoading('Submitting report...');
    
    try {
        const imageUrls = [];
        for (let i = 0; i < issueImages.length; i++) {
            const file = issueImages[i];
            const url = await uploadFile(file, `issues/${currentUser.uid}`);
            imageUrls.push(url);
        }
        
        const issueData = {
            userId: currentUser.uid,
            userName: currentUser.name || currentUser.ownerName,
            userEmail: currentUser.email,
            issueType,
            description,
            images: imageUrls,
            status: 'pending',
            venueId: currentVenue?.id || null,
            groundId: currentGround?.id || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.ISSUES).add(issueData);
        
        hideLoading();
        showToast('Issue reported successfully! We\'ll look into it.', 'success');
        closeModal('report-issue-modal');
        
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
});

// ==================== SHARE VENUE ====================

document.getElementById('share-whatsapp')?.addEventListener('click', () => {
    const url = window.location.href;
    const text = `Check out BookMyGame - ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
});

document.getElementById('share-facebook')?.addEventListener('click', () => {
    const url = window.location.href;
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
});

document.getElementById('share-twitter')?.addEventListener('click', () => {
    const url = window.location.href;
    const text = 'Check out BookMyGame!';
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
});

document.getElementById('copy-link')?.addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard!', 'success');
});

// ==================== EVENT LISTENERS INITIALIZATION ====================
addCEOTabEventListeners();
// Add this inside initializeEventListeners function
// Check for match payment callback
handleMatchPaymentCallback();
// Add these to your initializeEventListeners function
// Add these to your initializeEventListeners function
document.getElementById('select-venue-owner')?.addEventListener('click', () => {
    showPage('venue-owner-register-page');
});

document.getElementById('select-plot-owner')?.addEventListener('click', () => {
    showPage('plot-owner-register-page');
});
// Policy page navigation
document.getElementById('terms-menu-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('terms-page');
});

document.getElementById('privacy-menu-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('privacy-page');
});

document.getElementById('cancellation-menu-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('cancellation-page');
});

document.getElementById('refund-menu-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('refund-page');
});

document.getElementById('owner-agreement-menu-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    showPage('owner-agreement-page');
});

// Policy page back buttons
document.getElementById('terms-back-btn')?.addEventListener('click', goBack);
document.getElementById('privacy-back-btn')?.addEventListener('click', goBack);
document.getElementById('cancellation-back-btn')?.addEventListener('click', goBack);
document.getElementById('refund-back-btn')?.addEventListener('click', goBack);
document.getElementById('owner-agreement-back-btn')?.addEventListener('click', goBack);
// Add to your initializeEventListeners function
document.getElementById('close-tournament-reg-modal')?.addEventListener('click', () => {
    closeModal('tournament-registration-modal');
});
function initializeEventListeners() {
    // Auth navigation
    document.getElementById('show-register-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('register-page');
    });
    
    document.getElementById('show-owner-register-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showOwnerTypeSelection();
    });
    // Add this with other event listeners
document.getElementById('view-all-matches')?.addEventListener('click', (e) => {
    e.preventDefault();
    loadAllMatchesPage();
});
// Add this to your initializeEventListeners function
document.getElementById('create-tournament-form')?.addEventListener('submit', handleCreateTournament);
    document.getElementById('show-plot-owner-register-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('plot-owner-register-page');
    });
    // Add this to your initializeEventListeners function or add it separately
function initializeTournamentFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    if (filterBtns.length) {
        filterBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                filterBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                const filter = this.dataset.filter;
                loadAllTournaments(filter);
            });
        });
    }
}

// Call this function when the tournaments page is loaded
function showTournaments() {
    initializeTournamentFilters();
    loadAllTournaments('upcoming');
    showPage('tournaments-page');
}
    // Back buttons
    document.getElementById('register-back-btn')?.addEventListener('click', goBack);
    document.getElementById('owner-type-back-btn')?.addEventListener('click', goBack);
    document.getElementById('venue-owner-register-back-btn')?.addEventListener('click', goBack);
    document.getElementById('plot-owner-register-back-btn')?.addEventListener('click', goBack);
    document.getElementById('venue-back-btn')?.addEventListener('click', goBack);
    document.getElementById('ground-back-btn')?.addEventListener('click', goBack);
    document.getElementById('booking-back-btn')?.addEventListener('click', goBack);
    document.getElementById('confirmation-home-btn')?.addEventListener('click', goBack);
    document.getElementById('entry-pass-back-btn')?.addEventListener('click', goBack);
    document.getElementById('tournaments-back-btn')?.addEventListener('click', goBack);
    document.getElementById('tournament-details-back-btn')?.addEventListener('click', goBack);
    document.getElementById('tournament-reg-back-btn')?.addEventListener('click', goBack);
    document.getElementById('tournament-payment-back-btn')?.addEventListener('click', goBack);
    document.getElementById('bookings-back-btn')?.addEventListener('click', goBack);
    document.getElementById('profile-back-btn')?.addEventListener('click', goBack);
    document.getElementById('owner-dashboard-back-btn')?.addEventListener('click', goBack);
    document.getElementById('admin-dashboard-back-btn')?.addEventListener('click', goBack);
    document.getElementById('ceo-dashboard-back-btn')?.addEventListener('click', goBack);
    
    // Navigation
    document.getElementById('nav-home')?.addEventListener('click', (e) => {
        e.preventDefault();
        showHome();
    });
    
    document.getElementById('nav-bookings')?.addEventListener('click', (e) => {
        e.preventDefault();
        showBookings();
    });
    
    document.getElementById('nav-tournaments')?.addEventListener('click', (e) => {
        e.preventDefault();
        showTournaments();
    });
    
    document.getElementById('nav-profile')?.addEventListener('click', (e) => {
        e.preventDefault();
        showProfile();
    });
    
    document.getElementById('profile-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        showProfile();
    });
    
    document.getElementById('refresh-location')?.addEventListener('click', getUserLocation);
    document.getElementById('view-all-venues')?.addEventListener('click', (e) => {
        e.preventDefault();
        loadAllVenuesPage();
    });
    
    document.getElementById('view-all-tournaments')?.addEventListener('click', (e) => {
        e.preventDefault();
        showTournaments();
    });
    
    document.getElementById('share-venue-btn')?.addEventListener('click', shareVenue);
    document.getElementById('write-review-btn')?.addEventListener('click', showWriteReview);
    document.getElementById('view-entry-pass-btn')?.addEventListener('click', showEntryPassFromConfirmation);
    document.getElementById('back-to-home-btn')?.addEventListener('click', goHome);
    
    // Profile links
    document.getElementById('profile-bookings-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showBookings();
    });
    
    document.getElementById('owner-dashboard-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showOwnerDashboard();
    });
    
    document.getElementById('admin-dashboard-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showAdminDashboard();
    });
    
    document.getElementById('ceo-dashboard-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showCEODashboard();
    });
    
    document.getElementById('referral-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('Share your referral code to earn rewards!', 'info');
    });
    
    document.getElementById('logout-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
    
    document.getElementById('edit-profile-btn')?.addEventListener('click', editProfile);
    document.getElementById('change-photo-btn')?.addEventListener('click', changeProfilePhoto);
    
    // Owner dashboard tabs
    document.getElementById('owner-overview-tab')?.addEventListener('click', () => loadOwnerDashboard('overview'));
    document.getElementById('owner-grounds-tab')?.addEventListener('click', () => loadOwnerDashboard('grounds'));
    document.getElementById('owner-bookings-tab')?.addEventListener('click', () => loadOwnerDashboard('bookings'));
    document.getElementById('owner-earnings-tab')?.addEventListener('click', () => loadOwnerDashboard('earnings'));
    document.getElementById('owner-tournaments-tab')?.addEventListener('click', () => loadOwnerDashboard('tournaments'));
    document.getElementById('owner-payouts-tab')?.addEventListener('click', () => loadOwnerDashboard('payouts'));
    document.getElementById('owner-verification-tab')?.addEventListener('click', () => loadOwnerDashboard('verification'));
    
    document.getElementById('owner-profile-btn')?.addEventListener('click', showProfile);
    
    // Modal close buttons
    document.getElementById('close-add-ground-modal')?.addEventListener('click', () => closeModal('add-ground-modal'));
    document.getElementById('close-create-tournament-modal')?.addEventListener('click', () => closeModal('create-tournament-modal'));
    document.getElementById('close-slot-management-modal')?.addEventListener('click', () => closeModal('slot-management-modal'));
    document.getElementById('close-create-admin-modal')?.addEventListener('click', () => closeModal('create-admin-modal'));
    document.getElementById('close-edit-profile-modal')?.addEventListener('click', () => closeModal('edit-profile-modal'));
    document.getElementById('close-write-review-modal')?.addEventListener('click', () => closeModal('write-review-modal'));
    document.getElementById('close-tournament-reg-modal')?.addEventListener('click', () => closeModal('tournament-registration-modal'));
    document.getElementById('close-reg-payment-modal')?.addEventListener('click', () => closeModal('registration-payment-modal'));
    document.getElementById('close-payout-request-modal')?.addEventListener('click', () => closeModal('payout-request-modal'));
    document.getElementById('close-report-modal')?.addEventListener('click', () => closeModal('report-issue-modal'));
    document.getElementById('close-verification-modal')?.addEventListener('click', () => closeModal('owner-verification-modal'));
    document.getElementById('close-qr-scanner')?.addEventListener('click', toggleOwnerQRScanner);
    
    // Form submissions
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('register-form')?.addEventListener('submit', handleRegister);
    document.getElementById('venue-owner-register-form')?.addEventListener('submit', handleVenueOwnerRegister);
    document.getElementById('plot-owner-register-form')?.addEventListener('submit', handlePlotOwnerRegister);
    document.getElementById('add-ground-form')?.addEventListener('submit', handleAddGround);
   
    document.getElementById('edit-profile-form')?.addEventListener('submit', handleEditProfile);
    
    // Search
    document.getElementById('global-search')?.addEventListener('input', (e) => {
        searchVenues(e.target.value);
    });
    
    // UPI Payment buttons
    document.querySelectorAll('.upi-app').forEach(app => {
        app.addEventListener('click', function(e) {
            e.preventDefault();
            const upiId = this.dataset.upi;
            
            if (document.getElementById('booking-page').classList.contains('active')) {
                handleUPIPayment(upiId);
            } else if (document.getElementById('registration-payment-modal').classList.contains('active')) {
                processRegistrationPayment(upiId);
            }
        });
    });
    
    // Registration payment buttons
    document.getElementById('reg-phonepe')?.addEventListener('click', () => processRegistrationPayment('phonepe@ybl'));
    document.getElementById('reg-gpay')?.addEventListener('click', () => processRegistrationPayment('okhdfcbank'));
    document.getElementById('reg-paytm')?.addEventListener('click', () => processRegistrationPayment('paytm@paytm'));
    document.getElementById('reg-amazon')?.addEventListener('click', () => processRegistrationPayment('okaxis'));
    
    // Owner QR Scanner
    document.getElementById('header-qr-scanner')?.addEventListener('click', toggleOwnerQRScanner);
    
    // Password toggle
    document.querySelectorAll('.toggle-password').forEach(icon => {
        icon.addEventListener('click', function() {
            const input = this.previousElementSibling.previousElementSibling || this.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                this.classList.remove('fa-eye');
                this.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                this.classList.remove('fa-eye-slash');
                this.classList.add('fa-eye');
            }
        });
    });
    
    // Google sign in
    document.getElementById('google-signin-btn')?.addEventListener('click', handleGoogleSignIn);
    
    // Forgot password
    document.getElementById('forgot-password-link')?.addEventListener('click', handleForgotPassword);
    
    // Star rating
    for (let i = 1; i <= 5; i++) {
        document.getElementById(`star-${i}`)?.addEventListener('click', () => setRating(i));
    }
    
    document.getElementById('submit-review-btn')?.addEventListener('click', submitReview);
    
    // Bookings tabs
    document.getElementById('bookings-upcoming')?.addEventListener('click', () => loadUserBookings('upcoming'));
    document.getElementById('bookings-past')?.addEventListener('click', () => loadUserBookings('past'));
    document.getElementById('bookings-cancelled')?.addEventListener('click', () => loadUserBookings('cancelled'));
}

// ==================== ALL VENUES PAGE ====================

async function loadAllVenuesPage() {
    showLoading('Loading all venues...');
    
    try {
        let allVenuesPage = document.getElementById('all-venues-page');
        
        if (!allVenuesPage) {
            allVenuesPage = document.createElement('div');
            allVenuesPage.id = 'all-venues-page';
            allVenuesPage.className = 'page';
            allVenuesPage.innerHTML = `
                <header class="details-header">
                    <button class="back-btn" id="all-venues-back-btn">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <h2>All Venues</h2>
                    <div style="width:40px;"></div>
                </header>
                
                <div class="search-container" style="padding: var(--space-lg);">
                    <div class="search-bar" style="background: var(--gray-100);">
                        <i class="fas fa-search" style="color: var(--gray-500);"></i>
                        <input type="text" placeholder="Search venues..." id="all-venues-search" style="color: var(--gray-900);">
                    </div>
                </div>
                
                <div class="all-venues-filters" style="padding: 0 var(--space-lg) var(--space-lg); display: flex; gap: var(--space-sm); overflow-x: auto;">
                    <button class="filter-chip active" data-filter="all">All</button>
                    <button class="filter-chip" data-filter="cricket">Cricket</button>
                    <button class="filter-chip" data-filter="football">Football</button>
                    <button class="filter-chip" data-filter="badminton">Badminton</button>
                    <button class="filter-chip" data-filter="tennis">Tennis</button>
                    <button class="filter-chip" data-filter="basketball">Basketball</button>
                </div>
                
                <div class="all-venues-list" id="all-venues-list" style="padding: var(--space-lg);">
                    <div class="loading-spinner">
                        <div class="loader-spinner"></div>
                    </div>
                </div>
            `;
            document.querySelector('.app-container').appendChild(allVenuesPage);
            
            document.getElementById('all-venues-back-btn').addEventListener('click', goBack);
            document.getElementById('all-venues-search').addEventListener('input', debounce(function(e) {
                filterAllVenues(e.target.value);
            }, 500));
            
            document.querySelectorAll('.filter-chip').forEach(chip => {
                chip.addEventListener('click', function() {
                    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                    this.classList.add('active');
                    filterVenuesBySport(this.dataset.filter);
                });
            });
        }
        
        await displayAllVenues();
        hideLoading();
        showPage('all-venues-page');
        
    } catch (error) {
        hideLoading();
        console.error('Error loading all venues:', error);
        showToast('Failed to load venues', 'error');
    }
}

let allVenuesData = [];
let currentFilter = 'all';
let currentSearchTerm = '';

async function displayAllVenues(filterSport = 'all', searchTerm = '') {
    const container = document.getElementById('all-venues-list');
    
    try {
        let query = db.collection(COLLECTIONS.VENUES).where('hidden', '==', false);
        const snapshot = await query.get();
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-center" style="padding: var(--space-2xl); color: var(--gray-500);">No venues found</p>';
            return;
        }
        
        allVenuesData = [];
        snapshot.forEach(doc => {
            allVenuesData.push({ id: doc.id, ...doc.data() });
        });
        
        let filteredVenues = [...allVenuesData];
        
        if (filterSport !== 'all') {
            filteredVenues = filteredVenues.filter(venue => 
                venue.sportType && venue.sportType.toLowerCase() === filterSport.toLowerCase()
            );
        }
        
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            filteredVenues = filteredVenues.filter(venue => 
                (venue.venueName && venue.venueName.toLowerCase().includes(searchLower)) ||
                (venue.address && venue.address.toLowerCase().includes(searchLower)) ||
                (venue.city && venue.city.toLowerCase().includes(searchLower)) ||
                (venue.sportType && venue.sportType.toLowerCase().includes(searchLower))
            );
        }
        
        if (userLocation) {
            filteredVenues = filteredVenues.map(venue => {
                if (venue.location) {
                    const dist = calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        venue.location.latitude,
                        venue.location.longitude
                    );
                    return { ...venue, distance: dist };
                }
                return { ...venue, distance: Infinity };
            }).sort((a, b) => a.distance - b.distance);
        }
        
        if (filteredVenues.length === 0) {
            container.innerHTML = '<p class="text-center" style="padding: var(--space-2xl); color: var(--gray-500);">No venues match your criteria</p>';
            return;
        }
        
        container.innerHTML = filteredVenues.map(venue => {
            let distanceText = '';
            if (venue.distance && venue.distance !== Infinity) {
                distanceText = `${venue.distance.toFixed(1)} km away`;
            }
            
            const verifiedBadge = venue.isVerified ? 
                '<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' : '';
            
            return `
                <div class="venue-card" data-venue-id="${venue.id}" style="margin-bottom: var(--space-md);">
                    <img src="${venue.images?.[0] || 'https://via.placeholder.com/120'}" 
                         alt="${venue.venueName}" 
                         class="venue-image"
                         onerror="this.src='https://via.placeholder.com/120'">
                    <div class="venue-info">
                        <h3>${venue.venueName} ${verifiedBadge}</h3>
                        <div class="venue-sport">${venue.sportType || 'Multi-sport'}</div>
                        <div class="venue-rating">
                            <i class="fas fa-star"></i> ${(venue.rating || 0).toFixed(1)}
                            <span style="color: var(--gray-500); margin-left: var(--space-xs);">(${venue.totalReviews || 0})</span>
                        </div>
                        <div class="venue-address" style="font-size: var(--font-xs); color: var(--gray-500); margin: var(--space-xs) 0;">
                            <i class="fas fa-map-marker-alt"></i> ${venue.address || 'Address not available'}
                        </div>
                        ${distanceText ? `
                            <div class="venue-distance">
                                <i class="fas fa-location-dot"></i> ${distanceText}
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        document.querySelectorAll('#all-venues-list .venue-card').forEach(card => {
            card.addEventListener('click', () => {
                viewVenue(card.dataset.venueId);
            });
        });
        
    } catch (error) {
        console.error('Error displaying venues:', error);
        container.innerHTML = '<p class="text-center" style="color: var(--danger);">Failed to load venues</p>';
    }
}

function filterVenuesBySport(sport) {
    currentFilter = sport;
    displayAllVenues(currentFilter, currentSearchTerm);
}

function filterAllVenues(searchTerm) {
    currentSearchTerm = searchTerm;
    displayAllVenues(currentFilter, currentSearchTerm);
}

// ==================== SEARCH ====================

const searchVenues = debounce(async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
        if (searchTerm === '') {
            loadNearbyVenues();
        }
        return;
    }
    
    showLoading('Searching...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.VENUES).get();
        
        const results = [];
        const searchLower = searchTerm.toLowerCase();
        
        snapshot.forEach(doc => {
            const venue = doc.data();
            if (venue.hidden) return;
            
            if (venue.venueName.toLowerCase().includes(searchLower) ||
                venue.address.toLowerCase().includes(searchLower) ||
                venue.sportType.toLowerCase().includes(searchLower) ||
                (venue.city && venue.city.toLowerCase().includes(searchLower)) ||
                (venue.description && venue.description.toLowerCase().includes(searchLower))) {
                
                if (userLocation && venue.location) {
                    const distance = calculateDistance(
                        userLocation.lat,
                        userLocation.lng,
                        venue.location.latitude,
                        venue.location.longitude
                    );
                    venue.distance = distance;
                }
                
                results.push({ id: doc.id, ...venue });
            }
        });
        
        results.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        
        const container = document.getElementById('nearby-venues');
        if (results.length === 0) {
            container.innerHTML = '<p class="text-center">No venues found matching your search</p>';
        } else {
            container.innerHTML = results.map(venue => {
                const verifiedBadge = venue.isVerified ? 
                    '<span class="verified-badge"><i class="fas fa-check-circle"></i></span>' : '';
                
                return `
                    <div class="venue-card" data-venue-id="${venue.id}">
                        <img src="${venue.images?.[0] || 'https://via.placeholder.com/120'}" 
                             alt="${venue.venueName}" 
                             class="venue-image"
                             onerror="this.src='https://via.placeholder.com/120'">
                        <div class="venue-info">
                            <h3>${venue.venueName} ${verifiedBadge}</h3>
                            <div class="venue-sport">${venue.sportType}</div>
                            <div class="venue-rating">
                                <i class="fas fa-star"></i> ${(venue.rating || 0).toFixed(1)}
                            </div>
                            <div class="venue-distance">
                                <i class="fas fa-map-marker-alt"></i> 
                                ${venue.distance ? venue.distance.toFixed(1) + ' km away' : 'Distance unavailable'}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            document.querySelectorAll('.venue-card').forEach(card => {
                card.addEventListener('click', () => {
                    viewVenue(card.dataset.venueId);
                });
            });
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}, 500);

// ==================== ADMIN DASHBOARD ====================

function showAdminDashboard() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'ceo')) {
        showToast('Access denied', 'error');
        return;
    }
    
    document.getElementById('admin-id-display').innerHTML = `
        <i class="fas fa-user-shield"></i> Admin ID: ${currentUser.adminId || 'N/A'} (${currentUser.adminRole?.replace('_', ' ') || 'Admin'})
    `;
    
    loadAdminDashboard('overview');
    showPage('admin-dashboard-page');
}

async function loadAdminDashboard(tab) {
    const container = document.getElementById('admin-dashboard-content');
    
    // Update active tab styling
    document.querySelectorAll('.admin-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`admin-${tab}-tab`).classList.add('active');
    
    container.innerHTML = '<div class="loading-spinner"><div class="loader-spinner"></div></div>';
    
    if (tab === 'overview') {
        await loadAdminOverview(container);
    } else if (tab === 'owners') {
        await loadAdminOwners(container);
    } else if (tab === 'venues') {
        await loadAdminVenues(container);
    } else if (tab === 'bookings') {
        await loadAdminBookings(container);
    } else if (tab === 'tournaments') {
        await loadAdminTournaments(container);
    } else if (tab === 'payouts') {
        await loadAdminPayouts(container);
    } else if (tab === 'verification') {
        await loadAdminVerification(container);
    } else if (tab === 'reports') {
        await loadAdminReports(container);
    }
}

async function loadAdminOverview(container) {
    showLoading('Loading admin overview...');
    
    try {
        const ownersSnapshot = await db.collection(COLLECTIONS.OWNERS).get();
        const usersSnapshot = await db.collection(COLLECTIONS.USERS).get();
        const venuesSnapshot = await db.collection(COLLECTIONS.VENUES).get();
        const groundsSnapshot = await db.collection(COLLECTIONS.GROUNDS).get();
        const tournamentsSnapshot = await db.collection(COLLECTIONS.TOURNAMENTS).get();
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS).get();
        const payoutRequestsSnapshot = await db.collection(COLLECTIONS.PAYOUT_REQUESTS).where('status', '==', 'pending').get();
        const verificationRequestsSnapshot = await db.collection(COLLECTIONS.VERIFICATION_REQUESTS).where('status', '==', 'pending').get();
        
        let totalRevenue = 0;
        let todayBookings = 0;
        const today = new Date().toISOString().split('T')[0];
        
        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            totalRevenue += booking.commission || 0;
            if (booking.date === today) {
                todayBookings++;
            }
        });
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${ownersSnapshot.size}</div>
                    <div class="stat-label">Owners</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${usersSnapshot.size}</div>
                    <div class="stat-label">Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${venuesSnapshot.size}</div>
                    <div class="stat-label">Venues</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${groundsSnapshot.size}</div>
                    <div class="stat-label">Grounds</div>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${tournamentsSnapshot.size}</div>
                    <div class="stat-label">Tournaments</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${bookingsSnapshot.size}</div>
                    <div class="stat-label">Total Bookings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${todayBookings}</div>
                    <div class="stat-label">Today's Bookings</div>
                </div>
                <div class="stat-card" style="background: var(--gradient-secondary);">
                    <div class="stat-value">${formatCurrency(totalRevenue)}</div>
                    <div class="stat-label">Platform Revenue</div>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card" style="background: var(--gradient-warning);">
                    <div class="stat-value">${payoutRequestsSnapshot.size}</div>
                    <div class="stat-label">Pending Payouts</div>
                </div>
                <div class="stat-card" style="background: var(--gradient-accent);">
                    <div class="stat-value">${verificationRequestsSnapshot.size}</div>
                    <div class="stat-label">Verification Requests</div>
                </div>
            </div>
            
            <div class="recent-activity" style="margin-top: var(--space-xl);">
                <h4>Quick Actions</h4>
                <div class="ground-actions" style="margin-top: var(--space-md);">
                    <button class="manage-slots-btn" id="admin-verify-owners-btn">Verify Owners</button>
                    <button class="view-details-btn" id="admin-view-payouts-btn">Process Payouts</button>
                    <button class="close-day-btn" id="admin-view-reports-btn">Generate Reports</button>
                </div>
            </div>
        `;
        
        document.getElementById('admin-verify-owners-btn')?.addEventListener('click', () => loadAdminDashboard('verification'));
        document.getElementById('admin-view-payouts-btn')?.addEventListener('click', () => loadAdminDashboard('payouts'));
        document.getElementById('admin-view-reports-btn')?.addEventListener('click', () => loadAdminDashboard('reports'));
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading admin overview:', error);
        container.innerHTML = '<p class="text-center">Failed to load overview</p>';
    }
}

async function loadAdminOwners(container) {
    showLoading('Loading owners...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.OWNERS)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <div style="margin-bottom: var(--space-xl);">
                <input type="text" id="admin-owner-search" class="modal-input" placeholder="Search by Owner ID, Name or Venue">
            </div>
            <div id="admin-owners-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No owners found</p>';
        } else {
            snapshot.forEach(doc => {
                const owner = doc.data();
                
                const verifiedBadge = owner.isVerified ? 
                    '<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' : '';
                
                html += `
                    <div class="ground-management-card" data-owner-id="${owner.ownerUniqueId || ''}" data-owner-name="${owner.ownerName || ''}" data-venue-name="${owner.venueName || ''}">
                        <div class="ground-management-header">
                            <h4>${owner.ownerName || 'Owner'} ${verifiedBadge}</h4>
                            <span class="booking-status status-${owner.status || 'active'}">${owner.status || 'active'}</span>
                        </div>
                        <p><strong>Owner ID:</strong> ${owner.ownerUniqueId || 'N/A'}</p>
                        <p><strong>Email:</strong> ${owner.email}</p>
                        <p><strong>Phone:</strong> ${owner.phone || 'N/A'}</p>
                        <p><strong>Venue:</strong> ${owner.venueName || 'N/A'}</p>
                        <p><strong>City:</strong> ${owner.city || 'N/A'}</p>
                        <p><strong>Type:</strong> ${owner.ownerType === 'venue_owner' ? 'Venue Owner' : 'Plot Owner'}</p>
                        <p><strong>Registration Paid:</strong> ${owner.registrationPaid ? 'Yes' : 'No'}</p>
                        <p><strong>Total Earnings:</strong> ${formatCurrency(owner.totalEarnings || 0)}</p>
                        <p><strong>Total Bookings:</strong> ${owner.totalBookings || 0}</p>
                        <p><strong>Joined:</strong> ${owner.createdAt ? new Date(owner.createdAt.toDate()).toLocaleDateString() : 'N/A'}</p>
                        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                            ${owner.status === OWNER_STATUS.ACTIVE ? 
                                `<button class="close-day-btn" data-owner-id="${doc.id}">Block Owner</button>` :
                                `<button class="manage-slots-btn" data-owner-id="${doc.id}">Unblock Owner</button>`
                            }
                            <button class="view-details-btn" data-owner-id="${doc.id}">View Details</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add search functionality
        document.getElementById('admin-owner-search')?.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('#admin-owners-list-container .ground-management-card');
            
            cards.forEach(card => {
                const ownerId = card.getAttribute('data-owner-id')?.toLowerCase() || '';
                const ownerName = card.getAttribute('data-owner-name')?.toLowerCase() || '';
                const venueName = card.getAttribute('data-venue-name')?.toLowerCase() || '';
                
                if (ownerId.includes(searchTerm) || ownerName.includes(searchTerm) || venueName.includes(searchTerm)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
        
        // Add event listeners for block/unblock buttons
        document.querySelectorAll('.close-day-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => blockOwner(btn.dataset.ownerId));
        });
        
        document.querySelectorAll('.manage-slots-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => unblockOwner(btn.dataset.ownerId));
        });
        
        document.querySelectorAll('.view-details-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => viewOwnerDetails(btn.dataset.ownerId));
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading owners:', error);
        container.innerHTML = '<p class="text-center">Failed to load owners</p>';
    }
}
async function loadAdminVerification(container) {
    showLoading('Loading verification requests...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.VERIFICATION_REQUESTS)
            .where('status', '==', 'pending')
            .orderBy('submittedAt', 'desc')
            .get();
        
        let html = '<h3>Pending Verification Requests</h3>';
        
        if (snapshot.empty) {
            html += '<p class="text-center">No pending verification requests</p>';
        } else {
            snapshot.forEach(doc => {
                const request = doc.data();
                html += `
                    <div class="verification-item" style="background: var(--gray-50); border-radius: var(--radius); padding: var(--space-lg); margin-bottom: var(--space-md);">
                        <div class="verification-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md);">
                            <h4 style="margin: 0;">${request.ownerName || 'Owner'}</h4>
                            <span class="booking-status status-pending">Pending</span>
                        </div>
                        <p><strong>Owner ID:</strong> ${request.ownerId || 'N/A'}</p>
                        <p><strong>Email:</strong> ${request.ownerEmail || 'N/A'}</p>
                        <p><strong>Aadhaar:</strong> ${request.aadhaarNumber || 'N/A'}</p>
                        <p><strong>PAN:</strong> ${request.panNumber || 'N/A'}</p>
                        <p><strong>Submitted:</strong> ${request.submittedAt ? new Date(request.submittedAt.toDate()).toLocaleString() : 'N/A'}</p>
                        <div class="verification-actions" style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                            <button class="approve-btn" onclick="approveVerification('${doc.id}', '${request.ownerId}')">
                                <i class="fas fa-check"></i> Approve
                            </button>
                            <button class="reject-btn" onclick="rejectVerification('${doc.id}')">
                                <i class="fas fa-times"></i> Reject
                            </button>
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        hideLoading();
        
    } catch (error) {
        hideLoading();
        console.error('Error loading verification requests:', error);
        container.innerHTML = '<p class="text-center">Failed to load verification requests</p>';
    }
}

async function approveVerification(requestId, ownerId) {
    if (!confirm('Approve this verification request?')) return;
    
    showLoading('Approving verification...');
    
    try {
        await db.collection(COLLECTIONS.VERIFICATION_REQUESTS).doc(requestId).update({
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.uid
        });
        
        await db.collection(COLLECTIONS.OWNERS).doc(ownerId).update({
            verificationStatus: VERIFICATION_STATUS.VERIFIED,
            isVerified: true,
            verifiedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('Owner verified successfully', 'success');
        loadAdminDashboard('verification');
        
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function rejectVerification(requestId) {
    if (!confirm('Reject this verification request?')) return;
    
    showLoading('Rejecting verification...');
    
    try {
        await db.collection(COLLECTIONS.VERIFICATION_REQUESTS).doc(requestId).update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: currentUser.uid
        });
        
        hideLoading();
        showToast('Verification rejected', 'info');
        loadAdminDashboard('verification');
        
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function loadAdminPayouts(container) {
    showLoading('Loading payout requests...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${snapshot.size}</div>
                    <div class="stat-label">Total Payout Requests</div>
                </div>
            </div>
            
            <div style="margin-bottom: var(--space-xl);">
                <select id="payout-status-filter" class="modal-select" style="width: 100%;">
                    <option value="all">All Requests</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="paid">Paid</option>
                </select>
            </div>
            <div id="admin-payouts-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No payout requests found</p>';
        } else {
            snapshot.forEach(doc => {
                const payout = doc.data();
                html += `
                    <div class="payout-request-item" style="background: var(--gray-50); border-radius: var(--radius); padding: var(--space-lg); margin-bottom: var(--space-md);" data-payout-status="${payout.status}">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <strong style="font-size: var(--font-lg);">${formatCurrency(payout.amount || 0)}</strong>
                                <p style="margin-top: var(--space-xs);"><strong>Owner:</strong> ${payout.ownerName || 'Unknown'}</p>
                                <p><strong>UPI ID:</strong> ${payout.upiId || 'Not set'}</p>
                                <p><strong>Bookings:</strong> ${payout.bookingIds?.length || 0}</p>
                                <p><strong>Request ID:</strong> ${payout.requestId || 'N/A'}</p>
                                <p><strong>Requested:</strong> ${payout.createdAt ? new Date(payout.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
                                ${payout.approvedAt ? `<p><strong>Approved:</strong> ${new Date(payout.approvedAt.toDate()).toLocaleString()}</p>` : ''}
                                ${payout.paidAt ? `<p><strong>Paid:</strong> ${new Date(payout.paidAt.toDate()).toLocaleString()}</p>` : ''}
                            </div>
                            <div style="text-align: right;">
                                <span class="booking-status status-${payout.status || 'pending'}">${payout.status || 'pending'}</span>
                            </div>
                        </div>
                        ${payout.status === 'pending' ? `
                            <div class="payout-actions" style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                                <button class="approve-btn" onclick="approvePayout('${doc.id}', '${payout.ownerId}', ${payout.amount})">Approve</button>
                                <button class="reject-btn" onclick="rejectPayout('${doc.id}')">Reject</button>
                            </div>
                        ` : ''}
                        ${payout.status === 'approved' ? `
                            <div style="margin-top: var(--space-md);">
                                <button class="manage-slots-btn" onclick="markPayoutAsPaid('${doc.id}')">Mark as Paid</button>
                            </div>
                        ` : ''}
                        ${payout.status === 'paid' ? `
                            <div style="margin-top: var(--space-md);">
                                <div class="payment-note" style="background: var(--success); color: white; text-align: center; padding: var(--space-sm); border-radius: var(--radius);">
                                    <i class="fas fa-check-circle"></i> Payment Completed
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add filter functionality
        document.getElementById('payout-status-filter')?.addEventListener('change', function(e) {
            const filter = e.target.value;
            const cards = document.querySelectorAll('#admin-payouts-list-container .payout-request-item');
            
            cards.forEach(card => {
                if (filter === 'all') {
                    card.style.display = 'block';
                } else {
                    const status = card.getAttribute('data-payout-status');
                    card.style.display = status === filter ? 'block' : 'none';
                }
            });
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading payouts:', error);
        container.innerHTML = '<p class="text-center">Failed to load payouts</p>';
    }
}

async function approvePayout(requestId, ownerId, amount) {
    if (!confirm(`Approve payout of ${formatCurrency(amount)}?`)) return;
    
    showLoading('Processing payout...');
    
    try {
        const batch = db.batch();
        
        const payoutRef = db.collection(COLLECTIONS.PAYOUT_REQUESTS).doc(requestId);
        batch.update(payoutRef, {
            status: 'approved',
            approvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            approvedBy: currentUser.uid
        });
        
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', ownerId)
            .where('payoutStatus', '==', 'payout_pending')
            .get();
        
        bookingsSnapshot.forEach(doc => {
            batch.update(doc.ref, {
                payoutStatus: BOOKING_STATUS.PAYOUT_DONE,
                payoutDate: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        
        await batch.commit();
        
        hideLoading();
        showToast('Payout approved successfully', 'success');
        loadAdminDashboard('payouts');
        
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function rejectPayout(requestId) {
    if (!confirm('Reject this payout request?')) return;
    
    showLoading('Rejecting payout...');
    
    try {
        await db.collection(COLLECTIONS.PAYOUT_REQUESTS).doc(requestId).update({
            status: 'rejected',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp(),
            rejectedBy: currentUser.uid
        });
        
        hideLoading();
        showToast('Payout rejected', 'info');
        loadAdminDashboard('payouts');
        
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}
// Add this function after the rejectPayout function (around line 3900-4000)

async function markPayoutAsPaid(requestId) {
    if (!confirm('Mark this payout as paid? This will update the status to PAID.')) return;
    
    showLoading('Updating payout status...');
    
    try {
        const payoutRef = db.collection(COLLECTIONS.PAYOUT_REQUESTS).doc(requestId);
        const payoutDoc = await payoutRef.get();
        
        if (!payoutDoc.exists) {
            throw new Error('Payout request not found');
        }
        
        const payout = payoutDoc.data();
        
        // Update payout request status
        await payoutRef.update({
            status: 'paid',
            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
            paidBy: currentUser.uid,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update related bookings payout status if any
        if (payout.bookingIds && payout.bookingIds.length > 0) {
            const batch = db.batch();
            
            for (const bookingId of payout.bookingIds) {
                const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
                    .where('bookingId', '==', bookingId)
                    .get();
                
                if (!bookingsSnapshot.empty) {
                    bookingsSnapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            payoutStatus: BOOKING_STATUS.PAYOUT_DONE,
                            payoutPaidAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                }
            }
            
            await batch.commit();
        }
        
        hideLoading();
        showToast('Payout marked as paid successfully', 'success');
        
        // Refresh the current view
        if (document.getElementById('admin-dashboard-page').classList.contains('active')) {
            loadAdminDashboard('payouts');
        } else if (document.getElementById('ceo-dashboard-page').classList.contains('active')) {
            loadCEODashboard('payouts');
        }
        
    } catch (error) {
        hideLoading();
        console.error('Error marking payout as paid:', error);
        showToast('Error marking payout as paid: ' + error.message, 'error');
    }
}

async function loadAdminVenues(container) {
    showLoading('Loading venues...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.VENUES)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <div style="margin-bottom: var(--space-xl);">
                <input type="text" id="admin-venue-search" class="modal-input" placeholder="Search by Venue Name, Owner or City">
            </div>
            <div id="admin-venues-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No venues found</p>';
        } else {
            snapshot.forEach(doc => {
                const venue = doc.data();
                const verifiedBadge = venue.isVerified ? 
                    '<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' : '';
                
                html += `
                    <div class="ground-management-card" data-venue-name="${venue.venueName || ''}" data-owner-name="${venue.ownerName || ''}" data-city="${venue.city || ''}">
                        <div class="ground-management-header">
                            <h4>${venue.venueName || 'Venue'} ${verifiedBadge}</h4>
                            <span class="booking-status status-${venue.hidden ? 'hidden' : 'active'}">${venue.hidden ? 'Hidden' : 'Active'}</span>
                        </div>
                        <p><strong>Owner:</strong> ${venue.ownerName || 'Unknown'}</p>
                        <p><strong>Address:</strong> ${venue.address || 'N/A'}, ${venue.city || 'N/A'}</p>
                        <p><strong>Sport:</strong> ${venue.sportType || 'Multi-sport'}</p>
                        <p><strong>Rating:</strong> ${(venue.rating || 0).toFixed(1)} ⭐ (${venue.totalReviews || 0} reviews)</p>
                        <p><strong>Created:</strong> ${venue.createdAt ? new Date(venue.createdAt.toDate()).toLocaleDateString() : 'N/A'}</p>
                        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                            <button class="manage-slots-btn" data-venue-id="${doc.id}">View Details</button>
                            ${!venue.hidden ? 
                                `<button class="close-day-btn" data-venue-id="${doc.id}" data-venue-name="${venue.venueName}">Hide Venue</button>` :
                                `<button class="manage-slots-btn" data-venue-id="${doc.id}" data-venue-name="${venue.venueName}">Show Venue</button>`
                            }
                            <button class="view-details-btn" data-owner-id="${venue.ownerId}">View Owner</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add search functionality
        document.getElementById('admin-venue-search')?.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('#admin-venues-list-container .ground-management-card');
            
            cards.forEach(card => {
                const venueName = card.getAttribute('data-venue-name')?.toLowerCase() || '';
                const ownerName = card.getAttribute('data-owner-name')?.toLowerCase() || '';
                const city = card.getAttribute('data-city')?.toLowerCase() || '';
                
                if (venueName.includes(searchTerm) || ownerName.includes(searchTerm) || city.includes(searchTerm)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
        
        // Add event listeners
        document.querySelectorAll('.manage-slots-btn[data-venue-id]').forEach(btn => {
            btn.addEventListener('click', () => viewVenue(btn.dataset.venueId));
        });
        
        document.querySelectorAll('.close-day-btn[data-venue-id]').forEach(btn => {
            btn.addEventListener('click', () => toggleVenueVisibility(btn.dataset.venueId, true));
        });
        
        document.querySelectorAll('.manage-slots-btn[data-venue-id][data-venue-name]').forEach(btn => {
            if (btn.textContent === 'Show Venue') {
                btn.addEventListener('click', () => toggleVenueVisibility(btn.dataset.venueId, false));
            }
        });
        
        document.querySelectorAll('.view-details-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => viewOwnerDetails(btn.dataset.ownerId));
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading venues:', error);
        container.innerHTML = '<p class="text-center">Failed to load venues</p>';
    }
}

async function loadAdminBookings(container) {
    showLoading('Loading all bookings...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        
        let html = `
            <div style="margin-bottom: var(--space-xl);">
                <select id="booking-status-filter" class="modal-select" style="width: 100%;">
                    <option value="all">All Bookings</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="pending_payment">Pending Payment</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
            <div id="admin-bookings-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No bookings found</p>';
        } else {
            snapshot.forEach(doc => {
                const booking = doc.data();
                html += `
                    <div class="booking-card status-${booking.bookingStatus}" data-booking-status="${booking.bookingStatus}">
                        <div class="booking-status status-${booking.bookingStatus}">
                            ${booking.bookingStatus?.replace(/_/g, ' ') || 'Unknown'}
                        </div>
                        <p><strong>${booking.userName || 'User'}</strong> booked <strong>${booking.venueName || 'Venue'} - ${booking.groundName || 'Ground'}</strong></p>
                        <p><i class="fas fa-map-marker-alt"></i> ${booking.groundAddress || booking.venueAddress || 'Address not available'}</p>
                        <p><i class="fas fa-calendar"></i> ${booking.date || 'N/A'} | <i class="fas fa-clock"></i> ${booking.slotTime || 'N/A'}</p>
                        <p><strong>Amount:</strong> ${formatCurrency(booking.amount || 0)}</p>
                        <p><strong>Platform Fee (10%):</strong> ${formatCurrency(booking.commission || 0)}</p>
                        <p><strong>Owner Share:</strong> ${formatCurrency(booking.ownerAmount || 0)}</p>
                        <p><strong>Payment ID:</strong> ${booking.paymentId || 'N/A'}</p>
                        <p><strong>Payout Status:</strong> <span class="booking-status status-${booking.payoutStatus || 'pending'}">${booking.payoutStatus || 'pending'}</span></p>
                        <p><small><strong>Booking ID:</strong> ${booking.bookingId || 'N/A'}</small></p>
                        ${booking.appliedOffer ? '<p><i class="fas fa-gift"></i> First booking offer applied</p>' : ''}
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add filter functionality
        document.getElementById('booking-status-filter')?.addEventListener('change', function(e) {
            const filter = e.target.value;
            const cards = document.querySelectorAll('#admin-bookings-list-container .booking-card');
            
            cards.forEach(card => {
                if (filter === 'all') {
                    card.style.display = 'block';
                } else {
                    const status = card.getAttribute('data-booking-status');
                    card.style.display = status === filter ? 'block' : 'none';
                }
            });
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading bookings:', error);
        container.innerHTML = '<p class="text-center">Failed to load bookings</p>';
    }
}

async function loadAdminTournaments(container) {
    showLoading('Loading tournaments...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <div style="margin-bottom: var(--space-xl);">
                <select id="tournament-status-filter" class="modal-select" style="width: 100%;">
                    <option value="all">All Tournaments</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>
            <div id="admin-tournaments-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No tournaments created yet</p>';
        } else {
            snapshot.forEach(doc => {
                const tournament = doc.data();
                const startDate = tournament.startDate ? new Date(tournament.startDate).toLocaleDateString('en-IN') : 'N/A';
                const endDate = tournament.endDate ? new Date(tournament.endDate).toLocaleDateString('en-IN') : 'N/A';
                
                html += `
                    <div class="tournament-card" data-tournament-id="${doc.id}" data-tournament-status="${tournament.status}">
                        <div class="tournament-header">
                            <div class="tournament-icon">
                                <i class="fas fa-trophy"></i>
                            </div>
                            <div class="tournament-details">
                                <div class="tournament-name">${tournament.tournamentName || 'Unnamed Tournament'}</div>
                                <div class="tournament-meta">${tournament.sportType || 'Multi-sport'} | ${startDate} - ${endDate}</div>
                            </div>
                        </div>
                        <div><strong>Entry Fee:</strong> ${formatCurrency(tournament.entryFee || 0)} | <strong>Prize:</strong> ${formatCurrency(tournament.prizeAmount || 0)}</div>
                        <div><strong>Teams:</strong> ${tournament.registeredTeams?.length || 0}/${tournament.maxTeams || 0}</div>
                        <div><strong>Format:</strong> ${tournament.format || 'Knockout'} | <strong>Team Size:</strong> ${tournament.teamSize || 11}</div>
                        <div><strong>Venue:</strong> ${tournament.venueName || 'N/A'}</div>
                        <div><strong>Status:</strong> <span class="booking-status status-${tournament.status || 'upcoming'}">${tournament.status || 'upcoming'}</span></div>
                        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                            <button class="manage-slots-btn" onclick="viewTournamentDetails('${doc.id}')">View Details</button>
                            <button class="view-details-btn" onclick="showTournamentRegistrations('${doc.id}')">View Registrations (${tournament.registeredTeams?.length || 0})</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        // Add filter functionality
        document.getElementById('tournament-status-filter')?.addEventListener('change', function(e) {
            const filter = e.target.value;
            const cards = document.querySelectorAll('#admin-tournaments-list-container .tournament-card');
            
            cards.forEach(card => {
                if (filter === 'all') {
                    card.style.display = 'block';
                } else {
                    const status = card.getAttribute('data-tournament-status');
                    card.style.display = status === filter ? 'block' : 'none';
                }
            });
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading tournaments:', error);
        container.innerHTML = '<p class="text-center">Failed to load tournaments</p>';
    }
}


function loadAdminReports(container) {
    container.innerHTML = `
        <div class="reports-filters">
            <h4>Generate Report</h4>
            <div class="filter-group" style="margin-bottom: var(--space-lg);">
                <label>Report Type</label>
                <select id="admin-report-type" class="modal-select" style="width: 100%;">
                    <option value="bookings">Bookings Report</option>
                    <option value="revenue">Revenue Report</option>
                    <option value="owners">Owners Report</option>
                    <option value="tournaments">Tournaments Report</option>
                    <option value="users">Users Report</option>
                    <option value="payouts">Payouts Report</option>
                </select>
            </div>
            
            <div class="filter-group" style="margin-bottom: var(--space-lg);">
                <label>Date Range</label>
                <select id="admin-date-range" class="modal-select" style="width: 100%;">
                    <option value="today">Today</option>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="year">This Year</option>
                    <option value="custom">Custom Range</option>
                </select>
            </div>
            
            <div class="filter-group" id="admin-custom-date-range" style="display: none; margin-bottom: var(--space-lg);">
                <input type="date" id="admin-start-date" class="modal-input" placeholder="Start Date" style="margin-bottom: var(--space-sm);">
                <input type="date" id="admin-end-date" class="modal-input" placeholder="End Date">
            </div>
            
            <div class="filter-group" style="margin-bottom: var(--space-lg);">
                <label>Format</label>
                <select id="admin-report-format" class="modal-select" style="width: 100%;">
                    <option value="table">Table</option>
                    <option value="csv">CSV</option>
                </select>
            </div>
            
            <button class="auth-btn" id="admin-generate-report-btn">Generate Report</button>
        </div>
        
        <div id="admin-report-results" class="report-results" style="margin-top: var(--space-xl);">
            <p class="text-center">Select filters and generate report</p>
        </div>
    `;
    
    document.getElementById('admin-date-range')?.addEventListener('change', function() {
        document.getElementById('admin-custom-date-range').style.display = 
            this.value === 'custom' ? 'block' : 'none';
    });
    
    document.getElementById('admin-generate-report-btn')?.addEventListener('click', generateAdminReport);
}

async function generateAdminReport() {
    const reportType = document.getElementById('admin-report-type').value;
    const dateRange = document.getElementById('admin-date-range').value;
    const format = document.getElementById('admin-report-format').value;
    
    showLoading('Generating report...');
    
    try {
        let startDate, endDate;
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        if (dateRange === 'today') {
            startDate = todayStr;
            endDate = todayStr;
        } else if (dateRange === 'week') {
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - 7);
            startDate = weekStart.toISOString().split('T')[0];
            endDate = todayStr;
        } else if (dateRange === 'month') {
            const monthStart = new Date(today);
            monthStart.setMonth(today.getMonth() - 1);
            startDate = monthStart.toISOString().split('T')[0];
            endDate = todayStr;
        } else if (dateRange === 'year') {
            const yearStart = new Date(today);
            yearStart.setFullYear(today.getFullYear() - 1);
            startDate = yearStart.toISOString().split('T')[0];
            endDate = todayStr;
        } else if (dateRange === 'custom') {
            startDate = document.getElementById('admin-start-date').value;
            endDate = document.getElementById('admin-end-date').value;
            
            if (!startDate || !endDate) {
                showToast('Please select both dates', 'error');
                hideLoading();
                return;
            }
        }
        
        let data = [];
        let headers = [];
        
        if (reportType === 'bookings') {
            const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
                .where('date', '>=', startDate)
                .where('date', '<=', endDate)
                .orderBy('date', 'desc')
                .get();
            
            headers = ['Booking ID', 'Date', 'Time', 'User', 'Venue', 'Ground', 'Amount', 'Commission', 'Status', 'Payment ID'];
            
            snapshot.forEach(doc => {
                const b = doc.data();
                data.push([
                    b.bookingId || 'N/A',
                    b.date || 'N/A',
                    b.slotTime || 'N/A',
                    b.userName || 'N/A',
                    b.venueName || 'N/A',
                    b.groundName || 'N/A',
                    b.amount || 0,
                    b.commission || 0,
                    b.bookingStatus || 'N/A',
                    b.paymentId || 'N/A'
                ]);
            });
            
        } else if (reportType === 'revenue') {
            const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
                .where('date', '>=', startDate)
                .where('date', '<=', endDate)
                .where('bookingStatus', '==', BOOKING_STATUS.CONFIRMED)
                .get();
            
            headers = ['Date', 'Booking ID', 'Amount', 'Commission', 'Owner Payout', 'Platform Revenue'];
            
            snapshot.forEach(doc => {
                const b = doc.data();
                data.push([
                    b.date || 'N/A',
                    b.bookingId || 'N/A',
                    b.amount || 0,
                    b.commission || 0,
                    b.ownerAmount || 0,
                    b.commission || 0
                ]);
            });
            
        } else if (reportType === 'owners') {
            const snapshot = await db.collection(COLLECTIONS.OWNERS).get();
            
            headers = ['Owner ID', 'Name', 'Email', 'Phone', 'Type', 'Status', 'Total Earnings', 'Total Bookings', 'Joined Date'];
            
            snapshot.forEach(doc => {
                const o = doc.data();
                data.push([
                    o.ownerUniqueId || 'N/A',
                    o.ownerName || 'N/A',
                    o.email || 'N/A',
                    o.phone || 'N/A',
                    o.ownerType === 'venue_owner' ? 'Venue Owner' : 'Plot Owner',
                    o.status || 'active',
                    o.totalEarnings || 0,
                    o.totalBookings || 0,
                    o.createdAt ? new Date(o.createdAt.toDate()).toLocaleDateString() : 'N/A'
                ]);
            });
            
        } else if (reportType === 'tournaments') {
            const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
                .where('createdAt', '>=', new Date(startDate))
                .where('createdAt', '<=', new Date(endDate))
                .get();
            
            headers = ['Tournament Name', 'Sport', 'Entry Fee', 'Prize', 'Teams', 'Status', 'Start Date', 'End Date'];
            
            snapshot.forEach(doc => {
                const t = doc.data();
                data.push([
                    t.tournamentName || 'N/A',
                    t.sportType || 'N/A',
                    t.entryFee || 0,
                    t.prizeAmount || 0,
                    `${t.registeredTeams?.length || 0}/${t.maxTeams || 0}`,
                    t.status || 'N/A',
                    t.startDate || 'N/A',
                    t.endDate || 'N/A'
                ]);
            });
            
        } else if (reportType === 'payouts') {
            const snapshot = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
                .where('createdAt', '>=', new Date(startDate))
                .where('createdAt', '<=', new Date(endDate))
                .orderBy('createdAt', 'desc')
                .get();
            
            headers = ['Request ID', 'Date', 'Owner', 'Amount', 'UPI ID', 'Status'];
            
            snapshot.forEach(doc => {
                const p = doc.data();
                data.push([
                    p.requestId || 'N/A',
                    p.createdAt ? new Date(p.createdAt.toDate()).toLocaleDateString() : 'N/A',
                    p.ownerName || 'N/A',
                    p.amount || 0,
                    p.upiId || 'N/A',
                    p.status || 'N/A'
                ]);
            });
        }
        
        if (format === 'table') {
            let tableHtml = `
                <h4>Report (${startDate} to ${endDate})</h4>
                <div style="overflow-x: auto;">
                    <table class="report-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: var(--gray-100);">
                                ${headers.map(h => `<th style="padding: var(--space-md); text-align: left; border-bottom: 2px solid var(--gray-200);">${h}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${data.map(row => `
                                <tr style="border-bottom: 1px solid var(--gray-200);">
                                    ${row.map(cell => `<td style="padding: var(--space-md);">${cell}</td>`).join('')}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <p style="margin-top: var(--space-lg);"><strong>Total Records:</strong> ${data.length}</p>
            `;
            document.getElementById('admin-report-results').innerHTML = tableHtml;
        } else {
            let csv = headers.join(',') + '\n';
            csv += data.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report_${reportType}_${startDate}_to_${endDate}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            document.getElementById('admin-report-results').innerHTML = '<p class="text-center">CSV downloaded successfully</p>';
        }
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error generating report:', error);
        showToast('Error generating report: ' + error.message, 'error');
    }
}


// ==================== CEO DASHBOARD ====================

function showCEODashboard() {
    if (!currentUser || (currentUser.role !== 'ceo' && currentUser.email !== CEO_EMAIL)) {
        showToast('Access denied', 'error');
        return;
    }
    
    document.getElementById('ceo-id-display').innerHTML = `
        <i class="fas fa-crown"></i> CEO Dashboard
    `;
    
    loadCEODashboard('overview');
    showPage('ceo-dashboard-page');
}

async function loadCEODashboard(tab) {
    const container = document.getElementById('ceo-dashboard-content');
    
    // Update active tab styling
    document.querySelectorAll('.ceo-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`ceo-${tab}-tab`).classList.add('active');
    
    container.innerHTML = '<div class="loading-spinner"><div class="loader-spinner"></div></div>';
    
    if (tab === 'overview') {
        await loadCEOOverview(container);
    } else if (tab === 'admins') {
        await loadAdminsList(container);
    } else if (tab === 'owners') {
        await loadOwnersList(container);
    } else if (tab === 'bookings') {
        await loadAllBookings(container);
    } else if (tab === 'tournaments') {
        await loadTournamentsList(container);
    } else if (tab === 'payouts') {
        await loadPayoutsList(container);
    } else if (tab === 'analytics') {
        await loadAnalytics(container);
    } else if (tab === 'referrals') {
        await loadReferrals(container);
    }
}

async function loadCEOOverview(container) {
    showLoading('Loading analytics...');
    
    try {
        const today = new Date().toISOString().split('T')[0];
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        const weekStart = lastWeek.toISOString().split('T')[0];
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const monthStart = lastMonth.toISOString().split('T')[0];
        
        const adminsSnapshot = await db.collection(COLLECTIONS.ADMINS).get();
        const ownersSnapshot = await db.collection(COLLECTIONS.OWNERS).get();
        const usersSnapshot = await db.collection(COLLECTIONS.USERS).get();
        const venuesSnapshot = await db.collection(COLLECTIONS.VENUES).get();
        const groundsSnapshot = await db.collection(COLLECTIONS.GROUNDS).get();
        const tournamentsSnapshot = await db.collection(COLLECTIONS.TOURNAMENTS).get();
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS).get();
        const referralsSnapshot = await db.collection(COLLECTIONS.REFERRALS).get();
        
        let totalRevenue = 0;
        let todayRevenue = 0;
        let weekRevenue = 0;
        let monthRevenue = 0;
        
        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            const bookingDate = booking.date;
            const commission = booking.commission || 0;
            
            totalRevenue += commission;
            
            if (bookingDate === today) {
                todayRevenue += commission;
            }
            
            if (bookingDate >= weekStart) {
                weekRevenue += commission;
            }
            
            if (bookingDate >= monthStart) {
                monthRevenue += commission;
            }
        });
        
        const plotOwners = ownersSnapshot.docs.filter(doc => doc.data().ownerType === 'plot_owner').length;
        const venueOwners = ownersSnapshot.docs.filter(doc => doc.data().ownerType === 'venue_owner').length;
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${adminsSnapshot.size}</div>
                    <div class="stat-label">Admins</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${ownersSnapshot.size}</div>
                    <div class="stat-label">Total Owners</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${usersSnapshot.size}</div>
                    <div class="stat-label">Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${venuesSnapshot.size}</div>
                    <div class="stat-label">Venues</div>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${groundsSnapshot.size}</div>
                    <div class="stat-label">Grounds</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${tournamentsSnapshot.size}</div>
                    <div class="stat-label">Tournaments</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${bookingsSnapshot.size}</div>
                    <div class="stat-label">Total Bookings</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${referralsSnapshot.size}</div>
                    <div class="stat-label">Referrals</div>
                </div>
            </div>
            
            <div class="revenue-card">
                <h4>Platform Revenue (10% Commission)</h4>
                <div class="revenue-amount">${formatCurrency(totalRevenue)}</div>
                <div class="stats-grid" style="margin-top: var(--space-md);">
                    <div class="stat-card" style="background: var(--gradient-warning);">
                        <div class="stat-value">${formatCurrency(todayRevenue)}</div>
                        <div class="stat-label">Today</div>
                    </div>
                    <div class="stat-card" style="background: var(--gradient-secondary);">
                        <div class="stat-value">${formatCurrency(weekRevenue)}</div>
                        <div class="stat-label">This Week</div>
                    </div>
                    <div class="stat-card" style="background: var(--gradient-accent);">
                        <div class="stat-value">${formatCurrency(monthRevenue)}</div>
                        <div class="stat-label">This Month</div>
                    </div>
                </div>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card" style="background: var(--gradient-secondary);">
                    <div class="stat-value">${venueOwners}</div>
                    <div class="stat-label">Venue Owners</div>
                </div>
                <div class="stat-card" style="background: var(--gradient-warning);">
                    <div class="stat-value">${plotOwners}</div>
                    <div class="stat-label">Plot Owners</div>
                </div>
            </div>
        `;
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading analytics:', error);
        container.innerHTML = '<p class="text-center">Failed to load analytics</p>';
    }
}

async function loadReferrals(container) {
    showLoading('Loading referral data...');
    
    try {
        const referralsSnapshot = await db.collection(COLLECTIONS.REFERRALS)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        let html = '<h3>Recent Referrals</h3>';
        
        if (referralsSnapshot.empty) {
            html += '<p class="text-center">No referrals yet</p>';
        } else {
            html += `
                <table class="report-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--gray-100);">
                            <th style="padding: var(--space-md); text-align: left;">Referral Code</th>
                            <th style="padding: var(--space-md); text-align: left;">Referred By</th>
                            <th style="padding: var(--space-md); text-align: left;">Date</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            referralsSnapshot.forEach(doc => {
                const ref = doc.data();
                html += `
                    <tr style="border-bottom: 1px solid var(--gray-200);">
                        <td style="padding: var(--space-md);">${ref.code || 'N/A'}</td>
                        <td style="padding: var(--space-md);">${ref.referredBy || 'N/A'}</td>
                        <td style="padding: var(--space-md);">${ref.createdAt ? new Date(ref.createdAt.toDate()).toLocaleDateString() : 'N/A'}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
        }
        
        // Add referral statistics
        const ownersWithReferrals = await db.collection(COLLECTIONS.OWNERS)
            .where('referralCount', '>', 0)
            .orderBy('referralCount', 'desc')
            .limit(10)
            .get();
        
        if (!ownersWithReferrals.empty) {
            html += '<h4 style="margin-top: var(--space-xl);">Top Referrers (Owners)</h4>';
            html += `
                <table class="report-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--gray-100);">
                            <th style="padding: var(--space-md); text-align: left;">Owner Name</th>
                            <th style="padding: var(--space-md); text-align: left;">Referral Count</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            ownersWithReferrals.forEach(doc => {
                const owner = doc.data();
                html += `
                    <tr style="border-bottom: 1px solid var(--gray-200);">
                        <td style="padding: var(--space-md);">${owner.ownerName || owner.name || 'Unknown'}</td>
                        <td style="padding: var(--space-md);">${owner.referralCount || 0}</td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
        }
        
        container.innerHTML = html;
        hideLoading();
        
    } catch (error) {
        hideLoading();
        console.error('Error loading referrals:', error);
        container.innerHTML = '<p class="text-center">Failed to load referrals</p>';
    }
}
function addCEOTabEventListeners() {
    // CEO Dashboard tabs
    document.getElementById('ceo-overview-tab')?.addEventListener('click', () => loadCEODashboard('overview'));
    document.getElementById('ceo-admins-tab')?.addEventListener('click', () => loadCEODashboard('admins'));
    document.getElementById('ceo-owners-tab')?.addEventListener('click', () => loadCEODashboard('owners'));
    document.getElementById('ceo-bookings-tab')?.addEventListener('click', () => loadCEODashboard('bookings'));
    document.getElementById('ceo-tournaments-tab')?.addEventListener('click', () => loadCEODashboard('tournaments'));
    document.getElementById('ceo-payouts-tab')?.addEventListener('click', () => loadCEODashboard('payouts'));
    document.getElementById('ceo-analytics-tab')?.addEventListener('click', () => loadCEODashboard('analytics'));
    document.getElementById('ceo-referrals-tab')?.addEventListener('click', () => loadCEODashboard('referrals'));
}
// Add this function after addCEOTabEventListeners() function (around line 12500-12600)

function addAdminTabEventListeners() {
    // Admin Dashboard tabs
    const adminTabs = document.querySelectorAll('.admin-tabs .tab-btn');
    if (adminTabs.length > 0) {
        adminTabs.forEach(btn => {
            btn.addEventListener('click', function() {
                const tabId = this.id;
                if (tabId === 'admin-overview-tab') {
                    loadAdminDashboard('overview');
                } else if (tabId === 'admin-owners-tab') {
                    loadAdminDashboard('owners');
                } else if (tabId === 'admin-venues-tab') {
                    loadAdminDashboard('venues');
                } else if (tabId === 'admin-bookings-tab') {
                    loadAdminDashboard('bookings');
                } else if (tabId === 'admin-tournaments-tab') {
                    loadAdminDashboard('tournaments');
                } else if (tabId === 'admin-payouts-tab') {
                    loadAdminDashboard('payouts');
                } else if (tabId === 'admin-verification-tab') {
                    loadAdminDashboard('verification');
                } else if (tabId === 'admin-reports-tab') {
                    loadAdminDashboard('reports');
                }
            });
        });
    }
}
async function loadAdminsList(container) {
    showLoading('Loading admins...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.ADMINS)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <button class="auth-btn" id="ceo-create-admin-btn" style="margin-bottom: var(--space-xl);">
                <i class="fas fa-user-shield"></i> Create New Admin
            </button>
            <div id="admins-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No admins found</p>';
        } else {
            snapshot.forEach(doc => {
                const admin = doc.data();
                if (admin.email === CEO_EMAIL) return;
                
                html += `
                    <div class="ground-management-card">
                        <div class="ground-management-header">
                            <h4>${admin.name || 'Admin'}</h4>
                            <span class="booking-status status-${admin.status || 'active'}">${admin.status || 'active'}</span>
                        </div>
                        <p><strong>Admin ID:</strong> ${admin.adminId || 'N/A'}</p>
                        <p><strong>Email:</strong> ${admin.email}</p>
                        <p><strong>Phone:</strong> ${admin.phone || 'N/A'}</p>
                        <p><strong>Role:</strong> ${admin.adminRole?.replace('_', ' ') || 'Admin'}</p>
                        <p><strong>Created:</strong> ${admin.createdAt ? new Date(admin.createdAt.toDate()).toLocaleDateString() : 'N/A'}</p>
                        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                            ${admin.status === ADMIN_STATUS.ACTIVE ? 
                                `<button class="close-day-btn" data-admin-id="${doc.id}">Block Admin</button>` :
                                `<button class="manage-slots-btn" data-admin-id="${doc.id}">Unblock Admin</button>`
                            }
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        document.getElementById('ceo-create-admin-btn')?.addEventListener('click', showCreateAdminModal);
        
        document.querySelectorAll('.close-day-btn[data-admin-id]').forEach(btn => {
            btn.addEventListener('click', () => blockAdmin(btn.dataset.adminId));
        });
        
        document.querySelectorAll('.manage-slots-btn[data-admin-id]').forEach(btn => {
            btn.addEventListener('click', () => unblockAdmin(btn.dataset.adminId));
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading admins:', error);
        container.innerHTML = '<p class="text-center">Failed to load admins</p>';
    }
}

async function blockAdmin(adminId) {
    if (!confirm('Block this admin? They will lose access to dashboard.')) return;
    
    showLoading('Blocking admin...');
    
    try {
        await db.collection(COLLECTIONS.ADMINS).doc(adminId).update({
            status: ADMIN_STATUS.BLOCKED,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            blockedBy: currentUser.uid,
            blockedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('Admin blocked');
        loadCEODashboard('admins');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function unblockAdmin(adminId) {
    showLoading('Unblocking admin...');
    
    try {
        await db.collection(COLLECTIONS.ADMINS).doc(adminId).update({
            status: ADMIN_STATUS.ACTIVE,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideLoading();
        showToast('Admin unblocked');
        loadCEODashboard('admins');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

function showCreateAdminModal() {
    document.getElementById('create-admin-form').reset();
    document.getElementById('create-admin-modal').classList.add('active');
}

async function handleCreateAdmin(e) {
    e.preventDefault();
    
    const name = document.getElementById('admin-name').value.trim();
    const email = document.getElementById('admin-email').value.trim();
    const phone = document.getElementById('admin-phone').value.trim();
    const password = document.getElementById('admin-password').value;
    const adminRole = document.getElementById('admin-role').value;
    
    if (!name || !email || !phone || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    showLoading('Creating admin account...');
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        const permissions = {
            manageOwners: document.getElementById('perm-manage-owners').checked,
            manageVenues: document.getElementById('perm-manage-venues').checked,
            manageBookings: document.getElementById('perm-manage-bookings').checked,
            manageTournaments: document.getElementById('perm-manage-tournaments').checked,
            viewPayouts: document.getElementById('perm-view-payouts').checked,
            manageSlots: document.getElementById('perm-manage-slots').checked,
            manageAdmins: adminRole === 'super_admin' ? true : false
        };
        
        const adminData = {
            uid: user.uid,
            email: email,
            name: name,
            phone: phone,
            profileImage: 'https://via.placeholder.com/150',
            adminId: generateId('ADM'),
            adminRole: adminRole,
            permissions: permissions,
            status: ADMIN_STATUS.ACTIVE,
            role: 'admin',
            createdBy: currentUser.uid,
            createdByEmail: currentUser.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: null,
            totalLogins: 0
        };
        
        await db.collection(COLLECTIONS.ADMINS).doc(user.uid).set(adminData);
        
        await user.updateProfile({
            displayName: name
        });
        
        hideLoading();
        showToast(`Admin created successfully!`, 'success');
        closeModal('create-admin-modal');
        
        if (document.getElementById('ceo-dashboard-page').classList.contains('active')) {
            loadCEODashboard('admins');
        }
        
    } catch (error) {
        hideLoading();
        let errorMessage = 'Failed to create admin';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters';
        } else {
            errorMessage = error.message;
        }
        
        showToast(errorMessage, 'error');
    }
}

async function loadOwnersList(container) {
    showLoading('Loading owners...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.OWNERS)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = `
            <div style="margin-bottom: var(--space-xl);">
                <input type="text" id="owner-search" class="modal-input" placeholder="Search by Owner ID, Name or Venue">
            </div>
            <div id="owners-list-container">
        `;
        
        if (snapshot.empty) {
            html += '<p class="text-center">No owners found</p>';
        } else {
            snapshot.forEach(doc => {
                const owner = doc.data();
                
                const verifiedBadge = owner.isVerified ? 
                    '<span class="verified-badge"><i class="fas fa-check-circle"></i> Verified</span>' : '';
                
                html += `
                    <div class="ground-management-card" data-owner-id="${owner.ownerUniqueId || ''}" data-owner-name="${owner.ownerName || ''}" data-venue-name="${owner.venueName || ''}">
                        <div class="ground-management-header">
                            <h4>${owner.ownerName || 'Owner'} ${verifiedBadge}</h4>
                            <span class="booking-status status-${owner.status || 'active'}">${owner.status || 'active'}</span>
                        </div>
                        <p><strong>Owner ID:</strong> ${owner.ownerUniqueId || 'N/A'}</p>
                        <p><strong>Email:</strong> ${owner.email}</p>
                        <p><strong>Phone:</strong> ${owner.phone || 'N/A'}</p>
                        <p><strong>Venue:</strong> ${owner.venueName || 'N/A'}</p>
                        <p><strong>City:</strong> ${owner.city || 'N/A'}</p>
                        <p><strong>Type:</strong> ${owner.ownerType === 'venue_owner' ? 'Venue Owner' : 'Plot Owner'}</p>
                        <p><strong>UPI ID:</strong> <span style="color: var(--primary); font-weight: 600;">${owner.upiId || 'Not set'}</span></p>
                        <p><strong>Joined:</strong> ${owner.createdAt ? new Date(owner.createdAt.toDate()).toLocaleDateString() : 'N/A'}</p>
                        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                            ${owner.status === OWNER_STATUS.ACTIVE ? 
                                `<button class="close-day-btn" data-owner-id="${doc.id}">Block Owner</button>` :
                                `<button class="manage-slots-btn" data-owner-id="${doc.id}">Unblock Owner</button>`
                            }
                            <button class="view-details-btn" data-owner-id="${doc.id}">View Details</button>
                            ${owner.upiId ? `
                                <button class="payout-btn" data-owner-id="${doc.id}" data-owner-upi="${owner.upiId}">Payout</button>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
        }
        
        html += '</div>';
        container.innerHTML = html;
        
        document.getElementById('owner-search')?.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('#owners-list-container .ground-management-card');
            
            cards.forEach(card => {
                const ownerId = card.getAttribute('data-owner-id')?.toLowerCase() || '';
                const ownerName = card.getAttribute('data-owner-name')?.toLowerCase() || '';
                const venueName = card.getAttribute('data-venue-name')?.toLowerCase() || '';
                
                if (ownerId.includes(searchTerm) || ownerName.includes(searchTerm) || venueName.includes(searchTerm)) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        });
        
        document.querySelectorAll('.close-day-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => blockOwner(btn.dataset.ownerId));
        });
        
        document.querySelectorAll('.manage-slots-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => unblockOwner(btn.dataset.ownerId));
        });
        
        document.querySelectorAll('.view-details-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => viewOwnerDetails(btn.dataset.ownerId));
        });
        
        document.querySelectorAll('.payout-btn[data-owner-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                const ownerId = btn.dataset.ownerId;
                const upiId = btn.dataset.ownerUpi;
                if (upiId && upiId !== 'Not set') {
                    showPayoutDetails(ownerId, upiId);
                } else {
                    showToast('Owner has not set UPI ID', 'warning');
                }
            });
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading owners:', error);
        container.innerHTML = '<p class="text-center">Failed to load owners</p>';
    }
}

function searchOwners() {
    const searchTerm = document.getElementById('owner-search').value.toLowerCase();
    const cards = document.querySelectorAll('[data-owner-id]');
    
    cards.forEach(card => {
        const ownerId = card.getAttribute('data-owner-id')?.toLowerCase() || '';
        const ownerName = card.getAttribute('data-owner-name')?.toLowerCase() || '';
        const venueName = card.getAttribute('data-venue-name')?.toLowerCase() || '';
        
        if (ownerId.includes(searchTerm) || ownerName.includes(searchTerm) || venueName.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

async function blockOwner(ownerId) {
    if (!confirm('Block this owner? Their venues will be hidden from users.')) return;
    
    showLoading('Blocking owner...');
    
    try {
        await db.collection(COLLECTIONS.OWNERS).doc(ownerId).update({
            status: OWNER_STATUS.BLOCKED,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            blockedBy: currentUser.uid,
            blockedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const venuesSnapshot = await db.collection(COLLECTIONS.VENUES)
            .where('ownerId', '==', ownerId)
            .get();
        
        const batch = db.batch();
        venuesSnapshot.forEach(doc => {
            batch.update(doc.ref, { 
                hidden: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        
        const groundsSnapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', ownerId)
            .get();
        
        const groundBatch = db.batch();
        groundsSnapshot.forEach(doc => {
            groundBatch.update(doc.ref, { 
                status: 'inactive',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await groundBatch.commit();
        
        hideLoading();
        showToast('Owner blocked successfully');
        loadAdminDashboard('owners');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function unblockOwner(ownerId) {
    if (!confirm('Unblock this owner?')) return;
    
    showLoading('Unblocking owner...');
    
    try {
        await db.collection(COLLECTIONS.OWNERS).doc(ownerId).update({
            status: OWNER_STATUS.ACTIVE,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const venuesSnapshot = await db.collection(COLLECTIONS.VENUES)
            .where('ownerId', '==', ownerId)
            .get();
        
        const batch = db.batch();
        venuesSnapshot.forEach(doc => {
            batch.update(doc.ref, { 
                hidden: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        
        const groundsSnapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', ownerId)
            .get();
        
        const groundBatch = db.batch();
        groundsSnapshot.forEach(doc => {
            groundBatch.update(doc.ref, { 
                status: 'active',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await groundBatch.commit();
        
        hideLoading();
        showToast('Owner unblocked successfully');
        loadAdminDashboard('owners');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function viewOwnerDetails(ownerId) {
    showLoading('Loading owner details...');
    
    try {
        const ownerDoc = await db.collection(COLLECTIONS.OWNERS).doc(ownerId).get();
        
        if (!ownerDoc.exists) {
            showToast('Owner not found', 'error');
            return;
        }
        
        const owner = ownerDoc.data();
        
        const venuesSnapshot = await db.collection(COLLECTIONS.VENUES)
            .where('ownerId', '==', ownerId)
            .get();
        
        const groundsSnapshot = await db.collection(COLLECTIONS.GROUNDS)
            .where('ownerId', '==', ownerId)
            .get();
        
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', ownerId)
            .where('bookingStatus', '==', BOOKING_STATUS.CONFIRMED)
            .get();
        
        let totalRevenue = 0;
        bookingsSnapshot.forEach(doc => {
            totalRevenue += doc.data().ownerAmount || 0;
        });
        
        const payoutRequestsSnapshot = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
            .where('ownerId', '==', ownerId)
            .orderBy('createdAt', 'desc')
            .get();
        
        let totalPaid = 0;
        payoutRequestsSnapshot.forEach(doc => {
            if (doc.data().status === 'approved' || doc.data().status === 'paid') {
                totalPaid += doc.data().amount;
            }
        });
        
        const content = document.getElementById('owner-details-content');
        content.innerHTML = `
            <h3>${owner.ownerName}</h3>
            
            <div class="owner-detail-item">
                <span class="owner-detail-label">Owner ID:</span>
                <span class="owner-detail-value">${owner.ownerUniqueId || 'N/A'}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Email:</span>
                <span class="owner-detail-value">${owner.email}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Phone:</span>
                <span class="owner-detail-value">${owner.phone || 'N/A'}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">UPI ID:</span>
                <span class="owner-detail-value" style="color: var(--primary); font-weight: 600;">${owner.upiId || 'Not set'}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Owner Type:</span>
                <span class="owner-detail-value">${owner.ownerType === 'venue_owner' ? 'Venue Owner' : 'Plot Owner'}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Registration Paid:</span>
                <span class="owner-detail-value">${owner.registrationPaid ? 'Yes' : 'No'}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Verified:</span>
                <span class="owner-detail-value">${owner.isVerified ? '✓ Verified' : 'Not Verified'}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Status:</span>
                <span class="owner-detail-value status-${owner.status}">${owner.status}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Total Earnings:</span>
                <span class="owner-detail-value">${formatCurrency(totalRevenue)}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Total Paid:</span>
                <span class="owner-detail-value">${formatCurrency(totalPaid)}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Pending Payout:</span>
                <span class="owner-detail-value">${formatCurrency(totalRevenue - totalPaid)}</span>
            </div>
            <div class="owner-detail-item">
                <span class="owner-detail-label">Total Bookings:</span>
                <span class="owner-detail-value">${bookingsSnapshot.size}</span>
            </div>
            
            <div class="owner-venues-list">
                <h4>Venues (${venuesSnapshot.size})</h4>
                ${venuesSnapshot.empty ? '<p>No venues found</p>' : ''}
                ${venuesSnapshot.docs.map(doc => {
                    const venue = doc.data();
                    return `
                        <div class="owner-venue-item">
                            <span class="owner-venue-name">${venue.venueName}</span>
                            <span class="owner-venue-status ${venue.hidden ? 'hidden' : 'active'}">
                                ${venue.hidden ? 'Hidden' : 'Active'}
                            </span>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="owner-venues-list">
                <h4>Grounds (${groundsSnapshot.size})</h4>
                ${groundsSnapshot.empty ? '<p>No grounds found</p>' : ''}
                ${groundsSnapshot.docs.map(doc => {
                    const ground = doc.data();
                    return `
                        <div class="owner-venue-item">
                            <span class="owner-venue-name">${ground.groundName}</span>
                            <span>${ground.sportType} | ${formatCurrency(ground.pricePerHour)}/hr</span>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="owner-venues-list">
                <h4>Payout History</h4>
                ${payoutRequestsSnapshot.empty ? '<p>No payouts yet</p>' : ''}
                ${payoutRequestsSnapshot.docs.map(doc => {
                    const payout = doc.data();
                    return `
                        <div class="payout-item">
                            <div>
                                <strong>${formatCurrency(payout.amount)}</strong>
                                <p class="booking-id">${new Date(payout.createdAt.toDate()).toLocaleDateString()}</p>
                            </div>
                            <span class="booking-status status-${payout.status}">${payout.status}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="owner-actions">
                ${owner.status === OWNER_STATUS.ACTIVE ? 
                    `<button class="close-day-btn" onclick="blockOwner('${ownerId}')">Block Owner</button>` :
                    `<button class="manage-slots-btn" onclick="unblockOwner('${ownerId}')">Unblock Owner</button>`
                }
                ${owner.upiId ? `
                    <button class="payout-btn" onclick="showPayoutDetails('${ownerId}', '${owner.upiId}')">Process Payout</button>
                ` : ''}
            </div>
        `;
        
        hideLoading();
        document.getElementById('owner-details-modal').classList.add('active');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function showPayoutDetails(ownerId, upiId) {
    showLoading('Loading payout details...');
    
    try {
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .where('ownerId', '==', ownerId)
            .where('bookingStatus', '==', BOOKING_STATUS.CONFIRMED)
            .get();
        
        let totalPending = 0;
        const pendingBookings = [];
        
        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            if (booking.payoutStatus !== BOOKING_STATUS.PAYOUT_DONE) {
                totalPending += booking.ownerAmount || 0;
                pendingBookings.push({
                    id: doc.id,
                    ...booking
                });
            }
        });
        
        const content = document.getElementById('payout-details-content');
        content.innerHTML = `
            <div class="payout-summary">
                <h4>Pending Payouts</h4>
                <div class="payout-amount">${formatCurrency(totalPending)}</div>
                <p>UPI ID: <strong>${upiId}</strong></p>
                <p>Pending Bookings: ${pendingBookings.length}</p>
            </div>
            
            <div class="payout-list">
                <h4>Pending Bookings</h4>
                ${pendingBookings.length === 0 ? '<p class="text-center">No pending payouts</p>' : ''}
                ${pendingBookings.map(booking => `
                    <div class="payout-item">
                        <div>
                            <strong>${booking.venueName} - ${booking.groundName}</strong><br>
                            <span class="booking-id">${booking.bookingId}</span>
                            <br><small>Status: ${booking.payoutStatus || 'pending'}</small>
                        </div>
                        <div>
                            <strong>${formatCurrency(booking.ownerAmount)}</strong><br>
                            <small>${booking.date}</small>
                        </div>
                    </div>
                `).join('')}
            </div>
            
            ${pendingBookings.length > 0 ? `
                <button class="submit-btn" id="process-payout-btn" data-owner-id="${ownerId}" data-total="${totalPending}">
                    Process Payout of ${formatCurrency(totalPending)}
                </button>
            ` : '<p class="text-center">No pending payouts to process</p>'}
        `;
        
        document.getElementById('process-payout-btn')?.addEventListener('click', async (e) => {
            const ownerId = e.target.dataset.ownerId;
            const amount = parseFloat(e.target.dataset.total);
            
            if (!confirm(`Process payout of ${formatCurrency(amount)} to ${upiId}?`)) return;
            
            showLoading('Processing payout...');
            
            try {
                const batch = db.batch();
                const payoutId = generateId('POUT');
                
                const payoutRef = db.collection(COLLECTIONS.PAYOUTS).doc();
                batch.set(payoutRef, {
                    payoutId,
                    ownerId,
                    amount,
                    upiId,
                    status: 'completed',
                    processedBy: currentUser.uid,
                    processedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    bookings: pendingBookings.map(b => b.bookingId)
                });
                
                pendingBookings.forEach(booking => {
                    const bookingRef = db.collection(COLLECTIONS.BOOKINGS).doc(booking.id);
                    batch.update(bookingRef, {
                        payoutStatus: BOOKING_STATUS.PAYOUT_DONE,
                        payoutId,
                        payoutDate: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                
                await batch.commit();
                
                hideLoading();
                showToast(`Payout of ${formatCurrency(amount)} processed successfully`);
                closeModal('payout-details-modal');
                loadAdminDashboard('payouts');
            } catch (error) {
                hideLoading();
                showToast(error.message, 'error');
            }
        });
        
        hideLoading();
        document.getElementById('payout-details-modal').classList.add('active');
    } catch (error) {
        hideLoading();
        showToast(error.message, 'error');
    }
}

async function loadAllBookings(container) {
    showLoading('Loading all bookings...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        
        let html = '<h3>Recent Bookings</h3>';
        
        if (snapshot.empty) {
            html += '<p class="text-center">No bookings found</p>';
        } else {
            snapshot.forEach(doc => {
                const booking = doc.data();
                html += `
                    <div class="booking-card status-${booking.bookingStatus}">
                        <div class="booking-status status-${booking.bookingStatus}">
                            ${booking.bookingStatus?.replace(/_/g, ' ') || 'Unknown'}
                        </div>
                        <p><strong>${booking.userName || 'User'}</strong> booked <strong>${booking.venueName || 'Venue'} - ${booking.groundName || 'Ground'}</strong></p>
                        <p>${booking.groundAddress || booking.venueAddress || 'Address not available'}</p>
                        <p>${booking.date || 'N/A'} | ${booking.slotTime || 'N/A'}</p>
                        <p>Amount: ${formatCurrency(booking.amount || 0)} | Commission: ${formatCurrency(booking.commission || 0)}</p>
                        <p>Owner Share: ${formatCurrency(booking.ownerAmount || 0)}</p>
                        <p>Payment ID: ${booking.paymentId || 'N/A'}</p>
                        <p>Payout Status: <span class="booking-status status-${booking.payoutStatus || 'pending'}">${booking.payoutStatus || 'pending'}</span></p>
                        <p><small>Booking ID: ${booking.bookingId || 'N/A'}</small></p>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading bookings:', error);
        container.innerHTML = '<p class="text-center">Failed to load bookings</p>';
    }
}

async function loadTournamentsList(container) {
    showLoading('Loading tournaments...');
    
    try {
        const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS)
            .orderBy('createdAt', 'desc')
            .get();
        
        let html = '<h3>All Tournaments</h3>';
        
        if (snapshot.empty) {
            html += '<p class="text-center">No tournaments created yet</p>';
        } else {
            snapshot.forEach(doc => {
                const tournament = doc.data();
                const startDate = tournament.startDate ? new Date(tournament.startDate).toLocaleDateString('en-IN') : 'N/A';
                html += `
                    <div class="tournament-card" data-tournament-id="${doc.id}">
                        <div class="tournament-header">
                            <div class="tournament-icon">
                                <i class="fas fa-trophy"></i>
                            </div>
                            <div class="tournament-details">
                                <div class="tournament-name">${tournament.tournamentName || 'Unnamed Tournament'}</div>
                                <div class="tournament-meta">${tournament.sportType || 'Multi-sport'} | ${startDate}</div>
                            </div>
                        </div>
                        <div>Entry: ${formatCurrency(tournament.entryFee || 0)} | Prize: ${formatCurrency(tournament.prizeAmount || 0)}</div>
                        <div>Teams: ${tournament.registeredTeams?.length || 0}/${tournament.maxTeams || 0}</div>
                        <div>Status: <span class="booking-status status-${tournament.status || 'upcoming'}">${tournament.status || 'upcoming'}</span></div>
                        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
                            <button class="manage-slots-btn" onclick="viewTournamentDetails('${doc.id}')">View</button>
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading tournaments:', error);
        container.innerHTML = '<p class="text-center">Failed to load tournaments</p>';
    }
}

async function loadPayoutsList(container) {
    showLoading('Loading payouts...');
    
    try {
        const payoutsSnapshot = await db.collection(COLLECTIONS.PAYOUT_REQUESTS)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        
        let html = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${payoutsSnapshot.size}</div>
                    <div class="stat-label">Total Payout Requests</div>
                </div>
            </div>
            
            <h4 style="margin-top: var(--space-xl);">Payout History</h4>
        `;
        
        if (payoutsSnapshot.empty) {
            html += '<p class="text-center">No payouts yet</p>';
        } else {
            payoutsSnapshot.forEach(doc => {
                const payout = doc.data();
                html += `
                    <div class="payout-item" style="background: var(--gray-50); border-radius: var(--radius); padding: var(--space-lg); margin-bottom: var(--space-md);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <strong style="font-size: var(--font-lg);">${formatCurrency(payout.amount || 0)}</strong>
                                <p class="booking-id" style="margin-top: var(--space-xs);">To: ${payout.ownerName || 'Unknown'}</p>
                                <p class="booking-id">UPI: ${payout.upiId || 'Not set'}</p>
                                <p class="booking-id">Bookings: ${payout.bookingIds?.length || 0}</p>
                            </div>
                            <div style="text-align: right;">
                                <span class="booking-status status-${payout.status || 'pending'}">${payout.status || 'pending'}</span>
                                <p class="booking-id" style="margin-top: var(--space-xs);">${payout.createdAt ? new Date(payout.createdAt.toDate()).toLocaleDateString() : 'N/A'}</p>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = html;
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading payouts:', error);
        container.innerHTML = '<p class="text-center">Failed to load payouts</p>';
    }
}

async function loadAnalytics(container) {
    showLoading('Loading analytics...');
    
    try {
        const bookingsSnapshot = await db.collection(COLLECTIONS.BOOKINGS).get();
        const ownersSnapshot = await db.collection(COLLECTIONS.OWNERS).get();
        const usersSnapshot = await db.collection(COLLECTIONS.USERS).get();
        const venuesSnapshot = await db.collection(COLLECTIONS.VENUES).get();
        const tournamentsSnapshot = await db.collection(COLLECTIONS.TOURNAMENTS).get();
        
        let totalRevenue = 0;
        let monthlyRevenue = {};
        let sportStats = {};
        let cityStats = {};
        
        bookingsSnapshot.forEach(doc => {
            const booking = doc.data();
            const commission = booking.commission || 0;
            totalRevenue += commission;
            
            if (booking.date) {
                const monthKey = booking.date.substring(0, 7);
                monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] || 0) + commission;
            }
            
            if (booking.sportType) {
                sportStats[booking.sportType] = (sportStats[booking.sportType] || 0) + 1;
            }
            
            if (booking.city) {
                cityStats[booking.city] = (cityStats[booking.city] || 0) + 1;
            }
        });
        
        const topSports = Object.entries(sportStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        const topCities = Object.entries(cityStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        const monthlyData = Object.entries(monthlyRevenue)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-6);
        
        container.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${ownersSnapshot.size}</div>
                    <div class="stat-label">Owners</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${usersSnapshot.size}</div>
                    <div class="stat-label">Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${venuesSnapshot.size}</div>
                    <div class="stat-label">Venues</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${tournamentsSnapshot.size}</div>
                    <div class="stat-label">Tournaments</div>
                </div>
            </div>
            
            <div class="revenue-card">
                <h4>Total Platform Revenue</h4>
                <div class="revenue-amount">${formatCurrency(totalRevenue)}</div>
            </div>
            
            ${monthlyData.length > 0 ? `
                <div style="margin-top: var(--space-xl);">
                    <h4>Monthly Revenue (Last 6 Months)</h4>
                    <div style="background: var(--gray-50); padding: var(--space-lg); border-radius: var(--radius);">
                        ${monthlyData.map(([month, revenue]) => `
                            <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-sm);">
                                <span>${month}</span>
                                <span><strong>${formatCurrency(revenue)}</strong></span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div style="margin-top: var(--space-xl);">
                <h4>Popular Sports</h4>
                <div style="background: var(--gray-50); padding: var(--space-lg); border-radius: var(--radius);">
                    ${topSports.map(([sport, count]) => `
                        <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-sm);">
                            <span>${sport}</span>
                            <span><strong>${count}</strong> bookings</span>
                        </div>
                    `).join('')}
                    ${topSports.length === 0 ? '<p class="text-center">No data available</p>' : ''}
                </div>
            </div>
            
            <div style="margin-top: var(--space-xl);">
                <h4>Top Cities</h4>
                <div style="background: var(--gray-50); padding: var(--space-lg); border-radius: var(--radius);">
                    ${topCities.map(([city, count]) => `
                        <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-sm);">
                            <span>${city}</span>
                            <span><strong>${count}</strong> bookings</span>
                        </div>
                    `).join('')}
                    ${topCities.length === 0 ? '<p class="text-center">No data available</p>' : ''}
                </div>
            </div>
        `;
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error loading analytics:', error);
        container.innerHTML = '<p class="text-center">Failed to load analytics</p>';
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    addAdminTabEventListeners();
    handleTournamentPaymentCallback();
    // Check for payment callback
    handlePaymentCallback();
    updateMatchStatuses();
    setInterval(updateMatchStatuses, 60000);
    // Online/Offline detection
    window.addEventListener('online', () => {
        document.querySelector('.offline-indicator')?.remove();
        showToast('You are back online', 'success');
    });
    
    window.addEventListener('offline', () => {
        if (!document.querySelector('.offline-indicator')) {
            const indicator = document.createElement('div');
            indicator.className = 'offline-indicator';
            indicator.textContent = 'You are offline. Some features may be unavailable.';
            document.body.prepend(indicator);
        }
    });
    
    // Auto-fill owner ID and date in owner agreement page
    const ownerIdSpan = document.getElementById('owner-id-placeholder');
    const dateSpan = document.getElementById('current-date-placeholder');
    
    if (ownerIdSpan && currentUser && currentUser.role === 'owner') {
        ownerIdSpan.textContent = currentUser.ownerUniqueId || 'N/A';
    }
    
    if (dateSpan) {
        const today = new Date();
        dateSpan.textContent = today.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
});
// ==================== ENHANCED ADD GROUND FUNCTIONS ====================

// Global variables for add ground
let selectedGroundImages = [];
let currentGroundStep = 1;
let selectedFiles = [];

const totalGroundSteps = 3;

// Enhanced Show Add Ground Modal
// ==================== SHOW ADD GROUND MODAL ====================
function showAddGroundModal() {
    // Reset form
    const form = document.getElementById('add-ground-form');
    if (form) form.reset();
    
    // Reset to step 1
    const steps = document.querySelectorAll('.form-step');
    const progressSteps = document.querySelectorAll('.progress-step');
    
    steps.forEach(step => step.classList.remove('active'));
    progressSteps.forEach(step => step.classList.remove('active', 'completed'));
    
    const firstStep = document.querySelector('.form-step[data-step="1"]');
    const firstProgress = document.querySelector('.progress-step[data-step="1"]');
    if (firstStep) firstStep.classList.add('active');
    if (firstProgress) firstProgress.classList.add('active');
    
    // Reset navigation buttons
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const submitBtn = document.getElementById('submit-ground-btn');
    
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.style.display = 'flex';
    if (submitBtn) submitBtn.style.display = 'none';
    
    // Reset price preview
    updateEarningsPreview(0);
    
    // Reset price input
    const priceInput = document.getElementById('ground-price-input');
    if (priceInput) priceInput.value = '';
    
    // Reset current step
    currentGroundStep = 1;
    
    // Show modal
    const modal = document.getElementById('add-ground-modal');
    if (modal) modal.classList.add('active');
}

// Update earnings preview
function updateEarningsPreview(price) {
    const platformFee = price * 0.10;
    const ownerEarning = price - platformFee;
    
    const customerPriceEl = document.querySelector('.customer-price');
    const platformFeeEl = document.querySelector('.platform-fee');
    const ownerEarningEl = document.querySelector('.owner-earning');
    
    if (customerPriceEl) customerPriceEl.textContent = `₹${price.toLocaleString()}`;
    if (platformFeeEl) platformFeeEl.textContent = `₹${platformFee.toLocaleString()}`;
    if (ownerEarningEl) ownerEarningEl.textContent = `₹${ownerEarning.toLocaleString()}`;
}

// Initialize step navigation
// ==================== INITIALIZE STEP NAVIGATION ====================


function initializeStepNavigation() {
    const prevBtn = document.getElementById('prev-step-btn');
    const nextBtn = document.getElementById('next-step-btn');
    const submitBtn = document.getElementById('submit-ground-btn');
    
    if (!prevBtn || !nextBtn || !submitBtn) return;
    
    function updateStep(step) {
        document.querySelectorAll('.form-step').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.progress-step').forEach(s => s.classList.remove('active'));
        
        const currentStepEl = document.querySelector(`.form-step[data-step="${step}"]`);
        const currentProgressEl = document.querySelector(`.progress-step[data-step="${step}"]`);
        if (currentStepEl) currentStepEl.classList.add('active');
        if (currentProgressEl) currentProgressEl.classList.add('active');
        
        for (let i = 1; i < step; i++) {
            const completedStep = document.querySelector(`.progress-step[data-step="${i}"]`);
            if (completedStep) completedStep.classList.add('completed');
        }
        
        if (prevBtn) prevBtn.disabled = (step === 1);
        
        if (step === totalGroundSteps) {
            if (nextBtn) nextBtn.style.display = 'none';
            if (submitBtn) submitBtn.style.display = 'flex';
        } else {
            if (nextBtn) nextBtn.style.display = 'flex';
            if (submitBtn) submitBtn.style.display = 'none';
        }
        
        currentGroundStep = step;
    }
    
    const newPrevBtn = prevBtn.cloneNode(true);
    const newNextBtn = nextBtn.cloneNode(true);
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    
    newPrevBtn.addEventListener('click', () => {
        if (currentGroundStep > 1) {
            updateStep(currentGroundStep - 1);
        }
    });
    
    newNextBtn.addEventListener('click', () => {
        if (validateStep(currentGroundStep)) {
            if (currentGroundStep < totalGroundSteps) {
                updateStep(currentGroundStep + 1);
            }
        }
    });
    
    document.querySelectorAll('.progress-step').forEach(step => {
        const newStep = step.cloneNode(true);
        step.parentNode.replaceChild(newStep, step);
        
        newStep.addEventListener('click', () => {
            const stepNum = parseInt(newStep.dataset.step);
            if (stepNum < currentGroundStep) {
                updateStep(stepNum);
            }
        });
    });
    
    function validateStep(step) {
    if (step === 1) {
        const groundName = document.getElementById('ground-name-input')?.value.trim();
        const sportType = document.getElementById('ground-sport-input')?.value;
        
        if (!groundName) {
            showToast('Please enter ground name', 'error');
            document.getElementById('ground-name-input')?.focus();
            return false;
        }
        if (!sportType) {
            showToast('Please select sport type', 'error');
            return false;
        }
        return true;
    }
    
    if (step === 2) {
        const price = parseFloat(document.getElementById('ground-price-input')?.value);
        if (!price || price <= 0) {
            showToast('Please enter a valid price per hour', 'error');
            document.getElementById('ground-price-input')?.focus();
            return false;
        }
        if (price < 100) {
            showToast('Minimum price is ₹100 per hour', 'error');
            return false;
        }
        return true;
    }
    
    // Step 3 validation - REMOVED image requirement
    if (step === 3) {
        // Images are optional - always return true
        return true;
    }
    
    return true;
}
}
// Initialize image upload
// ==================== INITIALIZE IMAGE UPLOAD ====================
function initializeImageUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('ground-images');
    const selectPhotosBtn = document.getElementById('select-photos-btn');
    
    if (!uploadArea || !fileInput) return;
    
    function updateImagePreview() {
        const previewGrid = document.getElementById('image-preview-grid');
        
        if (!previewGrid) return;
        
        if (selectedFiles.length === 0) {
            previewGrid.innerHTML = `
                <div class="preview-placeholder">
                    <i class="fas fa-camera"></i>
                    <p>No photos selected yet</p>
                    <span>Select at least 3 photos</span>
                </div>
            `;
            previewGrid.classList.remove('has-images');
            return;
        }
        
        previewGrid.classList.add('has-images');
        let html = '';
        
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            const url = URL.createObjectURL(file);
            html += `
                <div class="image-preview-item" data-index="${i}">
                    <img src="${url}" alt="Preview ${i + 1}">
                    <button type="button" class="image-preview-remove" data-index="${i}">
                        <i class="fas fa-times"></i>
                    </button>
                    <span class="image-preview-badge">${i + 1}</span>
                </div>
            `;
        }
        
        previewGrid.innerHTML = html;
        
        document.querySelectorAll('.image-preview-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                selectedFiles.splice(index, 1);
                updateFileInputFromSelectedFiles();
                updateImagePreview();
                
                if (selectedFiles.length < 3) {
                    showToast('Please select at least 3 photos', 'warning');
                }
            });
        });
    }
    
    function updateFileInputFromSelectedFiles() {
        const fileInput = document.getElementById('ground-images');
        if (!fileInput) return;
        
        const dataTransfer = new DataTransfer();
        selectedFiles.forEach(file => {
            dataTransfer.items.add(file);
        });
        fileInput.files = dataTransfer.files;
    }
    
    function handleFiles(files) {
        const validFiles = Array.from(files).filter(file => {
            const isValidType = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/jpg';
            const isValidSize = file.size <= 5 * 1024 * 1024;
            if (!isValidType) showToast(`${file.name}: Only JPEG/PNG files allowed`, 'error');
            if (!isValidSize) showToast(`${file.name}: File size must be less than 5MB`, 'error');
            return isValidType && isValidSize;
        });
        
        if (validFiles.length === 0) return;
        
        if (selectedFiles.length + validFiles.length > 10) {
            showToast('Maximum 10 photos allowed', 'error');
            return;
        }
        
        selectedFiles.push(...validFiles);
        updateFileInputFromSelectedFiles();
        updateImagePreview();
        
        if (selectedFiles.length >= 3) {
            showToast(`${selectedFiles.length} photos selected. You can proceed to next step.`, 'success');
        } else {
            showToast(`Selected ${selectedFiles.length} photos. Need at least 3.`, 'warning');
        }
    }
    
    const newUploadArea = uploadArea.cloneNode(true);
    uploadArea.parentNode.replaceChild(newUploadArea, uploadArea);
    
    if (selectPhotosBtn) {
        const newSelectPhotosBtn = selectPhotosBtn.cloneNode(true);
        selectPhotosBtn.parentNode.replaceChild(newSelectPhotosBtn, selectPhotosBtn);
        
        newSelectPhotosBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
    }
    
    newUploadArea.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
            handleFiles(e.target.files);
        }
    });
    
    newUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        newUploadArea.style.borderColor = 'var(--primary)';
        newUploadArea.style.background = 'var(--primary-50)';
    });
    
    newUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        newUploadArea.style.borderColor = 'var(--gray-300)';
        newUploadArea.style.background = 'var(--gray-50)';
    });
    
    newUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        newUploadArea.style.borderColor = 'var(--gray-300)';
        newUploadArea.style.background = 'var(--gray-50)';
        const files = e.dataTransfer.files;
        if (files.length) {
            handleFiles(files);
        }
    });
}

// Initialize price handlers
// ==================== INITIALIZE PRICE HANDLERS ====================
function initializePriceHandlers() {
    const priceInput = document.getElementById('ground-price-input');
    if (!priceInput) return;
    
    const newPriceInput = priceInput.cloneNode(true);
    priceInput.parentNode.replaceChild(newPriceInput, priceInput);
    
    newPriceInput.addEventListener('input', (e) => {
        const price = parseFloat(e.target.value) || 0;
        updateEarningsPreview(price);
    });
    
    document.querySelectorAll('.suggestion-badge').forEach(badge => {
        const newBadge = badge.cloneNode(true);
        badge.parentNode.replaceChild(newBadge, badge);
        
        newBadge.addEventListener('click', () => {
            const price = parseInt(newBadge.dataset.price);
            if (newPriceInput) {
                newPriceInput.value = price;
                updateEarningsPreview(price);
            }
        });
    });
}
// Enhanced handle add ground
async function handleAddGround(e) {
    e.preventDefault();
    
    const canAdd = await canAddGround();
    if (!canAdd) return;
    
    const groundName = document.getElementById('ground-name-input')?.value.trim();
    const sportType = document.getElementById('ground-sport-input')?.value;
    const pricePerHour = parseFloat(document.getElementById('ground-price-input')?.value);
    const groundAddress = document.getElementById('ground-address-input')?.value.trim();
    const fileInput = document.getElementById('ground-images');
    const groundImages = fileInput ? fileInput.files : [];
    
    if (!groundName || !sportType || !pricePerHour) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (groundImages.length === 0) {
    showToast('No photos selected. You can add photos later from the ground management page.', 'warning');
}
    
    // Show upload progress
    const uploadProgress = document.getElementById('upload-progress');
    const progressFill = document.getElementById('upload-progress-fill');
    const uploadStatus = document.getElementById('upload-status');
    
    if (uploadProgress) uploadProgress.style.display = 'block';
    if (progressFill) progressFill.style.width = '0%';
    if (uploadStatus) uploadStatus.textContent = 'Uploading photos...';
    
    showLoading('Adding ground...');
    
    try {
        const imageUrls = [];
        let uploaded = 0;
        
        for (let i = 0; i < groundImages.length; i++) {
            const file = groundImages[i];
            const url = await uploadFile(file, `grounds/${currentUser.uid}`);
            imageUrls.push(url);
            
            uploaded++;
            const progress = (uploaded / groundImages.length) * 100;
            if (progressFill) progressFill.style.width = `${progress}%`;
            if (uploadStatus) uploadStatus.textContent = `Uploading ${uploaded} of ${groundImages.length} photos...`;
        }
        
        const groundData = {
            ownerId: currentUser.uid,
            groundName,
            sportType,
            pricePerHour,
            groundAddress: groundAddress || '',
            images: imageUrls,
            rating: 0,
            totalReviews: 0,
            status: 'active',
            isVerified: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection(COLLECTIONS.GROUNDS).add(groundData);
        
        await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).update({
            groundsCount: firebase.firestore.FieldValue.increment(1)
        });
        
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        showToast('Ground added successfully!', 'success');
        closeModal('add-ground-modal');
        loadOwnerDashboard('grounds');
        
    } catch (error) {
        hideLoading();
        if (uploadProgress) uploadProgress.style.display = 'none';
        console.error('Error adding ground:', error);
        showToast(error.message || 'Error adding ground. Please try again.', 'error');
    }
}

// Initialize everything when modal is opened
function initializeAddGroundModal() {
    // Wait for DOM to be ready
    setTimeout(() => {
        initializeStepNavigation();
        initializeImageUpload();
        initializePriceHandlers();
    }, 100);
}

// Call this when the page loads and when modal is about to open
document.addEventListener('DOMContentLoaded', () => {
    initializeAddGroundModal();
});

// Also re-initialize when modal is opened to ensure fresh state
const originalShowAddGroundModal = showAddGroundModal;
window.showAddGroundModal = function() {
    initializeAddGroundModal();
    originalShowAddGroundModal();
};
// ==================== HANDLE PAYMENT CALLBACK ====================

/**
 * Handle payment callback when user returns from PhonePe
 * This should be called when the page loads
 */
async function handlePaymentCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const transactionId = urlParams.get('transactionId');
    const bookingId = urlParams.get('bookingId');
    const code = urlParams.get('code');
    
    // Check if this is a payment callback
    if (!transactionId && !bookingId) {
        return;
    }
    
    console.log('Payment callback detected');
    console.log('Transaction ID:', transactionId);
    console.log('Booking ID:', bookingId);
    console.log('Code:', code);
    
    // Show loading while verifying
    showLoading('Verifying payment...');
    
    try {
        // If code is already present in URL (from PhonePe redirect)
        if (code === 'PAYMENT_SUCCESS') {
            console.log('Payment success from URL parameter');
            
            // Update booking status
            const bookingSnapshot = await db.collection('bookings')
                .where('bookingId', '==', bookingId)
                .get();
            
            if (!bookingSnapshot.empty) {
                const bookingDoc = bookingSnapshot.docs[0];
                const booking = bookingDoc.data();
                
                // Update booking
                await bookingDoc.ref.update({
                    bookingStatus: BOOKING_STATUS.CONFIRMED,
                    paymentStatus: PAYMENT_STATUS.SUCCESS,
                    confirmedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Update slot status
                const [startTime, endTime] = booking.slotTime.split('-');
                const slotSnapshot = await db.collection('slots')
                    .where('groundId', '==', booking.groundId)
                    .where('date', '==', booking.date)
                    .where('startTime', '==', startTime)
                    .where('endTime', '==', endTime)
                    .get();
                
                if (!slotSnapshot.empty) {
                    await slotSnapshot.docs[0].ref.update({
                        status: SLOT_STATUS.CONFIRMED,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                }
                
                hideLoading();
                
                // Show success confirmation
                showPaymentSuccessConfirmation(booking);
                return;
            }
        }
        
        // If we have transaction ID but no code, verify with PhonePe
        if (transactionId) {
            const verificationResult = await verifyPaymentStatus(transactionId);
            
            if (verificationResult.success) {
                // Get booking from session storage or Firestore
                const pendingBooking = sessionStorage.getItem('pendingBooking');
                if (pendingBooking) {
                    const booking = JSON.parse(pendingBooking);
                    
                    // Update booking status
                    const bookingSnapshot = await db.collection('bookings')
                        .where('bookingId', '==', booking.bookingId)
                        .get();
                    
                    if (!bookingSnapshot.empty) {
                        await bookingSnapshot.docs[0].ref.update({
                            bookingStatus: BOOKING_STATUS.CONFIRMED,
                            paymentStatus: PAYMENT_STATUS.SUCCESS,
                            paymentId: transactionId,
                            confirmedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                    
                    // Clear session storage
                    sessionStorage.removeItem('pendingBooking');
                    sessionStorage.removeItem('currentTransaction');
                    
                    hideLoading();
                    showToast('Payment successful!', 'success');
                    
                    // Redirect to bookings page
                    setTimeout(() => {
                        showBookings();
                    }, 2000);
                }
            } else {
                hideLoading();
                showToast('Payment verification failed. Please contact support.', 'error');
            }
        }
        
    } catch (error) {
        console.error('Payment callback error:', error);
        hideLoading();
        showToast('Error verifying payment: ' + error.message, 'error');
    }
}

/**
 * Show payment success confirmation
 */
function showPaymentSuccessConfirmation(booking) {
    // Update confirmation page content
    document.getElementById('confirmation-title').textContent = 'Payment Successful!';
    document.getElementById('confirmation-message').textContent = 'Your booking has been confirmed. Show the entry pass at the venue.';
    document.getElementById('confirmation-status-icon').innerHTML = '<i class="fas fa-check-circle"></i>';
    document.getElementById('confirmation-status-icon').className = 'status-icon success';
    
    const details = document.getElementById('confirmation-details');
    details.innerHTML = `
        <p><strong>Booking ID:</strong> ${booking.bookingId}</p>
        <p><strong>Venue:</strong> ${booking.venueName}</p>
        <p><strong>Ground:</strong> ${booking.groundName}</p>
        <p><strong>Address:</strong> ${booking.groundAddress || booking.venueAddress}</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Time:</strong> ${booking.slotTime}</p>
        <p><strong>Amount Paid:</strong> ${formatCurrency(booking.amount)}</p>
        <p><strong>Status:</strong> <span style="color: var(--success);">CONFIRMED</span></p>
    `;
    
    if (booking.appliedOffer) {
        details.innerHTML += `<p><i class="fas fa-gift"></i> 20% first booking offer applied!</p>`;
        localStorage.setItem('firstBookingOffer_' + currentUser.uid, 'true');
    }
    
    document.getElementById('view-entry-pass-btn').style.display = 'block';
    showPage('confirmation-page');
}

// Call this when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check for payment callback
    handlePaymentCallback();
});
// Make functions globally available for onclick handlers
// ==================== DEBUG OWNER DATA ====================
async function debugOwnerData() {
    if (!currentUser) {
        console.log('No user logged in');
        showToast('Please login first', 'warning');
        return;
    }
    
    console.log('=== DEBUG: Owner Data ===');
    console.log('Current user object:', currentUser);
    console.log('User role:', currentUser.role);
    console.log('Owner type from currentUser:', currentUser.ownerType);
    
    if (currentUser.role !== 'owner') {
        console.log('User is not an owner. Role:', currentUser.role);
        showToast('You are not logged in as an owner', 'info');
        return;
    }
    
    try {
        const ownerDoc = await db.collection(COLLECTIONS.OWNERS).doc(currentUser.uid).get();
        if (ownerDoc.exists) {
            const ownerData = ownerDoc.data();
            console.log('Owner data from Firestore:', ownerData);
            console.log('Owner type from Firestore:', ownerData.ownerType);
            console.log('Is ownerType VENUE_OWNER?', ownerData.ownerType === OWNER_TYPES.VENUE_OWNER);
            console.log('Is ownerType PLOT_OWNER?', ownerData.ownerType === OWNER_TYPES.PLOT_OWNER);
            console.log('Owner status:', ownerData.status);
            console.log('Owner verification status:', ownerData.verificationStatus);
            
            // Display in a nice format
            let message = `Owner Data:\n`;
            message += `Type: ${ownerData.ownerType || 'Not set'}\n`;
            message += `ID: ${ownerData.ownerUniqueId || 'N/A'}\n`;
            message += `Name: ${ownerData.ownerName || 'N/A'}\n`;
            message += `Status: ${ownerData.status || 'N/A'}\n`;
            message += `Verified: ${ownerData.isVerified ? 'Yes' : 'No'}\n`;
            message += `Grounds Count: ${ownerData.groundsCount || 0}`;
            
            showToast(message, 'info');
        } else {
            console.log('Owner document not found in Firestore!');
            showToast('Owner data not found in database!', 'error');
        }
    } catch (error) {
        console.error('Error fetching owner data:', error);
        showToast('Error fetching owner data: ' + error.message, 'error');
    }
}
// ==================== TEST CAN ADD GROUND ====================
async function testCanAddGround() {
    console.log('=== Testing canAddGround ===');
    
    if (!currentUser) {
        console.log('No user logged in');
        showToast('Please login first', 'warning');
        return false;
    }
    
    console.log('Current user:', {
        uid: currentUser.uid,
        role: currentUser.role,
        ownerType: currentUser.ownerType
    });
    
    if (currentUser.role !== 'owner') {
        console.log('User is not an owner');
        showToast('You are not logged in as an owner', 'error');
        return false;
    }
    
    try {
        const result = await canAddGround();
        console.log('canAddGround result:', result);
        
        if (result) {
            showToast('✓ You can add grounds!', 'success');
        } else {
            showToast('✗ Cannot add grounds. Check console for details.', 'error');
        }
        
        return result;
        
    } catch (error) {
        console.error('Error in testCanAddGround:', error);
        showToast('Error testing: ' + error.message, 'error');
        return false;
    }
}
// ==================== RAZORPAY TOURNAMENT PAYMENT INTEGRATION ====================

// Your Razorpay Key ID (Get from Razorpay Dashboard)
const RAZORPAY_KEY_ID = 'rzp_test_RdECGCYMGRRSmU'; // REPLACE WITH YOUR ACTUAL KEY ID

// Razorpay Order Creation
async function createRazorpayOrder(tournament, registrationId, teamName) {
    try {
        const amount = tournament.entryFee;
        
        // Generate unique order ID
        const orderId = generateId('ORDER');
        
        // Store order details in Firestore
        const orderData = {
            orderId: orderId,
            registrationId: registrationId,
            tournamentId: tournament.tournamentId || tournament.id,
            tournamentName: tournament.tournamentName,
            teamName: teamName,
            amount: amount,
            userId: currentUser.uid,
            userName: currentUser.name || currentUser.ownerName || 'User',
            userEmail: currentUser.email,
            userPhone: currentUser.phone || '',
            status: 'created',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('razorpay_orders').add(orderData);
        
        return {
            orderId: orderId,
            amount: amount
        };
        
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        throw error;
    }
}

// Initiate Razorpay Payment
// ==================== INITIATE RAZORPAY PAYMENT (WITHOUT PRE-CREATING REGISTRATION) ====================

async function initiateRazorpayPayment(tournament, registrationId, teamName) {
    if (!currentUser) {
        showToast('Please login to continue', 'warning');
        return;
    }
    
    showLoading('Preparing payment...');
    
    try {
        if (!tournament && currentTournament) {
            tournament = currentTournament;
        }
        
        if (!tournament) {
            throw new Error('Tournament information not found');
        }
        
        // Verify tournament is still available before payment
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(tournament.id);
        const freshTournamentDoc = await tournamentRef.get();
        
        if (!freshTournamentDoc.exists) {
            throw new Error('Tournament not found');
        }
        
        const freshTournament = freshTournamentDoc.data();
        
        if (freshTournament.registeredTeams && freshTournament.registeredTeams.length >= freshTournament.maxTeams) {
            throw new Error('Tournament is now full. Cannot register.');
        }
        
        const today = new Date();
        const startDate = new Date(freshTournament.startDate);
        if (startDate <= today) {
            throw new Error('Tournament has already started. Cannot register.');
        }
        
        const amount = tournament.entryFee;
        
        // Generate unique order ID
        const orderId = generateId('ORDER');
        
        // Store order details in Firestore
        const orderData = {
            orderId: orderId,
            registrationId: registrationId,
            tournamentId: tournament.id,
            tournamentName: tournament.tournamentName,
            teamName: teamName,
            amount: amount,
            userId: currentUser.uid,
            userName: currentUser.name || currentUser.ownerName || 'User',
            userEmail: currentUser.email,
            userPhone: currentUser.phone || '',
            status: 'created',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('razorpay_orders').add(orderData);
        
        // Generate unique transaction ID
        const transactionId = generateTransactionId('RAZORPAY');
        
        // Store payment details
        const paymentData = {
            transactionId: transactionId,
            registrationId: registrationId,
            tournamentId: tournament.id,
            tournamentName: tournament.tournamentName,
            teamName: teamName,
            userId: currentUser.uid,
            userName: currentUser.name || currentUser.ownerName || 'User',
            userEmail: currentUser.email,
            userPhone: currentUser.phone || '',
            amount: amount,
            orderId: orderId,
            status: 'initiated',
            initiatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('tournament_payments').add(paymentData);
        
        hideLoading();
        
        // Open Razorpay Checkout
        const options = {
            key: RAZORPAY_KEY_ID,
            amount: Math.round(amount * 100), // Amount in paise
            currency: 'INR',
            name: 'BookMyGame',
            description: `Tournament Registration: ${tournament.tournamentName}`,
            image: 'https://bookmygame.com/logo.png',
            order_id: orderId,
            handler: async function(response) {
                // Payment successful - create registration
                await handleRazorpayPaymentSuccess(response, registrationId, tournament, teamName, amount, transactionId);
            },
            prefill: {
                name: currentUser.name || currentUser.ownerName || 'User',
                email: currentUser.email,
                contact: currentUser.phone || ''
            },
            notes: {
                registrationId: registrationId,
                tournamentId: tournament.id,
                tournamentName: tournament.tournamentName,
                teamName: teamName
            },
            theme: {
                color: '#2563eb'
            },
            modal: {
                ondismiss: function() {
                    // Payment cancelled - do NOT create registration
                    showToast('Payment cancelled', 'warning');
                    handleRazorpayPaymentCancelled(registrationId, transactionId);
                }
            }
        };
        
        const razorpay = new Razorpay(options);
        razorpay.open();
        
    } catch (error) {
        hideLoading();
        console.error('Razorpay payment error:', error);
        showToast('Payment initiation failed: ' + error.message, 'error');
        
        // Clean up any pending data
        sessionStorage.removeItem('pendingTournamentRegistration');
    }
}

// Handle Razorpay Payment Success
// ==================== HANDLE RAZORPAY PAYMENT SUCCESS (CREATE REGISTRATION AFTER PAYMENT) ====================

async function handleRazorpayPaymentSuccess(response, registrationId, tournament, teamName, amount, transactionId) {
    showLoading('Verifying payment and confirming registration...');
    
    try {
        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = response;
        
        // Get the pending registration from session storage
        const pendingRegistrationStr = sessionStorage.getItem('pendingTournamentRegistration');
        
        if (!pendingRegistrationStr) {
            throw new Error('Registration session not found. Please try again.');
        }
        
        const pendingRegistration = JSON.parse(pendingRegistrationStr);
        
        // Check if registration already exists to prevent duplicate
        const existingRegistration = await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS)
            .where('registrationId', '==', registrationId)
            .get();
        
        if (!existingRegistration.empty) {
            throw new Error('Registration already exists. Please check your bookings.');
        }
        
        // Check if tournament is still available
        const tournamentRef = db.collection(COLLECTIONS.TOURNAMENTS).doc(pendingRegistration.tournamentId);
        const tournamentDoc = await tournamentRef.get();
        
        if (!tournamentDoc.exists) {
            throw new Error('Tournament not found');
        }
        
        const tournamentData = tournamentDoc.data();
        
        // Verify tournament is still open
        if (tournamentData.registeredTeams && tournamentData.registeredTeams.length >= tournamentData.maxTeams) {
            throw new Error('Tournament is now full. Registration failed.');
        }
        
        const today = new Date();
        const startDate = new Date(tournamentData.startDate);
        if (startDate <= today) {
            throw new Error('Tournament has already started. Registration failed.');
        }
        
        // Create the registration record in Firestore (NOW after payment)
        const registrationData = {
            registrationId: pendingRegistration.registrationId,
            tournamentId: pendingRegistration.tournamentId,
            tournamentName: pendingRegistration.tournamentName,
            userId: pendingRegistration.userId,
            userName: pendingRegistration.userName,
            userEmail: pendingRegistration.userEmail,
            userPhone: pendingRegistration.userPhone,
            teamName: pendingRegistration.teamName,
            captainName: pendingRegistration.captainName,
            captainPhone: pendingRegistration.captainPhone,
            contactNumber: pendingRegistration.contactNumber,
            players: pendingRegistration.players,
            entryFee: pendingRegistration.entryFee,
            status: REGISTRATION_STATUS.CONFIRMED, // CONFIRMED immediately after payment
            paymentStatus: PAYMENT_STATUS.SUCCESS,
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature,
            paidAt: firebase.firestore.FieldValue.serverTimestamp(),
            registeredAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add registration to Firestore
        await db.collection(COLLECTIONS.TOURNAMENT_REGISTRATIONS).add(registrationData);
        
        // Update tournament with registered team
        await tournamentRef.update({
            registeredTeams: firebase.firestore.FieldValue.arrayUnion({
                teamName: pendingRegistration.teamName,
                userId: pendingRegistration.userId,
                userName: pendingRegistration.userName,
                captainName: pendingRegistration.captainName,
                players: pendingRegistration.players,
                registrationId: pendingRegistration.registrationId,
                status: REGISTRATION_STATUS.CONFIRMED,
                paymentStatus: PAYMENT_STATUS.SUCCESS,
                razorpayPaymentId: razorpay_payment_id,
                paidAt: new Date().toISOString(),
                registeredAt: new Date().toISOString()
            }),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Update payment record
        const paymentQuery = await db.collection('tournament_payments')
            .where('transactionId', '==', transactionId)
            .get();
        
        if (!paymentQuery.empty) {
            await paymentQuery.docs[0].ref.update({
                status: PAYMENT_STATUS.SUCCESS,
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id,
                razorpaySignature: razorpay_signature,
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                verifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Clear session storage
        sessionStorage.removeItem('pendingTournamentRegistration');
        sessionStorage.removeItem('pendingTournamentPayment');
        
        hideLoading();
        showToast('Payment successful! Tournament registration confirmed!', 'success');
        
        // Show success modal
        showRazorpaySuccessModal(pendingRegistration.registrationId, amount, tournament.tournamentName, pendingRegistration.teamName, razorpay_payment_id);
        
    } catch (error) {
        hideLoading();
        console.error('Payment verification error:', error);
        showToast('Payment verification failed. Please contact support with your payment details.', 'error');
        
        // Update payment as failed
        const paymentQuery = await db.collection('tournament_payments')
            .where('transactionId', '==', transactionId)
            .get();
        
        if (!paymentQuery.empty) {
            await paymentQuery.docs[0].ref.update({
                status: PAYMENT_STATUS.FAILED,
                errorMessage: error.message,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Show payment failed modal with option to retry
        showPaymentFailedModal();
    }
}

// Handle Razorpay Payment Cancelled
// ==================== HANDLE RAZORPAY PAYMENT CANCELLED ====================

async function handleRazorpayPaymentCancelled(registrationId, transactionId) {
    try {
        // Update payment record as failed
        const paymentQuery = await db.collection('tournament_payments')
            .where('transactionId', '==', transactionId)
            .get();
        
        if (!paymentQuery.empty) {
            await paymentQuery.docs[0].ref.update({
                status: PAYMENT_STATUS.FAILED,
                errorMessage: 'User cancelled payment',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Clear any pending registration data
        sessionStorage.removeItem('pendingTournamentRegistration');
        sessionStorage.removeItem('pendingTournamentPayment');
        
        // Do NOT create any registration record
        
        showToast('Payment cancelled. No registration was created.', 'info');
        
    } catch (error) {
        console.error('Error handling payment cancellation:', error);
    }
}

// Show Razorpay Success Modal
// ==================== SHOW RAZORPAY SUCCESS MODAL ====================

// ==================== SHOW RAZORPAY SUCCESS MODAL ====================

function showRazorpaySuccessModal(registrationId, amount, tournamentName, teamName, paymentId) {
    // Check if modal already exists
    let modal = document.getElementById('razorpay-success-modal');
    
    // Remove existing modal if present to avoid duplicates
    if (modal) {
        modal.remove();
    }
    
    // Get user email safely
    const userEmail = currentUser?.email || 'your email';
    const tournamentNameEscaped = escapeHtml(tournamentName || 'Tournament');
    const teamNameEscaped = escapeHtml(teamName || 'Team');
    
    const modalHtml = `
        <div id="razorpay-success-modal" class="modal">
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3><i class="fas fa-check-circle" style="color: var(--success);"></i> Registration Confirmed!</h3>
                    <button class="close-btn" id="close-razorpay-success-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, var(--success), #059669); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto var(--space-xl);">
                            <i class="fas fa-check-circle" style="font-size: 2.5rem; color: white;"></i>
                        </div>
                        <h3 style="font-size: var(--font-xl); margin-bottom: var(--space-md);">Payment Successful!</h3>
                        <p style="color: var(--gray-600); margin-bottom: var(--space-xl);">Your payment of ${formatCurrency(amount)} was successful. Your team is now officially registered for the tournament.</p>
                        
                        <div style="background: #f9fafb; border-radius: var(--radius); padding: var(--space-lg); text-align: left; margin-bottom: var(--space-xl); border: 1px solid #e5e7eb;">
                            <p><strong>🏆 Tournament:</strong> ${tournamentNameEscaped}</p>
                            <p><strong>👥 Team Name:</strong> ${teamNameEscaped}</p>
                            <p><strong>📋 Registration ID:</strong> ${registrationId}</p>
                            <p><strong>💳 Payment ID:</strong> ${paymentId}</p>
                            <p><strong>✅ Status:</strong> <span style="color: var(--success);">Confirmed</span></p>
                            <p><strong>📧 Confirmation sent to:</strong> ${userEmail}</p>
                        </div>
                        
                        <div style="background: #eff6ff; padding: var(--space-md); border-radius: var(--radius); margin-bottom: var(--space-xl); display: flex; align-items: center; gap: var(--space-sm);">
                            <i class="fas fa-info-circle" style="color: var(--primary);"></i>
                            <span style="color: var(--gray-700);">Your team has been added to the tournament roster. Check your bookings for details.</span>
                        </div>
                        
                        <div style="display: flex; gap: var(--space-md);">
                            <button id="view-tournament-btn" style="flex: 1; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fas fa-eye"></i> View Tournament
                            </button>
                            <button id="razorpay-go-home" style="flex: 1; background: #f3f4f6; color: #374151; border: none; border-radius: var(--radius); padding: var(--space-md); font-weight: 600; cursor: pointer; transition: all 0.2s ease;">
                                <i class="fas fa-home"></i> Go Home
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Get modal element after insertion
    modal = document.getElementById('razorpay-success-modal');
    
    // Add close button event listener
    const closeBtn = document.getElementById('close-razorpay-success-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeModal('razorpay-success-modal');
            goHome();
        });
    }
    
    // Add view tournament button event listener
    const viewTournamentBtn = document.getElementById('view-tournament-btn');
    if (viewTournamentBtn) {
        viewTournamentBtn.addEventListener('click', () => {
            closeModal('razorpay-success-modal');
            if (currentTournament) {
                viewTournamentDetails(currentTournament.id);
            } else {
                goHome();
            }
        });
    }
    
    // Add go home button event listener
    const goHomeBtn = document.getElementById('razorpay-go-home');
    if (goHomeBtn) {
        goHomeBtn.addEventListener('click', () => {
            closeModal('razorpay-success-modal');
            goHome();
        });
    }
    
    // Show modal
    if (modal) {
        modal.classList.add('active');
    }
    
    // Add hover effects for buttons
    const viewBtn = document.getElementById('view-tournament-btn');
    const homeBtn = document.getElementById('razorpay-go-home');
    
    if (viewBtn) {
        viewBtn.addEventListener('mouseenter', () => {
            viewBtn.style.transform = 'translateY(-2px)';
            viewBtn.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
        });
        viewBtn.addEventListener('mouseleave', () => {
            viewBtn.style.transform = 'translateY(0)';
            viewBtn.style.boxShadow = 'none';
        });
    }
    
    if (homeBtn) {
        homeBtn.addEventListener('mouseenter', () => {
            homeBtn.style.transform = 'translateY(-2px)';
            homeBtn.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
        });
        homeBtn.addEventListener('mouseleave', () => {
            homeBtn.style.transform = 'translateY(0)';
            homeBtn.style.boxShadow = 'none';
        });
    }
}

// Make it available globally
window.testCanAddGround = testCanAddGround;

// Make it available globally
window.debugOwnerData = debugOwnerData;
window.approveTournamentRegistration = approveTournamentRegistration;
window.rejectTournamentRegistration = rejectTournamentRegistration;
window.blockOwner = blockOwner;
window.unblockOwner = unblockOwner;
window.showPayoutDetails = showPayoutDetails;
window.viewTournamentDetails = viewTournamentDetails;
window.showTournamentRegistration = showTournamentRegistration;
window.showTournamentRegistrations = showTournamentRegistrations;
window.showEntryPass = showEntryPass;
window.requestPayout = requestPayout;
window.viewOwnerDetails = viewOwnerDetails;
window.approveVerification = approveVerification;
window.rejectVerification = rejectVerification;
window.approvePayout = approvePayout;
window.rejectPayout = rejectPayout;
window.showPayoutRequestModal = showPayoutRequestModal;
window.processRegistrationPayment = processRegistrationPayment;
window.blockAdmin = blockAdmin;
window.unblockAdmin = unblockAdmin;
window.showCreateAdminModal = showCreateAdminModal;
window.handleCreateAdmin = handleCreateAdmin;
window.blockOwner = blockOwner;
window.unblockOwner = unblockOwner;
window.viewOwnerDetails = viewOwnerDetails;
window.showPayoutDetails = showPayoutDetails;
window.viewTournamentDetails = viewTournamentDetails;
window.markPayoutAsPaid = markPayoutAsPaid;
// Make functions globally available for onclick handlers
window.showCreateMatchModal = showCreateMatchModal;
window.joinMatch = joinMatch;
window.createMatch = createMatch;
window.clearMatchFilters = clearMatchFilters;
window.filterAllMatches = filterAllMatches;
window.displayAllMatches = displayAllMatches;
window.MATCH_STATUS = MATCH_STATUS;
// Add to your window exports
window.approveTournamentRegistration = approveTournamentRegistration;
window.rejectTournamentRegistration = rejectTournamentRegistration;
window.showTournamentRegistrations = showTournamentRegistrations;
window.deleteTournament = deleteTournament;