# LeaveEasy - Leave Management System

A comprehensive full-stack web application for managing student leave requests in educational institutions.

## Features

- **Role-based Authentication**: Support for students, mentors, HOD, principal, warden, and admin roles
- **Approval Workflow**: Multi-level approval system based on leave type and destination
- **Parent Notifications**: Automatic email and SMS notifications to parents when leave is approved
- **Real-time Dashboard**: Role-specific dashboards with statistics and request management
- **Modern UI**: Built with React and Tailwind CSS for a responsive, modern interface

## Tech Stack

### Frontend
- **React 18** - Modern JavaScript library for building user interfaces
- **Tailwind CSS** - Utility-first CSS framework for styling
- **React Router** - Client-side routing
- **Firebase SDK** - Authentication and Firestore integration

### Backend
- **Firebase Authentication** - User authentication and role management
- **Firestore** - NoSQL database for storing users, requests, and approvals
- **Firebase Cloud Functions** - Serverless functions for notifications and automation
- **Firebase Hosting** - Static site hosting

### Integrations
- **Nodemailer** - Email notifications
- **Twilio** - SMS notifications
- **TypeScript** - Type-safe cloud functions

## Project Structure

```
leaveeasy/
├── public/                 # Static files
├── src/
│   ├── components/
│   │   ├── auth/          # Login and signup components
│   │   ├── dashboard/     # Role-specific dashboards
│   │   ├── forms/         # Leave request forms
│   │   ├── cards/         # Reusable card components
│   │   └── layout/        # Navigation and layout components
│   ├── contexts/          # React context providers
│   ├── firebase/          # Firebase configuration
│   └── App.js             # Main application component
├── functions/             # Firebase Cloud Functions
│   ├── src/
│   │   └── index.ts       # Cloud function implementations
│   └── package.json       # Function dependencies
├── firestore.rules        # Firestore security rules
├── firestore.indexes.json # Database indexes
└── firebase.json          # Firebase project configuration
```

## Setup Instructions

### 1. Firebase Project Setup

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication with Email/Password provider
3. Create a Firestore database
4. Enable Firebase Hosting
5. Enable Cloud Functions

### 2. Environment Configuration

1. Copy your Firebase config from Project Settings
2. Update `src/firebase/config.js` with your Firebase configuration
3. Set up environment variables for Cloud Functions:

```bash
firebase functions:config:set email.user="your-gmail@gmail.com"
firebase functions:config:set email.password="your-app-password"
firebase functions:config:set twilio.account_sid="your-twilio-sid"
firebase functions:config:set twilio.auth_token="your-twilio-token"
firebase functions:config:set twilio.phone_number="your-twilio-phone"
```

### 3. Installation

```bash
# Install frontend dependencies
npm install

# Install function dependencies
cd functions
npm install
cd ..
```

### 4. Development

```bash
# Start development server
npm start

# Start Firebase emulators (optional)
firebase emulators:start
```

### 5. Deployment

```bash
# Build the project
npm run build

# Deploy to Firebase
firebase deploy
```

## User Roles and Permissions

### Student
- Submit leave requests
- View own request history
- Track approval status

### Mentor
- Approve/reject student requests (first level)
- View department requests

### Head of Department (HOD)
- Approve/reject requests after mentor approval
- View department-wide statistics

### Principal
- Final approval for outstation leave requests
- Institution-wide overview

### Warden
- Final approval for all leave requests
- Hostel management perspective

### Admin
- Full system access
- User management
- System statistics and maintenance

## Approval Workflow

1. **Student** submits leave request
2. **Mentor** reviews and approves/rejects
3. **HOD** reviews mentor-approved requests
4. **Principal** reviews outstation requests (if applicable)
5. **Warden** gives final approval
6. **Parent notification** sent automatically upon approval

## Database Schema

### Users Collection
```javascript
{
  email: string,
  firstName: string,
  lastName: string,
  role: 'student' | 'mentor' | 'hod' | 'principal' | 'warden' | 'admin',
  department: string,
  studentId?: string,
  phoneNumber: string,
  parentEmail?: string,
  parentPhone?: string,
  createdAt: string
}
```

### Leave Requests Collection
```javascript
{
  studentId: string,
  leaveType: 'casual' | 'medical' | 'emergency' | 'academic' | 'personal',
  startDate: string,
  endDate: string,
  reason: string,
  destination: string,
  contactNumber: string,
  emergencyContact?: string,
  isOutstation: boolean,
  status: 'pending' | 'approved' | 'rejected',
  approvals: Array<{
    role: string,
    approvedBy: string,
    status: 'approved' | 'rejected',
    timestamp: string,
    comments?: string
  }>,
  createdAt: string,
  lastUpdated: string
}
```

## Security

- Firestore security rules ensure data access based on user roles
- Authentication required for all operations
- Role-based access control implemented throughout the application
- Parent contact information protected and only accessible to authorized personnel

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please contact the development team or create an issue in the repository.
