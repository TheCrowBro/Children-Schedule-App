// Bundles the Capacitor plugins into www/native-plugins.js (exposed as window.LLPlugins) so the plain-script app can use them.
// `||` lets tests install fake plugins before this file runs.
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { registerPlugin } from '@capacitor/core';

const Insets = registerPlugin('Insets');
const Calendar = registerPlugin('Calendar');   // the app's own Android plugin (InsetsPlugin.java): the system bars over the page
const Folder = registerPlugin('Folder');       // the app's own iOS plugin (FolderPlugin.swift): a folder in the Files app (iCloud Drive) for the family folder

window.LLPlugins = window.LLPlugins || { SecureStorage, KeychainAccess, BiometricAuth, App, Browser, Filesystem, Share, LocalNotifications, Insets, Calendar, Folder };
