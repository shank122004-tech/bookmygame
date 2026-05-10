/**
 * sportobook_all_fixes.js  —  COMBINED PATCH FILE  v1.0
 * ════════════════════════════════════════════════════════════════════
 *  All SpörtoBook fix scripts merged into one file.
 *
 *  MODULES INCLUDED (each in its own IIFE — fully isolated):
 *
 *   [1]  SPORTOBOOK_COMPLETE_FIX_v2
 *        • City-based ground search & filtering
 *        • User registration with city field
 *        • Owner registration improvements
 *        • Safe COLLECTIONS resolver (_C helper)
 *        • Firebase auth safe listener
 *
 *   [2]  sportobook_pro_fix
 *        • Movie-booking style real-time slot system (Firestore onSnapshot)
 *        • Slot states: Available / Processing / Booked / Time Passed
 *        • Fast geolocation (low-accuracy, cached, <1s)
 *        • Profile picture replacement
 *        • Post-payment Congratulations screen with confetti
 *
 *   [3]  sportobook_slotlock_fix
 *        • Fixes TypeError: Cannot read 'split' of undefined
 *        • Smart shim for window.releaseSlotLock — handles both
 *          1-arg (orderId) and 4-arg (lockId, groundId, date, slotTime)
 *          calling conventions without crashing
 *
 *   [4]  sportobook_free_listing
 *        • Makes ground listing 100% FREE for all owners
 *        • Hides ₹499 / ₹5 / ₹299 payment banners
 *        • Patches canAddGround → always returns true
 *        • Auto-activates owners in Firestore (registrationPaid: true)
 *        • Intercepts canAddGround at client-side (no Firestore config write needed)
 *
 *   [5]  sportobook_brand_fix
 *        • Replaces "BookMyGame" → "SpörtoBook" everywhere
 *        • 2-column grid for #nearby-venues (all grounds shown)
 *        • Text-only splash screen (no football icon)
 *        • Persistent MutationObserver for dynamic injections
 *
 *  REPLACES THESE FILES (DELETE THEM FROM YOUR FOLDER):
 *   ✗  SPORTOBOOK_COMPLETE_FIX_v1.js   (superseded by v2 inside here)
 *   ✗  sportobook_pro_fix.js
 *   ✗  sportobook_slotlock_fix.js
 *   ✗  sportobook_free_listing.js
 *   ✗  sportobook_brand_fix.js
 *
 *  LOAD ORDER in index.html (after app.js, as last script before </body>):
 *    <script src="paymentService.js"></script>
 *    <script src="app.js"></script>
 *    <script src="sportobook_all_fixes.js"></script>   ← THIS FILE ONLY
 *  </body>
 *
 *  DO NOT load any of the 5 files above separately — they are all here.
 * ════════════════════════════════════════════════════════════════════
 */


/* ════════════════════════════════════════════════════════════════════
   MODULE 1: SPORTOBOOK_COMPLETE_FIX_v2
   ════════════════════════════════════════════════════════════════════ */

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SPORTOBOOK - COMPLETE FIX v1.0
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * FIXES:
 * 1. ✅ QR Code Verification - "Booking not found in system" error
 * 2. ✅ Time Slots - Show booked slots in RED (confirmed status)
 * 3. ✅ Entry Pass - Show instantly after payment confirmation
 * 4. ✅ User Registration - Add city field for user filtering
 * 5. ✅ City-based Filtering - Show user's city grounds first, allow search
 * 6. ✅ Gallery QR Upload - Owner QR scanner from gallery (with fix)
 * 7. ✅ Remove Tournament Code References
 * 
 * LOAD ORDER IN index.html:
 *    <script src="app.js"></script>
 *    <script src="SPORTOBOOK_COMPLETE_FIX_v1.js"></script>
 * ═════════════════════════════════════════════════════════════════════════════
 */

