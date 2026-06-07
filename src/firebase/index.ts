'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAuth, getAuth, inMemoryPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';


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

  let auth;
  try {
    const ls = (globalThis as Record<string, unknown>)['localStorage'];
    const isLocalStorageAvailable = ls !== undefined && typeof (ls as { getItem?: unknown }).getItem === 'function';
    const persistence = isLocalStorageAvailable ? browserLocalPersistence : inMemoryPersistence;
    auth = initializeAuth(firebaseApp, { persistence });
  } catch {
    // Auth already initialized (e.g., HMR or subsequent calls)
    auth = getAuth(firebaseApp);
  }

  return {
    firebaseApp,
    auth,
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
