# Brand Settings Firebase Troubleshooting Guide

## Issue: Brand Settings not saving to Firebase

### Step 1: Check Browser Console
1. Open browser DevTools (F12)
2. Go to Console tab
3. Try to save branding settings
4. Look for these logs:
   - `🔄 Loading branding from Firestore...`
   - `Saving branding to Firestore:`
   - `✅ Branding saved to Firestore successfully` (success)
   - `❌ Failed to save branding to Firestore:` (error)

### Step 2: Check Firestore Rules
The `settings` collection needs proper Firestore security rules:

```javascript
match /settings/{document=**} {
  allow read: if true;  // Public can read
  allow write: if request.auth != null;  // Only authenticated admins can write
}
```

**To update Firestore rules:**
1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: `hotel-63c74`
3. Go to **Firestore Database** → **Rules**
4. Update the rules to include the `settings` collection
5. Click **Publish**

### Step 3: Verify Authentication
Make sure you're logged in as admin:
1. Check if you see your email in the admin dashboard
2. Verify you're in the allowed admins list:
   - `admin@luxestay.com`
   - `resort.helpdesk01@gmail.com`

### Step 4: Check Firebase Console
1. Go to Firebase Console → Firestore Database
2. Check if `settings` collection exists
3. Check if `branding` document exists
4. If document doesn't exist, it will be created on first save

### Step 5: Common Errors

#### Error: "Missing or insufficient permissions"
**Solution:** Update Firestore rules (see Step 2)

#### Error: "Firebase database not initialized"
**Solution:** Check if Firebase config is correct in `lib/firebase.ts`

#### Error: "Failed to save branding to Firestore"
**Solution:**
1. Check browser console for detailed error
2. Verify you're authenticated
3. Check Firestore rules
4. Check network tab for failed requests

### Step 6: Test Save Function
1. Open browser console
2. Try saving branding settings
3. Check for these console logs:
   ```
   handleBrandingSubmit called with brandForm: {...}
   updateBranding called with payload: {...}
   Saving branding to Firestore: {...}
   ✅ Branding saved to Firestore successfully
   ```

### Step 7: Verify Data in Firestore
After saving, check Firebase Console:
1. Go to Firestore Database
2. Look for `settings` collection
3. Check `branding` document
4. Verify all fields are saved correctly

## Expected Behavior

1. **On Save:**
   - Form submits
   - Loading state shows
   - Success toast appears
   - Data saved to Firestore
   - Real-time listener updates UI

2. **On Load:**
   - Data loads from Firestore
   - Form fields populate
   - Real-time updates if changed elsewhere

## Debug Checklist

- [ ] Browser console shows no errors
- [ ] Firestore rules allow write for authenticated users
- [ ] User is authenticated (logged in as admin)
- [ ] Firebase config is correct
- [ ] Network tab shows successful POST request
- [ ] Firestore console shows `settings/branding` document
- [ ] Real-time listener is working

## Still Not Working?

1. Check browser console for specific error messages
2. Check Network tab for failed requests
3. Verify Firestore rules are published
4. Try logging out and logging back in
