// Bundles the Capacitor plugins into www/native-plugins.js (exposed as window.LLPlugins) so the plain-script app can use them.
// `||` lets tests install fake plugins before this file runs.
import { SecureStorage, KeychainAccess } from '@aparajita/capacitor-secure-storage';
import { BiometricAuth } from '@aparajita/capacitor-biometric-auth';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { registerPlugin } from '@capacitor/core';

const Insets = registerPlugin('Insets');
const Calendar = registerPlugin('Calendar');   // the app's own Android plugin (InsetsPlugin.java): the system bars over the page

window.LLPlugins = window.LLPlugins || { SecureStorage, KeychainAccess, BiometricAuth, App, Browser, Filesystem, Share, Insets, Calendar };
