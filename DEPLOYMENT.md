# Deployment Guide for LeaveEasy

## Prerequisites

1. **Firebase CLI**: Install Firebase CLI globally
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebase Authentication**: Login to Firebase
   ```bash
   firebase login
   ```

3. **Project Setup**: Ensure you're in the correct Firebase project
   ```bash
   firebase use leave-ease-9ae9c
   ```

## Deployment Steps

### 1. Build the Application
```bash
npm run build
```

### 2. Deploy to Firebase Hosting
```bash
# Deploy everything (hosting + functions)
npm run deploy

# Deploy only hosting
npm run deploy:hosting

# Deploy only functions
npm run deploy:functions
```

### 3. Test Local Build
```bash
# Serve the built application locally
npm run serve
```

## Environment Configuration

- **Production**: Uses `.env.production` file
- **Development**: Uses default environment variables
- **Local Testing**: Set `REACT_APP_USE_EMULATORS=true` for local Firebase emulators

## Security Features

- **Headers**: Security headers configured in `firebase.json`
- **Caching**: Static assets cached for 1 year
- **Redirects**: SPA routing handled via Firebase hosting rewrites

## Post-Deployment

1. **Verify Deployment**: Check the live URL at `https://leave-ease-9ae9c.web.app`
2. **Test Authentication**: Ensure Firebase Auth is working
3. **Test Functions**: Verify Cloud Functions are responding
4. **Check Firestore**: Confirm database rules are active

## Troubleshooting

- **Build Errors**: Check console for missing dependencies
- **Function Errors**: Check Firebase Console > Functions logs
- **Auth Issues**: Verify Firebase project configuration
- **Database Issues**: Check Firestore rules and indexes

## URLs

- **Live Site**: https://leave-ease-9ae9c.web.app
- **Firebase Console**: https://console.firebase.google.com/project/leave-ease-9ae9c
