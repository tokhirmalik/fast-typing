/*
  EDIT THIS FILE (see SETUP-GUIDE.md).

  1. Paste your Firebase web-app config below (Firebase console -> Project settings -> Your apps -> Web app).
  2. Put the Google e-mail address(es) of the organizer(s) in ADMIN_EMAILS.
     The SAME address(es) must also be written in firestore.rules.

  While apiKey still says "PASTE_API_KEY", the site runs in DEMO MODE:
  everything is stored only in this browser (good for a trial run on one computer).
*/
window.APP_CONFIG = {
  EVENT_TITLE: 'Fast Typing Challenge',

  ADMIN_EMAILS: ['toxirmaliksaloxiddinov@gmail.com'],

  firebaseConfig: {
    apiKey: 'AIzaSyBserYPndcYM5xVUEqgRoNnUz2JLYflfx8',
    authDomain: 'cifssupport-fast-typing.firebaseapp.com',
    projectId: 'cifssupport-fast-typing',
    appId: '1:769739914685:web:98bb4c653ab9d1481666d4'
  }
};
