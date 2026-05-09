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
            const COLLECTIONS = window.COLLECTIONS;
            
            // Check if email already exists
            const existingUserQuery = await db.collection(COLLECTIONS.USERS)
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
                const referralSnapshot = await db.collection(COLLECTIONS.REFERRALS)
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
            
            await db.collection(COLLECTIONS.USERS).doc(user.uid).set(userData);
            
            // Update user profile
            await user.updateProfile({
                displayName: name
            });
            
            // If referred by someone, create referral record
            if (referredBy) {
                await db.collection(COLLECTIONS.REFERRALS).add({
                    code: userData.referralCode,
                    userId: user.uid,
                    userName: name,
                    referredBy: referredBy,
                    status: 'pending',
                    createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
                
                // Increment referral count
                await db.collection(COLLECTIONS.OWNERS).doc(referredBy).update({
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
            const COLLECTIONS = window.COLLECTIONS;
            
            const userDoc = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
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
            const COLLECTIONS = window.COLLECTIONS;
            
            // Load user city first
            await loadCurrentUserCity();
            
            // Fetch all venues and grounds
            const [venuesSnap, groundsSnap] = await Promise.all([
                db.collection(COLLECTIONS.VENUES || 'venues')
                    .where('hidden', '==', false)
                    .get(),
                db.collection(COLLECTIONS.GROUNDS || 'grounds')
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
            const COLLECTIONS = window.COLLECTIONS;
            
            // Fetch slots from Firestore
            const slotsSnap = await db.collection(COLLECTIONS.SLOTS)
                .where('groundId', '==', groundId)
                .where('date', '==', date)
                .get();
            
            // Fetch bookings for this ground and date (CONFIRMED bookings mark slots as booked)
            const bookingsSnap = await db.collection(COLLECTIONS.BOOKINGS)
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
            const COLLECTIONS = window.COLLECTIONS;
            const currentUser = window.firebase.auth().currentUser;
            
            // SECURITY CHECK 3: Get booking from database
            // TRY MULTIPLE WAYS TO FIND THE BOOKING
            let bookingDoc = null;
            let bookingSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
                .where('bookingId', '==', qrObject.bookingId)
                .get();
            
            if (!bookingSnapshot.empty) {
                bookingDoc = bookingSnapshot.docs[0];
            } else {
                // Try to find by ground ID and date and slot
                bookingSnapshot = await db.collection(COLLECTIONS.BOOKINGS)
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
            const groundDoc = await db.collection(COLLECTIONS.GROUNDS).doc(booking.groundId).get();
            
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
            await db.collection(COLLECTIONS.GROUNDS).doc(booking.groundId).update({
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
        if (window.firebase?.auth?.().currentUser) {
            loadCurrentUserCity();
        }
        
        console.log('✅ All fixes initialized successfully!');
    }
    
    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeFixes);
    } else {
        initializeFixes();
    }
    
    // Also run when user logs in
    window.firebase?.auth?.().onAuthStateChanged(() => {
        loadCurrentUserCity();
    });
    
})();

// Export for debugging
console.log('✅ SpörtoBook Complete Fix v1.0 loaded successfully!');