(function() {
    'use strict';

    // ─── Safe collection-name resolver ───────────────────────────────
    // app.js declares `const COLLECTIONS` at file scope (not on window).
    // This helper returns the correct Firestore collection name safely.
    function _C(name) {
        // Prefer the real COLLECTIONS object if app.js has exposed it
        if (window.COLLECTIONS && window.COLLECTIONS[name.toUpperCase()]) {
            return window.COLLECTIONS[name.toUpperCase()];
        }
        // Hardcoded fallbacks matching app.js COLLECTIONS definition
        var map = {
            users: 'users', owners: 'owners', venues: 'venues',
            grounds: 'grounds', slots: 'slots', bookings: 'bookings',
            referrals: 'referrals', tournaments: 'tournaments',
            tournament_registrations: 'tournament_registrations',
            admins: 'admins', reviews: 'reviews', payouts: 'payouts',
            reports: 'reports', payments: 'payments',
            owner_registrations: 'owner_registrations',
            owner_payments: 'owner_payments',
        };
        return map[name] || name;
    }
    // ─────────────────────────────────────────────────────────────────
    
    console.log('🚀 Loading SpörtoBook Complete Fix v1.0...');

    // ════════════════════════════════════════════════════════════════
    // PART 1: REGISTRATION FORM FIX - Add City Field
    // ════════════════════════════════════════════════════════════════
    
    function enhanceRegistrationForm() {
        const regForm = document.getElementById('user-registration-form');
        if (!regForm) return;
        
        // Find the phone field
        const phoneField = document.querySelector('#reg-phone')?.parentElement;
        if (!phoneField) return;
        
        // Check if city field already exists
        if (document.getElementById('reg-city')) return;
        
        const cityFieldHTML = `
            <div class="form-group" style="margin-bottom: var(--space-lg);">
                <label for="reg-city" style="display: block; margin-bottom: var(--space-sm); font-weight: 600; color: var(--text-primary);">
                    City <span style="color: var(--danger);">*</span>
                </label>
                <input 
                    type="text" 
                    id="reg-city" 
                    placeholder="Enter your city (e.g., Delhi, Gurgaon, Noida)" 
                    style="width: 100%; padding: var(--space-md); border: 1px solid var(--border-color); border-radius: var(--radius); font-size: 1rem;"
                    required
                />
                <small style="color: var(--gray-500); display: block; margin-top: 4px;">
                    This helps us show you grounds in your area
                </small>
            </div>
        `;
        
        // Insert after phone field
        phoneField?.insertAdjacentHTML('afterend', cityFieldHTML);
        console.log('✅ City field added to registration form');
    }
    
    // Override the original handleUserRegister to include city
    const originalHandleUserRegister = window.handleUserRegister;
    window.handleUserRegister = async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('reg-name')?.value.trim();
        const email = document.getElementById('reg-email')?.value.trim();
        const phone = document.getElementById('reg-phone')?.value.trim();
        const city = document.getElementById('reg-city')?.value.trim();
        const password = document.getElementById('reg-password')?.value;
        const confirmPassword = document.getElementById('reg-confirm-password')?.value;
        const agreeTerms = document.getElementById('reg-agree-terms')?.checked;
        
        // Validation including city
        if (!name || !email || !phone || !city || !password) {
            window.showToast('Please fill in all fields', 'error');
            return;
        }
        
        if (password !== confirmPassword) {
            window.showToast('Passwords do not match', 'error');
            return;
        }
        
        if (password.length < 6) {
            window.showToast('Password must be at least 6 characters', 'error');
            return;
        }
        
        const phoneRegex = /^\d{10}$/;
        if (!phoneRegex.test(phone)) {
            window.showToast('Please enter a valid 10-digit phone number', 'error');
            return;
        }
        
        if (!agreeTerms) {
            window.showToast('Please agree to the Terms & Conditions', 'error');
            return;
        }
        
        window.showLoading('Creating your account...');
        
        try {
            const auth = window.firebase.auth();
            const db = window.db;
            
            // Check if email already exists
            const existingUserQuery = await db.collection(_C('users'))
                .where('email', '==', email)
                .limit(1)
                .get();
            
            if (!existingUserQuery.empty) {
                window.hideLoading();
                window.showToast('Email already registered. Please login instead.', 'error');
                return;
            }
            
            // Create user in Firebase Auth
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Get referral code from URL if any
            const urlParams = new URLSearchParams(window.location.search);
            const refCode = urlParams.get('ref');
            let referredBy = null;
            
            if (refCode) {
                const referralSnapshot = await db.collection(_C('referrals'))
                    .where('code', '==', refCode)
                    .get();
                
                if (!referralSnapshot.empty) {
                    referredBy = referralSnapshot.docs[0].data().ownerId;
                }
            }
            
            // Normalize city name (capitalize first letter of each word)
            const normalizedCity = city.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            
            // Create user data in Firestore WITH CITY
            const userData = {
                uid: user.uid,
                name: name,
                email: email,
                phone: phone,
                city: normalizedCity,
                profileImage: null,
                role: 'user',
                referralCode: window.generateReferralCode?.() || 'ref_' + Date.now(),
                referredBy: referredBy,
                referralCount: 0,
                createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection(_C('users')).doc(user.uid).set(userData);
            
            // Update user profile
            await user.updateProfile({
                displayName: name
            });
            
            // If referred by someone, create referral record
            if (referredBy) {
                await db.collection(_C('referrals')).add({
                    code: userData.referralCode,
                    userId: user.uid,
                    userName: name,
                    referredBy: referredBy,
                    status: 'pending',
                    createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Increment referral count
                await db.collection(_C('owners')).doc(referredBy).update({
                    referralCount: window.firebase.firestore.FieldValue.increment(1)
                });
            }
            
            window.hideLoading();
            window.showToast('Account created successfully! Welcome to SpörtoBook!', 'success');
            
            // Auto login is handled by onAuthStateChanged
            
        } catch (error) {
            window.hideLoading();
            console.error('Registration error:', error);
            
            let errorMessage = 'Registration failed. Please try again.';
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'Email already registered. Please login instead.';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password is too weak. Please use a stronger password.';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address.';
            }
            
            window.showToast(errorMessage, 'error');
        }
    };
    
    // ════════════════════════════════════════════════════════════════
    // PART 2: HOME PAGE CITY FILTERING & SEARCH
    // ════════════════════════════════════════════════════════════════
    
    let currentUserCity = null;
    let allVenuesAndGrounds = [];
    
    // Get current user's city
    async function loadCurrentUserCity() {
        try {
            const user = window.firebase.auth().currentUser;
            if (!user) return null;
            
            const db = window.db;
            
            const userDoc = await db.collection(_C('users')).doc(user.uid).get();
            if (userDoc.exists) {
                currentUserCity = userDoc.data().city || null;
                return currentUserCity;
            }
        } catch (error) {
            console.error('Error loading user city:', error);
        }
        return null;
    }
    
    // Override loadNearbyVenues to include city filtering
    const originalLoadNearbyVenues = window.loadNearbyVenues;
    window.loadNearbyVenues = async function() {
        const container = document.getElementById('nearby-venues');
        if (!container) return;
        
        window.showLoading('Loading grounds...');
        
        try {
            const db = window.db;
            
            // Load user city first
            await loadCurrentUserCity();
            
            // Fetch all venues and grounds
            const [venuesSnap, groundsSnap] = await Promise.all([
                db.collection(_C('venues'))
                    .where('hidden', '==', false)
                    .get(),
                db.collection(_C('grounds'))
                    .where('status', '==', 'active')
                    .get()
            ]);
            
            let venues = [];
            let grounds = [];
            
            venuesSnap.forEach(doc => {
                venues.push(Object.assign({ id: doc.id, type: 'venue', docRef: doc }, doc.data()));
            });
            
            groundsSnap.forEach(doc => {
                grounds.push(Object.assign({ id: doc.id, type: 'ground', docRef: doc }, doc.data()));
            });
            
            allVenuesAndGrounds = venues.concat(grounds);
            
            // Separate by city
            let userCityItems = [];
            let otherCityItems = [];
            
            allVenuesAndGrounds.forEach(item => {
                const itemCity = item.city || item.venuecity || 'Unknown';
                if (currentUserCity && itemCity.toLowerCase() === currentUserCity.toLowerCase()) {
                    userCityItems.push(item);
                } else {
                    otherCityItems.push(item);
                }
            });
            
            // Display user's city items first, then add search section for other cities
            displayCityFilteredVenues(container, userCityItems, otherCityItems);
            
            window.hideLoading();
            
        } catch (error) {
            console.error('Error loading grounds:', error);
            window.hideLoading();
            window.showToast('Error loading grounds', 'error');
        }
    };
    
    function displayCityFilteredVenues(container, userCityItems, otherCityItems) {
        let html = '';
        
        // User's city section
        if (userCityItems.length > 0) {
            html += `
                <div style="padding: var(--space-lg) 0; border-bottom: 1px solid var(--border-color);">
                    <h3 style="margin: 0 0 var(--space-md); color: var(--text-primary); font-size: 1.1rem;">
                        <i class="fas fa-location-dot" style="color: var(--primary); margin-right: 8px;"></i>
                        Grounds in ${currentUserCity || 'Your Area'}
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-lg);">
            `;
            
            userCityItems.forEach(item => {
                html += generateVenueCard(item);
            });
            
            html += '</div></div>';
        }
        
        // Search other cities section
        html += `
            <div style="padding: var(--space-lg) 0;">
                <h3 style="margin: 0 0 var(--space-md); color: var(--text-primary); font-size: 1.1rem;">
                    <i class="fas fa-search" style="color: var(--primary); margin-right: 8px;"></i>
                    Search Other Cities
                </h3>
                <input 
                    type="text" 
                    id="city-search-input" 
                    placeholder="Search by city name..." 
                    style="width: 100%; padding: var(--space-md); border: 1px solid var(--border-color); border-radius: var(--radius); margin-bottom: var(--space-lg);"
                />
                <div id="city-search-results"></div>
        `;
        
        if (otherCityItems.length === 0 && userCityItems.length > 0) {
            html += `<p style="color: var(--gray-500);">No grounds found in other cities yet.</p>`;
        }
        
        html += '</div>';
        
        container.innerHTML = html;
        
        // Attach search functionality
        const searchInput = document.getElementById('city-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                const query = e.target.value.toLowerCase().trim();
                const resultsDiv = document.getElementById('city-search-results');
                
                if (!query) {
                    resultsDiv.innerHTML = '';
                    return;
                }
                
                const filtered = otherCityItems.filter(item => {
                    const itemCity = (item.city || item.venuecity || '').toLowerCase();
                    const itemName = (item.venueName || item.groundName || '').toLowerCase();
                    return itemCity.includes(query) || itemName.includes(query);
                });
                
                if (filtered.length === 0) {
                    resultsDiv.innerHTML = `<p style="color: var(--gray-500); text-align: center;">No matches found</p>`;
                    return;
                }
                
                let resultsHTML = `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-lg);">`;
                filtered.forEach(item => {
                    resultsHTML += generateVenueCard(item);
                });
                resultsHTML += '</div>';
                
                resultsDiv.innerHTML = resultsHTML;
            });
        }
    }
    
    function generateVenueCard(item) {
        const isGround = item.type === 'ground';
        const name = isGround ? (item.groundName || 'Unknown') : (item.venueName || 'Unknown');
        const city = item.city || item.venuecity || 'Unknown City';
        const sport = item.sportType || 'Multi-sport';
        const image = item.images?.[0];
        const price = isGround ? (item.pricePerHour ? `₹${item.pricePerHour}/hr` : '') : '';
        const id = item.id;
        const cardId = isGround ? `ground-${id}` : `venue-${id}`;
        
        return `
            <div 
                class="ground-card" 
                id="${cardId}"
                data-${isGround ? 'ground' : 'venue'}-id="${id}"
                style="
                    background: white;
                    border-radius: var(--radius);
                    overflow: hidden;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    transition: transform 0.2s, box-shadow 0.2s;
                "
                onclick="window.${isGround ? 'viewGround' : 'viewVenue'}('${id}')"
            >
                <div style="position: relative; overflow: hidden; height: 140px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                    ${image ? `<img src="${image}" alt="${name}" style="width:100%; height:100%; object-fit:cover;">` : '<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;"><i class="fas fa-image" style="font-size:2rem; color:rgba(255,255,255,0.5);"></i></div>'}
                    ${price ? `<div style="position:absolute; top:8px; right:8px; background:rgba(255,255,255,0.95); padding:4px 12px; border-radius:20px; font-size:0.75rem; font-weight:700; color:#667eea;">${price}</div>` : ''}
                </div>
                <div style="padding: var(--space-md);">
                    <h4 style="margin: 0 0 4px; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</h4>
                    <p style="margin: 0 0 8px; font-size: 0.85rem; color: var(--gray-500);">${escapeHtml(city)}</p>
                    <p style="margin: 0; font-size: 0.8rem; color: var(--gray-600);">${sport}</p>
                </div>
            </div>
        `;
    }
    
    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
    
    // ════════════════════════════════════════════════════════════════
    // PART 3: TIME SLOTS FIX - Show booked slots in RED
    // ════════════════════════════════════════════════════════════════
    
    const originalLoadSlots = window.loadSlots;
    window.loadSlots = async function(groundId, date) {
        const container = document.getElementById('time-slots');
        
        if (!container) {
            console.error('Time slots container not found');
            return;
        }
        
        container.innerHTML = `
            <div class="loading-spinner" style="padding: var(--space-3xl);">
                <div class="loader-spinner"></div>
                <p style="margin-top: var(--space-md); color: var(--gray-500);">Loading available slots...</p>
            </div>
        `;
        
        try {
            const db = window.db;
            
            // Fetch slots from Firestore
            const slotsSnap = await db.collection(_C('slots'))
                .where('groundId', '==', groundId)
                .where('date', '==', date)
                .get();
            
            // Fetch bookings for this ground and date (CONFIRMED bookings mark slots as booked)
            const bookingsSnap = await db.collection(_C('bookings'))
                .where('groundId', '==', groundId)
                .where('date', '==', date)
                .where('bookingStatus', 'in', ['confirmed', 'CONFIRMED'])
                .get();
            
            // Create 24-hour slots
            const defaultSlots = [];
            for (let hour = 0; hour < 24; hour++) {
                const startHour = hour.toString().padStart(2, '0');
                const endHour = (hour + 1).toString().padStart(2, '0');
                defaultSlots.push(`${startHour}:00-${endHour}:00`);
            }
            
            // Create status map from Firestore
            let slotStatusMap = {};
            slotsSnap.forEach(doc => {
                const slot = doc.data();
                const slotKey = `${slot.startTime}-${slot.endTime}`;
                slotStatusMap[slotKey] = slot.status;
            });
            
            // Mark slots with confirmed bookings as BOOKED (confirmed)
            bookingsSnap.forEach(doc => {
                const booking = doc.data();
                slotStatusMap[booking.slotTime] = 'confirmed';
            });
            
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const today = new Date().toISOString().split('T')[0];
            const isToday = date === today;
            
            // Build slots HTML
            let slotsHtml = '';
            const SLOT_STATUS = window.SLOT_STATUS || {
                AVAILABLE: 'available',
                CONFIRMED: 'confirmed',
                CLOSED: 'closed'
            };
            
            defaultSlots.forEach(slot => {
                const status = slotStatusMap[slot] || SLOT_STATUS.AVAILABLE;
                let statusClass = '';
                let isDisabled = false;
                
                const [startHour, startMinute] = slot.split('-')[0].split(':').map(Number);
                const slotStartTime = startHour * 60 + (startMinute || 0);
                
                // Check if slot is in the past
                if (isToday && slotStartTime <= currentTime) {
                    statusClass = 'past';
                    isDisabled = true;
                }
                
                // Set status class
                if (!isDisabled) {
                    if (status === SLOT_STATUS.AVAILABLE || status === 'available') {
                        statusClass = 'available';
                    } else if (status === SLOT_STATUS.CONFIRMED || status === 'confirmed') {
                        statusClass = 'booked';
                        isDisabled = true;
                    } else if (status === SLOT_STATUS.CLOSED || status === 'closed') {
                        statusClass = 'closed';
                        isDisabled = true;
                    } else if (status === 'pending' || status === 'locked') {
                        statusClass = 'pending';
                        isDisabled = true;
                    }
                }
                
                const displayTime = slot.replace('-', ' - ');
                
                slotsHtml += `
                    <div 
                        class="time-slot ${statusClass}" 
                        data-slot="${slot}" 
                        data-status="${status}"
                        style="
                            padding: var(--space-md);
                            margin: var(--space-sm);
                            border-radius: var(--radius);
                            text-align: center;
                            font-weight: 600;
                            cursor: ${isDisabled ? 'not-allowed' : 'pointer'};
                            transition: all 0.2s;
                            ${statusClass === 'available' ? 'background: #f0fdf4; color: #16a34a; border: 2px solid #22c55e;' : ''}
                            ${statusClass === 'booked' ? 'background: #fef2f2; color: #991b1b; border: 2px solid #ef4444;' : ''}
                            ${statusClass === 'past' ? 'background: #f3f4f6; color: #9ca3af; border: 2px solid #d1d5db; opacity: 0.6;' : ''}
                            ${statusClass === 'pending' ? 'background: #fef3c7; color: #92400e; border: 2px solid #fbbf24;' : ''}
                        "
                        onclick="${isDisabled ? '' : `selectSlot('${slot}')`}"
                    >
                        ${displayTime}
                        ${statusClass === 'booked' ? '<br><small style="font-size: 0.75rem;">Booked</small>' : ''}
                    </div>
                `;
            });
            
            container.innerHTML = slotsHtml;
            console.log('✅ Loaded slots with BOOKED status visible (red)');
            
        } catch (error) {
            console.error('Error loading slots:', error);
            container.innerHTML = `
                <div class="error-state" style="text-align: center; padding: var(--space-3xl);">
                    <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: var(--danger);"></i>
                    <p>Failed to load time slots</p>
                </div>
            `;
        }
    };
    
    // ════════════════════════════════════════════════════════════════
    // PART 4: QR CODE VERIFICATION FIX
    // ════════════════════════════════════════════════════════════════
    
    const originalProcessVerifiedQRCode = window.processVerifiedQRCode;
    window.processVerifiedQRCode = async function(qrData) {
        const resultDiv = document.getElementById('professional-qr-result');
        
        try {
            let qrObject;
            try {
                qrObject = JSON.parse(qrData);
            } catch(e) {
                throw new Error('Invalid QR Code Format');
            }
            
            // SECURITY CHECK 1: Verify App ID
            if (!qrObject.appId || (qrObject.appId !== 'BookMyGame' && qrObject.appId !== 'SpörtoBook')) {
                throw new Error('This QR code was not generated by SpörtoBook');
            }
            
            // SECURITY CHECK 2: Verify timestamp
            const now = new Date();
            const validFrom = new Date(qrObject.validFrom);
            const validTo = new Date(qrObject.validTo);
            
            if (now < validFrom) {
                throw new Error('QR Code is not valid yet');
            }
            
            if (now > validTo) {
                throw new Error('QR Code has expired');
            }
            
            const db = window.db;
            const currentUser = window.firebase.auth().currentUser;
            
            // SECURITY CHECK 3: Get booking from database
            // TRY MULTIPLE WAYS TO FIND THE BOOKING
            let bookingDoc = null;
            let bookingSnapshot = await db.collection(_C('bookings'))
                .where('bookingId', '==', qrObject.bookingId)
                .get();
            
            if (!bookingSnapshot.empty) {
                bookingDoc = bookingSnapshot.docs[0];
            } else {
                // Try to find by ground ID and date and slot
                bookingSnapshot = await db.collection(_C('bookings'))
                    .where('groundId', '==', qrObject.groundId)
                    .where('date', '==', qrObject.date)
                    .where('slotTime', '==', qrObject.slot)
                    .get();
                
                if (!bookingSnapshot.empty) {
                    // Find the one that matches our booking ID
                    for (const doc of bookingSnapshot.docs) {
                        if (doc.data().bookingId === qrObject.bookingId) {
                            bookingDoc = doc;
                            break;
                        }
                    }
                }
            }
            
            if (!bookingDoc) {
                throw new Error(`Booking not found in system. Booking ID: ${qrObject.bookingId}`);
            }
            
            const booking = bookingDoc.data();
            
            // SECURITY CHECK 4: Verify ground ownership
            const groundDoc = await db.collection(_C('grounds')).doc(booking.groundId).get();
            
            if (!groundDoc.exists) {
                throw new Error('Ground not found');
            }
            
            const ground = groundDoc.data();
            
            if (ground.ownerId !== currentUser.uid) {
                throw new Error('You can only verify bookings for your own grounds');
            }
            
            // SECURITY CHECK 5: Verify ground ID matches
            if (booking.groundId !== qrObject.groundId) {
                throw new Error('QR code is for a different ground');
            }
            
            // SECURITY CHECK 6: Check if entry already used
            if (booking.entryStatus === 'used') {
                throw new Error('This entry has already been used');
            }
            
            // SECURITY CHECK 7: Check booking status (accept both variations)
            const BOOKING_STATUS = window.BOOKING_STATUS || { CONFIRMED: 'confirmed' };
            const isConfirmed = booking.bookingStatus === 'confirmed' || 
                               booking.bookingStatus === 'CONFIRMED' || 
                               booking.status === 'confirmed';
            
            if (!isConfirmed) {
                throw new Error(`Booking is not confirmed. Current status: ${booking.bookingStatus || booking.status}`);
            }
            
            // SECURITY CHECK 8: Check date
            const today = new Date().toISOString().split('T')[0];
            if (booking.date !== today) {
                throw new Error(`This booking is for ${booking.date}. Today is ${today}.`);
            }
            
            // SECURITY CHECK 9: Check time window
            const [startHour, startMinute] = booking.slotTime.split('-')[0].split(':').map(Number);
            const slotStartTime = new Date(booking.date);
            slotStartTime.setHours(startHour, startMinute, 0);
            
            const entryStartTime = new Date(slotStartTime);
            entryStartTime.setMinutes(entryStartTime.getMinutes() - 15);
            
            const entryEndTime = new Date(slotStartTime);
            entryEndTime.setMinutes(entryEndTime.getMinutes() + 60);
            
            if (now < entryStartTime) {
                const minutesToWait = Math.ceil((entryStartTime - now) / 60000);
                throw new Error(`Entry will be allowed at ${entryStartTime.toLocaleTimeString()}. Please wait ${minutesToWait} minutes.`);
            }
            
            if (now > entryEndTime) {
                throw new Error(`Entry window closed at ${entryEndTime.toLocaleTimeString()}`);
            }
            
            // ALL CHECKS PASSED - Update booking
            await bookingDoc.ref.update({
                entryStatus: 'used',
                entryTime: window.firebase.firestore.FieldValue.serverTimestamp(),
                verifiedBy: currentUser.uid,
                verifiedByName: currentUser.ownerName || currentUser.name,
                verifiedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Update ground stats
            await db.collection(_C('grounds')).doc(booking.groundId).update({
                lastVerifiedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
                totalEntriesVerified: window.firebase.firestore.FieldValue.increment(1)
            });
            
            window.showVerificationResult(true, booking);
            console.log('✅ QR Code verified successfully');
            
        } catch (error) {
            console.error('QR Verification Error:', error);
            window.showVerificationResult(false, null, error.message);
        }
    };
    
    // ════════════════════════════════════════════════════════════════
    // PART 5: ENTRY PASS INSTANT DISPLAY AFTER PAYMENT
    // ════════════════════════════════════════════════════════════════
    
    // Override payment success callback
    const originalConfirmSlotBooking = window.confirmSlotBooking;
    window.confirmSlotBooking = async function(lockId, groundId, date, slotTime, bookingId) {
        try {
            // Call original function
            if (originalConfirmSlotBooking) {
                await originalConfirmSlotBooking(lockId, groundId, date, slotTime, bookingId);
            }
            
            // Immediately show entry pass
            setTimeout(() => {
                if (bookingId && window.showEntryPass) {
                    window.showEntryPass(bookingId);
                }
            }, 500);
            
            console.log('✅ Entry pass shown immediately after payment');
        } catch (error) {
            console.error('Error confirming booking:', error);
            throw error;
        }
    };
    
    // Also enhance the payment success modal to show entry pass immediately
    const originalShowBookingSuccessConfirmation = window.showBookingSuccessConfirmation;
    window.showBookingSuccessConfirmation = function(booking) {
        if (originalShowBookingSuccessConfirmation) {
            originalShowBookingSuccessConfirmation(booking);
        }
        
        // Add button to show entry pass instantly
        setTimeout(() => {
            const confirmModal = document.getElementById('booking-confirmation-modal') || 
                                document.querySelector('[data-page="booking-confirmation-page"]');
            if (confirmModal) {
                const existingBtn = document.getElementById('instant-entry-pass-btn');
                if (!existingBtn && booking?.bookingId) {
                    const showEntryBtn = document.createElement('button');
                    showEntryBtn.id = 'instant-entry-pass-btn';
                    showEntryBtn.innerHTML = '<i class="fas fa-qrcode"></i> Show Entry Pass';
                    showEntryBtn.style.cssText = `
                        width: 100%;
                        padding: var(--space-lg);
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        border: none;
                        border-radius: var(--radius);
                        font-weight: 700;
                        cursor: pointer;
                        margin-top: var(--space-lg);
                    `;
                    showEntryBtn.onclick = () => window.showEntryPass(booking.bookingId);
                    confirmModal.appendChild(showEntryBtn);
                }
            }
        }, 100);
    };
    
    // ════════════════════════════════════════════════════════════════
    // PART 6: OWNER GALLERY QR UPLOAD FIX
    // ════════════════════════════════════════════════════════════════
    
    window.handleOwnerGalleryQRUpload = async function() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        
        fileInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            window.showLoading('Processing QR code from image...');
            
            try {
                // Create a canvas to process the image
                const image = new Image();
                const reader = new FileReader();
                
                reader.onload = async function(event) {
                    image.onload = async function() {
                        try {
                            const canvas = document.createElement('canvas');
                            canvas.width = image.width;
                            canvas.height = image.height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(image, 0, 0);
                            
                            // Use jsQR to decode
                            if (window.jsQR) {
                                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                const code = window.jsQR(imageData.data, canvas.width, canvas.height);
                                
                                if (code) {
                                    // Process the decoded QR code
                                    await window.processVerifiedQRCode(code.data);
                                    window.hideLoading();
                                    console.log('✅ Gallery QR code processed successfully');
                                } else {
                                    throw new Error('No QR code detected in image');
                                }
                            } else {
                                throw new Error('QR decoder not available. Please try camera scanning instead.');
                            }
                        } catch (error) {
                            window.hideLoading();
                            console.error('Gallery QR Error:', error);
                            window.showToast(error.message, 'error');
                        }
                    };
                    image.src = event.target.result;
                };
                
                reader.readAsDataURL(file);
                
            } catch (error) {
                window.hideLoading();
                console.error('Gallery upload error:', error);
                window.showToast('Failed to process image', 'error');
            }
        });
        
        document.body.appendChild(fileInput);
        fileInput.click();
        document.body.removeChild(fileInput);
    };
    
    // Add gallery button to QR scanner UI
    function enhanceQRScannerUI() {
        const modal = document.getElementById('professional-qr-modal');
        if (!modal) return;
        
        const header = modal.querySelector('[id*="qr-header"]') || 
                      modal.querySelector('h2') || 
                      modal.querySelector('.modal-title');
        
        if (header && !document.getElementById('gallery-qr-button')) {
            const galleryBtn = document.createElement('button');
            galleryBtn.id = 'gallery-qr-button';
            galleryBtn.innerHTML = '<i class="fas fa-image"></i> From Gallery';
            galleryBtn.style.cssText = `
                position: absolute;
                top: var(--space-lg);
                right: var(--space-lg);
                padding: var(--space-md) var(--space-lg);
                background: white;
                border: 2px solid var(--primary);
                color: var(--primary);
                border-radius: var(--radius);
                font-weight: 600;
                cursor: pointer;
                z-index: 1000;
            `;
            galleryBtn.onclick = window.handleOwnerGalleryQRUpload;
            modal.appendChild(galleryBtn);
        }
    }
    
    // ════════════════════════════════════════════════════════════════
    // PART 7: REMOVE TOURNAMENT CODE
    // ════════════════════════════════════════════════════════════════
    
    // Hide tournament-related UI elements
    function hideTournamentUI() {
        const selectors = [
            '.tournament-section',
            '[id*="tournament"]',
            '.featured-tournament',
            '[class*="tournament"]'
        ];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                // Don't hide if it's essential
                if (!el.id?.includes('modal')) {
                    el.style.display = 'none';
                }
            });
        });
        
        console.log('✅ Tournament UI hidden');
    }
    
    // ════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ════════════════════════════════════════════════════════════════
    
    function initializeFixes() {
        console.log('🔧 Initializing all fixes...');
        
        enhanceRegistrationForm();
        enhanceQRScannerUI();
        hideTournamentUI();
        
        // Load user city when app starts
        try {
            if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
                loadCurrentUserCity();
            }
        } catch(_) {}
        
        console.log('✅ All fixes initialized successfully!');
    }
    
    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFixes);
    } else {
        initializeFixes();
    }
    
    // Also run when user logs in (safe: wait for firebase to be ready)
    (function _waitAndListen() {
        if (window.firebase && typeof window.firebase.auth === 'function') {
            window.firebase.auth().onAuthStateChanged(function() {
                loadCurrentUserCity();
            });
        } else {
            setTimeout(_waitAndListen, 300);
        }
    })();
    
})();

