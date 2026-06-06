'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (!getApps().length) {
    // We will always initialize with the config file to ensure consistency.
    const firebaseApp = initializeApp(firebaseConfig);
    return getSdks(firebaseApp);
  }

  // If already initialized, return the SDKs with the already initialized App
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  let firestore;
  try {
    // Attempt to initialize firestore with settings for better connectivity in restricted environments
    firestore = initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
    });
  } catch (e) {
    // If already initialized (e.g. during HMR), get the existing instance
    firestore = getFirestore(firebaseApp);
  }

  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore,
    storage: getStorage(firebaseApp)
  };
}

export * from './provider';
export * from './client-provider';
export { useCollection } from './firestore/use-collection';
export { useDoc } from './firestore/use-doc';
export * from './errors';
export * from './error-emitter';
