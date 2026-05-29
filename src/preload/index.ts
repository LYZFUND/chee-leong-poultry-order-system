import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('appInfo', {
  name: 'CHEE LEONG Poultry Orders',
  platform: process.platform,
});