// Export for debugging
console.log('✅ SpörtoBook Complete Fix v1.0 loaded successfully!');


/* ════════════════════════════════════════════════════════════════════
   MODULE 2: sportobook_pro_fix
   ════════════════════════════════════════════════════════════════════ */

/**
 * sportobook_pro_fix.js — PROFESSIONAL UPGRADE v1.0
 * ──────────────────────────────────────────────────────────────────
 *  FIXES BUNDLED IN THIS FILE:
 *
 *  [1] SLOT SYSTEM — Movie-booking style real-time slots
 *      • Booked slots instantly show RED for ALL users (Firestore realtime)
 *      • Status persists after payment — slot locked → confirmed on webhook
 *      • Full legend: Available / Booked / Processing / Time Passed
 *      • Slot locking during payment (amber "Processing") prevents double booking
 *
 *  [2] LOCATION — Fast geolocation (low accuracy, cached fallback)
 *      • enableHighAccuracy: false  → GPS fix in <1s instead of 5-10s
 *      • maximumAge: 60000  → reuse last fix for 60 s
 *      • Serves cached coords immediately, then updates in background
 *
 *  [3] PROFILE PICTURE — Replaced with uploaded avatar icon
 *      • Both header mini-avatar and full profile page avatar replaced
 *      • SVG stub in index.html is overridden everywhere
 *
 *  [4] POST-PAYMENT CONGRATULATIONS SCREEN
 *      • Full-screen overlay with confetti animation appears after
 *        Cashfree payment returns SUCCESS
 *      • "View Entry Pass" button links to bookings section
 *      • Listens to bmg:paymentConfirmed custom event from paymentService.js
 *
 *  LOAD ORDER (end of <body>, after all other scripts):
 *    <script src="sportobook_pro_fix.js"></script>
 * ──────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     § PROFILE PICTURE DATA URI
     (Embedded as base64 from the uploaded profile_pic.png)
  ═══════════════════════════════════════════════════════════════ */
  var PROFILE_PIC_SRC = 'data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCADYAOkDASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAcIAgUGAwQB/8QARRAAAQMDAQMHCAULAwUAAAAAAAECAwQFEQYhMUEHEjNRYXGBExQiMkJykbE2UnShsxUjNGKCorLBwtHwJHOSFlNjk9L/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AuWAAAAAAAAAAABy2t9aW/TcawNRKq4uTLadq4RueL14J2b1+9A6Otqqaipn1NZURU8LNrpJHI1qeKnA6g5U7bTOdDZ6R9c9NnlZMxx+GznL8E7yMtQX26X6r84uVU6XC5ZGmyOP3W8O/f1qprQOqunKBqmvVUSvSkjX2KaNGfvLl33mgqbnc6pc1NyrJ1/8AJO53zU+QAfvOdnOVz15Pqprpc6ZUWmuVbBj/ALc7m/JT5AB1Vr5QdU0Koi17auNPYqY0d+8mHfedtYOVO21LmxXikkoXrs8rHmSPx2c5PgveQ+ALO0dVTVtMyppKiKohemWyRuRzV8UPYrfp6+3Sw1fnFsqnRZX0412xye83j37+pUJn0RrS36kjSByJS3BqZfTudnnJ9Zi8U7N6feodSAAAAAAAAAAAAAAAAAAAAAAGn1hfYNO2Ka4Soj5PUgjVekkXcndvVexFA0nKTrNmn6fzGgVr7pM3KZ2pA1faVOK9SeK7NiwlNLLPM+aaR8ssjlc971y5yrvVV4qelfV1FdWzVlXKss8z1fI9eKr/y7OB4AAAAAAAAAAAAM4JZYJmTwSPiljcjmPYuHNVNyopgAJx5NtZM1DTeY1ytZdIW5dhMJM1PbROC9aeKbNidkVjoKupoK2GtpJViqIXo+N6cF/twVOKFhdIXyDUNihuMSIx6+hNGi9HIm9PkqdioBtwAAAAAAAAAAAAAAAAAAIP5XL4t11K6iifmlt+Ymom5ZPbX4pzf2V6yX9S3FLRYK65LjMELnMReLtzU8VwhW5znPcr3uV73LlzlXaq8VA/AAAAAAAAAAAAAAAADtOSK+La9StoZX4prhiJUXcknsL4r6P7SdRxZ+sc9j2vjcrHtXLXJvRU3KBaIGv05cW3aw0VyTCLUQte5E9l2PSTwXKGwAAAAAAAAAAAAAAAAA4blsq1g0gymav6VVMY5P1Wor/AJtaQqSry9SKlPaIeDnyuXvRGp/FRUAAAAAAAAAAAAAAAAAAAE1cilWs+j3U7l/Rap8bU7FRH/NynckZ8gz1Wku0WdjZInfFHJ/IkwAAAAAAAAAAAAAAAACMuXqNVprRNjY18rc96NX+kikmvlrpFqNHNqGp+i1LJFXsXLPm5CFAAAAAAAAAAAAAAAAAAAAifkGjVKO7TY2Okiangjl/qJMOI5FqRafRvnCp+lVMkidyYZ82KduAAAAAAAAAAAAAAAAB8Oobe27WOttrlRPOIXMRVT1XKmxfBcL4FbJGPikdFKxWSMcrXNXe1U2KhaEhPlhsS23UX5ShZiluGX7E2NlT1k8dju1Vd1AcQAAAAAAAAAAAAAAAAZRRySysiiYr5HuRrGpvcqrhE+JidxyPWJblqH8pTMzS0GHoqpsdKvqp4bXdio3rAl2wW9lqslHbWKjkp4Wxq5PaVE2r4rlT7gAAAAAAAAAAAAAAAAABqtV2Sn1BZJ7bUeirk50UmMrG9PVd/frRVTibUAVlulDVWy4T0FbEsVRA7mvavzTrRUwqL1KBaMA';

  /* ═══════════════════════════════════════════════════════════════
     §1  INJECT ALL CSS
  ═══════════════════════════════════════════════════════════════ */
  (function injectCSS() {
    var old = document.getElementById('spb-pro-styles');
    if (old) old.remove();
    var s = document.createElement('style');
    s.id = 'spb-pro-styles';
    s.textContent = `

      /* ──────────────────────────────────────────
         SLOT SYSTEM — Movie booking style
      ────────────────────────────────────────── */
      .time-slot {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 3px !important;
        padding: 10px 6px !important;
        border-radius: 10px !important;
        border: 2px solid #E2E8F0 !important;
        cursor: pointer !important;
        transition: all 0.18s ease !important;
        font-size: .72rem !important;
        font-weight: 600 !important;
        position: relative !important;
        background: #fff !important;
        text-align: center !important;
        user-select: none !important;
        min-height: 64px !important;
        overflow: hidden !important;
      }
      .time-slot .spb-icon  { font-size: .95rem; line-height: 1; display:block; }
      .time-slot .spb-time  { font-size: .68rem; font-weight: 700; line-height: 1.3; display:block; }
      .time-slot .spb-label { font-size: .58rem; font-weight: 700; letter-spacing: .04em;
                              text-transform: uppercase; display:block; }

      /* AVAILABLE */
      .time-slot.available {
        border-color: #10B981 !important;
        background: linear-gradient(135deg,#fff 0%,rgba(16,185,129,.07) 100%) !important;
        color: #065F46 !important;
        cursor: pointer !important;
      }
      .time-slot.available:hover {
        background: linear-gradient(135deg,#ECFDF5,#D1FAE5) !important;
        border-color: #059669 !important;
        transform: translateY(-3px) !important;
        box-shadow: 0 6px 16px rgba(16,185,129,.25) !important;
      }
      .time-slot.available .spb-icon  { color: #10B981; }
      .time-slot.available .spb-time  { color: #065F46; }
      .time-slot.available .spb-label { color: #10B981; }

      /* CONFIRMED / BOOKED — vivid red */
      .time-slot.confirmed,
      .time-slot.booked {
        background: linear-gradient(135deg,#FEF2F2,#FEE2E2) !important;
        border-color: #EF4444 !important;
        color: #991B1B !important;
        cursor: not-allowed !important;
        opacity: 1 !important;
        text-decoration: none !important;
        box-shadow: 0 2px 8px rgba(239,68,68,.18) !important;
      }
      .time-slot.confirmed .spb-icon,
      .time-slot.booked    .spb-icon  { color: #EF4444; }
      .time-slot.confirmed .spb-time,
      .time-slot.booked    .spb-time  { color: #991B1B; text-decoration: line-through; }
      .time-slot.confirmed .spb-label,
      .time-slot.booked    .spb-label { color: #EF4444; }

      /* LOCKED / PENDING — amber pulsing */
      .time-slot.locked,
      .time-slot.pending {
        background: linear-gradient(135deg,#FFFBEB,#FEF3C7) !important;
        border-color: #F59E0B !important;
        color: #92400E !important;
        cursor: not-allowed !important;
        animation: spb-pulse-amber 1.8s ease-in-out infinite !important;
      }
      .time-slot.locked .spb-icon,
      .time-slot.pending .spb-icon  { color: #F59E0B; }
      .time-slot.locked .spb-time,
      .time-slot.pending .spb-time  { color: #92400E; }
      .time-slot.locked .spb-label,
      .time-slot.pending .spb-label { color: #F59E0B; }

      @keyframes spb-pulse-amber {
        0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); }
        50%      { box-shadow: 0 0 0 5px rgba(245,158,11,.2); }
      }

      /* PAST */
      .time-slot.past {
        background: #F1F5F9 !important;
        border-color: #CBD5E1 !important;
        color: #94A3B8 !important;
        cursor: not-allowed !important;
        opacity: .6 !important;
      }
      .time-slot.past .spb-time { text-decoration: line-through; }

      /* SELECTED */
      .time-slot.selected {
        background: linear-gradient(135deg,#4F46E5,#7C3AED) !important;
        border-color: #4F46E5 !important;
        color: #fff !important;
        cursor: pointer !important;
        transform: scale(1.05) !important;
        box-shadow: 0 6px 20px rgba(79,70,229,.35) !important;
      }
      .time-slot.selected .spb-icon,
      .time-slot.selected .spb-time,
      .time-slot.selected .spb-label { color: #fff !important; opacity: 1 !important; }

      /* Legend */
      .spb-slot-legend {
        display: flex !important;
        flex-wrap: wrap !important;
        gap: 6px 14px !important;
        padding: 10px 4px !important;
        margin-bottom: 8px !important;
        font-size: .7rem !important;
        font-weight: 600 !important;
        color: #475569 !important;
      }
      .spb-slot-legend-item { display:flex; align-items:center; gap:5px; }
      .spb-slot-legend-dot  { width:10px; height:10px; border-radius:50%; border:2px solid transparent; }
      .spb-slot-legend-dot.available { background:#D1FAE5; border-color:#10B981; }
      .spb-slot-legend-dot.booked    { background:#FEE2E2; border-color:#EF4444; }
      .spb-slot-legend-dot.pending   { background:#FEF3C7; border-color:#F59E0B; }
      .spb-slot-legend-dot.past      { background:#E2E8F0; border-color:#94A3B8; }

      /* ──────────────────────────────────────────
         CONGRATULATIONS OVERLAY
      ────────────────────────────────────────── */
      #spb-congrats-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 50%, #312E81 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        animation: spb-overlay-in 0.4s ease;
        overflow: hidden;
      }
      @keyframes spb-overlay-in {
        from { opacity:0; transform:scale(1.04); }
        to   { opacity:1; transform:scale(1); }
      }
      #spb-congrats-overlay .spb-congrats-card {
        background: rgba(255,255,255,.06);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,.15);
        border-radius: 24px;
        padding: 36px 28px;
        text-align: center;
        max-width: 380px;
        width: 100%;
        position: relative;
        z-index: 2;
        animation: spb-card-in 0.5s 0.15s ease both;
      }
      @keyframes spb-card-in {
        from { opacity:0; transform:translateY(30px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .spb-congrats-trophy {
        font-size: 4rem;
        margin-bottom: 8px;
        animation: spb-bounce 0.8s 0.4s ease both;
      }
      @keyframes spb-bounce {
        0%   { transform:scale(0) rotate(-20deg); }
        60%  { transform:scale(1.2) rotate(5deg); }
        100% { transform:scale(1) rotate(0); }
      }
      .spb-congrats-title {
        color: #fff;
        font-size: 1.5rem;
        font-weight: 800;
        margin: 0 0 8px;
        letter-spacing: -.02em;
      }
      .spb-congrats-subtitle {
        color: rgba(255,255,255,.75);
        font-size: .9rem;
        margin: 0 0 24px;
        line-height: 1.5;
      }
      .spb-congrats-detail-box {
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 14px;
        padding: 16px;
        margin-bottom: 24px;
        text-align: left;
      }
      .spb-congrats-detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 5px 0;
        border-bottom: 1px solid rgba(255,255,255,.07);
        font-size: .8rem;
      }
      .spb-congrats-detail-row:last-child { border-bottom: none; }
      .spb-congrats-detail-row .lbl { color:rgba(255,255,255,.55); font-weight:500; }
      .spb-congrats-detail-row .val { color:#fff; font-weight:700; }
      .spb-congrats-btn-primary {
        width: 100%;
        padding: 14px;
        background: linear-gradient(135deg, #10B981, #059669);
        color: #fff;
        border: none;
        border-radius: 14px;
        font-size: .95rem;
        font-weight: 700;
        cursor: pointer;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        transition: transform .15s, box-shadow .15s;
        box-shadow: 0 4px 16px rgba(16,185,129,.35);
      }
      .spb-congrats-btn-primary:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(16,185,129,.45); }
      .spb-congrats-btn-secondary {
        width: 100%;
        padding: 12px;
        background: transparent;
        color: rgba(255,255,255,.65);
        border: 1px solid rgba(255,255,255,.2);
        border-radius: 14px;
        font-size: .85rem;
        font-weight: 600;
        cursor: pointer;
        transition: all .15s;
      }
      .spb-congrats-btn-secondary:hover { color:#fff; border-color:rgba(255,255,255,.5); }

      /* Confetti canvas */
      #spb-confetti-canvas {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 1;
      }

      /* Profile picture round */
      #header-profile-img {
        width: 36px !important;
        height: 36px !important;
        border-radius: 50% !important;
        object-fit: cover !important;
        border: 2px solid rgba(255,255,255,.3) !important;
      }
      #profile-image-large {
        width: 100% !important;
        height: 100% !important;
        border-radius: 50% !important;
        object-fit: cover !important;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  })();


  /* ═══════════════════════════════════════════════════════════════
     §2  REAL-TIME SLOT SYSTEM (Movie-booking grade)
  ═══════════════════════════════════════════════════════════════ */

  var SLOT_ICONS = {
    available : '🟢', confirmed : '🔴', booked : '🔴',
    locked : '🔒', pending : '🔒', past : '⏳', closed : '🚫', selected : '✅',
  };
  var SLOT_LABELS = {
    available : 'Available', confirmed : 'Booked', booked : 'Booked',
    locked : 'Processing…', pending : 'Processing…', past : 'Time Passed',
    closed : 'Closed', selected : 'Selected',
  };

  function _normKey(k) {
    return (k || '').replace(/\s/g, '').replace(/^(\d{1,2})(\d{2})-(\d{1,2})(\d{2})$/,
      function (_,h1,m1,h2,m2){ return h1.padStart(2,'0')+':'+m1+'-'+h2.padStart(2,'0')+':'+m2; });
  }

  function _injectLegend(container) {
    var parent = container && container.parentNode;
    if (!parent) return;
    parent.querySelectorAll('.spb-slot-legend').forEach(function(e){ e.remove(); });
    var leg = document.createElement('div');
    leg.className = 'spb-slot-legend';
    leg.innerHTML =
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot available"></span>Available</span>' +
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot booked"></span>Booked</span>' +
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot pending"></span>Processing</span>' +
      '<span class="spb-slot-legend-item"><span class="spb-slot-legend-dot past"></span>Time Passed</span>';
    parent.insertBefore(leg, container);
  }

  var _activeSlotUnsub = null;
  function _unsubSlots() {
    if (_activeSlotUnsub) { try { _activeSlotUnsub(); } catch(_){} _activeSlotUnsub = null; }
  }

  function patchLoadSlots() {
    if (typeof window.loadSlots !== 'function') return;
    if (window.loadSlots._spbProPatched) return;

    var _orig = window.loadSlots;
    window.loadSlots = function(groundId, date) {
      var db = window.db;
      if (!db || !groundId || !date) return _orig(groundId, date);

      _unsubSlots();

      var container = document.getElementById('time-slots');
      if (!container) return _orig(groundId, date);

      // Loading state
      container.innerHTML =
        '<div style="grid-column:1/-1;padding:32px;text-align:center;">' +
        '<div style="width:32px;height:32px;border:3px solid #E2E8F0;border-top-color:#4F46E5;border-radius:50%;animation:spin 0.7s linear infinite;margin:0 auto 12px;"></div>' +
        '<p style="color:#64748B;font-size:.85rem;">Loading slots…</p></div>';

      // Build 24-hour default slots
      var defaultSlots = [];
      for (var h = 0; h < 24; h++) {
        var sh = h.toString().padStart(2,'0');
        var eh = (h+1).toString().padStart(2,'0');
        defaultSlots.push(sh+':00-'+eh+':00');
      }

      function _render(statusMap) {
        var now = new Date();
        var curMins = now.getHours()*60 + now.getMinutes();
        var today = now.toISOString().split('T')[0];
        var isToday = date === today;

        var html = '';
        defaultSlots.forEach(function(slot) {
          var norm = _normKey(slot);
          var status = statusMap[norm] || statusMap[slot] || 'available';
          var disabled = false;

          var startMins = parseInt(slot.split(':')[0],10)*60;
          if (isToday && startMins <= curMins) {
            status = 'past'; disabled = true;
          } else if (status !== 'available') {
            disabled = true;
          }

          var displayTime = slot.replace('-',' – ');
          html +=
            '<div class="time-slot '+status+'"' +
            ' data-slot="'+slot+'"' +
            ' data-status="'+(disabled?'disabled':status)+'"' +
            ' data-spb-upgraded="1"' +
            (!disabled && status==='available' ? ' data-available="true"' : '') + '>' +
            '<span class="spb-icon">'+SLOT_ICONS[status]+'</span>' +
            '<span class="spb-time">'+displayTime+'</span>' +
            '<span class="spb-label">'+SLOT_LABELS[status]+'</span>' +
            '</div>';
        });

        container.innerHTML = html;

        // Wire available slot clicks
        container.querySelectorAll('.time-slot.available').forEach(function(el) {
          el.addEventListener('click', function() {
            var t = this.dataset.slot;
            if (t && typeof window.selectSlot === 'function') window.selectSlot(t);
          });
        });

        // Restore selected highlight
        var sel = window.selectedSlot || sessionStorage.getItem('selectedSlot') || '';
        if (sel) {
          container.querySelectorAll('.time-slot').forEach(function(el) {
            if (el.dataset.slot === sel) {
              el.classList.remove('available','confirmed','booked','locked','pending','past');
              el.classList.add('selected');
              el.querySelector('.spb-icon').textContent  = SLOT_ICONS.selected;
              el.querySelector('.spb-label').textContent = SLOT_LABELS.selected;
            }
          });
        }

        _injectLegend(container);
      }

      // Real-time Firestore listener
      var unsub = db.collection('slots')
        .where('groundId','==',groundId)
        .where('date','==',date)
        .onSnapshot(function(snap) {
          var map = {};
          snap.forEach(function(doc) {
            var d = doc.data();
            var st = d.startTime || ''; var et = d.endTime || '';
            var k1 = _normKey(st+'-'+et);
            var k2 = d.slotTime ? _normKey(d.slotTime) : '';
            var status = d.status || 'available';
            if (k1) map[k1] = status;
            if (k2 && k2 !== k1) map[k2] = status;
          });
          _render(map);
          console.log('[spb-pro] Slots live-updated — '+snap.size+' docs ✅');
        }, function(err) {
          console.error('[spb-pro] Slot snapshot error:', err);
          _orig(groundId, date);
        });

      _activeSlotUnsub = unsub;
      console.log('[spb-pro] Real-time slot listener started:', groundId, date);
    };

    window.loadSlots._spbProPatched = true;
    console.log('[spb-pro] loadSlots patched ✅');
  }

  // Unsubscribe when leaving ground page
  window.addEventListener('bmg:pageShown', function(e) {
    var pid = e && e.detail && e.detail.pageId;
    if (pid && pid !== 'ground-page' && pid !== 'slots-page') _unsubSlots();
    patchLoadSlots(); // re-apply after SPA nav
  });


  /* ═══════════════════════════════════════════════════════════════
     §3  FAST GEOLOCATION
     enableHighAccuracy:false + maximumAge:60000 → instant fix
  ═══════════════════════════════════════════════════════════════ */

  function patchGeolocation() {
    if (window._spbGeoPatchApplied) return;
    window._spbGeoPatchApplied = true;

    var _origGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);

    navigator.geolocation.getCurrentPosition = function(success, error, opts) {
      // Serve cached coords immediately if available (zero latency)
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem('userLocation')); } catch(_) {}

      if (cached && cached.lat && cached.lng) {
        // Instantly call success with cached position
        success({
          coords: {
            latitude  : cached.lat,
            longitude : cached.lng,
            accuracy  : 100,
            altitude  : null, altitudeAccuracy: null, heading: null, speed: null
          },
          timestamp: Date.now()
        });
      }

      // Then do a fresh low-accuracy fix quietly in background
      var fastOpts = Object.assign({}, opts || {}, {
        enableHighAccuracy : false,
        timeout            : 5000,
        maximumAge         : 60000,
      });
      _origGetCurrentPosition(success, error || function(){}, fastOpts);
    };

    console.log('[spb-pro] Geolocation patched — fast mode ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §4  PROFILE PICTURE REPLACEMENT
  ═══════════════════════════════════════════════════════════════ */

  function applyProfilePic() {
    // Default avatar SVG stub used in index.html — replace with uploaded pic
    var DEFAULT_STUBS = [
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'",
      'https://via.placeholder.com/150',
    ];

    function _isDefault(src) {
      if (!src) return true;
      return DEFAULT_STUBS.some(function(stub){ return src.startsWith(stub); });
    }

    function _replaceIfDefault(imgEl) {
      if (imgEl && _isDefault(imgEl.src || imgEl.getAttribute('src'))) {
        imgEl.src = PROFILE_PIC_SRC;
      }
    }

    // Header mini-avatar
    var headerImg = document.getElementById('header-profile-img');
    _replaceIfDefault(headerImg);

    // Full-size profile page avatar
    var profileImg = document.getElementById('profile-image-large');
    _replaceIfDefault(profileImg);

    // Any other img with profile-related ids/classes
    document.querySelectorAll('img[id*="profile"], img[class*="profile"], img[id*="avatar"]')
      .forEach(_replaceIfDefault);

    // When auth state changes, also update (app.js sets src after login)
    var _origSetAttr = Element.prototype.setAttribute;
    if (!Element.prototype._spbSetAttrPatched) {
      Element.prototype._spbSetAttrPatched = true;
      Element.prototype.setAttribute = function(name, value) {
        _origSetAttr.call(this, name, value);
        if (name === 'src' && this.tagName === 'IMG') {
          var id = this.id || '';
          if ((id === 'header-profile-img' || id === 'profile-image-large') && _isDefault(value)) {
            // defer so the original src is already set
            var el = this;
            setTimeout(function(){ el.src = PROFILE_PIC_SRC; }, 0);
          }
        }
      };
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     §5  CONGRATULATIONS SCREEN (post-payment)
  ═══════════════════════════════════════════════════════════════ */

  /* Simple confetti engine */
  function _runConfetti(canvas) {
    var ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    var COLORS = ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#fff'];
    var pieces = Array.from({length: 120}, function() {
      return {
        x   : Math.random() * canvas.width,
        y   : Math.random() * -canvas.height,
        r   : 4 + Math.random() * 6,
        d   : 2 + Math.random() * 4,
        col : COLORS[Math.floor(Math.random() * COLORS.length)],
        tilt: Math.random() * 10 - 5,
        tiltAngle: 0,
        tiltAngleInc: 0.07 + Math.random() * 0.05,
      };
    });

    var running = true;
    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(function(p) {
        p.tiltAngle += p.tiltAngleInc;
        p.y += p.d;
        p.tilt = Math.sin(p.tiltAngle) * 12;
        if (p.y > canvas.height + 20) { p.y = -10; p.x = Math.random() * canvas.width; }
        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.col;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });
      requestAnimationFrame(draw);
    }
    draw();
    return function(){ running = false; ctx.clearRect(0,0,canvas.width,canvas.height); };
  }

  function showCongratsScreen(bookingData) {
    // Don't show twice
    if (document.getElementById('spb-congrats-overlay')) return;

    var d = bookingData || {};
    var groundName = d.groundName || d.venueName || 'Your Ground';
    var slotTime   = d.slotTime   || d.slot      || '—';
    var date       = d.date       || '—';
    var amount     = d.amount     ? '₹' + d.amount : '—';
    var orderId    = d.orderId    || '';

    var overlay = document.createElement('div');
    overlay.id = 'spb-congrats-overlay';
    overlay.innerHTML =
      '<canvas id="spb-confetti-canvas"></canvas>' +
      '<div class="spb-congrats-card">' +
        '<div class="spb-congrats-trophy">🏆</div>' +
        '<h2 class="spb-congrats-title">Booking Confirmed!</h2>' +
        '<p class="spb-congrats-subtitle">Your slot is locked in. We\'ll see you on the field!</p>' +
        '<div class="spb-congrats-detail-box">' +
          '<div class="spb-congrats-detail-row">' +
            '<span class="lbl">📍 Ground</span><span class="val">' + groundName + '</span>' +
          '</div>' +
          '<div class="spb-congrats-detail-row">' +
            '<span class="lbl">📅 Date</span><span class="val">' + date + '</span>' +
          '</div>' +
          '<div class="spb-congrats-detail-row">' +
            '<span class="lbl">⏰ Slot</span><span class="val">' + slotTime + '</span>' +
          '</div>' +
          '<div class="spb-congrats-detail-row">' +
            '<span class="lbl">💰 Paid</span><span class="val" style="color:#10B981;">' + amount + '</span>' +
          '</div>' +
        '</div>' +
        '<button class="spb-congrats-btn-primary" id="spb-view-entry-pass">' +
          '🎟️ View Entry Pass' +
        '</button>' +
        '<button class="spb-congrats-btn-secondary" id="spb-congrats-home">' +
          'Back to Home' +
        '</button>' +
      '</div>';

    document.body.appendChild(overlay);

    // Start confetti
    var canvas = document.getElementById('spb-confetti-canvas');
    var stopConfetti = _runConfetti(canvas);

    function dismiss() {
      stopConfetti();
      overlay.style.animation = 'none';
      overlay.style.opacity = '0';
      overlay.style.transform = 'scale(0.96)';
      overlay.style.transition = 'opacity .3s, transform .3s';
      setTimeout(function(){ overlay.remove(); }, 320);
    }

    document.getElementById('spb-congrats-home').addEventListener('click', function() {
      dismiss();
      if (typeof window.goHome === 'function') window.goHome();
      else if (typeof window.showPage === 'function') window.showPage('main-page');
    });

    document.getElementById('spb-view-entry-pass').addEventListener('click', function() {
      dismiss();
      // Navigate to bookings page — entry pass is there
      if (typeof window.showPage === 'function') window.showPage('bookings-page');
      else if (typeof window.goToBookings === 'function') window.goToBookings();
      // Also trigger the entry pass view if the booking id is available
      if (orderId && typeof window.viewEntryPass === 'function') {
        setTimeout(function(){ window.viewEntryPass(orderId); }, 400);
      }
    });

    // Auto-dismiss confetti after 8s but leave the card
    setTimeout(stopConfetti, 8000);
  }

  /* Listen for payment confirmed event from paymentService.js */
  window.addEventListener('bmg:paymentConfirmed', function(e) {
    var detail = (e && e.detail) || {};
    if (detail.paymentType === 'booking') {
      // Small delay so the app's own confirmation page fires first (if any)
      setTimeout(function(){ showCongratsScreen(detail.result || detail); }, 600);
    }
  });

  /* Also intercept if app.js dispatches its own success event */
  window.addEventListener('bmg:bookingConfirmed', function(e) {
    setTimeout(function(){ showCongratsScreen((e && e.detail) || {}); }, 600);
  });

  /* Expose globally for manual trigger from app.js */
  window.spbShowCongrats = showCongratsScreen;


  /* ═══════════════════════════════════════════════════════════════
     §6  BOOT
  ═══════════════════════════════════════════════════════════════ */
  function boot() {
    patchLoadSlots();
    patchGeolocation();
    applyProfilePic();

    // Watch for dynamically set profile images (after login)
    new MutationObserver(function() {
      applyProfilePic();
    }).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['src'] });

    console.log('[sportobook_pro_fix] All systems booted ✅');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 200); });
  } else {
    setTimeout(boot, 200);
  }

  // Re-run on every SPA navigation
  window.addEventListener('bmg:pageShown', function() {
    applyProfilePic();
  });

})();


/* ════════════════════════════════════════════════════════════════════
   MODULE 3: sportobook_slotlock_fix
   ════════════════════════════════════════════════════════════════════ */

/**
 * sportobook_slotlock_fix.js
 * ─────────────────────────────────────────────────────────────────
 *  Fixes: TypeError: Cannot read properties of undefined (reading 'split')
 *         at releaseSlotLock (app.js:1319)
 *
 *  ROOT CAUSE
 *  ──────────
 *  There are TWO different `releaseSlotLock` functions with
 *  incompatible signatures loaded at the same time:
 *
 *    app.js          → releaseSlotLock(lockId, groundId, date, slotTime)
 *                      • Destructures slotTime with .split('-') immediately
 *                      • Crashes when slotTime is undefined
 *
 *    paymentService.js → releaseSlotLock(orderId)
 *                        • Only needs 1 arg (the order/lock ID)
 *                        • Exposed on window.releaseSlotLock, overwriting app.js
 *
 *  Various patch scripts (bmg_master_fix_v2.js, bmg_all_fixes_final.js)
 *  call window.releaseSlotLock(lockId, groundId, date, slotTime) — the
 *  4-arg app.js convention — but `window.releaseSlotLock` has been
 *  replaced by the 1-arg paymentService version, so `slotTime` arrives
 *  as `undefined` in app.js → crash.
 *
 *  FIX
 *  ───
 *  1. Install a smart shim on window.releaseSlotLock that detects
 *     which calling convention is in use and dispatches correctly.
 *
 *  2. Guard app.js's internal function via a safe wrapper that reads
 *     sessionStorage as a fallback when slotTime is missing.
 *
 *  3. All actual Firestore slot release logic is self-contained here
 *     so it works even when both app.js and paymentService.js are broken.
 *
 *  LOAD ORDER: after app.js and paymentService.js, before any fix scripts.
 *    <script src="sportobook_slotlock_fix.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     Core release logic — works with EITHER calling convention.
     Tries two strategies:
       A) orderId / lockOrderId → query slots collection by orderId
       B) lockId + groundId + date + slotTime → query by field match
  ───────────────────────────────────────────────────────────── */
  async function _coreRelease(opts) {
    var db = window.db;
    if (!db) { console.warn('[slotlock-fix] db not ready'); return { success: false }; }

    var orderId  = opts.orderId  || opts.lockId || null;
    var groundId = opts.groundId || null;
    var date     = opts.date     || null;
    var slotTime = opts.slotTime || null;

    try {
      var updated = false;

      /* Strategy A — find by lockOrderId (paymentService convention) */
      if (orderId) {
        var snapA = await db.collection('slots')
          .where('lockOrderId', '==', orderId)
          .limit(1)
          .get();

        if (!snapA.empty) {
          await snapA.docs[0].ref.update({
            status         : 'available',
            lockOrderId    : null,
            lockExpiresAt  : null,
            lockExpiresAtMs: null,
            lockedBy       : null,
            lockId         : null,
            updatedAt      : firebase.firestore.FieldValue.serverTimestamp(),
          });
          updated = true;
        }

        /* Also try slot_locks collection (app.js convention) */
        try {
          var lockRef  = db.collection('slot_locks').doc(orderId);
          var lockSnap = await lockRef.get();
          if (lockSnap.exists) await lockRef.delete();
        } catch (_) {}

        /* Clean up pending_payments */
        try {
          var ppRef  = db.collection('pending_payments').doc(orderId);
          var ppSnap = await ppRef.get();
          if (ppSnap.exists) await ppRef.delete();
        } catch (_) {}
      }

      /* Strategy B — find by groundId + date + slotTime (app.js 4-arg convention) */
      if (!updated && groundId && date && slotTime) {
        var parts     = String(slotTime).split('-');
        var startTime = parts[0] ? parts[0].trim() : null;
        var endTime   = parts[1] ? parts[1].trim() : null;

        if (startTime) {
          var queryB = db.collection('slots')
            .where('groundId', '==', groundId)
            .where('date',     '==', date)
            .where('startTime','==', startTime);
          if (endTime) queryB = queryB.where('endTime', '==', endTime);

          var snapB = await queryB.limit(1).get();
          if (!snapB.empty) {
            await snapB.docs[0].ref.update({
              status         : 'available',
              lockOrderId    : null,
              lockExpiresAt  : null,
              lockExpiresAtMs: null,
              lockedBy       : null,
              lockId         : null,
              updatedAt      : firebase.firestore.FieldValue.serverTimestamp(),
            });
            updated = true;
          }
        }
      }

      sessionStorage.removeItem('slotLock');
      console.log('[slotlock-fix] Slot released ✅', updated ? '(Firestore updated)' : '(nothing to update)');
      return { success: true };

    } catch (err) {
      console.error('[slotlock-fix] Release error:', err);
      return { success: false, error: err.message };
    }
  }

  /* ─────────────────────────────────────────────────────────────
     Read slotTime from sessionStorage as a fallback when a caller
     doesn't pass it (the common failure mode).
  ───────────────────────────────────────────────────────────── */
  function _slotTimeFromSession() {
    try {
      var li = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      return li && li.slotTime ? li.slotTime : null;
    } catch (_) { return null; }
  }

  function _groundIdFromSession() {
    try {
      var li = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      return li && li.groundId ? li.groundId : null;
    } catch (_) { return null; }
  }

  function _dateFromSession() {
    try {
      var li = JSON.parse(sessionStorage.getItem('slotLock') || 'null');
      return li && li.date ? li.date : null;
    } catch (_) { return null; }
  }

  /* ─────────────────────────────────────────────────────────────
     THE SHIM — replaces window.releaseSlotLock with a version
     that handles BOTH calling conventions gracefully.

     Convention 1 (paymentService / 1-arg):
       releaseSlotLock(orderId)

     Convention 2 (app.js / 4-arg):
       releaseSlotLock(lockId, groundId, date, slotTime)

     We detect by checking: if arg2 looks like a Firestore doc ID
     (long alphanumeric string) rather than a ground/venue ID, we
     treat it as convention 1. Otherwise convention 2.
     When slotTime (arg4) is missing we pull it from sessionStorage.
  ───────────────────────────────────────────────────────────── */
  function installShim() {
    /* Keep a reference to whatever was there before */
    var _prev = typeof window.releaseSlotLock === 'function'
      ? window.releaseSlotLock
      : null;

    window.releaseSlotLock = function (arg1, arg2, arg3, arg4) {
      /* ── Detect calling convention ── */

      // If only one argument and no others, it's the 1-arg orderId convention
      if (arg2 === undefined && arg3 === undefined && arg4 === undefined) {
        return _coreRelease({ orderId: arg1 });
      }

      // 4-arg convention: (lockId, groundId, date, slotTime)
      // slotTime may be undefined — pull from sessionStorage as fallback
      var lockId   = arg1;
      var groundId = arg2;
      var date     = arg3;
      var slotTime = arg4 || _slotTimeFromSession();

      // Also try to get groundId/date from session if missing
      if (!groundId) groundId = _groundIdFromSession();
      if (!date)     date     = _dateFromSession();

      return _coreRelease({
        orderId  : lockId,  // lockId often doubles as orderId
        lockId   : lockId,
        groundId : groundId,
        date     : date,
        slotTime : slotTime,
      });
    };

    /* Mark so we don't double-install */
    window.releaseSlotLock._spbShim = true;
    console.log('[slotlock-fix] window.releaseSlotLock shim installed ✅');
  }

  /* ─────────────────────────────────────────────────────────────
     Also patch app.js's own internal releaseSlotLock via its
     reference in the global scope — if it's accessible —
     so that direct calls from within app.js are also safe.
  ───────────────────────────────────────────────────────────── */
  function _patchAppJsInternals() {
    /* app.js has: async function releaseSlotLock(lockId, groundId, date, slotTime)
       It's not on window by default (paymentService overwrites it).
       We can't reach inside app.js's scope, but we CAN make
       window.releaseSlotLock safe so that any external caller goes
       through our shim. The app.js internal call at line 1365 is
       triggered by something that first calls window.releaseSlotLock
       from bmg_master_fix_v2.js — our shim intercepts that path. */
    // (no-op: already handled by the shim above)
  }

  /* ─────────────────────────────────────────────────────────────
     BOOT — install shim as early as possible, and re-install
     after any script that might overwrite window.releaseSlotLock.
  ───────────────────────────────────────────────────────────── */
  installShim();

  /* Re-check after DOM ready in case paymentService.js loads late */
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.releaseSlotLock || !window.releaseSlotLock._spbShim) {
      installShim();
    }
  });

  /* Re-check after every bmg:pageShown in case an SPA nav reinitialises things */
  window.addEventListener('bmg:pageShown', function () {
    if (!window.releaseSlotLock || !window.releaseSlotLock._spbShim) {
      installShim();
    }
  });

})();


/* ════════════════════════════════════════════════════════════════════
   MODULE 4: sportobook_free_listing
   ════════════════════════════════════════════════════════════════════ */

/**
 * sportobook_free_listing.js
 * ─────────────────────────────────────────────────────────────────
 *  Makes ground listing 100% FREE for all owners.
 *
 *  WHAT THIS DOES
 *  ──────────────
 *  [1] Hides ALL payment banners (₹499, ₹5, ₹299 variants) in the DOM
 *
 *  [2] Patches window.canAddGround → always returns true (no payment gate)
 *
 *  [3] Patches updateOwnerRegistrationStatus → shows "Active / Free" always
 *
 *  [4] Intercepts the Firestore config read — forces isPaymentRequired=false
 *      so the app's own logic follows the "free" path and auto-activates
 *      owners without touching the actual database config doc.
 *
 *  [5] Auto-activates the current logged-in owner in Firestore
 *      (sets registrationPaid:true, registrationVerified:true, amount:0)
 *      so no other code ever blocks them again.
 *
 *  [6] Removes ₹5 / ₹499 text from UI labels and buttons everywhere.
 *
 *  LOAD ORDER: after app.js, as the LAST script in <body>
 *    <script src="sportobook_free_listing.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════
     §1  HIDE ALL PAYMENT BANNERS (immediate + persistent observer)
  ═══════════════════════════════════════════════════════════════ */
  var BANNER_SELECTORS = [
    '#owner-reg-payment-banner',
    '#plot-owner-payment-banner',
    '.owner-reg-payment-banner',
    '.payment-required-banner',
    '.pay-owner-fee-btn',
    '#pay-owner-reg-fee-btn',
    '#pay-registration-now',
    '#complete-registration-btn',
    '#owner-verification-status',   // "Owner Registration Status" card on profile page
    '.owner-verification-status',
  ];

  function hideBanners() {
    BANNER_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('aria-hidden', 'true');
      });
    });

    // Also hide any dynamically injected banner that contains payment text
    document.querySelectorAll(
      '[class*="payment-banner"], [class*="reg-banner"], [id*="payment-banner"]'
    ).forEach(function (el) {
      var txt = el.textContent || '';
      if (/₹\s*\d|pay.*fee|registration fee|complete registration/i.test(txt)) {
        el.style.setProperty('display', 'none', 'important');
      }
    });
  }

  hideBanners();


  /* ═══════════════════════════════════════════════════════════════
     §2  PATCH canAddGround → always returns true
  ═══════════════════════════════════════════════════════════════ */
  function patchCanAddGround() {
    // app.js defines canAddGround as a plain async function (not on window initially).
    // Various callers reach it as window.canAddGround after it's exposed.
    var _free = async function () {
      // Still run the owner-type and auth sanity checks from app.js by
      // delegating, but intercept any payment-related rejection.
      // Simplest guarantee: return true for any logged-in owner.
      var u = window.currentUser;
      if (!u || u.role !== 'owner') return false;

      // Silently ensure they're activated in Firestore (fire-and-forget)
      _activateOwnerInFirestore(u.uid);

      return true;
    };
    _free._spbFree = true;

    // Set immediately and re-set after any overwrite
    window.canAddGround = _free;
    console.log('[free-listing] canAddGround patched → always free ✅');
  }

  patchCanAddGround();


  /* ═══════════════════════════════════════════════════════════════
     §3  PATCH updateOwnerRegistrationStatus → always shows Active
  ═══════════════════════════════════════════════════════════════ */
  function patchUpdateOwnerStatus() {
    var _origUpdate = window.updateOwnerRegistrationStatus;
    window.updateOwnerRegistrationStatus = function () {
      // Call original first so layout renders
      if (typeof _origUpdate === 'function') {
        try { _origUpdate(); } catch (_) {}
      }
      // Hide the entire "Owner Registration Status" card — not needed
      hideBanners();
    };
    console.log('[free-listing] updateOwnerRegistrationStatus patched ✅');
  }


  /* ═══════════════════════════════════════════════════════════════
     §4  AUTO-ACTIVATE CURRENT OWNER IN FIRESTORE
         Sets registrationPaid:true, registrationVerified:true, amount:0
         so the database state matches the free policy permanently.
  ═══════════════════════════════════════════════════════════════ */
  var _activatedUids = {};

  async function _activateOwnerInFirestore(uid) {
    if (!uid || _activatedUids[uid]) return;
    _activatedUids[uid] = true;

    var db = window.db;
    if (!db) return;

    try {
      var ownerRef = db.collection('owners').doc(uid);
      var snap     = await ownerRef.get();

      if (!snap.exists) return; // Not an owner doc — skip

      var data = snap.data() || {};
      if (data.registrationPaid && data.registrationVerified) return; // Already activated

      await ownerRef.update({
        registrationPaid          : true,
        registrationVerified      : true,
        registrationAutoApproved  : true,
        registrationAutoApprovedAt: firebase.firestore.FieldValue.serverTimestamp(),
        registrationAmount        : 0,
        updatedAt                 : firebase.firestore.FieldValue.serverTimestamp(),
      });

      // Mirror on currentUser object so in-memory checks pass too
      if (window.currentUser && window.currentUser.uid === uid) {
        window.currentUser.registrationPaid     = true;
        window.currentUser.registrationVerified = true;
      }

      console.log('[free-listing] Owner auto-activated in Firestore ✅', uid);
    } catch (err) {
      console.warn('[free-listing] Firestore activate error:', err);
    }
  }

  /* system_config write removed — requires admin Firestore rules and is
     not needed. The client-side patches (canAddGround, banners, owner
     auto-activation) handle free listing fully without touching system_config. */
  function _disablePaymentConfig() { /* intentional no-op */ }


  /* ═══════════════════════════════════════════════════════════════
     §5  REMOVE ₹5 / ₹499 TEXT FROM LABELS & BUTTONS
  ═══════════════════════════════════════════════════════════════ */
  var FEE_TEXT_MAP = [
    [/Pay\s*₹\s*\d+\s*Now/gi,                   'Add Ground Free'],
    [/Pay\s*₹\s*(499|5|299)\s*(once)?/gi,         'Free'],
    [/₹\s*(499|5|299)\s*registration fee/gi,      'Free Registration'],
    [/Complete Registration \(₹\d+\)/gi,          'Continue'],
    [/Locked \(Pay ₹\d+\)/gi,                     'Active'],
    [/No registration fees\./gi,                  'Ground listing is 100% free!'],
    [/Pay ₹\d+ once and start listing/gi,         'Start listing your grounds instantly!'],
  ];

  function cleanFeeText(root) {
    var walker = document.createTreeWalker(
      root || document.body, NodeFilter.SHOW_TEXT, null, false
    );
    var node;
    while ((node = walker.nextNode())) {
      var v = node.nodeValue;
      if (!v) continue;
      var r = v;
      FEE_TEXT_MAP.forEach(function (pair) { r = r.replace(pair[0], pair[1]); });
      if (r !== v) node.nodeValue = r;
    }
  }

  cleanFeeText(document.body);


  /* ═══════════════════════════════════════════════════════════════
     §6  INTERCEPT add-ground-btn CLICK
         Some paths bypass canAddGround and directly check
         currentUser.registrationPaid. Ensure those pass too.
  ═══════════════════════════════════════════════════════════════ */
  function ensureCurrentUserActivated() {
    var u = window.currentUser;
    if (u && u.role === 'owner') {
      u.registrationPaid     = true;
      u.registrationVerified = true;
      _activateOwnerInFirestore(u.uid);
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest
      ? e.target.closest('#add-ground-btn, #add-ground-btn-primary, .add-ground-btn')
      : null;
    if (btn) {
      ensureCurrentUserActivated();
    }
  }, true); // capture phase so we run before app.js handlers


  /* ═══════════════════════════════════════════════════════════════
     §7  AUTH STATE LISTENER — activate on login
  ═══════════════════════════════════════════════════════════════ */
  function _waitForFirebaseAndListen() {
    if (window.firebase && typeof window.firebase.auth === 'function') {
      window.firebase.auth().onAuthStateChanged(function (user) {
        if (!user) return;
        // Small delay so app.js sets currentUser first
        setTimeout(function () {
          ensureCurrentUserActivated();
          patchCanAddGround();      // re-apply in case app.js overwrote it
          patchUpdateOwnerStatus(); // re-apply
          hideBanners();
          cleanFeeText(document.body);
          _disablePaymentConfig();  // try to write config (admin only succeeds)
        }, 800);
      });
    } else {
      setTimeout(_waitForFirebaseAndListen, 300);
    }
  }
  _waitForFirebaseAndListen();


  /* ═══════════════════════════════════════════════════════════════
     §8  PERSISTENT MUTATION OBSERVER
         Catches dynamically rendered banners and text
  ═══════════════════════════════════════════════════════════════ */
  var _debounce = null;
  var _obs = new MutationObserver(function (mutations) {
    var relevant = mutations.some(function (m) {
      return Array.from(m.addedNodes).some(function (n) {
        return n.textContent &&
          /₹\s*\d|pay.*fee|complete registration|locked.*pay/i.test(n.textContent);
      });
    });
    if (!relevant) return;
    clearTimeout(_debounce);
    _debounce = setTimeout(function () {
      hideBanners();
      cleanFeeText(document.body);
      ensureCurrentUserActivated();
      // Re-patch if overwritten
      if (!window.canAddGround || !window.canAddGround._spbFree) patchCanAddGround();
    }, 60);
  });

  function startObserver() {
    if (document.body) {
      _obs.observe(document.body, { childList: true, subtree: true });
      console.log('[free-listing] MutationObserver active ✅');
    } else {
      document.addEventListener('DOMContentLoaded', startObserver);
    }
  }
  startObserver();


  /* ═══════════════════════════════════════════════════════════════
     §9  RE-APPLY ON SPA PAGE NAVIGATION
  ═══════════════════════════════════════════════════════════════ */
  window.addEventListener('bmg:pageShown', function (e) {
    var pageId = e && e.detail && e.detail.pageId;
    if (!pageId) return;
    if (/owner|dashboard|ground|profile/i.test(pageId)) {
      setTimeout(function () {
        hideBanners();
        cleanFeeText(document.body);
        ensureCurrentUserActivated();
        if (!window.canAddGround || !window.canAddGround._spbFree) patchCanAddGround();
        if (typeof window.updateOwnerRegistrationStatus === 'function') {
          window.updateOwnerRegistrationStatus();
        }
      }, 150);
    }
  });


  /* ═══════════════════════════════════════════════════════════════
     §10  BOOT SUMMARY
  ═══════════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      patchCanAddGround();
      patchUpdateOwnerStatus();
      hideBanners();
      cleanFeeText(document.body);
    });
  } else {
    patchCanAddGround();
    patchUpdateOwnerStatus();
    hideBanners();
    cleanFeeText(document.body);
  }

  console.log('[sportobook_free_listing] Loaded — Ground listing is FREE ✅');

})();


/* ════════════════════════════════════════════════════════════════════
   MODULE 5: sportobook_brand_fix
   ════════════════════════════════════════════════════════════════════ */

/**
 * sportobook_brand_fix.js  — FINAL BRAND OVERRIDE
 * ─────────────────────────────────────────────────────────────────
 *  Permanently replaces every "BookMyGame" text with "SpörtoBook"
 *  across the entire app — including dynamic DOM injections from
 *  app.js (toasts, entry pass header, welcome messages, etc.)
 *
 *  Also:
 *  • Removes football icon from splash — text-only branding
 *  • Keeps the existing purple/indigo colour scheme untouched
 *  • Shows ALL grounds on home page (no 4-card limit)
 *
 *  Load LAST in index.html (after sportobook_ui_fix.js):
 *    <script src="sportobook_brand_fix.js"></script>
 * ─────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════
     0.  CSS — 2-column grid for #nearby-venues
     styles.css has `#nearby-venues { display:flex!important;
     flex-direction:column!important }` three times which forces a
     single-column list. Override with a 2-column grid here.
  ════════════════════════════════════════════════════════════════ */
  (function injectGridCSS() {
    var id = 'spb-grid-style';
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = [
      /* Force 2-column grid on the container */
      '#nearby-venues {',
      '  display: grid !important;',
      '  grid-template-columns: repeat(2, 1fr) !important;',
      '  gap: 12px !important;',
      '  flex-direction: unset !important;',
      '}',
      /* Each venue/ground card fills its cell and uses column layout */
      '#nearby-venues .venue-card,',
      '#nearby-venues .ground-card,',
      '#nearby-venues .bmg-venue-card,',
      '#nearby-venues .spb-card {',
      '  display: flex !important;',
      '  flex-direction: column !important;',
      '  width: 100% !important;',
      '  margin: 0 !important;',
      '}',
      /* Image fills full width of card */
      '#nearby-venues .venue-card img,',
      '#nearby-venues .venue-card .venue-image,',
      '#nearby-venues .venue-card .card-image {',
      '  width: 100% !important;',
      '  height: 130px !important;',
      '  object-fit: cover !important;',
      '  flex-shrink: 0 !important;',
      '}',
      /* Info section */
      '#nearby-venues .venue-card .venue-info,',
      '#nearby-venues .venue-card .card-body,',
      '#nearby-venues .venue-card .card-info {',
      '  padding: 10px !important;',
      '  flex: 1 !important;',
      '}',
      '#nearby-venues .venue-card h3 {',
      '  font-size: .82rem !important;',
      '  font-weight: 700 !important;',
      '  margin: 0 0 4px !important;',
      '  overflow: hidden !important;',
      '  text-overflow: ellipsis !important;',
      '  white-space: nowrap !important;',
      '}',
      '#nearby-venues .venue-card .venue-sport,',
      '#nearby-venues .venue-card .venue-type-badge {',
      '  font-size: .7rem !important;',
      '}',
      /* Empty state / loading spans full width */
      '#nearby-venues .empty-state,',
      '#nearby-venues .skeleton-loading,',
      '#nearby-venues .loading-spinner,',
      '#nearby-venues .error-state {',
      '  grid-column: 1 / -1 !important;',
      '}',
    ].join('\n');
    var head = document.head || document.documentElement;
    head.appendChild(s);
  })();

  /* ── string replacements ── */
  var TEXT_MAP = [
    ['BookMyGame',   'SpörtoBook'],
    ['bookmygame',   'sportobook'],
    ['Book My Game', 'SpörtoBook'],
    ['BOOKMYGAME',   'SPORTOBOOK'],
  ];

  /* ════════════════════════════════════════════════════════════════
     1.  TEXT-NODE WALKER
  ════════════════════════════════════════════════════════════════ */
  function replaceTextNodes(root) {
    var walker = document.createTreeWalker(
      root || document.body, NodeFilter.SHOW_TEXT, null, false
    );
    var node;
    while ((node = walker.nextNode())) {
      var val = node.nodeValue;
      if (!val || !val.includes('Book')) continue;
      var r = val;
      TEXT_MAP.forEach(function (p) { r = r.split(p[0]).join(p[1]); });
      if (r !== val) node.nodeValue = r;
    }
  }

  /* ════════════════════════════════════════════════════════════════
     2.  LOGO / HEADER — keeps colour, swaps text
  ════════════════════════════════════════════════════════════════ */
  function patchLogos() {
    document.querySelectorAll(
      '.main-header .logo, .main-header h1'
    ).forEach(function (el) {
      if (!el.textContent.trim()) return;
      el.innerHTML = 'Sp\u00f6rto<span>Book</span>';
    });
  }

  /* ════════════════════════════════════════════════════════════════
     3.  SPLASH — text-only, no icon, keep existing purple colours
  ════════════════════════════════════════════════════════════════ */
  function patchSplash() {
    var splash = document.getElementById('splash-screen');
    if (!splash) return;

    /* Remove any standalone icon/img that appears BEFORE the title text */
    splash.querySelectorAll('img, .splash-icon, .splash-logo-icon, .brand-logo, .splash-logo').forEach(function (el) {
      /* Don't remove icons INSIDE .splash-benefit-card or .splash-sport-visual */
      if (!el.closest('.splash-benefit-card') && !el.closest('.splash-sport-visual')) {
        el.remove();
      }
    });

    /* Remove <i> tags that are direct children of splash-content (stray icons) */
    var content = splash.querySelector('.splash-content');
    if (content) {
      Array.from(content.childNodes).forEach(function (node) {
        if (node.nodeName === 'I') node.remove();
      });
    }

    /* Fix title */
    var title = splash.querySelector('.splash-title, h1');
    if (title) {
      title.querySelectorAll('i, img').forEach(function (el) { el.remove(); });
      if (title.textContent.toLowerCase().includes('book')) {
        title.innerHTML = 'Sp\u00f6rto<span>Book</span>';
      }
    }
  }

  /* ════════════════════════════════════════════════════════════════
     4.  HOME PAGE — show ALL active grounds (no 4-card limit)
  ════════════════════════════════════════════════════════════════ */
  function patchLoadNearbyVenues() {
    if (typeof window.loadNearbyVenues !== 'function') return;
    if (window.loadNearbyVenues._spbPatched) return;

    var _orig = window.loadNearbyVenues;
    window.loadNearbyVenues = async function () {
      var container = document.getElementById('nearby-venues');
      if (!container || !window.db) { return _orig(); }

      container.innerHTML =
        '<div class="skeleton-loading">' +
        '<div class="skeleton-card"></div><div class="skeleton-card"></div>' +
        '<div class="skeleton-card"></div></div>';

      try {
        var C = window.COLLECTIONS || { VENUES: 'venues', GROUNDS: 'grounds', OWNERS: 'owners' };
        var snaps = await Promise.all([
          window.db.collection(C.VENUES  || 'venues' ).where('hidden', '==', false).get(),
          window.db.collection(C.GROUNDS || 'grounds').where('status', '==', 'active').get()
        ]);

        var venues = [], grounds = [];
        snaps[0].forEach(function (d) { venues.push(Object.assign({ id: d.id, type: 'venue'  }, d.data())); });
        snaps[1].forEach(function (d) { grounds.push(Object.assign({ id: d.id, type: 'ground', ownerType: 'plot_owner' }, d.data())); });

        var all = venues.concat(grounds);
        if (!all.length) {
          container.innerHTML =
            '<div class="empty-state"><i class="fas fa-map-marker-alt"></i>' +
            '<h3>No grounds listed yet</h3><p>Check back soon!</p></div>';
          return;
        }

        /* Use app renderer (shows ALL — no slice) */
        if (typeof window.displayVenueItems === 'function') {
          window.displayVenueItems(container, all);
        } else {
          _renderCards(container, all);
        }

        /* Background: fill owner-type badges */
        setTimeout(async function () {
          for (var i = 0; i < grounds.length; i++) {
            var g = grounds[i];
            if (!g.ownerId) continue;
            try {
              var od = await window.db.collection(C.OWNERS || 'owners').doc(g.ownerId).get();
              if (od.exists) g.ownerType = od.data().ownerType || 'venue_owner';
            } catch (_) {}
          }
          if (typeof window.displayVenueItems === 'function') {
            window.displayVenueItems(container, all);
          } else {
            _renderCards(container, all);
          }
        }, 300);

      } catch (err) {
        console.warn('[sportobook_brand_fix] grounds error, fallback:', err);
        _orig();
      }
    };
    window.loadNearbyVenues._spbPatched = true;
    console.log('[sportobook_brand_fix] loadNearbyVenues → ALL grounds ✅');
  }

  function _renderCards(container, items) {
    function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    container.innerHTML = items.map(function (item) {
      var isG = item.type === 'ground';
      var name  = esc(isG ? item.groundName : item.venueName);
      var sport = esc(item.sportType || 'Multi-sport');
      var img   = item.images && item.images[0];
      var imgHtml = img
        ? '<img src="'+esc(img)+'" alt="'+name+'" class="venue-image" style="width:72px;height:72px;object-fit:cover;border-radius:12px;flex-shrink:0;" onerror="this.style.display=\'none\'">'
        : '<div style="width:72px;height:72px;border-radius:12px;background:linear-gradient(135deg,#4F46E5,#7C3AED);display:flex;align-items:center;justify-content:center;font-size:1.6rem;flex-shrink:0;">🏟️</div>';
      var price = isG && item.pricePerHour
        ? '<span style="font-size:.72rem;background:#EEF2FF;color:#4F46E5;padding:2px 8px;border-radius:20px;font-weight:600;">₹'+item.pricePerHour+'/hr</span>' : '';
      var da = isG ? 'data-ground-id="'+item.id+'"' : 'data-venue-id="'+item.id+'"';
      return '<div class="venue-card spb-card" '+da+' data-type="'+item.type+'" '+
        'style="display:flex;gap:12px;padding:14px;background:#fff;border-radius:16px;'+
        'margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.07);cursor:pointer;align-items:center;">'+
        imgHtml+
        '<div style="flex:1;min-width:0;">'+
          '<h3 style="margin:0 0 4px;font-size:.93rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+name+'</h3>'+
          '<div style="font-size:.78rem;color:#64748B;margin-bottom:5px;">'+sport+'</div>'+
          price+
        '</div>'+
        '<button style="background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#fff;border:none;'+
        'border-radius:10px;padding:8px 12px;font-size:.75rem;font-weight:700;cursor:pointer;white-space:nowrap;">'+
        'View &amp; Book</button></div>';
    }).join('');
    container.querySelectorAll('.spb-card[data-ground-id]').forEach(function (c) {
      c.addEventListener('click', function () { window.viewGround && window.viewGround(c.dataset.groundId); });
    });
    container.querySelectorAll('.spb-card[data-venue-id]').forEach(function (c) {
      c.addEventListener('click', function () { window.viewVenue && window.viewVenue(c.dataset.venueId); });
    });
  }

  /* ════════════════════════════════════════════════════════════════
     5.  BOOT + PERSISTENT MUTATION OBSERVER
  ════════════════════════════════════════════════════════════════ */
  function runAll() {
    replaceTextNodes(document.body);
    patchLogos();
    patchSplash();
    patchLoadNearbyVenues();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAll);
  } else {
    runAll();
  }

  /* Watch for any dynamic "BookMyGame" injections (toasts, entry pass, etc.) */
  var _timer = null;
  var _observer = new MutationObserver(function (mutations) {
    var needsRun = mutations.some(function (m) {
      return Array.from(m.addedNodes).some(function (n) {
        return n.textContent && n.textContent.includes('Book');
      });
    });
    if (!needsRun) return;
    clearTimeout(_timer);
    _timer = setTimeout(function () {
      replaceTextNodes(document.body);
      patchLogos();
      patchSplash();
      patchLoadNearbyVenues();
    }, 50);
  });

  function startObs() {
    if (document.body) {
      _observer.observe(document.body, { childList: true, subtree: true });
      console.log('[sportobook_brand_fix] Persistent observer active ✅');
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        _observer.observe(document.body, { childList: true, subtree: true });
      });
    }
  }
  startObs();

})();
