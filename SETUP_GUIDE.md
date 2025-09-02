# LeaveEasy Setup Guide

## Prerequisites
- Node.js (v16 or higher)
- Firebase CLI (`npm install -g firebase-tools`)
- Gmail account (for email notifications)
- Twilio account (for SMS notifications)

## Step 1: Firebase Project Setup

1. **Create Firebase Project**
   ```bash
   # Login to Firebase
   firebase login
   
   # Initialize Firebase in your project
   firebase init
   ```
   
   Select:
   - ✅ Firestore
   - ✅ Functions
   - ✅ Hosting
   - ✅ Storage (optional)

2. **Update Firebase Configuration**
   - Go to Firebase Console → Project Settings → General
   - Copy your Firebase config object
   - Replace the config in `src/firebase/config.js`

3. **Enable Authentication**
   - Go to Firebase Console → Authentication → Sign-in method
   - Enable Email/Password provider

## Step 2: Environment Variables for Cloud Functions

```bash
# Email configuration (Gmail)
firebase functions:config:set email.user="your-email@gmail.com"
firebase functions:config:set email.password="your-app-password"

# Twilio configuration
firebase functions:config:set twilio.account_sid="your-twilio-sid"
firebase functions:config:set twilio.auth_token="your-twilio-token"
firebase functions:config:set twilio.phone_number="your-twilio-phone"
```

### Gmail App Password Setup
1. Enable 2-factor authentication on your Gmail account
2. Go to Google Account settings → Security → App passwords
3. Generate an app password for "Mail"
4. Use this password in the configuration above

### Twilio Setup
1. Create account at [twilio.com](https://www.twilio.com)
2. Get Account SID and Auth Token from Console
3. Purchase a phone number for SMS

## Step 3: Install Dependencies

```bash
# Frontend dependencies
npm install

# Function dependencies
cd functions
npm install
cd ..
```

## Step 4: Deploy Firestore Rules and Indexes

```bash
# Deploy Firestore rules and indexes
firebase deploy --only firestore
```

## Step 5: Deploy Cloud Functions

```bash
# Deploy functions
firebase deploy --only functions
```

## Step 6: Build and Deploy Frontend

```bash
# Build the React app
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

## Step 7: Test the Application

1. **Start Development Server**
   ```bash
   npm start
   ```

2. **Create Test Users**
   - Register users with different roles
   - Test the approval workflow
   - Verify notifications

## Deployment Commands

```bash
# Deploy everything
firebase deploy

# Deploy specific services
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore

# View logs
firebase functions:log
```

## Troubleshooting

### Common Issues

1. **Firebase Config Error**
   - Ensure Firebase config is correctly set in `src/firebase/config.js`
   - Check that all required services are enabled

2. **Function Deployment Fails**
   - Verify Node.js version (18+ required)
   - Check function dependencies in `functions/package.json`

3. **Email/SMS Not Working**
   - Verify environment variables are set correctly
   - Check Gmail app password and Twilio credentials

4. **Permission Errors**
   - Ensure Firestore rules are deployed
   - Check user roles are correctly set in database

### Testing Checklist

- [ ] User registration works for all roles
- [ ] Login/logout functionality
- [ ] Student can submit leave requests
- [ ] Mentor can approve/reject requests
- [ ] HOD approval workflow
- [ ] Principal approval for outstation requests
- [ ] Warden final approval
- [ ] Parent notifications sent
- [ ] Admin dashboard shows all data

## Production Considerations

1. **Security**
   - Review and update Firestore rules
   - Set up proper CORS policies
   - Use environment variables for sensitive data

2. **Performance**
   - Enable Firestore indexes for queries
   - Optimize bundle size
   - Set up CDN for static assets

3. **Monitoring**
   - Set up Firebase Analytics
   - Monitor function execution
   - Set up error reporting

## Support

For issues or questions:
1. Check Firebase Console for errors
2. Review function logs: `firebase functions:log`
3. Test with Firebase emulators: `firebase emulators:start`
